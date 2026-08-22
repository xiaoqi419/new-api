package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupQuotaFloorTestState(t *testing.T) {
	t.Helper()
	truncateTables(t)
	require.NoError(t, DB.Exec("DELETE FROM users").Error)
	require.NoError(t, DB.Exec("DELETE FROM tokens").Error)

	oldRedisEnabled := common.RedisEnabled
	oldBatchUpdateEnabled := common.BatchUpdateEnabled
	common.RedisEnabled = false
	common.BatchUpdateEnabled = false
	t.Cleanup(func() {
		common.RedisEnabled = oldRedisEnabled
		common.BatchUpdateEnabled = oldBatchUpdateEnabled
	})
}

func TestDecreaseUserQuotaIfEnoughEnforcesFloor(t *testing.T) {
	setupQuotaFloorTestState(t)

	user := User{Id: 1, Username: "user-quota-floor", Password: "password", Status: common.UserStatusEnabled, Quota: 100}
	require.NoError(t, DB.Create(&user).Error)

	readQuota := func() int {
		var got User
		require.NoError(t, DB.First(&got, user.Id).Error)
		return got.Quota
	}

	ok, err := DecreaseUserQuotaIfEnough(user.Id, 60)
	require.NoError(t, err)
	assert.True(t, ok)
	assert.Equal(t, 40, readQuota())

	// Insufficient balance must not deduct and must report failure, so a
	// concurrent request that lost the race is rejected instead of overspending.
	ok, err = DecreaseUserQuotaIfEnough(user.Id, 60)
	require.NoError(t, err)
	assert.False(t, ok)
	assert.Equal(t, 40, readQuota())

	// Spending exactly the remaining balance is allowed.
	ok, err = DecreaseUserQuotaIfEnough(user.Id, 40)
	require.NoError(t, err)
	assert.True(t, ok)
	assert.Equal(t, 0, readQuota())

	_, err = DecreaseUserQuotaIfEnough(user.Id, -1)
	require.Error(t, err)
}

func TestDecreaseTokenQuotaIfEnoughEnforcesFloor(t *testing.T) {
	setupQuotaFloorTestState(t)

	token := Token{Id: 1, UserId: 1, Key: "token-quota-floor", RemainQuota: 100, UsedQuota: 0}
	require.NoError(t, DB.Create(&token).Error)

	readToken := func() Token {
		var got Token
		require.NoError(t, DB.First(&got, token.Id).Error)
		return got
	}

	ok, err := DecreaseTokenQuotaIfEnough(token.Id, token.Key, 70)
	require.NoError(t, err)
	assert.True(t, ok)
	got := readToken()
	assert.Equal(t, 30, got.RemainQuota)
	assert.Equal(t, 70, got.UsedQuota)

	// Insufficient remaining quota must leave both counters untouched.
	ok, err = DecreaseTokenQuotaIfEnough(token.Id, token.Key, 70)
	require.NoError(t, err)
	assert.False(t, ok)
	got = readToken()
	assert.Equal(t, 30, got.RemainQuota)
	assert.Equal(t, 70, got.UsedQuota)

	ok, err = DecreaseTokenQuotaIfEnough(token.Id, token.Key, 30)
	require.NoError(t, err)
	assert.True(t, ok)
	got = readToken()
	assert.Equal(t, 0, got.RemainQuota)
	assert.Equal(t, 100, got.UsedQuota)
}
