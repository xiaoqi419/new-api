package model

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCalcSubscriptionBalanceQuotaRejectsNonFiniteAndOverflow(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })
	common.QuotaPerUnit = 500000
	const maxTopUpAmount int64 = 1<<63 - 1

	quota, err := calcSubscriptionBalanceQuota(math.NaN())
	require.Error(t, err)
	assert.Zero(t, quota)

	quota, err = calcSubscriptionBalanceQuota(math.MaxFloat64)
	require.Error(t, err)
	assert.Zero(t, quota)

	quota, err = calcSubscriptionBalanceQuota(0.000001)
	require.NoError(t, err)
	assert.Equal(t, 1, quota, "balance purchase keeps the existing ceiling semantics")
}

func TestTryCompleteAgentPrepayRejectsQuotaOverflow(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })
	setupAgentSettleTest(t)
	common.QuotaPerUnit = 500000

	owner := User{Id: 52, Username: "owner52"}
	require.NoError(t, DB.Create(&owner).Error)
	agent := Agent{Id: 5, OwnerUserId: owner.Id, Name: "a5", Status: AgentStatusActive, CostRatio: 1}
	require.NoError(t, DB.Create(&agent).Error)
	require.NoError(t, DB.Create(&TopUp{
		Id:              103,
		UserId:          owner.Id,
		Amount:          maxTopUpAmount,
		TradeNo:         "AGP5OVERFLOW",
		PaymentProvider: PaymentProviderEpay,
		AgentPrepayId:   agent.Id,
		Status:          common.TopUpStatusPending,
		CreateTime:      common.GetTimestamp(),
	}).Error)

	handled, err := TryCompleteAgentPrepay("AGP5OVERFLOW", PaymentProviderEpay, "")
	assert.True(t, handled)
	require.Error(t, err)
	assert.Zero(t, readAgentWallet(t, agent.Id))

	var topUp TopUp
	require.NoError(t, DB.First(&topUp, 103).Error)
	assert.Equal(t, common.TopUpStatusPending, topUp.Status)
}

func TestGrantGroupBuySuccessRejectsQuotaOverflow(t *testing.T) {
	setupGroupBuyTest(t)
	oldQuotaPerUnit := common.QuotaPerUnit
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })
	common.QuotaPerUnit = math.MaxFloat64

	groupBuy := &GroupBuy{Status: GroupBuyStatusPending}
	members, err := grantGroupBuySuccessTx(DB, groupBuy, 1)
	require.Error(t, err)
	assert.Nil(t, members)
	assert.Equal(t, GroupBuyStatusPending, groupBuy.Status)
}
