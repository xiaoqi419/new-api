package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupGMPayTopUpTest(t *testing.T) {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedisEnabled := common.RedisEnabled
	previousMainDatabaseType := common.MainDatabaseType()
	previousLogDatabaseType := common.LogDatabaseType()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.TopUp{}, &model.User{}, &model.Log{}))
	model.DB, model.LOG_DB = db, db
	common.RedisEnabled = false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, model.InitLogDB())

	previousPayAddress := operation_setting.PayAddress
	previousEpayID := operation_setting.EpayId
	previousEpayKey := operation_setting.EpayKey
	previousPayMethods := operation_setting.PayMethods
	previousPrice := operation_setting.Price
	previousMinTopUp := operation_setting.MinTopUp
	previousCallbackAddress := operation_setting.CustomCallbackAddress
	previousServerAddress := system_setting.ServerAddress
	operation_setting.PayAddress = "https://pay.example.test/payments/epay/v1/order/create-transaction"
	operation_setting.EpayId = "gmpay-test-pid"
	operation_setting.EpayKey = "gmpay-test-secret"
	operation_setting.PayMethods = []map[string]string{{"type": "usdt.tron"}}
	operation_setting.Price = 1
	operation_setting.MinTopUp = 1
	operation_setting.CustomCallbackAddress = "https://new-api.example"
	system_setting.ServerAddress = "https://new-api.example"
	t.Cleanup(func() {
		operation_setting.PayAddress = previousPayAddress
		operation_setting.EpayId = previousEpayID
		operation_setting.EpayKey = previousEpayKey
		operation_setting.PayMethods = previousPayMethods
		operation_setting.Price = previousPrice
		operation_setting.MinTopUp = previousMinTopUp
		operation_setting.CustomCallbackAddress = previousCallbackAddress
		system_setting.ServerAddress = previousServerAddress
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedisEnabled
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			require.NoError(t, sqlDB.Close())
		}
	})
}

func insertGMPayTopUpForTest(t *testing.T, tradeNo string, money float64, paymentMethod string, paymentProvider string) *model.TopUp {
	t.Helper()
	user := &model.User{Id: 701, Username: "gmpay-callback-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.FirstOrCreate(user, model.User{Id: user.Id}).Error)
	topUp := &model.TopUp{
		UserId:          user.Id,
		Amount:          1,
		Money:           money,
		TradeNo:         tradeNo,
		PaymentMethod:   paymentMethod,
		PaymentProvider: paymentProvider,
		Status:          common.TopUpStatusPending,
		CreateTime:      common.GetTimestamp(),
	}
	require.NoError(t, topUp.Insert())
	return topUp
}

func signedGMPayNotifyRequest(t *testing.T, params map[string]any) *http.Request {
	t.Helper()
	params["signature"] = service.GMPaySignature(params, operation_setting.EpayKey)
	payload, err := common.Marshal(params)
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/user/gmpay/notify", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	return request
}

func validGMPayNotifyParams(orderID string) map[string]any {
	return map[string]any{
		"pid":                  operation_setting.EpayId,
		"order_id":             orderID,
		"amount":               float64(10),
		"status":               float64(2),
		"actual_amount":        10.0123,
		"receive_address":      "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
		"token":                "USDT",
		"block_transaction_id": "tron-transaction-id",
		"trade_id":             "gmpay-gateway-order",
	}
}

func TestGMPayNotifySettlesMatchingOrderExactlyOnce(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	order := insertGMPayTopUpForTest(t, "gmpay-success-order", 10, "usdt.tron", model.PaymentProviderEpay)
	params := validGMPayNotifyParams(order.TradeNo)

	for attempt := 0; attempt < 2; attempt++ {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = signedGMPayNotifyRequest(t, params)
		GMPayNotify(ctx)
		assert.Equal(t, "ok", recorder.Body.String())
		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Contains(t, recorder.Header().Get("Content-Type"), "text/plain")
	}

	stored := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusSuccess, stored.Status)
	var user model.User
	require.NoError(t, model.DB.First(&user, order.UserId).Error)
	assert.Equal(t, int(common.QuotaPerUnit), user.Quota)
}

func TestGMPayNotifyRejectsUntrustedCallbackBeforeSettlement(t *testing.T) {
	testCases := []struct {
		name            string
		pid             string
		amount          string
		status          string
		paymentMethod   string
		paymentProvider string
		validSignature  bool
	}{
		{name: "mismatched merchant", pid: "another-pid", amount: "10.00", status: "2", paymentMethod: "usdt.tron", paymentProvider: model.PaymentProviderEpay, validSignature: true},
		{name: "mismatched amount", pid: "gmpay-test-pid", amount: "9.99", status: "2", paymentMethod: "usdt.tron", paymentProvider: model.PaymentProviderEpay, validSignature: true},
		{name: "non-success status", pid: "gmpay-test-pid", amount: "10.00", status: "1", paymentMethod: "usdt.tron", paymentProvider: model.PaymentProviderEpay, validSignature: true},
		{name: "legacy payment method", pid: "gmpay-test-pid", amount: "10.00", status: "2", paymentMethod: "alipay", paymentProvider: model.PaymentProviderEpay, validSignature: true},
		{name: "foreign payment provider", pid: "gmpay-test-pid", amount: "10.00", status: "2", paymentMethod: "usdt.tron", paymentProvider: model.PaymentProviderStripe, validSignature: true},
		{name: "invalid signature", pid: "gmpay-test-pid", amount: "10.00", status: "2", paymentMethod: "usdt.tron", paymentProvider: model.PaymentProviderEpay, validSignature: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			setupGMPayTopUpTest(t)
			gin.SetMode(gin.TestMode)
			order := insertGMPayTopUpForTest(t, "gmpay-reject-"+strings.ReplaceAll(tc.name, " ", "-"), 10, tc.paymentMethod, tc.paymentProvider)
			amount := float64(10)
			if tc.amount == "9.99" {
				amount = 9.99
			}
			status := float64(2)
			if tc.status == "1" {
				status = 1
			}
			params := validGMPayNotifyParams(order.TradeNo)
			params["pid"] = tc.pid
			params["amount"] = amount
			params["status"] = status
			request := signedGMPayNotifyRequest(t, params)
			if !tc.validSignature {
				params["signature"] = strings.Repeat("0", 64)
				payload, err := common.Marshal(params)
				require.NoError(t, err)
				request = httptest.NewRequest(http.MethodPost, "/api/user/gmpay/notify", bytes.NewReader(payload))
				request.Header.Set("Content-Type", "application/json")
			}
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = request
			GMPayNotify(ctx)

			assert.Equal(t, "fail", recorder.Body.String())
			stored := model.GetTopUpByTradeNo(order.TradeNo)
			require.NotNil(t, stored)
			assert.Equal(t, common.TopUpStatusPending, stored.Status)
		})
	}
}

func TestGMPayNotifyRejectsOversizedBody(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/gmpay/notify", strings.NewReader(fmt.Sprintf(`{"padding":"%s"}`, strings.Repeat("x", gmpayCallbackBodyLimit))))

	GMPayNotify(ctx)

	assert.Equal(t, "fail", recorder.Body.String())
}

func TestGMPayNotifyRejectsMissingOrInvalidAuditFields(t *testing.T) {
	testCases := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{name: "missing gateway trade ID", mutate: func(params map[string]any) { delete(params, "trade_id") }},
		{name: "zero actual amount", mutate: func(params map[string]any) { params["actual_amount"] = float64(0) }},
		{name: "invalid receive address", mutate: func(params map[string]any) { params["receive_address"] = "not-a-tron-address" }},
		{name: "checksum-mutated receive address", mutate: func(params map[string]any) { params["receive_address"] = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwc" }},
		{name: "invalid token", mutate: func(params map[string]any) { params["token"] = "USDC" }},
		{name: "missing block transaction ID", mutate: func(params map[string]any) { delete(params, "block_transaction_id") }},
		{name: "numeric gateway trade ID", mutate: func(params map[string]any) { params["trade_id"] = float64(12345) }},
		{name: "numeric block transaction ID", mutate: func(params map[string]any) { params["block_transaction_id"] = float64(12345) }},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			setupGMPayTopUpTest(t)
			gin.SetMode(gin.TestMode)
			order := insertGMPayTopUpForTest(t, "gmpay-audit-"+strings.ReplaceAll(tc.name, " ", "-"), 10, gmpayNativePaymentMethod, model.PaymentProviderEpay)
			params := validGMPayNotifyParams(order.TradeNo)
			tc.mutate(params)

			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = signedGMPayNotifyRequest(t, params)
			GMPayNotify(ctx)

			assert.Equal(t, "fail", recorder.Body.String())
			stored := model.GetTopUpByTradeNo(order.TradeNo)
			require.NotNil(t, stored)
			assert.Equal(t, common.TopUpStatusPending, stored.Status)
			var user model.User
			require.NoError(t, model.DB.First(&user, order.UserId).Error)
			assert.Zero(t, user.Quota)
		})
	}
}

func TestGMPayNotifyRejectsCallbackForForeignAgent(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	order := insertGMPayTopUpForTest(t, "gmpay-foreign-agent", 10, gmpayNativePaymentMethod, model.PaymentProviderEpay)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", order.UserId).Update("agent_id", 9).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = signedGMPayNotifyRequest(t, validGMPayNotifyParams(order.TradeNo))
	settleGMPayNotify(ctx, operation_setting.EpayId, operation_setting.EpayKey, 8)

	assert.Equal(t, "fail", recorder.Body.String())
	stored := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusPending, stored.Status)
	var user model.User
	require.NoError(t, model.DB.First(&user, order.UserId).Error)
	assert.Zero(t, user.Quota)
}

func TestGMPayNotifyRejectsEmptyMerchantConfiguration(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	order := insertGMPayTopUpForTest(t, "gmpay-empty-merchant-config", 10, gmpayNativePaymentMethod, model.PaymentProviderEpay)

	for _, credentials := range []struct {
		name string
		pid  string
		key  string
	}{
		{name: "empty PID", key: operation_setting.EpayKey},
		{name: "empty secret", pid: operation_setting.EpayId},
	} {
		t.Run(credentials.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = signedGMPayNotifyRequest(t, validGMPayNotifyParams(order.TradeNo))
			settleGMPayNotify(ctx, credentials.pid, credentials.key, 0)

			assert.Equal(t, "fail", recorder.Body.String())
			assert.Equal(t, http.StatusOK, recorder.Code)
		})
	}

	stored := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusPending, stored.Status)
}

func TestRequestEpayCheckoutRejectsNativeMinimumBeforeOrderCreation(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	operation_setting.Price = 0.01
	user := &model.User{Id: 703, Username: "gmpay-minimum-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)

	previousClientFactory := newGMPayNativeClient
	clientFactoryCalled := false
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		clientFactoryCalled = true
		return nil, fmt.Errorf("native client must not be created for the minimum amount")
	}
	t.Cleanup(func() { newGMPayNativeClient = previousClientFactory })

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", user.Id)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/epay/checkout", strings.NewReader(`{"amount":1,"payment_method":"usdt.tron"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	RequestEpayCheckout(ctx)

	assert.False(t, clientFactoryCalled)
	assert.Contains(t, recorder.Body.String(), "充值金额过低")
	var topUpCount int64
	require.NoError(t, model.DB.Model(&model.TopUp{}).Count(&topUpCount).Error)
	assert.Zero(t, topUpCount)
}

func TestRequestEpayCheckoutUsesNativeGMPayForUSDTTron(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	user := &model.User{Id: 702, Username: "gmpay-checkout-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)

	requestBodies := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, http.MethodPost, request.Method)
		require.Equal(t, "/payments/gmpay/v1/order/create-transaction", request.URL.Path)
		var payload map[string]any
		require.NoError(t, common.DecodeJson(request.Body, &payload))
		requestBodies <- payload
		_, _ = writer.Write([]byte(fmt.Sprintf(`{"status_code":200,"message":"success","data":{"trade_id":"gateway-native-order","order_id":%q,"amount":10,"currency":"USD","actual_amount":10.0123,"receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token":"USDT","status":1,"expiration_time":2000000000,"payment_url":"https://gmpay.example/private-checkout"}}`, payload["order_id"])))
	}))
	t.Cleanup(server.Close)

	previousClientFactory := newGMPayNativeClient
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		return service.NewGMPayClient(server.URL, pid, secret, server.Client())
	}
	t.Cleanup(func() { newGMPayNativeClient = previousClientFactory })

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", user.Id)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/epay/checkout", strings.NewReader(`{"amount":10,"payment_method":"usdt.tron"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	RequestEpayCheckout(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Message string         `json:"message"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "success", response.Message)
	assert.Equal(t, "crypto", response.Data["checkout_type"])
	assert.Equal(t, "gateway-native-order", response.Data["gateway_trade_no"])
	assert.Equal(t, "10.0123", response.Data["actual_amount"])
	assert.Equal(t, "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", response.Data["receive_address"])
	assert.Equal(t, "USDT", response.Data["token"])
	assert.Equal(t, "TRON", response.Data["network"])
	assert.NotContains(t, response.Data, "payment_url")
	assert.NotContains(t, response.Data, "server_time")
	assert.NotContains(t, recorder.Body.String(), operation_setting.EpayKey)

	payload := <-requestBodies
	assert.Equal(t, float64(10), payload["amount"])
	assert.Equal(t, "usd", payload["currency"])
	assert.Equal(t, "usdt", payload["token"])
	assert.Equal(t, "tron", payload["network"])
	assert.Equal(t, "https://new-api.example/api/user/gmpay/notify", payload["notify_url"])
	assert.Equal(t, "https://new-api.example/wallet", payload["redirect_url"])
}
