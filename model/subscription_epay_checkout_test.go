package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func insertSubscriptionEpayCheckoutOrder(t *testing.T, tradeNo string, userId int, provider string, status string) {
	t.Helper()
	order := &SubscriptionOrder{
		UserId:          userId,
		PlanId:          1,
		Money:           9.99,
		TradeNo:         tradeNo,
		PaymentMethod:   "alipay",
		PaymentProvider: provider,
		Status:          status,
		CreateTime:      common.GetTimestamp(),
	}
	require.NoError(t, order.Insert())
}

func TestGetSubscriptionOrderByTradeNoAndUserIdScopesOrderToOwner(t *testing.T) {
	truncateTables(t)
	insertSubscriptionEpayCheckoutOrder(t, "subscription-status-owner", 101, PaymentProviderEpay, common.TopUpStatusPending)

	order := GetSubscriptionOrderByTradeNoAndUserId("subscription-status-owner", 101)
	require.NotNil(t, order)
	assert.Equal(t, "subscription-status-owner", order.TradeNo)

	assert.Nil(t, GetSubscriptionOrderByTradeNoAndUserId("subscription-status-owner", 102))
	assert.Nil(t, GetSubscriptionOrderByTradeNoAndUserId("", 101))
	assert.Nil(t, GetSubscriptionOrderByTradeNoAndUserId("subscription-status-owner", 0))
}

func TestFailPendingSubscriptionOrderOnlyUpdatesMatchingPendingEpayOrder(t *testing.T) {
	testCases := []struct {
		name             string
		storedProvider   string
		storedStatus     string
		expectedProvider string
		wantError        error
		wantStatus       string
	}{
		{
			name:             "marks matching pending order failed",
			storedProvider:   PaymentProviderEpay,
			storedStatus:     common.TopUpStatusPending,
			expectedProvider: PaymentProviderEpay,
			wantStatus:       common.TopUpStatusFailed,
		},
		{
			name:             "rejects another payment provider",
			storedProvider:   PaymentProviderStripe,
			storedStatus:     common.TopUpStatusPending,
			expectedProvider: PaymentProviderEpay,
			wantError:        ErrPaymentMethodMismatch,
			wantStatus:       common.TopUpStatusPending,
		},
		{
			name:             "does not overwrite completed order",
			storedProvider:   PaymentProviderEpay,
			storedStatus:     common.TopUpStatusSuccess,
			expectedProvider: PaymentProviderEpay,
			wantStatus:       common.TopUpStatusSuccess,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			truncateTables(t)
			tradeNo := "subscription-fail-" + tc.name
			insertSubscriptionEpayCheckoutOrder(t, tradeNo, 201, tc.storedProvider, tc.storedStatus)

			err := FailPendingSubscriptionOrder(tradeNo, tc.expectedProvider)
			if tc.wantError != nil {
				require.ErrorIs(t, err, tc.wantError)
			} else {
				require.NoError(t, err)
			}

			order := GetSubscriptionOrderByTradeNo(tradeNo)
			require.NotNil(t, order)
			assert.Equal(t, tc.wantStatus, order.Status)
			if tc.wantStatus == common.TopUpStatusFailed {
				assert.NotZero(t, order.CompleteTime)
			}
		})
	}
}

func TestCompleteSubscriptionOrderRejectsMismatchedEpayPaymentMethod(t *testing.T) {
	truncateTables(t)
	insertUserForPaymentGuardTest(t, 801, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 802)
	order := &SubscriptionOrder{
		UserId:          801,
		PlanId:          plan.Id,
		Money:           plan.PriceAmount,
		TradeNo:         "subscription-epay-method-mismatch",
		PaymentMethod:   "wxpay",
		PaymentProvider: PaymentProviderEpay,
		Status:          common.TopUpStatusPending,
		CreateTime:      common.GetTimestamp(),
	}
	require.NoError(t, order.Insert())

	err := CompleteSubscriptionOrder(order.TradeNo, `{"provider":"epay","type":"alipay"}`, PaymentProviderEpay, "alipay")
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)

	stored := GetSubscriptionOrderByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusPending, stored.Status)
	assert.Equal(t, "wxpay", stored.PaymentMethod)
	assert.Zero(t, countUserSubscriptionsForPaymentGuardTest(t, 801))
	assert.Nil(t, GetTopUpByTradeNo(order.TradeNo))
}
