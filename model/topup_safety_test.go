package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRechargeOfficialOrderCreditsOnce(t *testing.T) {
	truncateTables(t)

	user := &User{Id: 901, Username: "official-topup-user", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(user).Error)
	topUp := &TopUp{
		Id:              901,
		UserId:          user.Id,
		Amount:          2,
		Money:           2,
		TradeNo:         "official-topup-normal",
		PaymentMethod:   PaymentMethodAlipay,
		PaymentProvider: PaymentProviderAlipay,
		Status:          common.TopUpStatusPending,
		CreateTime:      common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(topUp).Error)

	previousCallback := OnTopUpSuccess
	callbackCount := 0
	OnTopUpSuccess = func(_ *TopUp, quotaAdded int) {
		assert.Equal(t, common.QuotaPerUnit*2, float64(quotaAdded))
		callbackCount++
	}
	t.Cleanup(func() { OnTopUpSuccess = previousCallback })

	require.NoError(t, RechargeOfficialOrder(topUp.TradeNo, PaymentProviderAlipay, "alipay", "127.0.0.1"))
	assert.Equal(t, common.QuotaPerUnit*2, float64(readUserQuotaForTopUpSafetyTest(t, user.Id)))
	assert.Equal(t, common.TopUpStatusSuccess, getTopUpStatusForTopUpSafetyTest(t, topUp.TradeNo))
	assert.Equal(t, 1, callbackCount)

	// A repeated payment callback must not credit the account or invoke hooks again.
	require.NoError(t, RechargeOfficialOrder(topUp.TradeNo, PaymentProviderAlipay, "alipay", "127.0.0.1"))
	assert.Equal(t, common.QuotaPerUnit*2, float64(readUserQuotaForTopUpSafetyTest(t, user.Id)))
	assert.Equal(t, 1, callbackCount)
}

func TestRechargeOfficialOrderRejectsQuotaOverflow(t *testing.T) {
	truncateTables(t)

	user := &User{Id: 902, Username: "official-topup-overflow", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(user).Error)
	topUp := &TopUp{
		Id:              902,
		UserId:          user.Id,
		Amount:          1<<63 - 1,
		Money:           2,
		TradeNo:         "official-topup-overflow",
		PaymentMethod:   PaymentMethodWechatPay,
		PaymentProvider: PaymentProviderWechatPay,
		Status:          common.TopUpStatusPending,
		CreateTime:      common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(topUp).Error)

	err := RechargeOfficialOrder(topUp.TradeNo, PaymentProviderWechatPay, "wechatpay", "127.0.0.1")
	require.Error(t, err)
	assert.Equal(t, 0, readUserQuotaForTopUpSafetyTest(t, user.Id))
	assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForTopUpSafetyTest(t, topUp.TradeNo))
}

func readUserQuotaForTopUpSafetyTest(t *testing.T, userID int) int {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("quota").Where("id = ?", userID).First(&user).Error)
	return user.Quota
}

func getTopUpStatusForTopUpSafetyTest(t *testing.T, tradeNo string) string {
	t.Helper()
	var topUp TopUp
	require.NoError(t, DB.Where("trade_no = ?", tradeNo).First(&topUp).Error)
	return topUp.Status
}
