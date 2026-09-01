package controller

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/shopspring/decimal"
)

func GetTopUpInfo(c *gin.Context) {
	complianceConfirmed := operation_setting.IsPaymentComplianceConfirmed()

	// 获取支付方式
	payMethods := effectiveEpayPaymentMethods()
	if !complianceConfirmed {
		payMethods = []map[string]string{}
	}
	nativeCrypto := operation_setting.IsGMPayNativePaymentGatewayMode()
	var cryptoAssets []service.GMPayPaymentAsset
	if nativeCrypto {
		cryptoAssets = make([]service.GMPayPaymentAsset, 0)
	}
	if complianceConfirmed && nativeCrypto {
		if cfg := epayConfigForAgent(common.GetContextKeyInt(c, constant.ContextKeyUserAgentId)); cfg.Enabled && cfg.Client != nil && cfg.Client.Config != nil && cfg.Client.BaseUrl != nil {
			if client, err := newGMPayNativeClient(cfg.Client.BaseUrl.String(), cfg.Client.Config.PartnerID, cfg.Client.Config.Key); err == nil {
				assets, _ := client.SupportedAssets(c.Request.Context())
				for _, asset := range assets {
					for _, token := range asset.Tokens {
						cryptoAssets = append(cryptoAssets, service.GMPayPaymentAsset{Network: asset.Network, Token: token, DisplayName: asset.DisplayName})
					}
				}
			}
		}
	}

	// 如果启用了 Stripe 支付，添加到支付方法列表
	if isStripeTopUpEnabled() {
		// 检查是否已经包含 Stripe
		hasStripe := false
		for _, method := range payMethods {
			if method["type"] == "stripe" {
				hasStripe = true
				break
			}
		}

		if !hasStripe {
			stripeMethod := map[string]string{
				"name":      "Stripe",
				"type":      "stripe",
				"color":     "#635BFF",
				"min_topup": strconv.Itoa(setting.StripeMinTopUp),
			}
			payMethods = append(payMethods, stripeMethod)
		}
	}

	// Waffo Pancake is displayed above the standard Waffo gateway.
	enableWaffoPancake := isWaffoPancakeTopUpEnabled()
	if enableWaffoPancake {
		hasWaffoPancake := false
		for _, method := range payMethods {
			if method["type"] == model.PaymentMethodWaffoPancake {
				hasWaffoPancake = true
				break
			}
		}

		if !hasWaffoPancake {
			payMethods = append(payMethods, map[string]string{
				"name":      "Waffo Pancake",
				"type":      model.PaymentMethodWaffoPancake,
				"color":     "#F97316",
				"min_topup": strconv.Itoa(setting.WaffoPancakeMinTopUp),
			})
		}
	}

	// 如果启用了 Waffo 支付，添加到支付方法列表
	enableWaffo := isWaffoTopUpEnabled()
	if enableWaffo {
		hasWaffo := false
		for _, method := range payMethods {
			if method["type"] == model.PaymentMethodWaffo {
				hasWaffo = true
				break
			}
		}

		if !hasWaffo {
			waffoMethod := map[string]string{
				"name":      "Waffo (Global Payment)",
				"type":      model.PaymentMethodWaffo,
				"color":     "#3B82F6",
				"min_topup": strconv.Itoa(setting.WaffoMinTopUp),
			}
			payMethods = append(payMethods, waffoMethod)
		}
	}

	// 微信支付 / 支付宝官方商户直连
	enableWechatPay := isWechatPayTopUpEnabled()
	if enableWechatPay {
		hasWechatPay := false
		for _, method := range payMethods {
			if method["type"] == model.PaymentMethodWechatPay {
				hasWechatPay = true
				break
			}
		}
		if !hasWechatPay {
			payMethods = append(payMethods, map[string]string{
				"name":      "微信支付",
				"type":      model.PaymentMethodWechatPay,
				"color":     "rgba(var(--semi-green-5), 1)",
				"min_topup": strconv.Itoa(setting.WechatPayMinTopUp),
			})
		}
	}

	enableAlipay := isAlipayTopUpEnabled()
	if enableAlipay {
		hasAlipay := false
		for _, method := range payMethods {
			if method["type"] == model.PaymentMethodAlipay {
				hasAlipay = true
				break
			}
		}
		if !hasAlipay {
			payMethods = append(payMethods, map[string]string{
				"name":      "支付宝",
				"type":      model.PaymentMethodAlipay,
				"color":     "rgba(var(--semi-blue-5), 1)",
				"min_topup": strconv.Itoa(setting.AlipayMinTopUp),
			})
		}
	}

	data := gin.H{
		"enable_online_topup":              isEpayTopUpEnabled(),
		"enable_stripe_topup":              isStripeTopUpEnabled(),
		"enable_creem_topup":               isCreemTopUpEnabled(),
		"enable_wechatpay_topup":           enableWechatPay,
		"enable_alipay_topup":              enableAlipay,
		"wechatpay_native":                 enableWechatPay && setting.WechatPayNative,
		"wechatpay_h5":                     enableWechatPay && setting.WechatPayH5,
		"wechatpay_jsapi":                  enableWechatPay && setting.WechatPayJSAPI,
		"wechatpay_min_topup":              setting.WechatPayMinTopUp,
		"alipay_min_topup":                 setting.AlipayMinTopUp,
		"enable_waffo_topup":               enableWaffo,
		"enable_waffo_pancake_topup":       enableWaffoPancake,
		"enable_redemption":                complianceConfirmed,
		"payment_compliance_confirmed":     complianceConfirmed,
		"payment_compliance_terms_version": operation_setting.CurrentComplianceTermsVersion,
		"waffo_pay_methods": func() interface{} {
			if enableWaffo {
				return setting.GetWaffoPayMethods()
			}
			return nil
		}(),
		"creem_products":          setting.CreemProducts,
		"pay_methods":             payMethods,
		"min_topup":               operation_setting.MinTopUp,
		"stripe_min_topup":        setting.StripeMinTopUp,
		"waffo_min_topup":         setting.WaffoMinTopUp,
		"waffo_pancake_min_topup": setting.WaffoPancakeMinTopUp,
		"amount_options":          operation_setting.GetPaymentSetting().AmountOptions,
		"max_topup":               GetMaxTopup(int64(operation_setting.MinTopUp)),
		"discount":                operation_setting.GetPaymentSetting().AmountDiscount,
		"topup_link":              common.TopUpLink,
	}
	// Legacy EPay must not expose the Native asset capability. Native mode
	// deliberately returns an empty array when EPUSDT is unavailable so the
	// wallet can fail closed instead of falling back to the default TRON order.
	if nativeCrypto {
		data["crypto_assets"] = cryptoAssets
	}
	common.ApiSuccess(c, data)
}

func effectiveEpayPaymentMethods() []map[string]string {
	methods := make([]map[string]string, 0, len(operation_setting.PayMethods))
	for _, configured := range operation_setting.PayMethods {
		paymentMethod := strings.TrimSpace(configured["type"])
		if paymentMethod == "" {
			continue
		}
		if operation_setting.IsGMPayNativePaymentGatewayMode() && paymentMethod != gmpayNativePaymentMethod {
			continue
		}
		cloned := make(map[string]string, len(configured))
		for key, value := range configured {
			cloned[key] = value
		}
		methods = append(methods, cloned)
	}
	return methods
}

// defaultMaxTopupAmount 预设金额被清空时的兜底上限，取内置默认预设的最高档。
const defaultMaxTopupAmount = 500

type EpayRequest struct {
	Amount        int64  `json:"amount"`
	PaymentMethod string `json:"payment_method"`
	Token         string `json:"token"`
	Network       string `json:"network"`
}

type AmountRequest struct {
	Amount int64 `json:"amount"`
}

func GetEpayClient() *epay.Client {
	return buildEpayClient(operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey)
}

// buildEpayClient 以给定凭据构建易支付 client；任一凭据为空或初始化失败返回 nil。
func buildEpayClient(payAddress, epayId, epayKey string) *epay.Client {
	if payAddress == "" || epayId == "" || epayKey == "" {
		return nil
	}
	withUrl, err := epay.NewClient(&epay.Config{
		PartnerID: epayId,
		Key:       epayKey,
	}, payAddress)
	if err != nil {
		return nil
	}
	return withUrl
}

// epayCallbackAmountMatches rejects malformed or negative callback amounts and
// compares the verified amount with the immutable local order amount using
// decimal arithmetic rather than float equality.
func epayCallbackAmountMatches(callbackMoney string, orderMoney float64) bool {
	if strings.TrimSpace(callbackMoney) == "" || math.IsNaN(orderMoney) || math.IsInf(orderMoney, 0) || orderMoney < 0 {
		return false
	}
	callbackAmount, err := decimal.NewFromString(strings.TrimSpace(callbackMoney))
	if err != nil || callbackAmount.IsNegative() {
		return false
	}
	return callbackAmount.Equal(decimal.NewFromFloat(orderMoney))
}

// getPayMoney 计算易支付应付金额。unitPrice 为「元/单位」单价（代理自定义套餐价，
// 为 0 时回退平台全局 operation_setting.Price）。
func getPayMoney(amount int64, group string, unitPrice float64) float64 {
	if unitPrice <= 0 {
		unitPrice = operation_setting.Price
	}
	dAmount := decimal.NewFromInt(amount)
	// 充值金额以“展示类型”为准：
	// - USD/CNY: 前端传 amount 为金额单位；TOKENS: 前端传 tokens，需要换成 USD 金额
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		dAmount = dAmount.Div(dQuotaPerUnit)
	}

	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}

	dTopupGroupRatio := decimal.NewFromFloat(topupGroupRatio)
	dPrice := decimal.NewFromFloat(unitPrice)
	// apply optional preset discount by the original request amount (if configured), default 1.0
	discount := 1.0
	if ds, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok {
		if ds > 0 {
			discount = ds
		}
	}
	dDiscount := decimal.NewFromFloat(discount)

	payMoney := dAmount.Mul(dPrice).Mul(dTopupGroupRatio).Mul(dDiscount)

	return payMoney.InexactFloat64()
}

// topupQuotaFromAmount converts a stored top-up amount (USD-equivalent units)
// into the quota credited to the account. A top-up amount is user-controlled at
// the payment boundary, so a saturated conversion must fail instead of
// allowing a wrapped value to reach settlement.
func topupQuotaFromAmount(amount int64) (int, error) {
	quota, clamp := common.QuotaFromDecimalChecked(
		decimal.NewFromInt(amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Truncate(0),
	)
	if clamp != nil {
		return 0, clamp
	}
	return quota, nil
}

// getMinTopup 返回最小充值门槛。minTopupOverride>0 时使用代理自定义值，否则回退平台全局。
func getMinTopup(minTopupOverride int) int64 {
	minTopup := operation_setting.MinTopUp
	if minTopupOverride > 0 {
		minTopup = minTopupOverride
	}
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dMinTopup := decimal.NewFromInt(int64(minTopup))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		minTopup = common.QuotaFromDecimal(dMinTopup.Mul(dQuotaPerUnit))
	}
	return int64(minTopup)
}

// GetMaxTopup 返回单笔充值上限，取管理员配置的预设金额里的最高一档。
// 预设被清空时回退到内置默认档位的最高值：完全不设上限时用户能填出天文数字，
// 支付网关只会回一个没有信息量的下单失败，而金额本身还会一路进到配额计算里。
// 上限不会低于该渠道的最小充值门槛，否则会出现无论填什么都通不过的死区。
func GetMaxTopup(minTopup int64) int64 {
	maxOption := 0
	for _, option := range operation_setting.GetPaymentSetting().AmountOptions {
		if option > maxOption {
			maxOption = option
		}
	}
	if maxOption <= 0 {
		maxOption = defaultMaxTopupAmount
	}
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dMaxOption := decimal.NewFromInt(int64(maxOption))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		maxOption = int(dMaxOption.Mul(dQuotaPerUnit).IntPart())
	}
	return max(int64(maxOption), minTopup)
}

// validateTopupRange 统一校验单笔充值金额区间，不通过时自己写响应。
// 各支付渠道的下限设置不同，故由调用方传入；上限对所有渠道一致。
// 金额是用户可控的计费乘数，只拦下限等于没拦。
func validateTopupRange(c *gin.Context, amount int64, minTopup int64) bool {
	if amount < minTopup {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", minTopup)})
		return false
	}
	if maxTopup := GetMaxTopup(minTopup); amount > maxTopup {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("单笔充值不能大于 %d", maxTopup)})
		return false
	}
	return true
}

func getTopUpQuota(amount int64) (int, error) {
	quota := decimal.NewFromInt(amount)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		quotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		quota = decimal.NewFromInt(quota.Div(quotaPerUnit).IntPart()).Mul(quotaPerUnit)
	} else {
		quota = quota.Mul(decimal.NewFromFloat(common.QuotaPerUnit))
	}
	return common.QuotaFromDecimalStrict(quota)
}

func getMaxTopUpAmount() int64 {
	if common.QuotaPerUnit <= 0 {
		return 0
	}
	quotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
	maxStoredAmount := decimal.NewFromInt(common.MaxQuota - 1).
		Div(quotaPerUnit).
		Floor()
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		return maxStoredAmount.Add(decimal.NewFromInt(1)).
			Mul(quotaPerUnit).
			Ceil().
			Sub(decimal.NewFromInt(1)).
			IntPart()
	}
	return maxStoredAmount.IntPart()
}

func validateCreditedQuota(quota decimal.Decimal) (int, error) {
	value, err := common.QuotaFromDecimalStrict(quota)
	if err != nil {
		return 0, errors.New("充值额度超出系统可表示范围")
	}
	if value <= 0 {
		return 0, errors.New("充值额度必须大于 0")
	}
	return value, nil
}

func validateTopUpQuota(amount int64) (int, error) {
	quota, err := getTopUpQuota(amount)
	if err == nil && quota > 0 {
		return quota, nil
	}
	maxAmount := getMaxTopUpAmount()
	if maxAmount > 0 && amount > maxAmount {
		return 0, fmt.Errorf("单笔充值数量不能大于 %d", maxAmount)
	}
	return 0, errors.New("充值数量无效")
}

func rejectInvalidCreditedQuota(c *gin.Context, userId int, quota decimal.Decimal) bool {
	creditedQuota, err := validateCreditedQuota(quota)
	if err == nil {
		err = model.ValidateTopUpQuotaCapacity(userId, creditedQuota)
	}
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": err.Error()})
		return true
	}
	return false
}

func rejectInvalidTopUpQuota(c *gin.Context, userId int, amount int64) bool {
	creditedQuota, err := validateTopUpQuota(amount)
	if err == nil {
		err = model.ValidateTopUpQuotaCapacity(userId, creditedQuota)
	}
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": err.Error()})
		return true
	}
	return false
}

func RequestEpay(c *gin.Context) {
	var req EpayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	if operation_setting.IsGMPayNativePaymentGatewayMode() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "当前支付模式仅支持站内收银台"})
		return
	}
	epayCfg := resolveEpayConfig(c)
	if !epayCfg.Enabled || epayCfg.Client == nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "当前站点未配置支付信息"})
		return
	}
	if !validateTopupRange(c, req.Amount, getMinTopup(epayCfg.MinTopup)) {
		return
	}
	id := c.GetInt("id")
	if rejectInvalidTopUpQuota(c, id, req.Amount) {
		return
	}

	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getPayMoney(req.Amount, group, epayCfg.UnitPrice)
	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}

	if !operation_setting.ContainsPayMethod(req.PaymentMethod) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付方式不存在"})
		return
	}

	returnUrl, _ := url.Parse(tenantReturnPath(c, epayCfg.AgentId, "/usage-logs"))
	var notifyUrl *url.URL
	if epayCfg.AgentId > 0 {
		notifyUrl, _ = url.Parse(fmt.Sprintf("%s/api/agent/%d/epay/notify", tenantRequestBaseURL(c), epayCfg.AgentId))
	} else {
		notifyUrl, _ = url.Parse(service.GetCallbackAddress() + "/api/user/epay/notify")
	}
	tradeNo := fmt.Sprintf("%s%d", common.GetRandomString(6), time.Now().Unix())
	tradeNo = fmt.Sprintf("USR%dNO%s", id, tradeNo)
	client := epayCfg.Client
	uri, params, err := client.Purchase(&epay.PurchaseArgs{
		Type:           req.PaymentMethod,
		ServiceTradeNo: tradeNo,
		Name:           fmt.Sprintf("TUC%d", req.Amount),
		Money:          strconv.FormatFloat(payMoney, 'f', 2, 64),
		Device:         epay.PC,
		NotifyUrl:      notifyUrl,
		ReturnUrl:      returnUrl,
	})
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 拉起支付失败 user_id=%d trade_no=%s payment_method=%s amount=%d error=%q", id, tradeNo, req.PaymentMethod, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}
	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dAmount := decimal.NewFromInt(int64(amount))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		amount = dAmount.Div(dQuotaPerUnit).IntPart()
	}
	// 代理用户下单前预检代理钱包，不足则提示，避免支付后挂单
	projectedQuota, quotaErr := topupQuotaFromAmount(amount)
	if quotaErr != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 预计充值额度超出安全范围 user_id=%d amount=%d error=%q", id, amount, quotaErr.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值额度过大"})
		return
	}
	if ok, msg := precheckAgentWalletForUser(c, projectedQuota); !ok {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": msg})
		return
	}
	topUp := &model.TopUp{
		UserId:          id,
		Amount:          amount,
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   req.PaymentMethod,
		PaymentProvider: model.PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	err = topUp.Insert()
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 创建充值订单失败 user_id=%d trade_no=%s payment_method=%s amount=%d error=%q", id, tradeNo, req.PaymentMethod, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 充值订单创建成功 provider=%s user_id=%d trade_no=%s payment_method=%s amount=%d money=%.2f status=checkout_created", model.PaymentProviderEpay, id, tradeNo, req.PaymentMethod, req.Amount, payMoney))
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": params, "url": uri})
}

// RequestEpayCheckout creates a wallet top-up order and returns an in-site
// MAPI checkout instruction. The legacy RequestEpay /submit.php response is
// intentionally retained for existing external clients.
func RequestEpayCheckout(c *gin.Context) {
	var req EpayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	epayCfg := resolveEpayConfig(c)
	if !epayCfg.Enabled || epayCfg.Client == nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "当前站点未配置支付信息"})
		return
	}
	if !isEpayMAPIAllowedPaymentMethod(req.PaymentMethod) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付方式不存在"})
		return
	}
	if !validateTopupRange(c, req.Amount, getMinTopup(epayCfg.MinTopup)) {
		return
	}

	userID := c.GetInt("id")
	if rejectInvalidTopUpQuota(c, userID, req.Amount) {
		return
	}
	group, err := model.GetUserGroup(userID, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getPayMoney(req.Amount, group, epayCfg.UnitPrice)
	useGMPayNative := shouldUseGMPayNative(req.PaymentMethod)
	if payMoney < 0.01 || (useGMPayNative && payMoney <= 0.01) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	var nativeToken, nativeNetwork string
	if useGMPayNative {
		nativeToken, nativeNetwork, err = resolveGMPayWalletAsset(c.Request.Context(), epayCfg, req.PaymentMethod, req.Token, req.Network)
		if err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("GMPay 原生充值资产校验失败 user_id=%d payment_method=%s error=%q", userID, req.PaymentMethod, err.Error()))
			c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
			return
		}
	}
	var mapiClient *service.EpayMAPIClient
	if !useGMPayNative {
		mapiClient, err = service.NewEpayMAPIClient(epayCfg.Client, nil)
		if err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 MAPI client 初始化失败 user_id=%d error=%q", userID, err.Error()))
			c.JSON(http.StatusOK, gin.H{"message": "error", "data": "当前站点未配置支付信息"})
			return
		}
	}

	returnURL, err := url.Parse(tenantReturnPath(c, epayCfg.AgentId, "/wallet"))
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 MAPI 回跳地址无效 user_id=%d error=%q", userID, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付配置错误"})
		return
	}
	var notifyURL *url.URL
	if epayCfg.AgentId > 0 {
		if useGMPayNative {
			notifyURL, err = url.Parse(fmt.Sprintf("%s/api/agent/%d/gmpay/notify", tenantRequestBaseURL(c), epayCfg.AgentId))
		} else {
			notifyURL, err = url.Parse(fmt.Sprintf("%s/api/agent/%d/epay/notify", tenantRequestBaseURL(c), epayCfg.AgentId))
		}
	} else if useGMPayNative {
		notifyURL, err = url.Parse(service.GetCallbackAddress() + "/api/user/gmpay/notify")
	} else {
		notifyURL, err = url.Parse(service.GetCallbackAddress() + "/api/user/epay/notify")
	}
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 MAPI 回调地址无效 user_id=%d error=%q", userID, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付配置错误"})
		return
	}

	tradeNo := fmt.Sprintf("USR%dNO%s%d", userID, common.GetRandomString(6), time.Now().Unix())
	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		amount = decimal.NewFromInt(amount).Div(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart()
	}
	projectedQuota, quotaErr := topupQuotaFromAmount(amount)
	if quotaErr != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 MAPI 预计充值额度超出安全范围 user_id=%d amount=%d error=%q", userID, amount, quotaErr.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值额度过大"})
		return
	}
	if ok, message := precheckAgentWalletForUser(c, projectedQuota); !ok {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": message})
		return
	}

	topUp := &model.TopUp{
		UserId:          userID,
		Amount:          amount,
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   req.PaymentMethod,
		PaymentProvider: model.PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 MAPI 创建充值订单失败 user_id=%d trade_no=%s payment_method=%s amount=%d error=%q", userID, tradeNo, req.PaymentMethod, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	if useGMPayNative {
		data, clientErr := createGMPayNativeCheckout(c.Request.Context(), epayCfg, req.PaymentMethod, tradeNo, fmt.Sprintf("TUC%d", req.Amount), payMoney, notifyURL, returnURL, nativeToken, nativeNetwork)
		if clientErr == nil {
			logger.LogInfo(c.Request.Context(), fmt.Sprintf("GMPay 原生充值 checkout 创建成功 user_id=%d trade_no=%s gateway_trade_no=%v payment_method=%s amount=%d money=%.2f checkout_type=crypto", userID, tradeNo, data["gateway_trade_no"], req.PaymentMethod, req.Amount, payMoney))
			c.JSON(http.StatusOK, gin.H{"message": "success", "data": data})
			return
		}
		if updateErr := model.UpdatePendingTopUpStatus(tradeNo, model.PaymentProviderEpay, common.TopUpStatusFailed); updateErr != nil &&
			!errors.Is(updateErr, model.ErrTopUpStatusInvalid) && !errors.Is(updateErr, model.ErrTopUpNotFound) && !errors.Is(updateErr, model.ErrPaymentMethodMismatch) {
			logger.LogError(c.Request.Context(), fmt.Sprintf("GMPay 原生充值回收失败订单失败 trade_no=%s error=%q", tradeNo, updateErr.Error()))
		}
		logger.LogError(c.Request.Context(), fmt.Sprintf("GMPay 原生充值创建 checkout 失败 user_id=%d trade_no=%s payment_method=%s error=%q", userID, tradeNo, req.PaymentMethod, clientErr.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	checkout, err := mapiClient.CreateCheckout(c.Request.Context(), service.EpayMAPIRequest{
		PaymentMethod: req.PaymentMethod,
		TradeNo:       tradeNo,
		Name:          fmt.Sprintf("TUC%d", req.Amount),
		Money:         strconv.FormatFloat(payMoney, 'f', 2, 64),
		ClientIP:      c.ClientIP(),
		Device:        epay.PC,
		NotifyURL:     notifyURL,
		ReturnURL:     returnURL,
	})
	if err != nil {
		if updateErr := model.UpdatePendingTopUpStatus(tradeNo, model.PaymentProviderEpay, common.TopUpStatusFailed); updateErr != nil &&
			!errors.Is(updateErr, model.ErrTopUpStatusInvalid) && !errors.Is(updateErr, model.ErrTopUpNotFound) && !errors.Is(updateErr, model.ErrPaymentMethodMismatch) {
			logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 MAPI 回收失败订单失败 trade_no=%s error=%q", tradeNo, updateErr.Error()))
		}
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 MAPI 创建 checkout 失败 user_id=%d trade_no=%s payment_method=%s error=%q", userID, tradeNo, req.PaymentMethod, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 MAPI 充值 checkout 创建成功 user_id=%d trade_no=%s gateway_trade_no=%s payment_method=%s amount=%d money=%.2f checkout_type=%s", userID, tradeNo, checkout.GatewayTradeNo, req.PaymentMethod, req.Amount, payMoney, checkout.CheckoutType))
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": gin.H{
		"trade_no":         tradeNo,
		"gateway_trade_no": checkout.GatewayTradeNo,
		"checkout_type":    checkout.CheckoutType,
		"checkout_value":   checkout.CheckoutValue,
		"payment_method":   req.PaymentMethod,
		"money":            strconv.FormatFloat(payMoney, 'f', 2, 64),
	}})
}

// isEpayMAPIAllowedPaymentMethod accepts only configured Epay methods. The
// official direct-payment types must stay on their dedicated checkout flows.
func isEpayMAPIAllowedPaymentMethod(paymentMethod string) bool {
	if paymentMethod == model.PaymentMethodAlipay || paymentMethod == model.PaymentMethodWechatPay ||
		!operation_setting.ContainsPayMethod(paymentMethod) {
		return false
	}
	if operation_setting.IsGMPayNativePaymentGatewayMode() {
		return paymentMethod == gmpayNativePaymentMethod
	}
	return true
}

// AgentConsolePrepayEpay 代理预充值(经易支付)：owner 是平台用户(agent_id=0)，走平台全局易支付网关；
// 订单标记 AgentPrepayId，回调经 model.TryCompleteAgentPrepay 按 1:1 入代理钱包(§5.1)。
func AgentConsolePrepayEpay(c *gin.Context) {
	agentId := consoleAgentId(c)
	if agentId <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "无权限"})
		return
	}
	var req EpayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	if !isEpayMAPIAllowedPaymentMethod(req.PaymentMethod) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付方式不存在"})
		return
	}
	// 代理预充走平台全局易支付（owner 为平台账号 agent_id=0）
	epayCfg := epayConfigForAgent(0)
	if !epayCfg.Enabled || epayCfg.Client == nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "平台未配置支付信息"})
		return
	}
	if !validateTopupRange(c, req.Amount, getMinTopup(0)) {
		return
	}
	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getPayMoney(req.Amount, group, 0)
	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	callBackAddress := service.GetCallbackAddress()
	returnUrl, _ := url.Parse(paymentReturnPath("/agent-console"))
	useGMPayNative := shouldUseGMPayNative(req.PaymentMethod)
	notifyPath := "/api/user/epay/notify"
	if useGMPayNative {
		notifyPath = "/api/user/gmpay/notify"
	}
	notifyUrl, _ := url.Parse(callBackAddress + notifyPath)
	tradeNo := fmt.Sprintf("AGP%dNO%s%d", agentId, common.GetRandomString(6), time.Now().Unix())
	client := epayCfg.Client
	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dAmount := decimal.NewFromInt(int64(amount))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		amount = dAmount.Div(dQuotaPerUnit).IntPart()
	}
	if _, err := topupQuotaFromAmount(amount); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("代理预充额度超出安全范围 agent_id=%d amount=%d error=%q", agentId, amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值额度过大"})
		return
	}
	topUp := &model.TopUp{
		UserId:          id,
		Amount:          amount,
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   req.PaymentMethod,
		PaymentProvider: model.PaymentProviderEpay,
		AgentPrepayId:   agentId,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("代理预充 创建订单失败 agent_id=%d trade_no=%s error=%q", agentId, tradeNo, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}
	if useGMPayNative {
		data, checkoutErr := createGMPayNativeCheckout(c.Request.Context(), epayCfg, req.PaymentMethod, tradeNo, fmt.Sprintf("AGP%d", req.Amount), payMoney, notifyUrl, returnUrl, req.Token, req.Network)
		if checkoutErr != nil {
			if updateErr := model.UpdatePendingTopUpStatus(tradeNo, model.PaymentProviderEpay, common.TopUpStatusFailed); updateErr != nil &&
				!errors.Is(updateErr, model.ErrTopUpStatusInvalid) && !errors.Is(updateErr, model.ErrTopUpNotFound) && !errors.Is(updateErr, model.ErrPaymentMethodMismatch) {
				logger.LogError(c.Request.Context(), fmt.Sprintf("GMPay 代理预充回收失败订单失败 trade_no=%s error=%q", tradeNo, updateErr.Error()))
			}
			logger.LogError(c.Request.Context(), fmt.Sprintf("GMPay 代理预充创建 checkout 失败 agent_id=%d trade_no=%s error=%q", agentId, tradeNo, checkoutErr.Error()))
			c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
			return
		}
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("GMPay 代理预充订单创建成功 agent_id=%d trade_no=%s amount=%d money=%.2f", agentId, tradeNo, amount, payMoney))
		c.JSON(http.StatusOK, gin.H{"message": "success", "data": data})
		return
	}
	uri, params, err := client.Purchase(&epay.PurchaseArgs{
		Type:           req.PaymentMethod,
		ServiceTradeNo: tradeNo,
		Name:           fmt.Sprintf("AGP%d", req.Amount),
		Money:          strconv.FormatFloat(payMoney, 'f', 2, 64),
		Device:         epay.PC,
		NotifyUrl:      notifyUrl,
		ReturnUrl:      returnUrl,
	})
	if err != nil {
		if updateErr := model.UpdatePendingTopUpStatus(tradeNo, model.PaymentProviderEpay, common.TopUpStatusFailed); updateErr != nil &&
			!errors.Is(updateErr, model.ErrTopUpStatusInvalid) && !errors.Is(updateErr, model.ErrTopUpNotFound) && !errors.Is(updateErr, model.ErrPaymentMethodMismatch) {
			logger.LogError(c.Request.Context(), fmt.Sprintf("代理预充回收失败订单失败 trade_no=%s error=%q", tradeNo, updateErr.Error()))
		}
		logger.LogError(c.Request.Context(), fmt.Sprintf("代理预充 拉起支付失败 agent_id=%d trade_no=%s error=%q", agentId, tradeNo, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("代理预充 订单创建成功 agent_id=%d trade_no=%s amount=%d money=%.2f", agentId, tradeNo, amount, payMoney))
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": params, "url": uri})
}

// AgentConsolePrepayStatus scopes polling to both the authenticated owner and
// the agent wallet targeted by the prepayment order.
func AgentConsolePrepayStatus(c *gin.Context) {
	tradeNo := strings.TrimSpace(c.Query("trade_no"))
	agentID := consoleAgentId(c)
	if tradeNo == "" || agentID <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil || topUp.UserId != c.GetInt("id") || topUp.AgentPrepayId != agentID {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "订单不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": gin.H{"status": topUp.Status}})
}

// tradeNo lock
var orderLocks sync.Map
var createLock sync.Mutex

// refCountedMutex 带引用计数的互斥锁，确保最后一个使用者才从 map 中删除
type refCountedMutex struct {
	mu       sync.Mutex
	refCount int
}

// LockOrder 尝试对给定订单号加锁
func LockOrder(tradeNo string) {
	createLock.Lock()
	var rcm *refCountedMutex
	if v, ok := orderLocks.Load(tradeNo); ok {
		rcm = v.(*refCountedMutex)
	} else {
		rcm = &refCountedMutex{}
		orderLocks.Store(tradeNo, rcm)
	}
	rcm.refCount++
	createLock.Unlock()
	rcm.mu.Lock()
}

// UnlockOrder 释放给定订单号的锁
func UnlockOrder(tradeNo string) {
	v, ok := orderLocks.Load(tradeNo)
	if !ok {
		return
	}
	rcm := v.(*refCountedMutex)
	rcm.mu.Unlock()

	createLock.Lock()
	rcm.refCount--
	if rcm.refCount == 0 {
		orderLocks.Delete(tradeNo)
	}
	createLock.Unlock()
}

// EpayNotify 平台主站易支付回调（全局凭据）。
func EpayNotify(c *gin.Context) {
	if !operation_setting.IsLegacyEpayPaymentGatewayMode() {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	if !isEpayWebhookEnabled() {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 webhook 被拒绝 provider=%s status=webhook_disabled", model.PaymentProviderEpay))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	settleEpayNotify(c, GetEpayClient(), 0)
}

// settleEpayNotify 解析并验签易支付回调，验签成功后按订单完成到账/挂单。
// expectedAgentId 为该回调所属代理(平台主站为 0)，用于与订单归属做双校验，防跨租户越权入账。
func settleEpayNotify(c *gin.Context, client *epay.Client, expectedAgentId int) {
	var params map[string]string

	if c.Request.Method == "POST" {
		// POST 请求：从 POST body 解析参数
		if err := c.Request.ParseForm(); err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 webhook POST 表单解析失败 provider=%s status=parse_error error=%q", model.PaymentProviderEpay, err.Error()))
			_, _ = c.Writer.Write([]byte("fail"))
			return
		}
		params = lo.Reduce(lo.Keys(c.Request.PostForm), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.PostForm.Get(t)
			return r
		}, map[string]string{})
	} else {
		// GET 请求：从 URL Query 解析参数
		params = lo.Reduce(lo.Keys(c.Request.URL.Query()), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.URL.Query().Get(t)
			return r
		}, map[string]string{})
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 webhook 收到请求 provider=%s trade_no=%s payment_method=%s trade_status=%s status=received", model.PaymentProviderEpay, params["out_trade_no"], params["type"], params["trade_status"]))

	if len(params) == 0 {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 webhook 参数为空 provider=%s status=empty_request", model.PaymentProviderEpay))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	if client == nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 client 未初始化 provider=%s trade_no=%s status=client_uninitialized", model.PaymentProviderEpay, params["out_trade_no"]))
		_, err := c.Writer.Write([]byte("fail"))
		if err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 webhook 响应写入失败 provider=%s trade_no=%s status=response_error error=%q", model.PaymentProviderEpay, params["out_trade_no"], err.Error()))
		}
		return
	}
	verifyInfo, err := client.Verify(params)
	if err != nil || !verifyInfo.VerifyStatus {
		if _, writeErr := c.Writer.Write([]byte("fail")); writeErr != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 webhook 响应写入失败 provider=%s trade_no=%s status=response_error error=%q", model.PaymentProviderEpay, params["out_trade_no"], writeErr.Error()))
		}
		if err != nil {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 webhook 验签失败 provider=%s trade_no=%s payment_method=%s status=verify_error error=%q", model.PaymentProviderEpay, params["out_trade_no"], params["type"], err.Error()))
		} else {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 webhook 验签失败 provider=%s trade_no=%s payment_method=%s status=verify_status_false", model.PaymentProviderEpay, params["out_trade_no"], params["type"]))
		}
		return
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 webhook 验签成功 provider=%s trade_no=%s payment_method=%s trade_status=%s status=verified", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, verifyInfo.Type, verifyInfo.TradeStatus))

	if verifyInfo.TradeStatus == epay.StatusTradeSuccess {
		// Validate the signed amount before taking the process lock or entering
		// any settlement path. This prevents a valid signature for a different
		// amount from completing the local order.
		topUp := model.GetTopUpByTradeNo(verifyInfo.ServiceTradeNo)
		if topUp == nil || !epayCallbackAmountMatches(verifyInfo.Money, topUp.Money) {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 webhook 金额不匹配或无效 provider=%s trade_no=%s payment_method=%s status=amount_mismatch", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, verifyInfo.Type))
			_, _ = c.Writer.Write([]byte("fail"))
			return
		}
		// 进程内锁只是优化；重复/并发回调的正确性由 RechargeEpay 的
		// 数据库行锁 + 事务内状态校验保证（多实例部署下同样安全）。
		LockOrder(verifyInfo.ServiceTradeNo)
		defer UnlockOrder(verifyInfo.ServiceTradeNo)
		topUp = model.GetTopUpByTradeNo(verifyInfo.ServiceTradeNo)
		if topUp == nil {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 回调订单不存在 provider=%s trade_no=%s payment_method=%s status=order_not_found", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, verifyInfo.Type))
			_, _ = c.Writer.Write([]byte("fail"))
			return
		}
		if topUp.PaymentProvider != model.PaymentProviderEpay || !verifyTopupAgentOwnership(c, topUp, expectedAgentId, "易支付") {
			_, _ = c.Writer.Write([]byte("fail"))
			return
		}
		if topUp.Status == common.TopUpStatusPending && topUp.PaymentMethod != verifyInfo.Type {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 回调支付方式与订单不匹配 provider=%s trade_no=%s payment_method=%s order_payment_method=%s status=payment_method_mismatch", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, verifyInfo.Type, topUp.PaymentMethod))
			_, _ = c.Writer.Write([]byte("fail"))
			return
		}
		if topUp.AgentPrepayId > 0 {
			if _, perr := model.TryCompleteAgentPrepay(verifyInfo.ServiceTradeNo, model.PaymentProviderEpay, c.ClientIP()); perr != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 代理预充值失败 trade_no=%s error=%q", topUp.TradeNo, perr.Error()))
				_, _ = c.Writer.Write([]byte("fail"))
				return
			}
			_, _ = c.Writer.Write([]byte("success"))
			return
		}
		if topUp.GroupBuyId > 0 {
			if _, gerr := model.TrySettleGroupBuyOrder(verifyInfo.ServiceTradeNo, model.PaymentProviderEpay, c.ClientIP()); gerr != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 拼团结算失败 trade_no=%s error=%q", topUp.TradeNo, gerr.Error()))
				_, _ = c.Writer.Write([]byte("fail"))
				return
			}
			_, _ = c.Writer.Write([]byte("success"))
			return
		}
		quotaToAdd, quotaErr := topupQuotaFromAmount(topUp.Amount)
		if quotaErr != nil || quotaToAdd <= 0 {
			logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 充值额度无效 trade_no=%s amount=%d error=%v", topUp.TradeNo, topUp.Amount, quotaErr))
			_, _ = c.Writer.Write([]byte("fail"))
			return
		}
		credited, err := model.CompletePaidTopupByTradeNo(topUp.TradeNo, model.PaymentProviderEpay, "", quotaToAdd)
		if err != nil {
			switch {
			case errors.Is(err, model.ErrTopUpNotFound):
				logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 回调订单不存在 provider=%s trade_no=%s payment_method=%s status=order_not_found", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, verifyInfo.Type))
			case errors.Is(err, model.ErrPaymentMethodMismatch):
				logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 订单支付网关不匹配 provider=%s trade_no=%s payment_method=%s status=provider_mismatch", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, verifyInfo.Type))
			case errors.Is(err, model.ErrTopUpStatusInvalid):
				logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 订单状态非法 provider=%s trade_no=%s payment_method=%s status=order_status_invalid", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, verifyInfo.Type))
			default:
				logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 充值处理失败 provider=%s trade_no=%s payment_method=%s status=settlement_failed error=%q", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, verifyInfo.Type, err.Error()))
			}
			if _, writeErr := c.Writer.Write([]byte("fail")); writeErr != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 webhook 响应写入失败 provider=%s trade_no=%s status=response_error error=%q", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, writeErr.Error()))
			}
			return
		}
		if !credited {
			logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 已处理或代理钱包不足，订单保持现状 provider=%s trade_no=%s payment_method=%s status=held_or_idempotent", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, verifyInfo.Type))
		} else {
			logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 充值成功 provider=%s trade_no=%s user_id=%d payment_method=%s quota_to_add=%d status=settled", model.PaymentProviderEpay, topUp.TradeNo, topUp.UserId, topUp.PaymentMethod, quotaToAdd))
			model.RecordTopupLog(topUp.UserId, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%f", logger.LogQuota(quotaToAdd), topUp.Money), c.ClientIP(), topUp.PaymentMethod, "epay")
			model.CreateInviterRebate(topUp.UserId, topUp.Id, topUp.TradeNo, quotaToAdd)
			model.GrantTopupLotteryCards(topUp.UserId, quotaToAdd)
			if model.OnTopUpSuccess != nil {
				model.OnTopUpSuccess(topUp, quotaToAdd)
			}
		}
	} else {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 webhook 忽略事件 provider=%s trade_no=%s payment_method=%s trade_status=%s status=ignored", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, verifyInfo.Type, verifyInfo.TradeStatus))
	}
	if _, writeErr := c.Writer.Write([]byte("success")); writeErr != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 webhook 响应写入失败 provider=%s trade_no=%s status=response_error error=%q", model.PaymentProviderEpay, verifyInfo.ServiceTradeNo, writeErr.Error()))
	}
}

func RequestAmount(c *gin.Context) {
	var req AmountRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	epayCfg := resolveEpayConfig(c)
	if !validateTopupRange(c, req.Amount, getMinTopup(epayCfg.MinTopup)) {
		return
	}
	id := c.GetInt("id")
	if rejectInvalidTopUpQuota(c, id, req.Amount) {
		return
	}
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getPayMoney(req.Amount, group, epayCfg.UnitPrice)
	if payMoney <= 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": strconv.FormatFloat(payMoney, 'f', 2, 64)})
}

func GetUserTopUps(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	keyword := c.Query("keyword")

	var (
		topups []*model.TopUp
		total  int64
		err    error
	)
	if keyword != "" {
		topups, total, err = model.SearchUserTopUps(userId, keyword, pageInfo)
	} else {
		topups, total, err = model.GetUserTopUps(userId, pageInfo)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(topups)
	common.ApiSuccess(c, pageInfo)
}

// GetAllTopUps 管理员获取全平台充值记录
func GetAllTopUps(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	keyword := c.Query("keyword")

	var (
		topups []*model.TopUp
		total  int64
		err    error
	)
	if keyword != "" {
		topups, total, err = model.SearchAllTopUps(keyword, pageInfo)
	} else {
		topups, total, err = model.GetAllTopUps(pageInfo)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(topups)
	common.ApiSuccess(c, pageInfo)
}

type AdminCompleteTopupRequest struct {
	TradeNo string `json:"trade_no"`
}

// AdminCompleteTopUp 管理员补单接口
func AdminCompleteTopUp(c *gin.Context) {
	var req AdminCompleteTopupRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.TradeNo == "" {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	// 订单级互斥，防止并发补单
	LockOrder(req.TradeNo)
	defer UnlockOrder(req.TradeNo)

	if err := model.ManualCompleteTopUp(req.TradeNo, c.ClientIP()); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
