package controller

import (
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

type dailyUsageAPIResponse struct {
	Success bool `json:"success"`
	Data    struct {
		InputTokens     int64    `json:"input_tokens"`
		TotalTokens     int64    `json:"total_tokens"`
		CacheReadTokens int64    `json:"cache_read_tokens"`
		CacheRate       *float64 `json:"cache_rate"`
	} `json:"data"`
}

func setupDailyUsageControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))), &gorm.Config{})
	require.NoError(t, err)
	model.DB, model.LOG_DB = db, db
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMainType, previousLogType)
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func performDailyUsageRequest(t *testing.T, target string, userID int) (*httptest.ResponseRecorder, dailyUsageAPIResponse) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, target, nil)
	ctx.Set("id", userID)
	ctx.Set(common.RequestIdKey, "untrusted-request-id")
	GetDailyUsage(ctx)
	var response dailyUsageAPIResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return recorder, response
}

func TestGetDailyUsageUsesAuthenticatedUserRatherThanRequestID(t *testing.T) {
	db := setupDailyUsageControllerTestDB(t)
	now := time.Now().Unix()
	start, end := now-3600, now+23*3600
	require.NoError(t, db.Create([]model.Log{
		{UserId: 101, CreatedAt: now, Type: model.LogTypeConsume, InputTokens: 100, CacheReadTokens: 25, CompletionTokens: 20},
		{UserId: 202, CreatedAt: now, Type: model.LogTypeConsume, InputTokens: 999, CacheReadTokens: 999, CompletionTokens: 999},
	}).Error)

	recorder, response := performDailyUsageRequest(t, fmt.Sprintf("/api/log/self/daily_usage?start_timestamp=%d&end_timestamp=%d", start, end), 101)
	require.Equal(t, http.StatusOK, recorder.Code)
	require.True(t, response.Success)
	assert.Equal(t, int64(100), response.Data.InputTokens)
	assert.Equal(t, int64(120), response.Data.TotalTokens)
	assert.Equal(t, int64(25), response.Data.CacheReadTokens)
	require.NotNil(t, response.Data.CacheRate)
	assert.InDelta(t, 0.25, *response.Data.CacheRate, 0.000001)
}

func TestGetDailyUsageRejectsInvalidOrHistoricalRanges(t *testing.T) {
	setupDailyUsageControllerTestDB(t)
	now := time.Now().Unix()
	tests := []struct {
		name   string
		target string
	}{
		{name: "missing", target: "/api/log/self/daily_usage"},
		{name: "too short", target: fmt.Sprintf("/api/log/self/daily_usage?start_timestamp=%d&end_timestamp=%d", now-3600, now+21*3600)},
		{name: "historical", target: fmt.Sprintf("/api/log/self/daily_usage?start_timestamp=%d&end_timestamp=%d", now-48*3600, now-24*3600)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder, response := performDailyUsageRequest(t, tt.target, 101)
			assert.Equal(t, http.StatusOK, recorder.Code)
			assert.False(t, response.Success)
		})
	}
}
