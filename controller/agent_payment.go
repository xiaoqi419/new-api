package controller

import (
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v81/webhook"
)

// tenantRequestBaseURL 返回当前请求的 scheme://host，用于按代理域名拼回调/回跳地址。
// 反代(Caddy)透传 Host 与 X-Forwarded-Proto；代理白标域名默认走 https。
func tenantRequestBaseURL(c *gin.Context) string {
	scheme := "https"
	if proto := c.GetHeader("X-Forwarded-Proto"); proto == "http" {
		scheme = "http"
	}
	return scheme + "://" + c.Request.Host
}

// tenantReturnPath 计算支付回跳地址：代理用户按其访问域名拼绝对地址，平台用户沿用全局 ServerAddress。
func tenantReturnPath(c *gin.Context, agentId int, suffix string) string {
	if agentId > 0 {
		return tenantRequestBaseURL(c) + suffix
	}
	return paymentReturnPath(suffix)
}

// verifyTopupAgentOwnership 校验订单归属用户的 agent_id 是否与回调所属代理一致，防跨租户越权入账(S5)。
func verifyTopupAgentOwnership(c *gin.Context, topUp *model.TopUp, expectedAgentId int, label string) bool {
	if topUp == nil {
		return false
	}
	return verifyPaymentOwnerAgent(c, topUp.UserId, topUp.TradeNo, expectedAgentId, label)
}

func verifyPaymentOwnerAgent(c *gin.Context, userID int, tradeNo string, expectedAgentID int, label string) bool {
	owner, err := model.GetUserById(userID, false)
	if err != nil || owner == nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("%s 回调订单用户不存在 trade_no=%s user_id=%d client_ip=%s", label, tradeNo, userID, c.ClientIP()))
		return false
	}
	if owner.AgentId != expectedAgentID {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("%s 回调订单归属代理不匹配 trade_no=%s user_agent_id=%d expected_agent_id=%d client_ip=%s", label, tradeNo, owner.AgentId, expectedAgentID, c.ClientIP()))
		return false
	}
	return true
}

// ---- 易支付租户配置 ----

type tenantEpayConfig struct {
	AgentId   int
	Enabled   bool
	Client    *epay.Client
	UnitPrice float64 // 元/单位（代理自定义套餐价，0 表示回退平台全局 Price）
	MinTopup  int     // 最小充值（0 表示回退平台全局 MinTopUp）
}

// epayConfigForAgent 构建指定代理的易支付配置；agentId<=0 回退平台全局配置。
func epayConfigForAgent(agentId int) tenantEpayConfig {
	if agentId <= 0 {
		return tenantEpayConfig{
			AgentId:   0,
			Enabled:   operation_setting.PayAddress != "" && operation_setting.EpayId != "" && operation_setting.EpayKey != "",
			Client:    buildEpayClient(operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey),
			UnitPrice: operation_setting.Price,
			MinTopup:  operation_setting.MinTopUp,
		}
	}
	cfg, err := model.GetAgentPaymentConfig(agentId, model.AgentPaymentProviderEpay)
	if err != nil || cfg == nil || !cfg.Enabled {
		return tenantEpayConfig{AgentId: agentId}
	}
	creds, err := cfg.DecryptCreds()
	if err != nil {
		common.SysError(fmt.Sprintf("failed to decrypt agent epay creds agent_id=%d: %s", agentId, err.Error()))
		return tenantEpayConfig{AgentId: agentId}
	}
	return tenantEpayConfig{
		AgentId:   agentId,
		Enabled:   true,
		Client:    buildEpayClient(creds["pay_address"], creds["epay_id"], creds["epay_key"]),
		UnitPrice: cfg.UnitPrice,
		MinTopup:  cfg.MinTopup,
	}
}

// resolveEpayConfig 依据当前登录用户的 agent_id 解析其应使用的易支付配置。
func resolveEpayConfig(c *gin.Context) tenantEpayConfig {
	return epayConfigForAgent(common.GetContextKeyInt(c, constant.ContextKeyUserAgentId))
}

// requirePlatformNativePaymentUser prevents white-label tenants from creating
// platform GMPay orders. Native callbacks settle through the platform account,
// so allowing an agent user to create one would leave a paid order without a
// valid tenant settlement path.
func requirePlatformNativePaymentUser(c *gin.Context) bool {
	if !operation_setting.IsGMPayNativePaymentGatewayMode() ||
		common.GetContextKeyInt(c, constant.ContextKeyUserAgentId) == 0 {
		return true
	}
	common.ApiErrorMsg(c, "当前支付网关仅支持平台用户")
	return false
}

// AgentEpayNotify 代理自有易支付回调：显式路径携带 agentId，使用该代理密钥验签并做订单归属双校验。
func AgentEpayNotify(c *gin.Context) {
	if !operation_setting.IsLegacyEpayPaymentGatewayMode() {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	agentId, err := strconv.Atoi(c.Param("id"))
	if err != nil || agentId <= 0 {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	cfg := epayConfigForAgent(agentId)
	if !cfg.Enabled || cfg.Client == nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("代理易支付回调 代理未配置或未启用 agent_id=%d client_ip=%s", agentId, c.ClientIP()))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	settleEpayNotify(c, cfg.Client, agentId)
}

// ---- Stripe 租户配置 ----

type tenantStripeConfig struct {
	AgentId       int
	Enabled       bool
	ApiSecret     string
	WebhookSecret string
	PriceId       string
	Promotion     bool
	UnitPrice     float64
	MinTopup      int
	SuccessURL    string
	CancelURL     string
}

// stripeConfigForAgent 构建指定代理的 Stripe 配置(不含回跳 URL)；agentId<=0 回退平台全局。
func stripeConfigForAgent(agentId int) tenantStripeConfig {
	if agentId <= 0 {
		return tenantStripeConfig{
			AgentId:       0,
			Enabled:       setting.StripeApiSecret != "",
			ApiSecret:     setting.StripeApiSecret,
			WebhookSecret: setting.StripeWebhookSecret,
			PriceId:       setting.StripePriceId,
			Promotion:     setting.StripePromotionCodesEnabled,
			UnitPrice:     setting.StripeUnitPrice,
			MinTopup:      setting.StripeMinTopUp,
		}
	}
	cfg, err := model.GetAgentPaymentConfig(agentId, model.AgentPaymentProviderStripe)
	if err != nil || cfg == nil || !cfg.Enabled {
		return tenantStripeConfig{AgentId: agentId}
	}
	creds, err := cfg.DecryptCreds()
	if err != nil {
		common.SysError(fmt.Sprintf("failed to decrypt agent stripe creds agent_id=%d: %s", agentId, err.Error()))
		return tenantStripeConfig{AgentId: agentId}
	}
	return tenantStripeConfig{
		AgentId:       agentId,
		Enabled:       true,
		ApiSecret:     creds["api_secret"],
		WebhookSecret: creds["webhook_secret"],
		PriceId:       creds["price_id"],
		Promotion:     creds["promotion_codes"] == "true",
		UnitPrice:     cfg.UnitPrice,
		MinTopup:      cfg.MinTopup,
	}
}

// resolveStripeConfig 依据当前登录用户的 agent_id 解析 Stripe 配置，并按域名补全回跳 URL。
func resolveStripeConfig(c *gin.Context) tenantStripeConfig {
	agentId := common.GetContextKeyInt(c, constant.ContextKeyUserAgentId)
	cfg := stripeConfigForAgent(agentId)
	cfg.SuccessURL = tenantReturnPath(c, agentId, "/usage-logs")
	cfg.CancelURL = tenantReturnPath(c, agentId, "/wallet")
	return cfg
}

// AgentStripeWebhook 代理自有 Stripe webhook：用该代理的 webhook secret 验签，再分发到公共处理。
func AgentStripeWebhook(c *gin.Context) {
	ctx := c.Request.Context()
	agentId, err := strconv.Atoi(c.Param("id"))
	if err != nil || agentId <= 0 {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	cfg := stripeConfigForAgent(agentId)
	if !cfg.Enabled || cfg.WebhookSecret == "" {
		logger.LogWarn(ctx, fmt.Sprintf("代理 Stripe webhook 代理未配置 agent_id=%d client_ip=%s", agentId, c.ClientIP()))
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("代理 Stripe webhook 读取请求体失败 agent_id=%d client_ip=%s error=%q", agentId, c.ClientIP(), err.Error()))
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}
	signature := c.GetHeader("Stripe-Signature")
	event, err := webhook.ConstructEventWithOptions(payload, signature, cfg.WebhookSecret, webhook.ConstructEventOptions{
		IgnoreAPIVersionMismatch: true,
	})
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("代理 Stripe webhook 验签失败 agent_id=%d client_ip=%s error=%q", agentId, c.ClientIP(), err.Error()))
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	callerIp := c.ClientIP()
	// 订单归属软校验(防跨租户)：能定位到充值订单时，校验其归属代理与回调路径一致。
	if refId := event.GetObjectValue("client_reference_id"); refId != "" {
		if topUp := model.GetTopUpByTradeNo(refId); topUp != nil && topUp.PaymentProvider == model.PaymentProviderStripe {
			if !verifyTopupAgentOwnership(c, topUp, agentId, "Stripe") {
				c.Status(http.StatusOK)
				return
			}
		}
	}
	logger.LogInfo(ctx, fmt.Sprintf("代理 Stripe webhook 验签成功 agent_id=%d event_type=%s client_ip=%s", agentId, string(event.Type), callerIp))
	dispatchStripeEvent(ctx, event, callerIp)
	c.Status(http.StatusOK)
}
