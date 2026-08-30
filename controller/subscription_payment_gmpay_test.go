package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type subscriptionTrackingBody struct {
	read bool
}

func (body *subscriptionTrackingBody) Read(_ []byte) (int, error) {
	body.read = true
	return 0, io.EOF
}

func (body *subscriptionTrackingBody) Close() error {
	return nil
}

func useSubscriptionPaymentGatewayMode(t *testing.T, mode string) {
	t.Helper()
	restore := operation_setting.SetEffectivePaymentGatewayModeForTest(mode)
	t.Cleanup(restore)
}

func setupSubscriptionGMPaySettlementTest(t *testing.T) {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedisEnabled := common.RedisEnabled
	previousMainDatabaseType := common.MainDatabaseType()
	previousLogDatabaseType := common.LogDatabaseType()
	db, err := gorm.Open(sqlite.Open("file:subscription-gmpay?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.SubscriptionPlan{},
		&model.SubscriptionOrder{},
		&model.UserSubscription{},
		&model.TopUp{},
		&model.Log{},
	))
	model.DB, model.LOG_DB = db, db
	common.RedisEnabled = false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedisEnabled
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			require.NoError(t, sqlDB.Close())
		}
	})
}

func insertSubscriptionGMPayOrder(t *testing.T, tradeNo string) *model.SubscriptionOrder {
	t.Helper()
	user := &model.User{Id: 931, Username: "subscription-gmpay-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)
	plan := &model.SubscriptionPlan{
		Id:            932,
		Title:         "Native subscription",
		PriceAmount:   9.99,
		Enabled:       true,
		DurationUnit:  model.SubscriptionDurationMonth,
		DurationValue: 1,
		TotalAmount:   1000,
	}
	require.NoError(t, model.DB.Create(plan).Error)
	model.InvalidateSubscriptionPlanCache(plan.Id)
	t.Cleanup(func() { model.InvalidateSubscriptionPlanCache(plan.Id) })
	order := &model.SubscriptionOrder{
		UserId:          user.Id,
		PlanId:          plan.Id,
		Money:           plan.PriceAmount,
		TradeNo:         tradeNo,
		PaymentMethod:   gmpayNativePaymentMethod,
		PaymentProvider: model.PaymentProviderEpay,
		Status:          common.TopUpStatusPending,
		CreateTime:      common.GetTimestamp(),
	}
	require.NoError(t, order.Insert())
	return order
}

func TestSubscriptionRequestEpayCreatesNativeGMPayCheckoutInNativeMode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	requestBodies := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, http.MethodPost, request.Method)
		require.Equal(t, "/payments/gmpay/v1/order/create-transaction", request.URL.Path)
		var payload map[string]any
		require.NoError(t, common.DecodeJson(request.Body, &payload))
		requestBodies <- payload
		now := time.Now().Unix()
		_, _ = writer.Write([]byte(`{"status_code":200,"message":"success","data":{"order_id":"` + payload["order_id"].(string) + `","trade_id":"GMPAY-SUB-1","amount":9.99,"currency":"USD","status":1,"actual_amount":"10.0123","receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token":"USDT","expiration_time":` +
			strconv.FormatInt(now+600, 10) + `,"server_time":` + strconv.FormatInt(now, 10) + `}}`))
	}))
	t.Cleanup(server.Close)
	setupSubscriptionEpayCheckoutTest(t, server.URL, []map[string]string{{"type": gmpayNativePaymentMethod, "name": "USDT (TRON)"}})
	useSubscriptionPaymentGatewayMode(t, operation_setting.PaymentGatewayModeGMPayNative)
	plan := insertSubscriptionEpayControllerPlan(t, 71020)

	originalFactory := newGMPayNativeClient
	newGMPayNativeClient = func(gatewayAddress string, pid string, secret string) (*service.GMPayClient, error) {
		return service.NewGMPayClient(gatewayAddress, pid, secret, server.Client())
	}
	t.Cleanup(func() { newGMPayNativeClient = originalFactory })

	recorder := requestSubscriptionEpayCheckout(t, plan.Id, gmpayNativePaymentMethod)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Message string `json:"message"`
		Data    struct {
			TradeNo        string `json:"trade_no"`
			GatewayTradeNo string `json:"gateway_trade_no"`
			CheckoutType   string `json:"checkout_type"`
			PaymentMethod  string `json:"payment_method"`
			Money          string `json:"money"`
			ActualAmount   string `json:"actual_amount"`
			ReceiveAddress string `json:"receive_address"`
			Token          string `json:"token"`
			Network        string `json:"network"`
			ExpirationTime int64  `json:"expiration_time"`
			ServerTime     int64  `json:"server_time"`
			PaymentURL     string `json:"payment_url"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, "success", response.Message)
	assert.NotEmpty(t, response.Data.TradeNo)
	assert.Equal(t, "GMPAY-SUB-1", response.Data.GatewayTradeNo)
	assert.Equal(t, "crypto", response.Data.CheckoutType)
	assert.Equal(t, gmpayNativePaymentMethod, response.Data.PaymentMethod)
	assert.Equal(t, "9.99", response.Data.Money)
	assert.Equal(t, "10.0123", response.Data.ActualAmount)
	assert.Equal(t, "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", response.Data.ReceiveAddress)
	assert.Equal(t, "USDT", response.Data.Token)
	assert.Equal(t, "TRON", response.Data.Network)
	assert.Positive(t, response.Data.ExpirationTime)
	assert.Positive(t, response.Data.ServerTime)
	assert.Empty(t, response.Data.PaymentURL)

	payload := <-requestBodies
	assert.Equal(t, response.Data.TradeNo, payload["order_id"])
	assert.Equal(t, float64(9.99), payload["amount"])
	assert.Equal(t, "https://subscription.example.com/api/user/gmpay/notify", payload["notify_url"])
	assert.Equal(t, "https://subscription.example.com/wallet", payload["redirect_url"])
	assert.Equal(t, "usd", payload["currency"])
	assert.Equal(t, "usdt", payload["token"])
	assert.Equal(t, "tron", payload["network"])
	assert.NotEmpty(t, payload["signature"])

	order := model.GetSubscriptionOrderByTradeNo(response.Data.TradeNo)
	require.NotNil(t, order)
	assert.Equal(t, model.PaymentProviderEpay, order.PaymentProvider)
	assert.Equal(t, gmpayNativePaymentMethod, order.PaymentMethod)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
}

func TestSubscriptionRequestEpaySeparatesLegacyAndNativePaymentMethods(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupSubscriptionEpayCheckoutTest(t, "https://pay.example.com", []map[string]string{{"type": "alipay"}})
	useSubscriptionPaymentGatewayMode(t, operation_setting.PaymentGatewayModeGMPayNative)
	plan := insertSubscriptionEpayControllerPlan(t, 71030)

	recorder := requestSubscriptionEpayCheckout(t, plan.Id, "alipay")

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{"success":false,"message":"支付方式不存在"}`, recorder.Body.String())
	var count int64
	require.NoError(t, model.DB.Model(&model.SubscriptionOrder{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestSubscriptionRequestEpayKeepsUsdtTronOnLegacyMAPIWhenLegacyModeIsEffective(t *testing.T) {
	gin.SetMode(gin.TestMode)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.NoError(t, request.ParseForm())
		assert.Equal(t, gmpayNativePaymentMethod, request.PostForm.Get("type"))
		_, _ = writer.Write([]byte(`{"code":1,"trade_no":"legacy-usdt-subscription","qrcode":"https://pay.example.com/legacy-usdt-qr"}`))
	}))
	t.Cleanup(server.Close)
	setupSubscriptionEpayCheckoutTest(t, server.URL, []map[string]string{{"type": gmpayNativePaymentMethod}})
	useSubscriptionPaymentGatewayMode(t, operation_setting.PaymentGatewayModeEpayLegacy)
	plan := insertSubscriptionEpayControllerPlan(t, 71031)
	nativeClientCalled := false
	originalFactory := newGMPayNativeClient
	newGMPayNativeClient = func(gatewayAddress string, pid string, secret string) (*service.GMPayClient, error) {
		nativeClientCalled = true
		return originalFactory(gatewayAddress, pid, secret)
	}
	t.Cleanup(func() { newGMPayNativeClient = originalFactory })

	recorder := requestSubscriptionEpayCheckout(t, plan.Id, gmpayNativePaymentMethod)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Message string `json:"message"`
		Data    struct {
			TradeNo       string `json:"trade_no"`
			CheckoutType  string `json:"checkout_type"`
			CheckoutValue string `json:"checkout_value"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, "success", response.Message)
	assert.Equal(t, "qrcode", response.Data.CheckoutType)
	assert.Equal(t, "https://pay.example.com/legacy-usdt-qr", response.Data.CheckoutValue)
	assert.False(t, nativeClientCalled)
	order := model.GetSubscriptionOrderByTradeNo(response.Data.TradeNo)
	require.NotNil(t, order)
	assert.Equal(t, gmpayNativePaymentMethod, order.PaymentMethod)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
}

func TestSubscriptionEpayNotifyRejectsBeforeReadingBodyInNativeMode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	useSubscriptionPaymentGatewayMode(t, operation_setting.PaymentGatewayModeGMPayNative)
	body := &subscriptionTrackingBody{}
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/subscription/epay/notify", nil)
	ctx.Request.Body = body

	SubscriptionEpayNotify(ctx)

	assert.False(t, body.read)
	assert.Equal(t, "fail", recorder.Body.String())
}

func TestTryCompleteGMPaySubscriptionOrderSettlesExactlyOnce(t *testing.T) {
	setupSubscriptionGMPaySettlementTest(t)
	order := insertSubscriptionGMPayOrder(t, "SUB-GMPAY-SETTLE")

	for attempt := 0; attempt < 2; attempt++ {
		handled, err := TryCompleteGMPaySubscriptionOrder(order.TradeNo, "9.99", `{"provider":"gmpay"}`, 0)
		require.NoError(t, err)
		assert.True(t, handled)
	}

	stored := model.GetSubscriptionOrderByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusSuccess, stored.Status)
	var subscriptionCount int64
	require.NoError(t, model.DB.Model(&model.UserSubscription{}).Where("user_id = ?", order.UserId).Count(&subscriptionCount).Error)
	assert.Equal(t, int64(1), subscriptionCount)
}

func TestTryCompleteGMPaySubscriptionOrderFailsClosedForInvalidContext(t *testing.T) {
	testCases := []struct {
		name            string
		tradeNo         string
		amount          string
		expectedAgentID int
		wantHandled     bool
	}{
		{name: "unknown order is not handled", tradeNo: "UNKNOWN-SUBSCRIPTION", amount: "9.99", wantHandled: false},
		{name: "wrong amount is handled and rejected", tradeNo: "SUB-GMPAY-AMOUNT", amount: "9.98", wantHandled: true},
		{name: "agent callback is handled and rejected", tradeNo: "SUB-GMPAY-AGENT", amount: "9.99", expectedAgentID: 42, wantHandled: true},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			setupSubscriptionGMPaySettlementTest(t)
			if strings.HasPrefix(tc.tradeNo, "SUB-GMPAY") {
				insertSubscriptionGMPayOrder(t, tc.tradeNo)
			}

			handled, err := TryCompleteGMPaySubscriptionOrder(tc.tradeNo, tc.amount, `{}`, tc.expectedAgentID)

			assert.Equal(t, tc.wantHandled, handled)
			if tc.wantHandled {
				require.Error(t, err)
				stored := model.GetSubscriptionOrderByTradeNo(tc.tradeNo)
				require.NotNil(t, stored)
				assert.Equal(t, common.TopUpStatusPending, stored.Status)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestGetSubscriptionEpayStatusRejectsOrderFromInactiveGatewayMode(t *testing.T) {
	setupSubscriptionEpayControllerTest(t)
	gin.SetMode(gin.TestMode)
	useSubscriptionPaymentGatewayMode(t, operation_setting.PaymentGatewayModeGMPayNative)
	insertSubscriptionEpayControllerOrder(t, "subscription-native-owner", 101, model.PaymentProviderEpay, common.TopUpStatusPending)
	insertSubscriptionEpayControllerOrder(t, "subscription-legacy-owner", 101, model.PaymentProviderEpay, common.TopUpStatusPending)
	require.NoError(t, model.DB.Model(&model.SubscriptionOrder{}).Where("trade_no = ?", "subscription-native-owner").Update("payment_method", gmpayNativePaymentMethod).Error)

	testCases := []struct {
		tradeNo string
		body    string
	}{
		{tradeNo: "subscription-native-owner", body: `{"message":"success","data":{"status":"pending"}}`},
		{tradeNo: "subscription-legacy-owner", body: `{"success":false,"message":"订单不存在"}`},
	}
	for _, tc := range testCases {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Set("id", 101)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/subscription/epay/status?trade_no="+tc.tradeNo, nil)

		GetSubscriptionEpayStatus(ctx)

		assert.JSONEq(t, tc.body, recorder.Body.String())
	}
}
