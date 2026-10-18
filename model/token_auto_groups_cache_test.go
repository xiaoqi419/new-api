package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTokenAutoGroupsRoundTripThroughRedisHashCache(t *testing.T) {
	useUserCacheMiniRedis(t)
	token := Token{
		Id:         42,
		UserId:     7,
		Key:        "token-auto-groups-cache-key",
		Name:       "auto-cache",
		Group:      "auto",
		AutoGroups: `["vip","default"]`,
	}

	require.NoError(t, cacheSetTokenForTest(token))
	cached, err := cacheGetTokenByKey(token.Key)
	require.NoError(t, err)
	assert.Equal(t, token.AutoGroups, cached.AutoGroups)
	groups, err := cached.GetAutoGroups()
	require.NoError(t, err)
	assert.Equal(t, []string{"vip", "default"}, groups)
}

func TestTokenAllowUserQuotaQueryRoundTripsThroughRedisHashCache(t *testing.T) {
	server := useUserCacheMiniRedis(t)
	token := Token{Id: 43, UserId: 7, Key: "token-user-quota-cache-key", Name: "user-quota-cache", AllowUserQuotaQuery: true}

	initialized, err := cacheInitToken(token)
	require.NoError(t, err)
	require.Equal(t, 1, initialized)
	cached, err := cacheGetTokenByKey(token.Key)
	require.NoError(t, err)
	assert.True(t, cached.AllowUserQuotaQuery)
	assert.Positive(t, server.TTL(getTokenCacheKey(token.Key)))
}

func TestTokenQuotaQueryPermissionRevocationInvalidatesCacheAndPreservesRouting(t *testing.T) {
	truncateTables(t)
	useUserCacheMiniRedis(t)
	token := Token{
		UserId: 7, Key: "token-quota-query-revoke", Name: "quota-query-revoke", ExpiredTime: -1,
		AllowUserQuotaQuery: true, Group: "auto", AutoGroups: `["default","vip"]`,
		GroupSwitchEnabled: true, GroupSwitchGroups: `["vip","default"]`, GroupSwitchThreshold: 3, GroupSwitchCooldown: 30,
		MaxConcurrency: 4, RemainQuota: 100, UsedQuota: 20,
	}
	require.NoError(t, token.Insert())
	initialized, err := cacheInitToken(token)
	require.NoError(t, err)
	require.Equal(t, 1, initialized)
	cached, err := GetTokenByKey(token.Key, false)
	require.NoError(t, err)
	require.True(t, cached.AllowUserQuotaQuery)

	token.AllowUserQuotaQuery = false
	require.NoError(t, token.Update())
	_, err = cacheGetTokenByKey(token.Key)
	require.Error(t, err, "revoked wallet visibility must not survive in a preheated cache")
	reloaded, err := GetTokenByKey(token.Key, false)
	require.NoError(t, err)
	assert.False(t, reloaded.AllowUserQuotaQuery)
	assert.Equal(t, token.AutoGroups, reloaded.AutoGroups)
	assert.True(t, reloaded.GroupSwitchEnabled)
	assert.Equal(t, []string{"vip", "default"}, reloaded.GetGroupSwitchGroups())
	assert.Equal(t, 3, reloaded.GroupSwitchThreshold)
	assert.Equal(t, 30, reloaded.GroupSwitchCooldown)
	assert.Equal(t, 4, reloaded.MaxConcurrency)
	assert.Equal(t, 100, reloaded.RemainQuota)
	assert.Equal(t, 20, reloaded.UsedQuota)

	for _, enabled := range []bool{false, true} {
		reloaded.AllowUserQuotaQuery = enabled
		encoded, err := common.Marshal(reloaded)
		require.NoError(t, err)
		var payload map[string]any
		require.NoError(t, common.Unmarshal(encoded, &payload))
		assert.Equal(t, enabled, payload["allow_user_quota_query"], "explicit false must remain visible to clients")
		var cloned Token
		require.NoError(t, common.Unmarshal(encoded, &cloned))
		assert.Equal(t, enabled, cloned.AllowUserQuotaQuery)
	}
}

func TestTokenUpdateSynchronouslyNarrowsPreheatedAutoGroupsCache(t *testing.T) {
	truncateTables(t)
	useUserCacheMiniRedis(t)
	token := Token{
		UserId:          7,
		Key:             "token-auto-groups-update-cache-key",
		Name:            "auto-cache-update",
		Status:          common.TokenStatusEnabled,
		ExpiredTime:     -1,
		UnlimitedQuota:  true,
		Group:           "auto",
		CrossGroupRetry: true,
		AutoGroups:      `["default","vip"]`,
	}
	require.NoError(t, token.Insert())
	require.NoError(t, cacheSetTokenForTest(token))

	preheated, err := cacheGetTokenByKey(token.Key)
	require.NoError(t, err)
	assert.JSONEq(t, `["default","vip"]`, preheated.AutoGroups)

	require.NoError(t, token.SetAutoGroups([]string{"vip"}))
	require.NoError(t, token.Update())
	// Update 是限制性变更：写库前删除缓存并设置 fence。缓存不再提供旧的
	// 宽分组值，下一次读取必须看到收紧后的分组。
	_, cacheErr := cacheGetTokenByKey(token.Key)
	require.Error(t, cacheErr, "the pre-update cache entry must be invalidated")
	reloaded, err := GetTokenByKey(token.Key, false)
	require.NoError(t, err)
	assert.JSONEq(t, `["vip"]`, reloaded.AutoGroups)
}

// cacheSetTokenForTest 以测试身份写入完整 token 缓存（含额度字段），
// 模拟“已水合”的缓存状态。
func cacheSetTokenForTest(token Token) error {
	_, err := cacheInitToken(token)
	return err
}
