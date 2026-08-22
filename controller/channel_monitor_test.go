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
			ChannelId int    `json:"channel_id"`
			Name      string `json:"name"`
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
