package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTryCompleteAgentPrepayCreditsWalletAndIsIdempotent(t *testing.T) {
	setupAgentSettleTest(t)
	owner := User{Id: 50, Username: "owner50", AgentId: 0}
	require.NoError(t, DB.Create(&owner).Error)
	agent := Agent{Id: 3, OwnerUserId: 50, Name: "a3", Status: AgentStatusActive, CostRatio: 1, WalletQuota: 0}
	require.NoError(t, DB.Create(&agent).Error)
	topUp := TopUp{
		Id: 100, UserId: 50, Amount: 10, Money: 73, TradeNo: "AGP3NOxyz",
		PaymentProvider: PaymentProviderEpay, AgentPrepayId: 3,
		Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(&topUp).Error)

	handled, err := TryCompleteAgentPrepay("AGP3NOxyz", PaymentProviderEpay, "1.2.3.4")
	require.NoError(t, err)
	assert.True(t, handled)

	want := common.QuotaFromFloat(10 * common.QuotaPerUnit)
	assert.Equal(t, want, readAgentWallet(t, 3))

	var count int64
	require.NoError(t, DB.Model(&AgentLedger{}).Where("agent_id = ? AND type = ?", 3, AgentLedgerTypePrepay).Count(&count).Error)
	assert.Equal(t, int64(1), count)

	var got TopUp
	require.NoError(t, DB.First(&got, 100).Error)
	assert.Equal(t, common.TopUpStatusSuccess, got.Status)

	// 幂等：重复回调不重复入账
	handled, err = TryCompleteAgentPrepay("AGP3NOxyz", PaymentProviderEpay, "1.2.3.4")
	require.NoError(t, err)
	assert.True(t, handled)
	assert.Equal(t, want, readAgentWallet(t, 3))
	require.NoError(t, DB.Model(&AgentLedger{}).Where("agent_id = ? AND type = ?", 3, AgentLedgerTypePrepay).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestTryCompleteAgentPrepayNonPrepayOrder(t *testing.T) {
	setupAgentSettleTest(t)
	topUp := TopUp{
		Id: 101, UserId: 1, Amount: 5, TradeNo: "USR1NOabc",
		PaymentProvider: PaymentProviderEpay, AgentPrepayId: 0,
		Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(&topUp).Error)
	handled, err := TryCompleteAgentPrepay("USR1NOabc", PaymentProviderEpay, "")
	require.NoError(t, err)
	assert.False(t, handled)
}

func TestTryCompleteAgentPrepayAutoApproveActivatesAgent(t *testing.T) {
	setupAgentSettleTest(t)
	old := common.AgentAutoApproveEnabled
	common.AgentAutoApproveEnabled = true
	t.Cleanup(func() { common.AgentAutoApproveEnabled = old })

	owner := User{Id: 51, Username: "owner51", AgentId: 0}
	require.NoError(t, DB.Create(&owner).Error)
	agent := Agent{Id: 4, OwnerUserId: 51, Name: "a4", Status: AgentStatusPending, CostRatio: 1}
	require.NoError(t, DB.Create(&agent).Error)
	topUp := TopUp{
		Id: 102, UserId: 51, Amount: 20, TradeNo: "AGP4NOxyz",
		PaymentProvider: PaymentProviderEpay, AgentPrepayId: 4,
		Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(&topUp).Error)

	handled, err := TryCompleteAgentPrepay("AGP4NOxyz", PaymentProviderEpay, "")
	require.NoError(t, err)
	assert.True(t, handled)

	var gotAgent Agent
	require.NoError(t, DB.First(&gotAgent, 4).Error)
	assert.Equal(t, AgentStatusActive, gotAgent.Status)
	var gotUser User
	require.NoError(t, DB.First(&gotUser, 51).Error)
	assert.True(t, gotUser.IsAgent)
}
