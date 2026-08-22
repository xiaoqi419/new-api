package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupWeChatBindTestState(t *testing.T) {
	t.Helper()
	truncateTables(t)
	require.NoError(t, DB.Exec("DELETE FROM users").Error)

	oldRedisEnabled := common.RedisEnabled
	oldBatchUpdateEnabled := common.BatchUpdateEnabled
	common.RedisEnabled = false
	common.BatchUpdateEnabled = false
	t.Cleanup(func() {
		common.RedisEnabled = oldRedisEnabled
		common.BatchUpdateEnabled = oldBatchUpdateEnabled
	})
}

func TestBindWeChatIdBindsUnboundAccount(t *testing.T) {
	setupWeChatBindTestState(t)

	user := User{
		Id:       1,
		Username: "wechat-bind-user",
		Password: "password",
		Email:    "bind@example.com",
		Status:   common.UserStatusEnabled,
	}
	require.NoError(t, DB.Create(&user).Error)

	require.NoError(t, BindWeChatIdToUser(user.Id, "openid-a"))

	var got User
	require.NoError(t, DB.First(&got, user.Id).Error)
	assert.Equal(t, "openid-a", got.WeChatId)
}

func TestBindWeChatIdRejectsAccountAlreadyBound(t *testing.T) {
	setupWeChatBindTestState(t)

	user := User{
		Id:       1,
		Username: "already-bound",
		Password: "password",
		Email:    "bound@example.com",
		Status:   common.UserStatusEnabled,
		WeChatId: "openid-existing",
	}
	require.NoError(t, DB.Create(&user).Error)

	err := BindWeChatIdToUser(user.Id, "openid-new")
	require.Error(t, err, "已绑定其他微信的账号必须拒绝，不能静默顶替")
	assert.Contains(t, err.Error(), "已绑定其他微信")

	var got User
	require.NoError(t, DB.First(&got, user.Id).Error)
	assert.Equal(t, "openid-existing", got.WeChatId, "原绑定必须保持不变")
}

// 空 openid 必须被挡在参数校验，否则会给账号写入一个空 wechat_id，
// 而 IsWeChatIdAlreadyTaken("") 之后会把它当成「已被占用」，连累后续绑定。
func TestBindWeChatIdRejectsEmptyWeChatId(t *testing.T) {
	setupWeChatBindTestState(t)

	user := User{
		Id:       1,
		Username: "empty-openid",
		Password: "password",
		Email:    "empty@example.com",
		Status:   common.UserStatusEnabled,
	}
	require.NoError(t, DB.Create(&user).Error)

	require.Error(t, BindWeChatIdToUser(user.Id, ""))
	require.Error(t, BindWeChatIdToUser(0, "openid-a"))

	var got User
	require.NoError(t, DB.First(&got, user.Id).Error)
	assert.Empty(t, got.WeChatId)
}
