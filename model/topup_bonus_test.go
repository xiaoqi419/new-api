package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withTopUpBonusCampaign(t *testing.T, raw string) {
	t.Helper()
	common.OptionMapRWMutex.Lock()
	created := false
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
		created = true
	}
	previous, had := common.OptionMap[TopUpBonusOptionKey]
	common.OptionMap[TopUpBonusOptionKey] = raw
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		defer common.OptionMapRWMutex.Unlock()
		if common.OptionMap == nil {
			return
		}
		if had {
			common.OptionMap[TopUpBonusOptionKey] = previous
			return
		}
		delete(common.OptionMap, TopUpBonusOptionKey)
		if created && len(common.OptionMap) == 0 {
			common.OptionMap = nil
		}
	})
}

func giftQuotaForYuan(t *testing.T, yuan float64) int {
	t.Helper()
	quota, err := common.WalletQuotaFromDecimalStrict(
		decimal.NewFromFloat(yuan).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Truncate(0),
	)
	require.NoError(t, err)
	return quota
}

func openBonusCampaign(tiers string) string {
	now := common.GetTimestamp()
	return fmt.Sprintf(`{"enabled":true,"start":%d,"end":%d,"tiers":%s}`, now-60, now+3600, tiers)
}

func TestTopUpBonusQuotaGiftsNothingWhenCampaignClosed(t *testing.T) {
	now := common.GetTimestamp()
	cases := []struct {
		name string
		raw  string
	}{
		{name: "missing", raw: ""},
		{name: "disabled", raw: fmt.Sprintf(`{"enabled":false,"start":%d,"end":%d,"tiers":[{"pay":200,"gift":30}]}`, now-60, now+3600)},
		{name: "not started", raw: `{"enabled":true,"start":2000000000,"end":2000003600,"tiers":[{"pay":200,"gift":30}]}`},
		{name: "ended", raw: `{"enabled":true,"start":1,"end":2,"tiers":[{"pay":200,"gift":30}]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			withTopUpBonusCampaign(t, tc.raw)
			got, err := TopUpBonusQuota(200, now)
			require.NoError(t, err)
			assert.Equal(t, 0, got)
		})
	}
}

func TestTopUpBonusQuotaMatchesHighestTier(t *testing.T) {
	withTopUpBonusCampaign(t, openBonusCampaign(`[{"pay":500,"gift":80},{"pay":100,"gift":10},{"pay":200,"gift":30}]`))
	now := common.GetTimestamp()
	cases := []struct {
		money float64
		gift  float64
	}{
		{money: 99.99, gift: 0},
		{money: 100, gift: 10},
		{money: 199.99, gift: 10},
		{money: 200, gift: 30},
		{money: 250, gift: 30},
		{money: 500, gift: 80},
	}
	for _, tc := range cases {
		t.Run(fmt.Sprintf("%.2f", tc.money), func(t *testing.T) {
			got, err := TopUpBonusQuota(tc.money, now)
			require.NoError(t, err)
			if tc.gift == 0 {
				assert.Equal(t, 0, got)
				return
			}
			assert.Equal(t, giftQuotaForYuan(t, tc.gift), got)
		})
	}
}

func TestNormalizeTopUpBonusCampaignRejectsInvalidTiers(t *testing.T) {
	_, err := NormalizeTopUpBonusCampaign(`{"enabled":true,"start":0,"end":10,"tiers":[{"pay":10,"gift":1}]}`)
	require.EqualError(t, err, "充值活动起止时间无效")
	_, err = NormalizeTopUpBonusCampaign(`{"enabled":false,"start":0,"end":0,"tiers":[{"pay":10,"gift":1},{"pay":10,"gift":2}]}`)
	require.EqualError(t, err, "充值活动档位金额重复")
}

func TestApplyTerminalTopupBonusFreezesAndSkipsAgentCost(t *testing.T) {
	setupAgentSettleTest(t)
	withTopUpBonusCampaign(t, openBonusCampaign(`[{"pay":100,"gift":10},{"pay":200,"gift":30}]`))
	expectedBonus := giftQuotaForYuan(t, 30)
	paidQuota := 500000

	agent := Agent{Id: 1, OwnerUserId: 9, Name: "bonus-agent", Status: AgentStatusActive, WalletQuota: 0, CostRatio: 1}
	require.NoError(t, DB.Create(&agent).Error)
	user := User{Id: 2, Username: "bonus-user", Password: "password", Status: common.UserStatusEnabled, Quota: 0, AgentId: agent.Id}
	require.NoError(t, DB.Create(&user).Error)
	topUp := TopUp{
		Id: 1, UserId: user.Id, TradeNo: "t-bonus-held", Status: common.TopUpStatusPending,
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		Amount: 1, Money: 200, CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(&topUp).Error)

	var credited bool
	err := DB.Transaction(func(tx *gorm.DB) error {
		var applyErr error
		credited, applyErr = ApplyTerminalTopupTx(tx, &topUp, &user, paidQuota)
		return applyErr
	})
	require.NoError(t, err)
	assert.False(t, credited)
	assert.Equal(t, 0, readUserQuota(t, user.Id))

	var held TopUp
	require.NoError(t, DB.First(&held, topUp.Id).Error)
	assert.Equal(t, common.TopUpStatusHeld, held.Status)
	assert.Equal(t, expectedBonus, held.BonusQuota)

	// A later campaign must not change the frozen gift, and the agent pays only the purchased quota.
	withTopUpBonusCampaign(t, `{"enabled":false,"start":0,"end":0,"tiers":[]}`)
	laterBonus, bonusErr := TopUpBonusQuota(200, common.GetTimestamp())
	require.NoError(t, bonusErr)
	assert.Equal(t, 0, laterBonus)

	require.NoError(t, DB.Model(&Agent{}).Where("id = ?", agent.Id).Update("wallet_quota", paidQuota).Error)
	ResettleHeldTopups(agent.Id)

	assert.Equal(t, paidQuota+expectedBonus, readUserQuota(t, user.Id))
	assert.Equal(t, 0, readAgentWallet(t, agent.Id))
	var ledger AgentLedger
	require.NoError(t, DB.Where("agent_id = ? AND type = ?", agent.Id, AgentLedgerTypeSettle).First(&ledger).Error)
	assert.Equal(t, int64(-paidQuota), ledger.QuotaDelta)

	var settled TopUp
	require.NoError(t, DB.First(&settled, topUp.Id).Error)
	assert.Equal(t, common.TopUpStatusSuccess, settled.Status)
	assert.Equal(t, expectedBonus, settled.BonusQuota)
}

func TestCompletePaidTopupByTradeNoBonusIsIdempotent(t *testing.T) {
	setupAgentSettleTest(t)
	withTopUpBonusCampaign(t, openBonusCampaign(`[{"pay":100,"gift":10},{"pay":200,"gift":30}]`))
	expectedBonus := giftQuotaForYuan(t, 30)
	paidQuota := 500000

	user := User{Id: 3, Username: "bonus-direct", Password: "password", Status: common.UserStatusEnabled, Quota: 0}
	require.NoError(t, DB.Create(&user).Error)
	topUp := TopUp{
		Id: 2, UserId: user.Id, TradeNo: "t-bonus-once", Status: common.TopUpStatusPending,
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		Amount: 1, Money: 200, CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(&topUp).Error)

	credited, bonus, err := CompletePaidTopupByTradeNo(topUp.TradeNo, PaymentProviderEpay, "", paidQuota)
	require.NoError(t, err)
	assert.True(t, credited)
	assert.Equal(t, expectedBonus, bonus)
	assert.Equal(t, paidQuota+expectedBonus, readUserQuota(t, user.Id))

	withTopUpBonusCampaign(t, openBonusCampaign(`[{"pay":200,"gift":80}]`))
	creditedAgain, bonusAgain, err := CompletePaidTopupByTradeNo(topUp.TradeNo, PaymentProviderEpay, "", paidQuota)
	require.NoError(t, err)
	assert.False(t, creditedAgain)
	assert.Equal(t, 0, bonusAgain)
	assert.Equal(t, paidQuota+expectedBonus, readUserQuota(t, user.Id))
}
