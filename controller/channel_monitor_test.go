package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type channelMonitorResponse struct {
	Success bool `json:"success"`
	Data    struct {
		OverallStatus string `json:"overall_status"`
		Channels      []struct {
			ChannelId       int    `json:"channel_id"`
			Name            string `json:"name"`
			CachePrediction *struct {
				ObservedRate           *float64 `json:"observed_rate"`
				PredictedRate          *float64 `json:"predicted_rate"`
				SampleCount            int64    `json:"sample_count"`
				InputTokens            int64    `json:"input_tokens"`
				Support                string   `json:"support"`
				ForecastHorizonSeconds int64    `json:"forecast_horizon_seconds"`
				InsufficientData       bool     `json:"insufficient_data"`
				Reason                 string   `json:"reason"`
			} `json:"cache_prediction"`
			Models []struct {
				Model           string `json:"model"`
				CachePrediction *struct {
					ObservedRate     *float64 `json:"observed_rate"`
					PredictedRate    *float64 `json:"predicted_rate"`
					SampleCount      int64    `json:"sample_count"`
					InputTokens      int64    `json:"input_tokens"`
					Support          string   `json:"support"`
					InsufficientData bool     `json:"insufficient_data"`
					Reason           string   `json:"reason"`
				} `json:"cache_prediction"`
			} `json:"models"`
		} `json:"channels"`
	} `json:"data"`
}

func setupChannelMonitorTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	gin.SetMode(gin.TestMode)
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled = false

	dsn := fmt.Sprintf(
		"file:%s?mode=memory&cache=shared",
		strings.ReplaceAll(t.Name(), "/", "_"),
	)
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)

	originalDB, originalLogDB := model.DB, model.LOG_DB
	model.DB = db
	model.LOG_DB = db

	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Log{}, &model.ChannelProbe{}))

	// The handler memoizes stats for 60s across requests, which would otherwise
	// leak between tests.
	channelMonitorCacheMu.Lock()
	channelMonitorStatsCache = make(map[int]channelMonitorStatsCacheEntry)
	channelMonitorCacheMu.Unlock()

	t.Cleanup(func() {
		model.DB, model.LOG_DB = originalDB, originalLogDB
		channelMonitorCacheMu.Lock()
		channelMonitorStatsCache = make(map[int]channelMonitorStatsCacheEntry)
		channelMonitorCacheMu.Unlock()
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func TestGetChannelMonitorOnlyListsEnabledChannels(t *testing.T) {
	db := setupChannelMonitorTestDB(t)

	require.NoError(t, db.Create(&[]model.Channel{
		{Id: 1, Name: "启用中", Key: "k1", Status: common.ChannelStatusEnabled},
		{Id: 2, Name: "手动停用", Key: "k2", Status: common.ChannelStatusManuallyDisabled},
		{Id: 3, Name: "自动停用", Key: "k3", Status: common.ChannelStatusAutoDisabled},
		{Id: 4, Name: "状态未知", Key: "k4"},
	}).Error)
	// Status has `default:1`, so GORM drops a zero on insert. Writing the column
	// explicitly is the only way to reach status 0, and it proves the filter
	// keeps only "enabled" rather than blacklisting the two disabled codes.
	require.NoError(t, db.Model(&model.Channel{}).Where("id = ?", 4).
		Update("status", common.ChannelStatusUnknown).Error)

	// Channel 9 is missing on purpose: a deleted channel keeps its usage logs,
	// and the list used to surface those rows as a nameless "#9" entry.
	now := time.Now().Unix()
	for _, channelId := range []int{1, 2, 3, 4, 9} {
		require.NoError(t, db.Create(&model.Log{
			UserId:           1,
			CreatedAt:        now - 600,
			Type:             model.LogTypeConsume,
			ModelName:        "gpt-4o-mini",
			ChannelId:        channelId,
			UseTime:          2,
			CompletionTokens: 100,
			FirstTokenMs:     300,
		}).Error)
	}

	router := gin.New()
	router.GET("/monitor", GetChannelMonitor)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/monitor?days=7", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	var body channelMonitorResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	require.True(t, body.Success)

	require.Len(t, body.Data.Channels, 1)
	assert.Equal(t, 1, body.Data.Channels[0].ChannelId)
	assert.Equal(t, "启用中", body.Data.Channels[0].Name)
}

func TestGetChannelMonitorOverallStatusIgnoresDisabledChannels(t *testing.T) {
	db := setupChannelMonitorTestDB(t)

	require.NoError(t, db.Create(&[]model.Channel{
		{Id: 1, Name: "启用中", Key: "k1", Status: common.ChannelStatusEnabled},
		{Id: 2, Name: "手动停用", Key: "k2", Status: common.ChannelStatusManuallyDisabled},
	}).Error)

	now := time.Now().Unix()
	require.NoError(t, db.Create(&model.Log{
		UserId:    1,
		CreatedAt: now - 600,
		Type:      model.LogTypeConsume,
		ModelName: "gpt-4o-mini",
		ChannelId: 1,
		UseTime:   2,
	}).Error)
	// The disabled channel only ever failed. Its errors must not drag the
	// site-wide badge down, since nothing routes to it any more.
	for i := 0; i < 5; i++ {
		require.NoError(t, db.Create(&model.Log{
			UserId:    1,
			CreatedAt: now - 600,
			Type:      model.LogTypeError,
			ModelName: "gpt-4o-mini",
			ChannelId: 2,
		}).Error)
	}

	router := gin.New()
	router.GET("/monitor", GetChannelMonitor)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/monitor?days=7", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	var body channelMonitorResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	require.True(t, body.Success)

	require.Len(t, body.Data.Channels, 1)
	assert.Equal(t, "normal", body.Data.OverallStatus)
}

func TestGetChannelMonitorReturnsTokenWeightedCacheMetrics(t *testing.T) {
	db := setupChannelMonitorTestDB(t)
	require.NoError(t, db.Create(&model.Channel{
		Id:     1,
		Name:   "缓存渠道",
		Key:    "k1",
		Status: common.ChannelStatusEnabled,
	}).Error)

	now := time.Now().Unix()
	for hour := 0; hour < 3; hour++ {
		for request := 0; request < 7; request++ {
			require.NoError(t, db.Create(&model.Log{
				UserId:    1,
				CreatedAt: now - int64(hour*3600) - 10,
				Type:      model.LogTypeConsume,
				ModelName: "cache-model",
				ChannelId: 1,
			}).Error)
		}
	}
	require.NoError(t, db.Model(&model.Log{}).Where("channel_id = ?", 1).
		Updates(map[string]interface{}{"input_tokens": 1000, "cache_read_tokens": 100}).Error)

	router := gin.New()
	router.GET("/monitor", GetChannelMonitor)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/monitor?days=15", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	var body channelMonitorResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	require.True(t, body.Success)
	require.Len(t, body.Data.Channels, 1)

	channel := body.Data.Channels[0]
	require.NotNil(t, channel.CachePrediction)
	require.NotNil(t, channel.CachePrediction.ObservedRate)
	require.NotNil(t, channel.CachePrediction.PredictedRate)
	assert.InDelta(t, 10.0, *channel.CachePrediction.ObservedRate, 0.01)
	assert.InDelta(t, 10.0, *channel.CachePrediction.PredictedRate, 0.01)
	assert.Equal(t, int64(21), channel.CachePrediction.SampleCount)
	assert.Equal(t, int64(21000), channel.CachePrediction.InputTokens)
	assert.Equal(t, "low", channel.CachePrediction.Support)
	assert.Equal(t, int64(86400), channel.CachePrediction.ForecastHorizonSeconds)
	assert.False(t, channel.CachePrediction.InsufficientData)
	assert.Empty(t, channel.CachePrediction.Reason)
	require.Len(t, channel.Models, 1)
	require.NotNil(t, channel.Models[0].CachePrediction)
	assert.InDelta(t, 10.0, *channel.Models[0].CachePrediction.ObservedRate, 0.01)
	assert.InDelta(t, 10.0, *channel.Models[0].CachePrediction.PredictedRate, 0.01)
}

func TestGetChannelMonitorTreatsCacheWritesAsCacheEvidence(t *testing.T) {
	db := setupChannelMonitorTestDB(t)
	require.NoError(t, db.Create(&model.Channel{
		Id:     1,
		Name:   "缓存写入渠道",
		Key:    "k1",
		Status: common.ChannelStatusEnabled,
	}).Error)

	now := time.Now().Unix()
	for hour := 0; hour < 3; hour++ {
		for request := 0; request < 20; request++ {
			require.NoError(t, db.Create(&model.Log{
				UserId:           1,
				CreatedAt:        now - int64(hour*3600) - 10,
				Type:             model.LogTypeConsume,
				ModelName:        "write-only-model",
				ChannelId:        1,
				InputTokens:      1000,
				CacheWriteTokens: 100,
			}).Error)
		}
	}

	router := gin.New()
	router.GET("/monitor", GetChannelMonitor)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/monitor?days=7", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	var body channelMonitorResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	require.True(t, body.Success)
	require.Len(t, body.Data.Channels, 1)

	channel := body.Data.Channels[0]
	require.NotNil(t, channel.CachePrediction)
	require.NotNil(t, channel.CachePrediction.ObservedRate)
	require.NotNil(t, channel.CachePrediction.PredictedRate)
	assert.Equal(t, 0.0, *channel.CachePrediction.ObservedRate)
	assert.Equal(t, 0.0, *channel.CachePrediction.PredictedRate)
	assert.False(t, channel.CachePrediction.InsufficientData)
	assert.Empty(t, channel.CachePrediction.Reason)
	require.Len(t, channel.Models, 1)
	require.NotNil(t, channel.Models[0].CachePrediction)
	require.NotNil(t, channel.Models[0].CachePrediction.ObservedRate)
	require.NotNil(t, channel.Models[0].CachePrediction.PredictedRate)
	assert.Equal(t, 0.0, *channel.Models[0].CachePrediction.ObservedRate)
	assert.Equal(t, 0.0, *channel.Models[0].CachePrediction.PredictedRate)
}

func TestGetChannelMonitorSeparatesObservedAndPredictionCacheEvidence(t *testing.T) {
	db := setupChannelMonitorTestDB(t)
	require.NoError(t, db.Create(&model.Channel{
		Id:     1,
		Name:   "窗口渠道",
		Key:    "k1",
		Status: common.ChannelStatusEnabled,
	}).Error)

	now := time.Now().Unix()
	for request := 0; request < 20; request++ {
		require.NoError(t, db.Create(&model.Log{
			UserId:          1,
			CreatedAt:       now - 10*24*3600,
			Type:            model.LogTypeConsume,
			ModelName:       "early-cache-model",
			ChannelId:       1,
			InputTokens:     1000,
			CacheReadTokens: 100,
		}).Error)
	}
	for hour := 0; hour < 3; hour++ {
		for request := 0; request < 20; request++ {
			require.NoError(t, db.Create(&model.Log{
				UserId:      1,
				CreatedAt:   now - int64(hour*3600) - 10,
				Type:        model.LogTypeConsume,
				ModelName:   "early-cache-model",
				ChannelId:   1,
				InputTokens: 1000,
			}).Error)
			require.NoError(t, db.Create(&model.Log{
				UserId:          1,
				CreatedAt:       now - int64(hour*3600) - 10,
				Type:            model.LogTypeConsume,
				ModelName:       "recent-cache-model",
				ChannelId:       1,
				InputTokens:     1000,
				CacheReadTokens: 200,
			}).Error)
		}
	}

	router := gin.New()
	router.GET("/monitor", GetChannelMonitor)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/monitor?days=15", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	var body channelMonitorResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	require.True(t, body.Success)
	require.Len(t, body.Data.Channels, 1)

	channel := body.Data.Channels[0]
	require.NotNil(t, channel.CachePrediction)
	require.NotNil(t, channel.CachePrediction.ObservedRate)
	require.NotNil(t, channel.CachePrediction.PredictedRate)
	assert.InDelta(t, 10.0, *channel.CachePrediction.ObservedRate, 0.01)
	assert.InDelta(t, 20.0, *channel.CachePrediction.PredictedRate, 0.01)
	require.Len(t, channel.Models, 2)

	early := channel.Models[0]
	assert.Equal(t, "early-cache-model", early.Model)
	require.NotNil(t, early.CachePrediction)
	require.NotNil(t, early.CachePrediction.ObservedRate)
	assert.InDelta(t, 2.5, *early.CachePrediction.ObservedRate, 0.01)
	assert.Nil(t, early.CachePrediction.PredictedRate)
	assert.True(t, early.CachePrediction.InsufficientData)
	assert.Equal(t, "no_cache_evidence", early.CachePrediction.Reason)
}
