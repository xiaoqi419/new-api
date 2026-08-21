package controller

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupSubscriptionEpayControllerTest(t *testing.T) {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.SubscriptionPlan{}, &model.SubscriptionOrder{}))
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			require.NoError(t, sqlDB.Close())
		}
	})
}

func setupSubscriptionEpayCheckoutTest(t *testing.T, payAddress string, payMethods []map[string]string) {
	t.Helper()
	setupSubscriptionEpayControllerTest(t)
	confirmPaymentComplianceForTest(t)

	originalPayAddress := operation_setting.PayAddress
	originalEpayID := operation_setting.EpayId
	originalEpayKey := operation_setting.EpayKey
	originalPayMethods := operation_setting.PayMethods
	originalCallbackAddress := operation_setting.CustomCallbackAddress
	t.Cleanup(func() {
		operation_setting.PayAddress = originalPayAddress
		operation_setting.EpayId = originalEpayID
		operation_setting.EpayKey = originalEpayKey
		operation_setting.PayMethods = originalPayMethods
		operation_setting.CustomCallbackAddress = originalCallbackAddress
	})

	operation_setting.PayAddress = payAddress
	operation_setting.EpayId = "subscription-merchant-id"
	operation_setting.EpayKey = "subscription-merchant-key"
	operation_setting.PayMethods = payMethods
	operation_setting.CustomCallbackAddress = "https://subscription.example.com"
}

func insertSubscriptionEpayControllerPlan(t *testing.T, id int) *model.SubscriptionPlan {
	t.Helper()
	model.InvalidateSubscriptionPlanCache(id)
	t.Cleanup(func() {
		model.InvalidateSubscriptionPlanCache(id)
	})
	plan := &model.SubscriptionPlan{
		Id:          id,
		Title:       "Epay Plan",
		PriceAmount: 9.99,
		Enabled:     true,
	}
	require.NoError(t, model.DB.Create(plan).Error)
	return plan
}

func requestSubscriptionEpayCheckout(t *testing.T, planID int, paymentMethod string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", 301)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/subscription/epay/pay",
		strings.NewReader(`{"plan_id":`+strconv.Itoa(planID)+`,"payment_method":"`+paymentMethod+`"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Request.RemoteAddr = "198.51.100.20:12345"
	SubscriptionRequestEpay(ctx)
	return recorder
}

func TestSubscriptionRequestEpayCreatesPendingOrderAndReturnsCheckout(t *testing.T) {
	gin.SetMode(gin.TestMode)
	requestForms := make(chan map[string]string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.URL.Path != "/mapi.php" || request.ParseForm() != nil {
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		requestForms <- map[string]string{
			"pid":          request.PostForm.Get("pid"),
			"type":         request.PostForm.Get("type"),
			"out_trade_no": request.PostForm.Get("out_trade_no"),
			"notify_url":   request.PostForm.Get("notify_url"),
			"return_url":   request.PostForm.Get("return_url"),
			"name":         request.PostForm.Get("name"),
			"money":        request.PostForm.Get("money"),
			"clientip":     request.PostForm.Get("clientip"),
			"device":       request.PostForm.Get("device"),
			"sign":         request.PostForm.Get("sign"),
			"sign_type":    request.PostForm.Get("sign_type"),
		}
		_, _ = writer.Write([]byte(`{"code":1,"trade_no":"gateway-subscription-1","qrcode":"weixin://subscription"}`))
	}))
	t.Cleanup(server.Close)
	setupSubscriptionEpayCheckoutTest(t, server.URL, []map[string]string{{"type": "alipay"}})
	plan := insertSubscriptionEpayControllerPlan(t, 71001)

	recorder := requestSubscriptionEpayCheckout(t, plan.Id, "alipay")

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Message string `json:"message"`
		Data    struct {
			TradeNo        string `json:"trade_no"`
			GatewayTradeNo string `json:"gateway_trade_no"`
			CheckoutType   string `json:"checkout_type"`
			CheckoutValue  string `json:"checkout_value"`
			PaymentMethod  string `json:"payment_method"`
			Money          string `json:"money"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, "success", response.Message)
	assert.NotEmpty(t, response.Data.TradeNo)
	assert.Equal(t, "gateway-subscription-1", response.Data.GatewayTradeNo)
	assert.Equal(t, "qrcode", response.Data.CheckoutType)
	assert.Equal(t, "weixin://subscription", response.Data.CheckoutValue)
	assert.Equal(t, "alipay", response.Data.PaymentMethod)
	assert.Equal(t, "9.99", response.Data.Money)

	form := <-requestForms
	assert.Equal(t, "subscription-merchant-id", form["pid"])
	assert.Equal(t, "alipay", form["type"])
	assert.Equal(t, response.Data.TradeNo, form["out_trade_no"])
	assert.Equal(t, "https://subscription.example.com/api/subscription/epay/notify", form["notify_url"])
	assert.Equal(t, "https://subscription.example.com/api/subscription/epay/return", form["return_url"])
	assert.Equal(t, "SUB:Epay Plan", form["name"])
	assert.Equal(t, "9.99", form["money"])
	assert.Equal(t, "198.51.100.20", form["clientip"])
	assert.Equal(t, "pc", form["device"])
	assert.NotEmpty(t, form["sign"])
	assert.Equal(t, "MD5", form["sign_type"])

	order := model.GetSubscriptionOrderByTradeNo(response.Data.TradeNo)
	require.NotNil(t, order)
	assert.Equal(t, 301, order.UserId)
	assert.Equal(t, plan.Id, order.PlanId)
	assert.Equal(t, model.PaymentProviderEpay, order.PaymentProvider)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
}

func TestSubscriptionRequestEpayFailsOnlyItsPendingOrderWhenCheckoutFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusBadGateway)
	}))
	t.Cleanup(server.Close)
	setupSubscriptionEpayCheckoutTest(t, server.URL, []map[string]string{{"type": "alipay"}})
	plan := insertSubscriptionEpayControllerPlan(t, 71002)

	recorder := requestSubscriptionEpayCheckout(t, plan.Id, "alipay")

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{"success":false,"message":"拉起支付失败"}`, recorder.Body.String())
	var order model.SubscriptionOrder
	require.NoError(t, model.DB.Where("plan_id = ?", plan.Id).First(&order).Error)
	assert.Equal(t, model.PaymentProviderEpay, order.PaymentProvider)
	assert.Equal(t, common.TopUpStatusFailed, order.Status)
	assert.NotZero(t, order.CompleteTime)
}

func TestSubscriptionRequestEpayRejectsConfiguredDirectPaymentMethods(t *testing.T) {
	for index, paymentMethod := range []string{model.PaymentMethodAlipay, model.PaymentMethodWechatPay} {
		t.Run(paymentMethod, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			setupSubscriptionEpayCheckoutTest(t, "https://pay.example.com", []map[string]string{{"type": paymentMethod}})
			plan := insertSubscriptionEpayControllerPlan(t, 71003+index)

			recorder := requestSubscriptionEpayCheckout(t, plan.Id, paymentMethod)

			require.Equal(t, http.StatusOK, recorder.Code)
			assert.JSONEq(t, `{"success":false,"message":"支付方式不存在"}`, recorder.Body.String())
			var orderCount int64
			require.NoError(t, model.DB.Model(&model.SubscriptionOrder{}).Count(&orderCount).Error)
			assert.Zero(t, orderCount)
		})
	}
}

func insertSubscriptionEpayControllerOrder(t *testing.T, tradeNo string, userId int, provider string, status string) {
	t.Helper()
	order := &model.SubscriptionOrder{
		UserId:          userId,
		PlanId:          1,
		Money:           9.99,
		TradeNo:         tradeNo,
		PaymentMethod:   "alipay",
		PaymentProvider: provider,
		Status:          status,
		CreateTime:      common.GetTimestamp(),
	}
	require.NoError(t, model.DB.Create(order).Error)
}

func TestGetSubscriptionEpayStatusScopesOrderToCurrentUser(t *testing.T) {
	setupSubscriptionEpayControllerTest(t)
	gin.SetMode(gin.TestMode)
	insertSubscriptionEpayControllerOrder(t, "subscription-epay-owner", 101, model.PaymentProviderEpay, common.TopUpStatusPending)
	insertSubscriptionEpayControllerOrder(t, "subscription-epay-foreign", 102, model.PaymentProviderEpay, common.TopUpStatusSuccess)
	insertSubscriptionEpayControllerOrder(t, "subscription-stripe-owner", 101, model.PaymentProviderStripe, common.TopUpStatusPending)

	testCases := []struct {
		name     string
		tradeNo  string
		wantBody string
	}{
		{
			name:     "returns owner Epay order",
			tradeNo:  "subscription-epay-owner",
			wantBody: `{"message":"success","data":{"status":"pending"}}`,
		},
		{
			name:     "hides another users order",
			tradeNo:  "subscription-epay-foreign",
			wantBody: `{"success":false,"message":"订单不存在"}`,
		},
		{
			name:     "does not expose another provider order",
			tradeNo:  "subscription-stripe-owner",
			wantBody: `{"success":false,"message":"订单不存在"}`,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Set("id", 101)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/subscription/epay/status?trade_no="+tc.tradeNo, nil)

			GetSubscriptionEpayStatus(ctx)

			require.Equal(t, http.StatusOK, recorder.Code)
			assert.JSONEq(t, tc.wantBody, recorder.Body.String())
		})
	}
}

func TestSubscriptionEpayReturnDoesNotSettleOrder(t *testing.T) {
	setupSubscriptionEpayControllerTest(t)
	gin.SetMode(gin.TestMode)
	insertSubscriptionEpayControllerOrder(t, "subscription-return-pending", 201, model.PaymentProviderEpay, common.TopUpStatusPending)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/subscription/epay/return?trade_no=subscription-return-pending&trade_status=TRADE_SUCCESS", nil)

	SubscriptionEpayReturn(ctx)

	require.Equal(t, http.StatusFound, recorder.Code)
	assert.Equal(t, paymentReturnPath("/wallet?pay=pending"), recorder.Header().Get("Location"))
	order := model.GetSubscriptionOrderByTradeNo("subscription-return-pending")
	require.NotNil(t, order)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
}
