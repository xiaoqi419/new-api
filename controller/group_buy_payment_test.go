package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupGroupBuyPaymentTest(t *testing.T) {
	t.Helper()

	originalGroupBuyEnabled := common.GroupBuyEnabled
	originalWechatPayEnabled := setting.WechatPayEnabled
	originalWechatPayAppID := setting.WechatPayAppId
	originalWechatPayMchID := setting.WechatPayMchId
	originalWechatPayAPIKey := setting.WechatPayApiV3Key
	originalWechatPayPrivateKey := setting.WechatPayPrivateKey
	originalWechatPayCertSerialNo := setting.WechatPayCertSerialNo
	originalWechatPayNative := setting.WechatPayNative
	originalWechatPayH5 := setting.WechatPayH5
	originalAlipayEnabled := setting.AlipayEnabled
	originalAlipayAppID := setting.AlipayAppId
	originalAlipayPrivateKey := setting.AlipayPrivateKey
	originalAlipayPublicKey := setting.AlipayPublicKey
	originalPayAddress := operation_setting.PayAddress
	originalEpayID := operation_setting.EpayId
	originalEpayKey := operation_setting.EpayKey
	originalPayMethods := operation_setting.PayMethods
	paymentSetting := operation_setting.GetPaymentSetting()
	originalComplianceConfirmed := paymentSetting.ComplianceConfirmed
	originalComplianceTermsVersion := paymentSetting.ComplianceTermsVersion

	t.Cleanup(func() {
		common.GroupBuyEnabled = originalGroupBuyEnabled
		setting.WechatPayEnabled = originalWechatPayEnabled
		setting.WechatPayAppId = originalWechatPayAppID
		setting.WechatPayMchId = originalWechatPayMchID
		setting.WechatPayApiV3Key = originalWechatPayAPIKey
		setting.WechatPayPrivateKey = originalWechatPayPrivateKey
		setting.WechatPayCertSerialNo = originalWechatPayCertSerialNo
		setting.WechatPayNative = originalWechatPayNative
		setting.WechatPayH5 = originalWechatPayH5
		setting.AlipayEnabled = originalAlipayEnabled
		setting.AlipayAppId = originalAlipayAppID
		setting.AlipayPrivateKey = originalAlipayPrivateKey
		setting.AlipayPublicKey = originalAlipayPublicKey
		operation_setting.PayAddress = originalPayAddress
		operation_setting.EpayId = originalEpayID
		operation_setting.EpayKey = originalEpayKey
		operation_setting.PayMethods = originalPayMethods
		paymentSetting.ComplianceConfirmed = originalComplianceConfirmed
		paymentSetting.ComplianceTermsVersion = originalComplianceTermsVersion
	})

	common.GroupBuyEnabled = true
	setting.WechatPayEnabled = false
	setting.WechatPayAppId = ""
	setting.WechatPayMchId = ""
	setting.WechatPayApiV3Key = ""
	setting.WechatPayPrivateKey = ""
	setting.WechatPayCertSerialNo = ""
	setting.WechatPayNative = false
	setting.WechatPayH5 = false
	setting.AlipayEnabled = false
	setting.AlipayAppId = ""
	setting.AlipayPrivateKey = ""
	setting.AlipayPublicKey = ""
	operation_setting.PayAddress = ""
	operation_setting.EpayId = ""
	operation_setting.EpayKey = ""
	operation_setting.PayMethods = nil
	paymentSetting.ComplianceConfirmed = true
	paymentSetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
}

func enableOfficialGroupBuyPaymentsForTest() {
	setting.WechatPayEnabled = true
	setting.WechatPayAppId = "wx-app"
	setting.WechatPayMchId = "wx-merchant"
	setting.WechatPayApiV3Key = "wx-api-key"
	setting.WechatPayPrivateKey = "wx-private-key"
	setting.WechatPayCertSerialNo = "wx-cert-serial"
	setting.WechatPayNative = true

	setting.AlipayEnabled = true
	setting.AlipayAppId = "ali-app"
	setting.AlipayPrivateKey = "ali-private-key"
	setting.AlipayPublicKey = "ali-public-key"
}

func enableEpayForGroupBuyTest(methods []map[string]string) {
	operation_setting.PayAddress = "https://pay.example.com"
	operation_setting.EpayId = "epay-id"
	operation_setting.EpayKey = "epay-key"
	operation_setting.PayMethods = methods
}

func TestAvailableGroupBuyPaymentMethodsFiltersAndDeduplicates(t *testing.T) {
	setupGroupBuyPaymentTest(t)
	enableOfficialGroupBuyPaymentsForTest()
	enableEpayForGroupBuyTest([]map[string]string{
		{"name": "", "type": "empty-name"},
		{"name": "Empty type", "type": "  "},
		{"name": "Card", "type": " custom "},
		{"name": "Duplicate card", "type": "custom"},
		{"name": "Stripe", "type": model.PaymentMethodStripe},
		{"name": "Creem", "type": model.PaymentMethodCreem},
		{"name": "Waffo", "type": model.PaymentMethodWaffo},
		{"name": "Waffo Pancake", "type": model.PaymentMethodWaffoPancake},
		{"name": "Balance", "type": model.PaymentMethodBalance},
		{"name": "Fake direct WeChat", "type": model.PaymentMethodWechatPay},
		{"name": "Fake direct Alipay", "type": model.PaymentMethodAlipay},
		{"name": "Aggregated WeChat", "type": "wxpay"},
	})

	assert.Equal(t, []groupBuyPaymentMethod{
		{Name: "微信支付", Type: model.PaymentMethodWechatPay},
		{Name: "支付宝", Type: model.PaymentMethodAlipay},
		{Name: "Card", Type: "custom"},
		{Name: "Aggregated WeChat", Type: "wxpay"},
	}, availableGroupBuyPaymentMethods("native"))
}

func TestAvailableGroupBuyPaymentMethodsReturnsEmptyWhenFeatureOrComplianceDisabled(t *testing.T) {
	setupGroupBuyPaymentTest(t)
	enableOfficialGroupBuyPaymentsForTest()
	enableEpayForGroupBuyTest([]map[string]string{{"name": "Card", "type": "custom"}})

	common.GroupBuyEnabled = false
	assert.Empty(t, availableGroupBuyPaymentMethods("native"))

	common.GroupBuyEnabled = true
	operation_setting.GetPaymentSetting().ComplianceConfirmed = false
	assert.Empty(t, availableGroupBuyPaymentMethods("native"))
}

func TestAvailableGroupBuyPaymentMethodsRequiresSupportedWechatScene(t *testing.T) {
	setupGroupBuyPaymentTest(t)
	enableOfficialGroupBuyPaymentsForTest()
	setting.AlipayEnabled = false
	setting.WechatPayNative = false
	setting.WechatPayH5 = false

	assert.Empty(t, availableGroupBuyPaymentMethods("native"))
	provider, err := resolveGroupBuyProvider(model.PaymentMethodWechatPay, "native")
	assert.Error(t, err)
	assert.Empty(t, provider)

	setting.WechatPayH5 = true
	assert.Equal(t, []groupBuyPaymentMethod{
		{Name: "微信支付", Type: model.PaymentMethodWechatPay},
	}, availableGroupBuyPaymentMethods("h5"))
	assert.Empty(t, availableGroupBuyPaymentMethods("native"))
}

func TestAvailableGroupBuyPaymentMethodsMatchesWechatScene(t *testing.T) {
	setupGroupBuyPaymentTest(t)
	enableOfficialGroupBuyPaymentsForTest()
	setting.AlipayEnabled = false

	setting.WechatPayNative = true
	setting.WechatPayH5 = false
	assert.Len(t, availableGroupBuyPaymentMethods("native"), 1)
	assert.Empty(t, availableGroupBuyPaymentMethods("h5"))

	setting.WechatPayNative = false
	setting.WechatPayH5 = true
	assert.Empty(t, availableGroupBuyPaymentMethods("native"))
	assert.Len(t, availableGroupBuyPaymentMethods("h5"), 1)
	assert.Len(t, availableGroupBuyPaymentMethods("unknown"), 0)
}

func TestResolveGroupBuyProviderAcceptsOnlyAdvertisedCapabilities(t *testing.T) {
	setupGroupBuyPaymentTest(t)
	enableOfficialGroupBuyPaymentsForTest()
	enableEpayForGroupBuyTest([]map[string]string{
		{"name": "Card", "type": "custom"},
		{"name": "Stripe", "type": model.PaymentMethodStripe},
	})

	provider, err := resolveGroupBuyProvider(model.PaymentMethodWechatPay, "native")
	require.NoError(t, err)
	assert.Equal(t, model.PaymentProviderWechatPay, provider)

	provider, err = resolveGroupBuyProvider(model.PaymentMethodAlipay, "native")
	require.NoError(t, err)
	assert.Equal(t, model.PaymentProviderAlipay, provider)

	provider, err = resolveGroupBuyProvider("custom", "native")
	require.NoError(t, err)
	assert.Equal(t, model.PaymentProviderEpay, provider)

	for _, method := range []string{
		"",
		"   ",
		"unknown",
		model.PaymentMethodStripe,
		model.PaymentMethodCreem,
		model.PaymentMethodWaffo,
		model.PaymentMethodWaffoPancake,
		model.PaymentMethodBalance,
	} {
		t.Run("reject_"+method, func(t *testing.T) {
			provider, err := resolveGroupBuyProvider(method, "native")
			assert.Error(t, err)
			assert.Empty(t, provider)
		})
	}
}

func TestCreateAndJoinGroupBuyRejectInvalidPaymentBeforePersistence(t *testing.T) {
	setupGroupBuyPaymentTest(t)
	enableEpayForGroupBuyTest([]map[string]string{
		{"name": "Stripe", "type": model.PaymentMethodStripe},
	})
	gin.SetMode(gin.TestMode)

	previousDB := model.DB
	model.DB = nil
	t.Cleanup(func() { model.DB = previousDB })

	tests := []struct {
		name    string
		body    string
		handler func(*gin.Context)
	}{
		{
			name:    "create blank",
			body:    `{"package_id":1,"payment_method":"   "}`,
			handler: CreateGroupBuy,
		},
		{
			name:    "create reserved provider",
			body:    `{"package_id":1,"payment_method":"stripe"}`,
			handler: CreateGroupBuy,
		},
		{
			name:    "join blank",
			body:    `{"group_no":"GB-1","payment_method":""}`,
			handler: JoinGroupBuy,
		},
		{
			name:    "join reserved provider",
			body:    `{"group_no":"GB-1","payment_method":"stripe"}`,
			handler: JoinGroupBuy,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/groupbuy", strings.NewReader(test.body))
			ctx.Request.Header.Set("Content-Type", "application/json")

			test.handler(ctx)

			var response struct {
				Success bool   `json:"success"`
				Message string `json:"message"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			assert.False(t, response.Success)
			assert.NotEmpty(t, response.Message)
		})
	}
}

func TestGetGroupBuyInfoIncludesEmptyPaymentMethodsWhenDisabled(t *testing.T) {
	setupGroupBuyPaymentTest(t)
	common.GroupBuyEnabled = false
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/user/groupbuy/info?scene=native", nil)
	GetGroupBuyInfo(ctx)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Enabled        bool                    `json:"enabled"`
			Packages       []model.GroupBuyPackage `json:"packages"`
			PaymentMethods []groupBuyPaymentMethod `json:"payment_methods"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.False(t, response.Data.Enabled)
	assert.Empty(t, response.Data.Packages)
	assert.NotNil(t, response.Data.PaymentMethods)
	assert.Empty(t, response.Data.PaymentMethods)
}

func TestGetGroupBuyInfoReturnsSupportedPaymentMethods(t *testing.T) {
	setupGroupBuyPaymentTest(t)
	enableEpayForGroupBuyTest([]map[string]string{{"name": "Card", "type": "custom"}})

	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open("file:group-buy-info?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			_ = sqlDB.Close()
		}
	})
	require.NoError(t, db.AutoMigrate(&model.GroupBuyPackage{}))
	require.NoError(t, db.Create(&model.GroupBuyPackage{Name: "Team", Enabled: true}).Error)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/user/groupbuy/info", nil)
	GetGroupBuyInfo(ctx)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Enabled        bool                    `json:"enabled"`
			Packages       []model.GroupBuyPackage `json:"packages"`
			PaymentMethods []groupBuyPaymentMethod `json:"payment_methods"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.True(t, response.Data.Enabled)
	require.Len(t, response.Data.Packages, 1)
	assert.Equal(t, "Team", response.Data.Packages[0].Name)
	assert.Equal(t, []groupBuyPaymentMethod{{Name: "Card", Type: "custom"}}, response.Data.PaymentMethods)
}

func TestReleaseGroupBuyPaymentReservationOnlyExpiresCurrentPendingMember(t *testing.T) {
	setupGroupBuyPaymentTest(t)
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open("file:group-buy-release?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			_ = sqlDB.Close()
		}
	})
	require.NoError(t, db.AutoMigrate(&model.GroupBuyParticipant{}))
	now := common.GetTimestamp()
	require.NoError(t, db.Create(&model.GroupBuyParticipant{
		GroupBuyId:        1,
		UserId:            7,
		TradeNo:           "GB-FAIL",
		PayStatus:         model.GroupBuyParticipantPending,
		ReserveExpireTime: now + 900,
	}).Error)
	require.NoError(t, db.Create(&model.GroupBuyParticipant{
		GroupBuyId:        1,
		UserId:            8,
		TradeNo:           "GB-FAIL-OTHER",
		PayStatus:         model.GroupBuyParticipantPending,
		ReserveExpireTime: now + 900,
	}).Error)
	require.NoError(t, db.Create(&model.GroupBuyParticipant{
		GroupBuyId:        1,
		UserId:            7,
		TradeNo:           "GB-PAID",
		PayStatus:         model.GroupBuyParticipantPaid,
		ReserveExpireTime: now + 900,
	}).Error)

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/groupbuy/create", nil)
	releaseGroupBuyPaymentReservation(ctx, 7, "GB-FAIL")

	var released, other, paid model.GroupBuyParticipant
	require.NoError(t, db.Where("trade_no = ?", "GB-FAIL").First(&released).Error)
	require.NoError(t, db.Where("trade_no = ?", "GB-FAIL-OTHER").First(&other).Error)
	require.NoError(t, db.Where("trade_no = ?", "GB-PAID").First(&paid).Error)
	assert.LessOrEqual(t, released.ReserveExpireTime, common.GetTimestamp())
	assert.Greater(t, other.ReserveExpireTime, common.GetTimestamp())
	assert.Greater(t, paid.ReserveExpireTime, common.GetTimestamp())
}
