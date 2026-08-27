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

func TestGetChannelModelMonitorStatsExcludesInvalidCacheTelemetry(t *testing.T) {
	originalLogDatabaseType := common.LogDatabaseType()
	common.SetLogDatabaseType(common.DatabaseTypeSQLite)
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Log{}))

	originalLogDB := LOG_DB
	LOG_DB = db
	t.Cleanup(func() {
		LOG_DB = originalLogDB
		common.SetLogDatabaseType(originalLogDatabaseType)
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})

	now := time.Now().Unix()
	require.NoError(t, db.Create([]Log{
		{
			CreatedAt:        now - 1,
			Type:             LogTypeConsume,
			ChannelId:        1,
			ModelName:        "cache-model",
			InputTokens:      100,
			CacheReadTokens:  20,
			CacheWriteTokens: 10,
		},
		{
			CreatedAt:        now - 1,
			Type:             LogTypeConsume,
			ChannelId:        1,
			ModelName:        "cache-model",
			InputTokens:      100,
			CacheReadTokens:  80,
			CacheWriteTokens: 30,
		},
		{
			CreatedAt: now - 1,
			Type:      LogTypeError,
			ChannelId: 1,
			ModelName: "cache-model",
		},
	}).Error)

	stats, err := GetChannelModelMonitorStats(now-3600, now)
	require.NoError(t, err)
	require.Len(t, stats, 1)
	assert.Equal(t, int64(2), stats[0].SuccessCount)
	assert.Equal(t, int64(1), stats[0].ErrorCount)
	assert.Equal(t, int64(1), stats[0].CacheSampleCount)
	assert.Equal(t, int64(100), stats[0].InputTokens)
	assert.Equal(t, int64(20), stats[0].CacheReadTokens)
	assert.Equal(t, int64(10), stats[0].CacheWriteTokens)
}
