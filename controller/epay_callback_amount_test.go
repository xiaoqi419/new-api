package controller

import (
	"bytes"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func signedEpayNotifyRequest(t *testing.T, tradeNo, money, key string) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	params := map[string]string{
		"out_trade_no": tradeNo,
		"trade_no":     "gateway-trade-1",
		"type":         "alipay",
		"money":        money,
		"trade_status": epay.StatusTradeSuccess,
	}
	ep := epay.GenerateParams(params, key)
	query := url.Values{}
	for name, value := range ep {
		query.Set(name, value)
	}
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/epay/notify?"+query.Encode(), nil)
	return ctx, recorder
}

func setupEpayCallbackAmountTopUpTest(t *testing.T) {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.TopUp{}, &model.User{}))
	model.DB, model.LOG_DB = db, db
	confirmPaymentComplianceForTest(t)

	originalPayAddress := operation_setting.PayAddress
	originalEpayID := operation_setting.EpayId
	originalEpayKey := operation_setting.EpayKey
	originalPayMethods := operation_setting.PayMethods
	operation_setting.PayAddress = "https://pay.example.com"
	operation_setting.EpayId = "merchant-id"
	operation_setting.EpayKey = "test-key"
	operation_setting.PayMethods = []map[string]string{{"type": "alipay"}}
	t.Cleanup(func() {
		operation_setting.PayAddress = originalPayAddress
		operation_setting.EpayId = originalEpayID
		operation_setting.EpayKey = originalEpayKey
		operation_setting.PayMethods = originalPayMethods
		model.DB, model.LOG_DB = previousDB, previousLogDB
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			require.NoError(t, sqlDB.Close())
		}
	})
}

func TestEpayCallbackAmountMatchesUsesDecimalBoundaries(t *testing.T) {
	testCases := []struct {
		name     string
		callback string
		order    float64
		matches  bool
	}{
		{name: "exact amount", callback: "9.99", order: 9.99, matches: true},
		{name: "trailing zeroes are equal", callback: "9.9900", order: 9.99, matches: true},
		{name: "different amount", callback: "10.00", order: 9.99, matches: false},
		{name: "empty callback amount", callback: "", order: 9.99, matches: false},
		{name: "invalid callback amount", callback: "not-a-number", order: 9.99, matches: false},
		{name: "negative callback amount", callback: "-9.99", order: 9.99, matches: false},
		{name: "negative local amount", callback: "9.99", order: -9.99, matches: false},
		{name: "non-finite local amount", callback: "9.99", order: math.Inf(1), matches: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.matches, epayCallbackAmountMatches(testCase.callback, testCase.order))
		})
	}
}

func TestEpayNotifyRejectsMismatchedAmountWithoutSettling(t *testing.T) {
	setupEpayCallbackAmountTopUpTest(t)
	gin.SetMode(gin.TestMode)
	order := &model.TopUp{
		UserId:          101,
		Amount:          1,
		Money:           9.99,
		TradeNo:         "epay-amount-mismatch",
		PaymentMethod:   "alipay",
		PaymentProvider: model.PaymentProviderEpay,
		Status:          common.TopUpStatusPending,
	}
	require.NoError(t, model.DB.Create(order).Error)

	ctx, recorder := signedEpayNotifyRequest(t, order.TradeNo, "10.00", operation_setting.EpayKey)
	EpayNotify(ctx)

	assert.Equal(t, "fail", recorder.Body.String())
	stored := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusPending, stored.Status)
}

func TestEpayNotifyRejectsMismatchedPaymentMethodWithoutSettling(t *testing.T) {
	setupEpayCallbackAmountTopUpTest(t)
	gin.SetMode(gin.TestMode)
	user := &model.User{Id: 101, Username: "epay-method-guard", Status: common.UserStatusEnabled}
	require.NoError(t, model.DB.Create(user).Error)
	order := &model.TopUp{
		UserId:          user.Id,
		Amount:          1,
		Money:           9.99,
		TradeNo:         "epay-method-mismatch",
		PaymentMethod:   "wxpay",
		PaymentProvider: model.PaymentProviderEpay,
		Status:          common.TopUpStatusPending,
	}
	require.NoError(t, model.DB.Create(order).Error)

	ctx, recorder := signedEpayNotifyRequest(t, order.TradeNo, "9.99", operation_setting.EpayKey)
	EpayNotify(ctx)

	assert.Equal(t, "fail", recorder.Body.String())
	stored := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusPending, stored.Status)
	assert.Equal(t, "wxpay", stored.PaymentMethod)
}

func TestEpayNotifyRejectsGroupBuyPaymentMethodMismatchWithoutSettling(t *testing.T) {
	setupEpayCallbackAmountTopUpTest(t)
	gin.SetMode(gin.TestMode)
	user := &model.User{Id: 102, Username: "epay-group-method-guard", Status: common.UserStatusEnabled}
	require.NoError(t, model.DB.Create(user).Error)
	order := &model.TopUp{
		UserId:          user.Id,
		Amount:          1,
		Money:           9.99,
		TradeNo:         "epay-group-method-mismatch",
		PaymentMethod:   "wxpay",
		PaymentProvider: model.PaymentProviderEpay,
		GroupBuyId:      777,
		Status:          common.TopUpStatusPending,
	}
	require.NoError(t, model.DB.Create(order).Error)

	ctx, recorder := signedEpayNotifyRequest(t, order.TradeNo, "9.99", operation_setting.EpayKey)
	EpayNotify(ctx)

	assert.Equal(t, "fail", recorder.Body.String())
	stored := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusPending, stored.Status)
	assert.Equal(t, "wxpay", stored.PaymentMethod)
}

func TestEpayNotifyDoesNotLogCallbackSecrets(t *testing.T) {
	setupEpayCallbackAmountTopUpTest(t)
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest(http.MethodGet, "/api/epay/notify?out_trade_no=epay-log-guard&type=alipay&trade_status=TRADE_SUCCESS&sign=sensitive-signature", nil)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = request

	var logs bytes.Buffer
	previousWriter := gin.DefaultWriter
	previousErrorWriter := gin.DefaultErrorWriter
	gin.DefaultWriter = &logs
	gin.DefaultErrorWriter = &logs
	t.Cleanup(func() {
		gin.DefaultWriter = previousWriter
		gin.DefaultErrorWriter = previousErrorWriter
	})

	EpayNotify(ctx)
	assert.Equal(t, "fail", recorder.Body.String())
	assert.NotContains(t, logs.String(), "sensitive-signature")
	assert.NotContains(t, logs.String(), "params=")
	assert.NotContains(t, logs.String(), "verify_info")
	assert.Contains(t, logs.String(), "trade_no=epay-log-guard")
}

func TestSubscriptionEpayNotifyRejectsMismatchedAmountWithoutSettling(t *testing.T) {
	setupSubscriptionEpayCheckoutTest(t, "https://pay.example.com", []map[string]string{{"type": "alipay"}})
	gin.SetMode(gin.TestMode)
	order := &model.SubscriptionOrder{
		UserId:          201,
		PlanId:          1,
		Money:           9.99,
		TradeNo:         "subscription-epay-amount-mismatch",
		PaymentMethod:   "alipay",
		PaymentProvider: model.PaymentProviderEpay,
		Status:          common.TopUpStatusPending,
	}
	require.NoError(t, model.DB.Create(order).Error)

	ctx, recorder := signedEpayNotifyRequest(t, order.TradeNo, "10.00", operation_setting.EpayKey)
	SubscriptionEpayNotify(ctx)

	assert.Equal(t, "fail", recorder.Body.String())
	stored := model.GetSubscriptionOrderByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusPending, stored.Status)
}
