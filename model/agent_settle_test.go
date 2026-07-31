package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupAgentSettleTest(t *testing.T) {
	t.Helper()
	truncateTables(t)
	require.NoError(t, DB.Exec("DELETE FROM users").Error)
	require.NoError(t, DB.Exec("DELETE FROM agents").Error)
	require.NoError(t, DB.Exec("DELETE FROM agent_ledgers").Error)
	require.NoError(t, DB.Exec("DELETE FROM top_ups").Error)

	oldRedis := common.RedisEnabled
	oldBatch := common.BatchUpdateEnabled
	common.RedisEnabled = false
	common.BatchUpdateEnabled = false
	t.Cleanup(func() {
		common.RedisEnabled = oldRedis
		common.BatchUpdateEnabled = oldBatch
	})
}

func readAgentWallet(t *testing.T, id int) int {
	t.Helper()
	var got Agent
	require.NoError(t, DB.First(&got, id).Error)
	return got.WalletQuota
}

func readUserQuota(t *testing.T, id int) int {
	t.Helper()
	var got User
	require.NoError(t, DB.First(&got, id).Error)
	return got.Quota
}

func settleInTx(t *testing.T, userId, agentId, quotaToAdd int, tradeNo string) bool {
	t.Helper()
	var credited bool
	err := DB.Transaction(func(tx *gorm.DB) error {
		var e error
		credited, e = SettleTerminalUserTopupTx(tx, userId, agentId, quotaToAdd, tradeNo)
		return e
	})
	require.NoError(t, err)
	return credited
}

func TestSettleTerminalUserTopup_PlatformDirect(t *testing.T) {
	setupAgentSettleTest(t)
	user := User{Id: 1, Username: "direct", Password: "password", Status: common.UserStatusEnabled, Quota: 0}
	require.NoError(t, DB.Create(&user).Error)

	credited := settleInTx(t, user.Id, 0, 500000, "t-direct")
	assert.True(t, credited)
	assert.Equal(t, 500000, readUserQuota(t, user.Id))

	var ledgerCount int64
	require.NoError(t, DB.Model(&AgentLedger{}).Count(&ledgerCount).Error)
	assert.Equal(t, int64(0), ledgerCount)
}

func TestSettleTerminalUserTopup_AgentEnough(t *testing.T) {
	setupAgentSettleTest(t)
	agent := Agent{Id: 1, OwnerUserId: 9, Name: "a1", Status: AgentStatusActive, WalletQuota: 500000, CostRatio: 1}
	require.NoError(t, DB.Create(&agent).Error)
	user := User{Id: 2, Username: "u-a1", Password: "password", Status: common.UserStatusEnabled, Quota: 0, AgentId: 1}
	require.NoError(t, DB.Create(&user).Error)

	credited := settleInTx(t, user.Id, user.AgentId, 500000, "t-a1")
	assert.True(t, credited)
	assert.Equal(t, 500000, readUserQuota(t, user.Id))
	assert.Equal(t, 0, readAgentWallet(t, agent.Id))

	var ledger AgentLedger
	require.NoError(t, DB.Where("agent_id = ?", agent.Id).First(&ledger).Error)
	assert.Equal(t, AgentLedgerTypeSettle, ledger.Type)
	assert.Equal(t, int64(-500000), ledger.QuotaDelta)
	assert.Equal(t, 0, ledger.BalanceAfter)
}

func TestSettleTerminalUserTopup_AgentDiscount(t *testing.T) {
	setupAgentSettleTest(t)
	agent := Agent{Id: 1, OwnerUserId: 9, Name: "a1", Status: AgentStatusActive, WalletQuota: 1000000, CostRatio: 0.8}
	require.NoError(t, DB.Create(&agent).Error)
	user := User{Id: 2, Username: "u-a1", Password: "password", Status: common.UserStatusEnabled, Quota: 0, AgentId: 1}
	require.NoError(t, DB.Create(&user).Error)

	// settleQuota = round(500000 * 0.8) = 400000
	credited := settleInTx(t, user.Id, user.AgentId, 500000, "t-a1")
	assert.True(t, credited)
	assert.Equal(t, 500000, readUserQuota(t, user.Id))
	assert.Equal(t, 600000, readAgentWallet(t, agent.Id))
}

func TestSettleTerminalUserTopup_AgentInsufficientHolds(t *testing.T) {
	setupAgentSettleTest(t)
	agent := Agent{Id: 1, OwnerUserId: 9, Name: "a1", Status: AgentStatusActive, WalletQuota: 100000, CostRatio: 1}
	require.NoError(t, DB.Create(&agent).Error)
	user := User{Id: 2, Username: "u-a1", Password: "password", Status: common.UserStatusEnabled, Quota: 0, AgentId: 1}
	require.NoError(t, DB.Create(&user).Error)

	credited := settleInTx(t, user.Id, user.AgentId, 500000, "t-a1")
	assert.False(t, credited)
	assert.Equal(t, 0, readUserQuota(t, user.Id))         // 未到账
	assert.Equal(t, 100000, readAgentWallet(t, agent.Id)) // 钱包不变，绝不为负

	var ledgerCount int64
	require.NoError(t, DB.Model(&AgentLedger{}).Count(&ledgerCount).Error)
	assert.Equal(t, int64(0), ledgerCount)
}

func TestApplyTerminalTopup_HeldThenResettle(t *testing.T) {
	setupAgentSettleTest(t)
	agent := Agent{Id: 1, OwnerUserId: 9, Name: "a1", Status: AgentStatusActive, WalletQuota: 0, CostRatio: 1}
	require.NoError(t, DB.Create(&agent).Error)
	user := User{Id: 2, Username: "u-a1", Password: "password", Status: common.UserStatusEnabled, Quota: 0, AgentId: 1}
	require.NoError(t, DB.Create(&user).Error)
	topUp := TopUp{Id: 1, UserId: user.Id, TradeNo: "t-held", Status: common.TopUpStatusPending, PaymentMethod: "epay", Amount: 1, CreateTime: common.GetTimestamp()}
	require.NoError(t, DB.Create(&topUp).Error)

	// 钱包为空 → 挂单
	var credited bool
	err := DB.Transaction(func(tx *gorm.DB) error {
		var e error
		credited, e = ApplyTerminalTopupTx(tx, &topUp, &user, 500000)
		return e
	})
	require.NoError(t, err)
	assert.False(t, credited)
	assert.Equal(t, 0, readUserQuota(t, user.Id))

	var held TopUp
	require.NoError(t, DB.First(&held, topUp.Id).Error)
	assert.Equal(t, common.TopUpStatusHeld, held.Status)
	assert.Equal(t, 500000, held.HeldQuota)

	// 代理补足钱包后补发（同步调用，避免异步不确定性）
	require.NoError(t, DB.Model(&Agent{}).Where("id = ?", agent.Id).Update("wallet_quota", 600000).Error)
	ResettleHeldTopups(agent.Id)

	assert.Equal(t, 500000, readUserQuota(t, user.Id))
	assert.Equal(t, 100000, readAgentWallet(t, agent.Id))
	var after TopUp
	require.NoError(t, DB.First(&after, topUp.Id).Error)
	assert.Equal(t, common.TopUpStatusSuccess, after.Status)
	assert.Equal(t, 0, after.HeldQuota)
}

func TestAdjustAgentWallet_PrepayAndFloor(t *testing.T) {
	setupAgentSettleTest(t)
	agent := Agent{Id: 1, OwnerUserId: 9, Name: "a1", Status: AgentStatusActive, WalletQuota: 0, CostRatio: 1}
	require.NoError(t, DB.Create(&agent).Error)

	require.NoError(t, AdjustAgentWallet(agent.Id, 300000, AgentLedgerTypePrepay, "p-1", 0, "预充值"))
	assert.Equal(t, 300000, readAgentWallet(t, agent.Id))

	var ledger AgentLedger
	require.NoError(t, DB.Where("agent_id = ? AND type = ?", agent.Id, AgentLedgerTypePrepay).First(&ledger).Error)
	assert.Equal(t, int64(300000), ledger.QuotaDelta)
	assert.Equal(t, 300000, ledger.BalanceAfter)

	// 扣超余额被拒，钱包绝不为负
	require.Error(t, AdjustAgentWallet(agent.Id, -400000, AgentLedgerTypeAdjust, "", 0, "调账"))
	assert.Equal(t, 300000, readAgentWallet(t, agent.Id))

	require.NoError(t, AdjustAgentWallet(agent.Id, -300000, AgentLedgerTypeAdjust, "", 0, "调账"))
	assert.Equal(t, 0, readAgentWallet(t, agent.Id))
}

func TestDecreaseAgentWalletIfEnough(t *testing.T) {
	setupAgentSettleTest(t)
	agent := Agent{Id: 1, OwnerUserId: 9, Name: "a1", Status: AgentStatusActive, WalletQuota: 100, CostRatio: 1}
	require.NoError(t, DB.Create(&agent).Error)

	ok, err := DecreaseAgentWalletIfEnough(agent.Id, 60)
	require.NoError(t, err)
	assert.True(t, ok)
	assert.Equal(t, 40, readAgentWallet(t, agent.Id))

	ok, err = DecreaseAgentWalletIfEnough(agent.Id, 60)
	require.NoError(t, err)
	assert.False(t, ok)
	assert.Equal(t, 40, readAgentWallet(t, agent.Id))

	ok, err = DecreaseAgentWalletIfEnough(agent.Id, 40)
	require.NoError(t, err)
	assert.True(t, ok)
	assert.Equal(t, 0, readAgentWallet(t, agent.Id))

	_, err = DecreaseAgentWalletIfEnough(agent.Id, -1)
	require.Error(t, err)
}
