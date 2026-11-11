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

func TestDiscountCampaignThresholdTiers(t *testing.T) {
	now := common.GetTimestamp()
	withTopUpBonusCampaign(t, fmt.Sprintf(`{"enabled":true,"mode":"discount","start":%d,"end":%d,"tiers":[{"pay":100,"discount":0.9},{"pay":500,"discount":0.8}]}`, now-10, now+60))
	for _, tc := range []struct{ amount, rate float64 }{{99, 1}, {100, .9}, {101, .9}, {300, .9}, {499, .9}, {500, .8}, {501, .8}, {1000, .8}} {
		rate, active := TopUpDiscount(tc.amount, now)
		assert.True(t, active)
		assert.Equal(t, tc.rate, rate)
	}
	bonus, err := TopUpBonusQuota(200, now)
	require.NoError(t, err)
	assert.Zero(t, bonus)
	_, active := TopUpDiscount(100, now+61)
	assert.False(t, active)
}

func TestDiscountCampaignValidation(t *testing.T) {
	for _, raw := range []string{
		`{"mode":"invalid"}`,
		`{"mode":"discount","tiers":[{"pay":100,"discount":0}]}`,
		`{"mode":"discount","tiers":[{"pay":100,"discount":1.1}]}`,
		`{"mode":"discount","tiers":[{"pay":100.5,"discount":0.9}]}`,
		`{"mode":"discount","tiers":[{"pay":100,"discount":0.99999}]}`,
	} {
		_, err := NormalizeTopUpBonusCampaign(raw)
		require.Error(t, err, raw)
	}
	normalized, err := NormalizeTopUpBonusCampaign(`{"mode":"discount","tiers":[{"pay":100,"discount":0.9}]}`)
	require.NoError(t, err)
	assert.Contains(t, normalized, `"mode":"discount"`)
}

func TestNewTopupFreezesGiftBeforeCampaignChanges(t *testing.T) {
	setupAgentSettleTest(t)
	withTopUpBonusCampaign(t, openBonusCampaign(`[{"pay":100,"gift":10}]`))
	user := User{Id: 40, Username: "snapshot-gift", Password: "password", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(&user).Error)
	topup := TopUp{UserId: user.Id, Amount: 100, Money: 100, TradeNo: "snapshot-gift-order", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp()}
	require.NoError(t, topup.Insert())
	assert.True(t, topup.CampaignSnapshot)
	withTopUpBonusCampaign(t, `{"enabled":false}`)
	paid := giftQuotaForYuan(t, 100)
	credited, bonus, err := CompletePaidTopupByTradeNo(topup.TradeNo, PaymentProviderEpay, "", paid)
	require.NoError(t, err)
	assert.True(t, credited)
	assert.Equal(t, giftQuotaForYuan(t, 10), bonus)
	assert.Equal(t, giftQuotaForYuan(t, 110), readUserQuota(t, user.Id))
}

func TestDiscountOrderCannotGainLaterGiftOrLoseCreditedQuota(t *testing.T) {
	setupAgentSettleTest(t)
	user := User{Id: 41, Username: "snapshot-discount", Password: "password", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(&user).Error)
	paid := giftQuotaForYuan(t, 100)
	topup := TopUp{UserId: user.Id, Amount: 100, Money: 90, TradeNo: "snapshot-discount-order", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp(), CampaignSnapshot: true, CampaignMode: "discount", CampaignDiscount: .9, CreditedQuota: paid}
	require.NoError(t, topup.Insert())
	withTopUpBonusCampaign(t, openBonusCampaign(`[{"pay":90,"gift":20}]`))
	credited, bonus, err := CompletePaidTopupByTradeNo(topup.TradeNo, PaymentProviderEpay, "", giftQuotaForYuan(t, 90))
	require.NoError(t, err)
	assert.True(t, credited)
	assert.Zero(t, bonus)
	assert.Equal(t, paid, readUserQuota(t, user.Id))
	again, _, err := CompletePaidTopupByTradeNo(topup.TradeNo, PaymentProviderEpay, "", paid)
	require.NoError(t, err)
	assert.False(t, again)
	assert.Equal(t, paid, readUserQuota(t, user.Id))
}

func TestDiscountStripeSettlementUsesFrozenPurchasedQuota(t *testing.T) {
	for _, manual := range []bool{false, true} {
		t.Run(fmt.Sprintf("manual_%v", manual), func(t *testing.T) {
			setupAgentSettleTest(t)
			user := User{Id: 42, Username: "stripe-discount", Password: "password", Status: common.UserStatusEnabled}
			require.NoError(t, DB.Create(&user).Error)
			topup := TopUp{UserId: user.Id, Amount: 100, Money: 90, TradeNo: "stripe-discount", PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp(), CampaignSnapshot: true, CampaignMode: "discount", CampaignDiscount: .9, CreditedQuota: giftQuotaForYuan(t, 100)}
			require.NoError(t, topup.Insert())
			withTopUpBonusCampaign(t, openBonusCampaign(`[{"pay":90,"gift":20}]`))
			if manual {
				require.NoError(t, ManualCompleteTopUp(topup.TradeNo, ""))
			} else {
				require.NoError(t, Recharge(topup.TradeNo, "cus_test", ""))
			}
			assert.Equal(t, giftQuotaForYuan(t, 100), readUserQuota(t, user.Id))
			var saved TopUp
			require.NoError(t, DB.First(&saved, topup.Id).Error)
			assert.Equal(t, 90.0, saved.Money)
			assert.Zero(t, saved.BonusQuota)
		})
	}
}

func TestDiscountCampaignLifecycleAndDuplicateTiers(t *testing.T) {
	now := common.GetTimestamp()
	for _, window := range []struct {
		enabled    bool
		start, end int64
	}{{false, now - 10, now + 10}, {true, now + 10, now + 20}, {true, now - 20, now - 10}} {
		withTopUpBonusCampaign(t, fmt.Sprintf(`{"mode":"discount","enabled":%t,"start":%d,"end":%d,"tiers":[{"pay":100,"discount":0.9}]}`, window.enabled, window.start, window.end))
		rate, active := TopUpDiscount(100, now)
		assert.False(t, active)
		assert.Equal(t, 1.0, rate)
	}
	_, err := NormalizeTopUpBonusCampaign(`{"mode":"discount","tiers":[{"pay":100,"discount":0.9},{"pay":100,"discount":0.8}]}`)
	require.Error(t, err)
}

func TestCapturedCampaignRemainsStableDuringPayment(t *testing.T) {
	now := common.GetTimestamp()
	withTopUpBonusCampaign(t, fmt.Sprintf(`{"enabled":true,"mode":"discount","start":%d,"end":%d,"tiers":[{"pay":500,"discount":0.8},{"pay":100,"discount":0.9}]}`, now-1, now+100))
	captured := ActiveTopUpBonus(now)
	withTopUpBonusCampaign(t, openBonusCampaign(`[{"pay":100,"gift":50}]`))
	rate, active := captured.Discount(499)
	assert.True(t, active)
	assert.Equal(t, .9, rate)
	rate, active = captured.Discount(500)
	assert.True(t, active)
	assert.Equal(t, .8, rate)
	gift, err := captured.BonusQuota(500)
	require.NoError(t, err)
	assert.Zero(t, gift)
}
