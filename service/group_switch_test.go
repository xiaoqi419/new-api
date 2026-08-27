package service

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func resetGroupSwitchMemoryCache(t *testing.T) {
	t.Helper()
	groupSwitchMemMutex.Lock()
	previous := groupSwitchMemCache
	groupSwitchMemCache = make(map[string]groupSwitchEntry)
	groupSwitchMemMutex.Unlock()
	t.Cleanup(func() {
		groupSwitchMemMutex.Lock()
		groupSwitchMemCache = previous
		groupSwitchMemMutex.Unlock()
	})
}

func useGroupSwitchRedis(t *testing.T) *miniredis.Miniredis {
	t.Helper()
	previousRedisEnabled := common.RedisEnabled
	previousRDB := common.RDB
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	require.NoError(t, client.Ping(context.Background()).Err())
	common.RedisEnabled = true
	common.RDB = client
	t.Cleanup(func() {
		_ = client.Close()
		common.RedisEnabled = previousRedisEnabled
		common.RDB = previousRDB
	})
	return server
}

func newGroupSwitchContext(threshold int) *gin.Context {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(c, constant.ContextKeyTokenGroupSwitch, true)
	common.SetContextKey(c, constant.ContextKeyTokenGroupSwitchThreshold, threshold)
	return c
}

func TestRecordGroupSwitchFailureEscalatesAtThreshold(t *testing.T) {
	c := newGroupSwitchContext(2)

	RecordGroupSwitchFailure(c)
	assert.Equal(t, 0, common.GetContextKeyInt(c, constant.ContextKeyGroupSwitchIndex))
	assert.Equal(t, 1, common.GetContextKeyInt(c, constant.ContextKeyGroupSwitchFail))

	RecordGroupSwitchFailure(c)
	assert.Equal(t, 1, common.GetContextKeyInt(c, constant.ContextKeyGroupSwitchIndex))
	assert.Equal(t, 0, common.GetContextKeyInt(c, constant.ContextKeyGroupSwitchFail))
}

func TestRecordGroupSwitchFailureThresholdOne(t *testing.T) {
	c := newGroupSwitchContext(1)

	RecordGroupSwitchFailure(c)
	assert.Equal(t, 1, common.GetContextKeyInt(c, constant.ContextKeyGroupSwitchIndex))
	RecordGroupSwitchFailure(c)
	assert.Equal(t, 2, common.GetContextKeyInt(c, constant.ContextKeyGroupSwitchIndex))
}

func TestRecordGroupSwitchFailureNoopWhenDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	RecordGroupSwitchFailure(c)
	assert.Equal(t, 0, common.GetContextKeyInt(c, constant.ContextKeyGroupSwitchIndex))
	assert.Equal(t, 0, common.GetContextKeyInt(c, constant.ContextKeyGroupSwitchFail))
}

func TestStickyGroupSwitchMemoryCache(t *testing.T) {
	prev := common.RedisEnabled
	common.RedisEnabled = false
	defer func() { common.RedisEnabled = prev }()
	resetGroupSwitchMemoryCache(t)

	require.Empty(t, GetStickyGroupSwitch(1, "gpt-4", "default"))

	SetStickyGroupSwitch(1, "gpt-4", "default", "vip", 10)
	assert.Equal(t, "vip", GetStickyGroupSwitch(1, "gpt-4", "default"))

	// A different token/model/group combination stays isolated.
	assert.Empty(t, GetStickyGroupSwitch(2, "gpt-4", "default"))

	// Zero cooldown must not persist anything.
	SetStickyGroupSwitch(3, "gpt-4", "default", "vip", 0)
	assert.Empty(t, GetStickyGroupSwitch(3, "gpt-4", "default"))
}

func TestStickyGroupSwitchExpiry(t *testing.T) {
	prev := common.RedisEnabled
	common.RedisEnabled = false
	defer func() { common.RedisEnabled = prev }()
	resetGroupSwitchMemoryCache(t)

	key := groupSwitchCacheKey(9, "m", "g")
	groupSwitchMemMutex.Lock()
	groupSwitchMemCache[key] = groupSwitchEntry{group: "vip", expireAt: time.Now().Add(-time.Minute)}
	groupSwitchMemMutex.Unlock()

	assert.Empty(t, GetStickyGroupSwitch(9, "m", "g"))
}

func TestStickyGroupSwitchSharesRedisAcrossLocalCaches(t *testing.T) {
	server := useGroupSwitchRedis(t)
	resetGroupSwitchMemoryCache(t)

	SetStickyGroupSwitch(41, "gpt-shared", "default", "vip", 10)
	stored, err := server.Get(groupSwitchCacheKey(41, "gpt-shared", "default"))
	require.NoError(t, err)
	assert.Equal(t, "vip", stored)

	// Simulate a second instance with no process-local shadow.
	groupSwitchMemMutex.Lock()
	groupSwitchMemCache = make(map[string]groupSwitchEntry)
	groupSwitchMemMutex.Unlock()
	assert.Equal(t, "vip", GetStickyGroupSwitch(41, "gpt-shared", "default"))
}

func TestStickyGroupSwitchRedisReadMirrorsOnlyRemainingTTL(t *testing.T) {
	server := useGroupSwitchRedis(t)
	resetGroupSwitchMemoryCache(t)

	SetStickyGroupSwitch(45, "gpt-remaining", "default", "vip", 10)
	server.FastForward(9 * time.Minute)
	groupSwitchMemMutex.Lock()
	groupSwitchMemCache = make(map[string]groupSwitchEntry)
	groupSwitchMemMutex.Unlock()

	before := time.Now()
	assert.Equal(t, "vip", GetStickyGroupSwitch(45, "gpt-remaining", "default"))
	key := groupSwitchCacheKey(45, "gpt-remaining", "default")
	groupSwitchMemMutex.RLock()
	entry := groupSwitchMemCache[key]
	groupSwitchMemMutex.RUnlock()
	require.Equal(t, "vip", entry.group)
	assert.WithinDuration(t, before.Add(time.Minute), entry.expireAt, time.Second)
}

func TestStickyGroupSwitchRejectsRedisEntryWithoutBoundedTTL(t *testing.T) {
	server := useGroupSwitchRedis(t)
	resetGroupSwitchMemoryCache(t)
	key := groupSwitchCacheKey(46, "gpt-unbounded", "default")
	require.NoError(t, server.Set(key, "vip"))

	assert.Empty(t, GetStickyGroupSwitch(46, "gpt-unbounded", "default"))
}

func TestStickyGroupSwitchFallsBackToBoundedMemoryWhenRedisFails(t *testing.T) {
	useGroupSwitchRedis(t)
	resetGroupSwitchMemoryCache(t)

	unavailableClient := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1"})
	t.Cleanup(func() { _ = unavailableClient.Close() })
	common.RDB = unavailableClient

	SetStickyGroupSwitch(42, "gpt-fallback", "default", "vip", 10)
	assert.Equal(t, "vip", GetStickyGroupSwitch(42, "gpt-fallback", "default"))

	common.RedisEnabled = false
	for i := 0; i < groupSwitchMemoryCapacity+32; i++ {
		SetStickyGroupSwitch(1000+i, "gpt-capacity", "default", "vip", 10)
	}
	groupSwitchMemMutex.RLock()
	cacheSize := len(groupSwitchMemCache)
	groupSwitchMemMutex.RUnlock()
	assert.LessOrEqual(t, cacheSize, groupSwitchMemoryCapacity)
}

func TestStickyGroupSwitchRedisFailureMemoryExpiresAndConvergesAfterRecovery(t *testing.T) {
	server := useGroupSwitchRedis(t)
	resetGroupSwitchMemoryCache(t)
	workingClient := common.RDB

	unavailableClient := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1"})
	t.Cleanup(func() { _ = unavailableClient.Close() })
	common.RDB = unavailableClient

	SetStickyGroupSwitch(43, "gpt-recovery", "default", "vip", 10)
	key := groupSwitchCacheKey(43, "gpt-recovery", "default")
	groupSwitchMemMutex.Lock()
	entry := groupSwitchMemCache[key]
	entry.expireAt = time.Now().Add(-time.Second)
	groupSwitchMemCache[key] = entry
	groupSwitchMemMutex.Unlock()
	assert.Empty(t, GetStickyGroupSwitch(43, "gpt-recovery", "default"))

	SetStickyGroupSwitch(43, "gpt-recovery", "default", "vip", 10)
	common.RDB = workingClient
	require.False(t, server.Exists(key), "the failed Redis write must only exist in local fallback")
	assert.Empty(t, GetStickyGroupSwitch(43, "gpt-recovery", "default"), "an authoritative Redis miss must clear stale fallback state")
}

func TestStickyGroupSwitchCapsFallbackTTL(t *testing.T) {
	prev := common.RedisEnabled
	common.RedisEnabled = false
	defer func() { common.RedisEnabled = prev }()
	resetGroupSwitchMemoryCache(t)

	before := time.Now()
	SetStickyGroupSwitch(44, "gpt-ttl", "default", "vip", groupSwitchMaxCooldownMinutes+100)
	key := groupSwitchCacheKey(44, "gpt-ttl", "default")
	groupSwitchMemMutex.RLock()
	entry := groupSwitchMemCache[key]
	groupSwitchMemMutex.RUnlock()
	require.Equal(t, "vip", entry.group)
	assert.WithinDuration(t, before.Add(groupSwitchMaxCooldownMinutes*time.Minute), entry.expireAt, time.Second)
}
