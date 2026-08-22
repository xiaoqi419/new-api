package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTenantAuthTestState(t *testing.T) {
	t.Helper()
	truncateTables(t)
	require.NoError(t, DB.Exec("DELETE FROM users").Error)

	oldRedis := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = oldRedis })
}

func mustHash(t *testing.T, pw string) string {
	t.Helper()
	h, err := common.Password2Hash(pw)
	require.NoError(t, err)
	return h
}

// 同一用户名可在平台与不同代理下并存(复合命名空间)，登录按租户 agent_id 精确解析。
func TestValidateAndFillWithTenantNamespacing(t *testing.T) {
	setupTenantAuthTestState(t)

	require.NoError(t, DB.Create(&User{
		Username: "alice", Password: mustHash(t, "pf-pass"),
		AgentId: 0, Status: common.UserStatusEnabled, AffCode: "pf",
	}).Error)

	agent := &Agent{OwnerUserId: 90001, Name: "AgentX", Status: AgentStatusActive, CostRatio: 1}
	require.NoError(t, agent.Insert())

	require.NoError(t, DB.Create(&User{
		Username: "alice", Password: mustHash(t, "term-pass"),
		AgentId: agent.Id, Status: common.UserStatusEnabled, AffCode: "tm",
	}).Error)

	platform := User{Username: "alice", Password: "pf-pass"}
	require.NoError(t, platform.ValidateAndFillWithTenant(0))
	assert.Equal(t, 0, platform.AgentId)

	terminal := User{Username: "alice", Password: "term-pass"}
	require.NoError(t, terminal.ValidateAndFillWithTenant(agent.Id))
	assert.Equal(t, agent.Id, terminal.AgentId)

	// 平台密码不能用于代理域名下的同名终端用户
	crossed := User{Username: "alice", Password: "pf-pass"}
	require.ErrorIs(t, crossed.ValidateAndFillWithTenant(agent.Id), ErrInvalidCredentials)

	// 复合唯一索引 (agent_id, username) 阻止同代理下重复用户名
	dupErr := DB.Create(&User{
		Username: "alice", Password: mustHash(t, "dup"),
		AgentId: agent.Id, Status: common.UserStatusEnabled, AffCode: "dup",
	}).Error
	require.Error(t, dupErr)
}

// 代理域名上优先识别代理 owner(平台账号 agent_id=0)，同名终端用户被 owner 遮蔽(S2/S3)。
func TestValidateAndFillWithTenantOwnerPrecedence(t *testing.T) {
	setupTenantAuthTestState(t)

	owner := &User{
		Username: "owneruser", Password: mustHash(t, "owner-pass"),
		AgentId: 0, IsAgent: true, Status: common.UserStatusEnabled, AffCode: "ow",
	}
	require.NoError(t, DB.Create(owner).Error)

	agent := &Agent{OwnerUserId: owner.Id, Name: "AgentY", Status: AgentStatusActive, CostRatio: 1}
	require.NoError(t, agent.Insert())

	require.NoError(t, DB.Create(&User{
		Username: "owneruser", Password: mustHash(t, "term-pass"),
		AgentId: agent.Id, Status: common.UserStatusEnabled, AffCode: "t2",
	}).Error)

	login := User{Username: "owneruser", Password: "owner-pass"}
	require.NoError(t, login.ValidateAndFillWithTenant(agent.Id))
	assert.Equal(t, owner.Id, login.Id)
	assert.Equal(t, 0, login.AgentId)
	assert.True(t, login.IsAgent)

	// owner 用户名在其域名被保留：同名终端用户即使密码正确也被遮蔽
	shadow := User{Username: "owneruser", Password: "term-pass"}
	require.ErrorIs(t, shadow.ValidateAndFillWithTenant(agent.Id), ErrInvalidCredentials)
}
