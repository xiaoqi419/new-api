package model

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupDailyUsageModelTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousLogDB := LOG_DB
	previousType := common.LogDatabaseType()
	common.SetLogDatabaseType(common.DatabaseTypeSQLite)
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Log{}))
	LOG_DB = db
	t.Cleanup(func() {
		LOG_DB = previousLogDB
		common.SetLogDatabaseType(previousType)
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func TestGetUserDailyUsageSummaryScopesUserAndUsesCanonicalTokens(t *testing.T) {
	db := setupDailyUsageModelTestDB(t)
	now := time.Now().Unix()
	start, end := now-3600, now+3600
	require.NoError(t, db.Create([]Log{
		{UserId: 101, CreatedAt: now - 30, Type: LogTypeConsume, InputTokens: 100, CacheReadTokens: 25, CacheWriteTokens: 10, PromptTokens: 999, CompletionTokens: 20},
		{UserId: 101, CreatedAt: now - 20, Type: LogTypeConsume, InputTokens: 200, CacheReadTokens: 0, CacheWriteTokens: 0, PromptTokens: 999, CompletionTokens: 30},
		{UserId: 202, CreatedAt: now - 10, Type: LogTypeConsume, InputTokens: 1000, CacheReadTokens: 1000, PromptTokens: 1000, CompletionTokens: 100},
		{UserId: 101, CreatedAt: end, Type: LogTypeConsume, InputTokens: 9999, CacheReadTokens: 9999},
	}).Error)

	summary, err := GetUserDailyUsageSummary(101, start, end)
	require.NoError(t, err)
	assert.Equal(t, int64(300), summary.InputTokens)
	assert.Equal(t, int64(350), summary.TotalTokens)
	assert.Equal(t, int64(25), summary.CacheReadTokens)
	require.NotNil(t, summary.CacheRate)
	assert.InDelta(t, 25.0/300.0, *summary.CacheRate, 0.000001)
}

func TestGetUserDailyUsageSummaryFallsBackAndOmitsMissingCacheTelemetry(t *testing.T) {
	db := setupDailyUsageModelTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, db.Create([]Log{
		{UserId: 101, CreatedAt: now, Type: LogTypeConsume, PromptTokens: 80, CompletionTokens: 20},
		{UserId: 101, CreatedAt: now, Type: LogTypeConsume, InputTokens: 100, CacheReadTokens: 101, PromptTokens: 7, CompletionTokens: 3},
	}).Error)

	summary, err := GetUserDailyUsageSummary(101, now-1, now+1)
	require.NoError(t, err)
	assert.Equal(t, int64(87), summary.InputTokens)
	assert.Equal(t, int64(110), summary.TotalTokens)
	assert.Equal(t, int64(0), summary.CacheReadTokens)
	assert.Nil(t, summary.CacheRate)
}

func TestGetUserDailyUsageSummaryReturnsZeroForNoRows(t *testing.T) {
	setupDailyUsageModelTestDB(t)
	summary, err := GetUserDailyUsageSummary(101, 100, 200)
	require.NoError(t, err)
	assert.Equal(t, int64(0), summary.InputTokens)
	assert.Equal(t, int64(0), summary.TotalTokens)
	assert.Equal(t, int64(0), summary.CacheReadTokens)
	assert.Nil(t, summary.CacheRate)
}
