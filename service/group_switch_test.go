package service

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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

	key := groupSwitchCacheKey(9, "m", "g")
	groupSwitchMemMutex.Lock()
	groupSwitchMemCache[key] = groupSwitchEntry{group: "vip", expireAt: time.Now().Add(-time.Minute)}
	groupSwitchMemMutex.Unlock()

	assert.Empty(t, GetStickyGroupSwitch(9, "m", "g"))
}
