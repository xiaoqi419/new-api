package controller

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

const (
	gmpayNativePaymentMethod = "usdt.tron"
	gmpayCallbackBodyLimit   = 64 << 10
)

var newGMPayNativeClient = func(gatewayAddress string, pid string, secret string) (*service.GMPayClient, error) {
	return service.NewGMPayClient(gatewayAddress, pid, secret, nil)
}

// newGMPayNetworkFeeEstimator is a test seam around the server-owned option
// loader. RequestEpayCheckout must never construct an estimator from request
// fields or from GMPay's create-order response.
var newGMPayNetworkFeeEstimator = service.CurrentNetworkFeeEstimator

// newAutomaticGMPayNetworkFeeEstimator is the no-configuration preset seam.
// It is used only when dynamic_enabled was omitted and private EPUSDT
// discovery cannot provide a server-owned context.
var newAutomaticGMPayNetworkFeeEstimator = service.NewAutomaticGMPayNetworkFeeEstimator

var automaticGMPayEstimatorCache struct {
	sync.Mutex
	estimator service.NetworkFeeEstimator
}

func cachedAutomaticGMPayNetworkFeeEstimator() (service.NetworkFeeEstimator, error) {
	automaticGMPayEstimatorCache.Lock()
	defer automaticGMPayEstimatorCache.Unlock()
	if automaticGMPayEstimatorCache.estimator != nil {
		return automaticGMPayEstimatorCache.estimator, nil
	}
	estimator, err := newAutomaticGMPayNetworkFeeEstimator()
	if err != nil {
		return nil, err
	}
	automaticGMPayEstimatorCache.estimator = estimator
	return estimator, nil
}

func resetCachedAutomaticGMPayNetworkFeeEstimator() {
	automaticGMPayEstimatorCache.Lock()
	automaticGMPayEstimatorCache.estimator = nil
	automaticGMPayEstimatorCache.Unlock()
}

// discoverGMPayNetworkFeeEstimator is the server-to-server EPUSDT capability
// bridge used by turnkey Native wallet checkout.  It remains a seam so tests
// can provide a deterministic estimator without contacting a gateway.
var discoverGMPayNetworkFeeEstimator = service.DiscoverGMPayNetworkFeeEstimator

var discoverGMPayNetworkFeeEstimatorFromClient = service.DiscoverGMPayNetworkFeeEstimatorFromClient

func resolveGMPayEstimatorWithClient(ctx context.Context, cfg service.GMPayFeeConfig, client *service.GMPayClient) (service.NetworkFeeEstimator, error) {
	if cfg.IsDynamicEnabled() {
		return newGMPayNetworkFeeEstimator()
	}
	if cfg.IsDynamicConfigured() {
		return nil, service.ErrNetworkFeeUnavailable
	}
	if client != nil {
		if estimator, err := discoverGMPayNetworkFeeEstimatorFromClient(ctx, client); err == nil && estimator != nil {
			return estimator, nil
		}
	}
	return cachedAutomaticGMPayNetworkFeeEstimator()
}

// estimateAndNormalizeGMPayNetworkQuote is the single boundary used by the
// admin probe and the checkout-facing status probe.  Estimators return a raw
// chain quote, while GMPayFeeQuoteFromNetworkQuote applies the same amount,
// provenance, asset, currency, TTL, and configured-limit checks used by order
// creation.  Keeping the conversion here prevents a healthy status from being
// reported for a quote that checkout would reject.
func estimateAndNormalizeGMPayNetworkQuote(
	ctx context.Context,
	estimator service.NetworkFeeEstimator,
	input service.NetworkFeeEstimateInput,
) (service.GMPayFeeQuote, error) {
	if estimator == nil {
		return service.GMPayFeeQuote{}, service.ErrGMPayFeeUnavailable
	}
	networkQuote, err := estimator.Estimate(ctx, input)
	if err != nil {
		return service.GMPayFeeQuote{}, err
	}
	return service.GMPayFeeQuoteFromNetworkQuote(
		networkQuote,
		input.BaseAmount,
		input.Token,
		input.Network,
		input.SettlementCurrency,
	)
}

// estimateGMPayNetworkQuoteWithAutomaticFallback mirrors the wallet's
// automatic ordering for status/test requests.  A private EPUSDT estimator
// can become unusable after discovery (for example when its context expires),
// so omitted dynamic_enabled retries the built-in preset before reporting an
// unavailable estimate. Explicit dynamic configuration never silently falls
// back to a different estimator.
func estimateGMPayNetworkQuoteWithAutomaticFallback(
	ctx context.Context,
	cfg service.GMPayFeeConfig,
	client *service.GMPayClient,
	input service.NetworkFeeEstimateInput,
) (service.GMPayFeeQuote, error) {
	estimator, err := resolveGMPayEstimatorWithClient(ctx, cfg, client)
	if err != nil {
		return service.GMPayFeeQuote{}, err
	}
	quote, err := estimateAndNormalizeGMPayNetworkQuote(ctx, estimator, input)
	if err == nil {
		return quote, nil
	}
	if !cfg.IsDynamicConfigured() {
		if fallbackEstimator, fallbackErr := cachedAutomaticGMPayNetworkFeeEstimator(); fallbackErr == nil {
			if fallbackQuote, fallbackQuoteErr := estimateAndNormalizeGMPayNetworkQuote(ctx, fallbackEstimator, input); fallbackQuoteErr == nil {
				return fallbackQuote, nil
			}
		}
	}
	return service.GMPayFeeQuote{}, err
}

type gmpayFeeStatusResponse struct {
	Configured      bool                        `json:"configured"`
	Capability      bool                        `json:"capability"`
	Healthy         bool                        `json:"healthy"`
	QuoteAvailable  bool                        `json:"quote_available"`
	Reason          string                      `json:"reason,omitempty"`
	SupportedAssets []service.GMPayPaymentAsset `json:"supported_assets,omitempty"`
	LastSyncAt      int64                       `json:"last_sync_at,omitempty"`
	LastSuccessAt   int64                       `json:"last_success_at,omitempty"`
}

var gmpayFeeStatusCache struct {
	sync.Mutex
	value     gmpayFeeStatusResponse
	expiresAt time.Time
	key       string
}

// GetGMPayFeeStatus reports only sanitized capability and availability data.
// Merchant credentials, endpoint URLs, transaction context, and full wallet
// addresses never cross this response boundary.
func GetGMPayFeeStatus(c *gin.Context) {
	cacheKey := currentGMPayFeeStatusCacheKey()
	if gmpayFeeStatusCacheValid(cacheKey) {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gmpayFeeStatusCached()})
		return
	}
	status := discoverGMPayFeeStatus(c.Request.Context())
	storeGMPayFeeStatus(status, cacheKey)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": status})
}

// TestGMPayFeeEstimate performs one server-side estimate using a safe 1.00
// base amount and an optional validated token/network pair. It never creates
// an order and returns no low-level gateway or chain context.
func TestGMPayFeeEstimate(c *gin.Context) {
	var request struct {
		Token   string `json:"token"`
		Network string `json:"network"`
	}
	if c.Request.Body != nil {
		_ = common.DecodeJson(c.Request.Body, &request)
	}
	clientCfg := GetEpayClient()
	if clientCfg == nil || clientCfg.Config == nil || clientCfg.BaseUrl == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "GMPay network fee discovery is unavailable"})
		return
	}
	client, err := newGMPayNativeClient(clientCfg.BaseUrl.String(), clientCfg.Config.PartnerID, clientCfg.Config.Key)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "GMPay network fee discovery is unavailable"})
		return
	}
	assets, err := client.SupportedAssetsFresh(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "GMPay network fee discovery is unavailable"})
		return
	}
	request.Token, request.Network, err = chooseGMPayFeeStatusAsset(assets, request.Token, request.Network)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "GMPay token or network is unavailable"})
		return
	}
	feeCfg, cfgErr := service.CurrentGMPayFeeConfig()
	if cfgErr != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "GMPay network fee estimate is unavailable"})
		return
	}
	settlementCurrency, currencyErr := gmpaySettlementCurrencyForNetwork(request.Network, feeCfg)
	if currencyErr != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "GMPay settlement currency is unavailable"})
		return
	}
	quote, err := estimateGMPayNetworkQuoteWithAutomaticFallback(c.Request.Context(), feeCfg, client, service.NetworkFeeEstimateInput{
		Token: request.Token, Network: request.Network, SettlementCurrency: settlementCurrency, BaseAmount: decimal.NewFromInt(1),
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "GMPay network fee estimate is unavailable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"token": strings.ToUpper(request.Token), "network": strings.ToUpper(request.Network),
		"source": quote.Source, "native_asset": quote.NativeAsset, "native_amount": quote.NativeAmount.String(),
		"fee_amount": quote.FeeAmount.StringFixed(2), "base_amount": quote.BaseAmount.StringFixed(2),
		"total_amount": quote.TotalAmount.StringFixed(2), "settlement_currency": quote.SettlementCurrency,
		"estimator_version": quote.EstimatorVersion, "confidence": quote.Confidence,
		"quoted_at": quote.QuotedAt.UTC().Format(time.RFC3339Nano), "expires_at": quote.ExpiresAt.UTC().Format(time.RFC3339Nano),
	}})
}

func discoverGMPayFeeStatus(ctx context.Context) gmpayFeeStatusResponse {
	status := gmpayFeeStatusResponse{}
	clientCfg := GetEpayClient()
	if clientCfg == nil || clientCfg.Config == nil || clientCfg.BaseUrl == nil {
		status.Reason = "GMPay merchant is not configured"
		return status
	}
	status.Configured = true
	client, err := newGMPayNativeClient(clientCfg.BaseUrl.String(), clientCfg.Config.PartnerID, clientCfg.Config.Key)
	if err != nil {
		status.Reason = "GMPay merchant client is unavailable"
		return status
	}
	assets, err := client.SupportedAssetsFresh(ctx)
	status.LastSyncAt = time.Now().Unix()
	if err != nil {
		status.Reason = "EPUSDT supported assets are unavailable"
		return status
	}
	for _, asset := range assets {
		for _, token := range asset.Tokens {
			status.SupportedAssets = append(status.SupportedAssets, service.GMPayPaymentAsset{Network: strings.ToUpper(asset.Network), Token: strings.ToUpper(token), DisplayName: asset.DisplayName})
		}
	}
	feeCfg, cfgErr := service.CurrentGMPayFeeConfig()
	if cfgErr != nil {
		status.Reason = "GMPay network fee configuration is unavailable"
		return status
	}
	estimator, err := resolveGMPayEstimatorWithClient(ctx, feeCfg, client)
	if err != nil {
		if errors.Is(err, service.ErrGMPayNetworkFeeCapabilityUnavailable) {
			status.Reason = "EPUSDT network fee capability is unavailable"
		} else if errors.Is(err, service.ErrNetworkFeeUnavailable) && feeCfg.IsDynamicConfigured() && !feeCfg.IsDynamicEnabled() {
			status.Reason = "GMPay dynamic network fee estimation is disabled"
		} else {
			status.Reason = "EPUSDT network fee context is unavailable"
		}
		return status
	}
	status.Capability = true
	if gmpayEstimatorHasQuote(ctx, estimator, assets, feeCfg) {
		status.Healthy, status.QuoteAvailable = true, true
		status.LastSuccessAt = status.LastSyncAt
		return status
	}
	status.Reason = "GMPay network fee estimate is unavailable"
	return status
}

func gmpayEstimatorHasQuote(ctx context.Context, estimator service.NetworkFeeEstimator, assets []service.GMPayAsset, feeCfg service.GMPayFeeConfig) bool {
	if estimator == nil {
		return false
	}
	for _, asset := range assets {
		for _, token := range asset.Tokens {
			currency, err := gmpaySettlementCurrencyForNetwork(asset.Network, feeCfg)
			if err != nil {
				continue
			}
			input := service.NetworkFeeEstimateInput{Token: token, Network: asset.Network, SettlementCurrency: currency, BaseAmount: decimal.NewFromInt(1)}
			if _, err = estimateAndNormalizeGMPayNetworkQuote(ctx, estimator, input); err == nil {
				return true
			}
			// In automatic mode a discovered private context may be structurally
			// valid but fail when its representative transaction is simulated.
			// Give the same cached built-in estimator used by checkout a chance.
			if !feeCfg.IsDynamicConfigured() {
				if fallbackEstimator, fallbackErr := cachedAutomaticGMPayNetworkFeeEstimator(); fallbackErr == nil {
					if _, fallbackQuoteErr := estimateAndNormalizeGMPayNetworkQuote(ctx, fallbackEstimator, input); fallbackQuoteErr == nil {
						return true
					}
				}
			}
		}
	}
	return false
}

func chooseGMPayFeeStatusAsset(assets []service.GMPayAsset, token, network string) (string, string, error) {
	token = strings.ToLower(strings.TrimSpace(token))
	network = strings.ToLower(strings.TrimSpace(network))
	if network != "" {
		if canonical, ok := service.NormalizeGMPayNetwork(network); ok {
			network = canonical
		}
	}
	for _, asset := range assets {
		if network != "" && asset.Network != network {
			continue
		}
		for _, supported := range asset.Tokens {
			if token != "" && !strings.EqualFold(token, supported) {
				continue
			}
			return strings.ToUpper(supported), asset.Network, nil
		}
	}
	return "", "", errors.New("asset unavailable")
}

func currentGMPayFeeStatusCacheKey() string {
	client := GetEpayClient()
	endpoint := ""
	if client != nil && client.BaseUrl != nil {
		endpoint = client.BaseUrl.String()
	}
	cfg, _ := service.CurrentGMPayFeeConfig()
	return fmt.Sprintf("%s|v=%d|dynamic=%t|configured=%t|chains=%d", endpoint, cfg.Version, cfg.IsDynamicEnabled(), cfg.IsDynamicConfigured(), len(cfg.Chains))
}

func gmpayFeeStatusCacheValid(keys ...string) bool {
	key := currentGMPayFeeStatusCacheKey()
	if len(keys) > 0 {
		key = keys[0]
	}
	gmpayFeeStatusCache.Lock()
	defer gmpayFeeStatusCache.Unlock()
	return key != "" && key == gmpayFeeStatusCache.key && !gmpayFeeStatusCache.expiresAt.IsZero() && time.Now().Before(gmpayFeeStatusCache.expiresAt)
}

func gmpayFeeStatusCached() gmpayFeeStatusResponse {
	gmpayFeeStatusCache.Lock()
	defer gmpayFeeStatusCache.Unlock()
	return gmpayFeeStatusCache.value
}

func storeGMPayFeeStatus(value gmpayFeeStatusResponse, keys ...string) {
	key := currentGMPayFeeStatusCacheKey()
	if len(keys) > 0 {
		key = keys[0]
	}
	gmpayFeeStatusCache.Lock()
	gmpayFeeStatusCache.value, gmpayFeeStatusCache.expiresAt, gmpayFeeStatusCache.key = value, time.Now().Add(15*time.Second), key
	gmpayFeeStatusCache.Unlock()
}

// GMPayNotify handles callbacks sent to the platform's configured GMPay
// merchant account. Agent callbacks use their own route and credentials.
func GMPayNotify(c *gin.Context) {
	if !operation_setting.IsGMPayNativePaymentGatewayMode() {
		writeGMPayNotifyResult(c, false)
		return
	}
	client := GetEpayClient()
	if client == nil || client.Config == nil {
		writeGMPayNotifyResult(c, false)
		return
	}
	settleGMPayNotify(c, client.Config.PartnerID, client.Config.Key, 0)
}

// AgentGMPayNotify handles a native GMPay callback for an agent-specific EPay
// configuration. The route agent ID and order owner are both checked before
// settlement to prevent cross-tenant credits.
func AgentGMPayNotify(c *gin.Context) {
	if !operation_setting.IsGMPayNativePaymentGatewayMode() {
		writeGMPayNotifyResult(c, false)
		return
	}
	agentID, err := strconv.Atoi(c.Param("id"))
	if err != nil || agentID <= 0 {
		writeGMPayNotifyResult(c, false)
		return
	}
	cfg := epayConfigForAgent(agentID)
	if !cfg.Enabled || cfg.Client == nil || cfg.Client.Config == nil {
		writeGMPayNotifyResult(c, false)
		return
	}
	settleGMPayNotify(c, cfg.Client.Config.PartnerID, cfg.Client.Config.Key, agentID)
}

func settleGMPayNotify(c *gin.Context, expectedPID string, secret string, expectedAgentID int) {
	if strings.TrimSpace(expectedPID) == "" || strings.TrimSpace(secret) == "" {
		writeGMPayNotifyResult(c, false)
		return
	}
	if c.Request.Method != http.MethodPost || !strings.HasPrefix(strings.ToLower(c.GetHeader("Content-Type")), "application/json") {
		writeGMPayNotifyResult(c, false)
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, gmpayCallbackBodyLimit+1))
	if err != nil || len(body) > gmpayCallbackBodyLimit {
		writeGMPayNotifyResult(c, false)
		return
	}
	params, err := gmpayCallbackSignatureParams(body)
	pid, pidOK := params["pid"].(string)
	orderID, orderIDOK := params["order_id"].(string)
	amount, amountOK := service.GMPayCanonicalParameter(params["amount"])
	status, statusOK := service.GMPayCanonicalParameter(params["status"])
	signature, signatureOK := params["signature"].(string)
	if err == nil {
		// New EPUSDT callbacks include the selected network. Keep accepting
		// legacy TRON callbacks that omitted it, but validate any supplied
		// asset/address before settlement.
		if networkValue, ok := params["network"]; ok {
			network, networkOK := networkValue.(string)
			token, tokenOK := params["token"].(string)
			address, addressOK := params["receive_address"].(string)
			if !networkOK || !tokenOK || !addressOK || !service.IsGMPayAddress(network, address) || strings.TrimSpace(network) == "" || strings.TrimSpace(token) == "" {
				writeGMPayNotifyResult(c, false)
				return
			}
		}
	}
	if err != nil || !pidOK || !orderIDOK || !amountOK || !statusOK || !signatureOK ||
		strings.TrimSpace(pid) == "" || strings.TrimSpace(orderID) == "" || strings.TrimSpace(signature) == "" ||
		subtle.ConstantTimeCompare([]byte(pid), []byte(expectedPID)) != 1 ||
		!service.VerifyGMPaySignature(params, signature, secret) || status != "2" {
		writeGMPayNotifyResult(c, false)
		return
	}

	topUp := model.GetTopUpByTradeNo(orderID)
	subscriptionOrder := model.GetSubscriptionOrderByTradeNo(orderID)
	if topUp != nil && subscriptionOrder != nil && !isDerivedSubscriptionTopUp(topUp, subscriptionOrder) {
		writeGMPayNotifyResult(c, false)
		return
	}
	expectedPaymentMethod := ""
	if topUp != nil {
		expectedPaymentMethod = topUp.PaymentMethod
	}
	if subscriptionOrder != nil {
		expectedPaymentMethod = subscriptionOrder.PaymentMethod
	}
	if !isGMPayNativeOrderPaymentMethod(expectedPaymentMethod) || !gmpayCallbackMatchesOrderAsset(params, expectedPaymentMethod) {
		writeGMPayNotifyResult(c, false)
		return
	}
	auditParams := make(map[string]any, len(params)-1)
	for key, value := range params {
		if key != "signature" {
			auditParams[key] = value
		}
	}
	payload, marshalErr := common.Marshal(auditParams)
	if marshalErr != nil {
		writeGMPayNotifyResult(c, false)
		return
	}
	handledSubscription, subscriptionErr := TryCompleteGMPaySubscriptionOrder(orderID, amount, string(payload), expectedAgentID)
	if handledSubscription {
		if subscriptionErr != nil {
			if !errors.Is(subscriptionErr, model.ErrSubscriptionOrderNotFound) &&
				!errors.Is(subscriptionErr, model.ErrSubscriptionOrderStatusInvalid) &&
				!errors.Is(subscriptionErr, model.ErrPaymentMethodMismatch) {
				logger.LogError(c.Request.Context(), fmt.Sprintf("GMPay 订阅结算失败 trade_no=%s error=%q", orderID, subscriptionErr.Error()))
			}
			writeGMPayNotifyResult(c, false)
			return
		}
		writeGMPayNotifyResult(c, true)
		return
	}
	if topUp == nil || topUp.PaymentProvider != model.PaymentProviderEpay ||
		!isGMPayNativeOrderPaymentMethod(topUp.PaymentMethod) || !epayCallbackAmountMatches(amount, topUp.Money) ||
		!verifyTopupAgentOwnership(c, topUp, expectedAgentID, "GMPay") ||
		(topUp.GroupBuyId != 0 && topUp.AgentPrepayId != 0) {
		writeGMPayNotifyResult(c, false)
		return
	}
	if topUp.AgentPrepayId > 0 {
		if expectedAgentID != 0 {
			writeGMPayNotifyResult(c, false)
			return
		}
		handled, settleErr := model.TryCompleteAgentPrepay(orderID, model.PaymentProviderEpay, c.ClientIP())
		if settleErr != nil || !handled {
			if settleErr != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("GMPay 代理预充值结算失败 trade_no=%s error=%q", orderID, settleErr.Error()))
			}
			writeGMPayNotifyResult(c, false)
			return
		}
		writeGMPayNotifyResult(c, true)
		return
	}
	if topUp.GroupBuyId > 0 {
		if expectedAgentID != 0 {
			writeGMPayNotifyResult(c, false)
			return
		}
		handled, settleErr := model.TrySettleGroupBuyOrder(orderID, model.PaymentProviderEpay, c.ClientIP())
		if settleErr != nil || !handled {
			if settleErr != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("GMPay 拼团结算失败 trade_no=%s error=%q", orderID, settleErr.Error()))
			}
			writeGMPayNotifyResult(c, false)
			return
		}
		writeGMPayNotifyResult(c, true)
		return
	}
	// Dynamic/fallback quotes are bound to ordinary wallet orders.  The quoted
	// payment-method marker is durable, so a process restart (or an expired
	// in-memory registry entry) fails closed instead of silently settling a
	// quote as a zero-fee legacy order.  Historical non-marker orders remain
	// compatible; when a binding is present it is still validated.
	var feeQuote service.GMPayFeeQuote
	quoteBindingPresent := false
	quotedOrder := isGMPayQuotedPaymentMethod(topUp.PaymentMethod)
	if binding, ok := service.GetGMPayQuoteBinding(topUp.TradeNo); ok {
		token, network, parsed := parseGMPayPaymentMethod(topUp.PaymentMethod)
		if !parsed || !service.ValidateGMPayQuoteBinding(binding, topUp.PaymentMethod, token, network, decimal.NewFromFloat(topUp.Money)) {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("GMPay 充值报价绑定校验失败 trade_no=%s status=quote_binding_invalid", topUp.TradeNo))
			writeGMPayNotifyResult(c, false)
			return
		}
		feeQuote = binding.Quote
		quoteBindingPresent = true
	} else if quotedOrder {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("GMPay 充值报价绑定缺失 trade_no=%s status=quote_binding_missing", topUp.TradeNo))
		writeGMPayNotifyResult(c, false)
		return
	}
	if !quoteBindingPresent {
		feeQuote = service.GMPayFeeQuote{
			BaseAmount:  decimal.NewFromFloat(topUp.Money),
			TotalAmount: decimal.NewFromFloat(topUp.Money),
			Source:      service.GMPayFeeSourceGatewayIncluded,
		}
	}

	quotaToAdd, err := topupQuotaFromAmount(topUp.Amount)
	if err != nil || quotaToAdd <= 0 {
		logger.LogError(c.Request.Context(), fmt.Sprintf("GMPay 充值额度无效 trade_no=%s amount=%d", topUp.TradeNo, topUp.Amount))
		writeGMPayNotifyResult(c, false)
		return
	}
	credited, err := model.CompletePaidTopupByTradeNo(topUp.TradeNo, model.PaymentProviderEpay, "", quotaToAdd)
	if err != nil {
		if !errors.Is(err, model.ErrTopUpNotFound) && !errors.Is(err, model.ErrPaymentMethodMismatch) && !errors.Is(err, model.ErrTopUpStatusInvalid) {
			logger.LogError(c.Request.Context(), fmt.Sprintf("GMPay 充值结算失败 trade_no=%s error=%q", topUp.TradeNo, err.Error()))
		}
		writeGMPayNotifyResult(c, false)
		return
	}
	if quoteBindingPresent {
		service.DeleteGMPayQuoteBinding(topUp.TradeNo)
	}
	if credited {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("GMPay 充值回调结算 trade_no=%s user_id=%d status=settled %s", topUp.TradeNo, topUp.UserId, gmpayFeeAuditFields(feeQuote)))
		model.RecordTopupLog(topUp.UserId, gmpayTopupLogContent(quotaToAdd, topUp.Money, feeQuote), c.ClientIP(), topUp.PaymentMethod, "gmpay")
		model.CreateInviterRebate(topUp.UserId, topUp.Id, topUp.TradeNo, quotaToAdd)
		model.GrantTopupLotteryCards(topUp.UserId, quotaToAdd)
		if model.OnTopUpSuccess != nil {
			model.OnTopUpSuccess(topUp, quotaToAdd)
		}
	} else {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("GMPay 充值回调幂等确认 trade_no=%s user_id=%d status=idempotent %s", topUp.TradeNo, topUp.UserId, gmpayFeeAuditFields(feeQuote)))
	}
	writeGMPayNotifyResult(c, true)
}

// gmpayTopupLogContent keeps the historical top-up log text intact for
// gateway-included/legacy orders.  Quotes produced by the new wallet fee path
// append a human-readable provenance label plus the allowlisted source,
// amount, currency, and quote-window fields from gmpayFeeAuditFields.  The
// suffix intentionally contains no asset addresses, RPC URLs, calldata, or
// merchant credentials.
func gmpayTopupLogContent(quotaToAdd int, payMoney float64, quote service.GMPayFeeQuote) string {
	content := fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%f", logger.LogQuota(quotaToAdd), payMoney)
	return content + gmpayTopupLogQuoteSuffix(quote)
}

func gmpayTopupLogQuoteSuffix(quote service.GMPayFeeQuote) string {
	source, err := service.NormalizeGMPayFeeSource(quote.Source)
	if err != nil {
		return ""
	}
	var label string
	switch source {
	case service.GMPayFeeSourceChainNetworkEstimate:
		label = "动态网络费用估算"
	case service.GMPayFeeSourceAdminFallback:
		label = "人工兜底"
	default:
		// Preserve the historical log wording for gateway-included quotes and
		// any unknown source rather than presenting an unverifiable label.
		return ""
	}
	return fmt.Sprintf("，费用来源：%s（%s）", label, gmpayFeeAuditFields(quote))
}

func isDerivedSubscriptionTopUp(topUp *model.TopUp, order *model.SubscriptionOrder) bool {
	return topUp != nil && order != nil &&
		order.Status == common.TopUpStatusSuccess && topUp.Status == common.TopUpStatusSuccess &&
		topUp.PaymentProvider == "" && topUp.Amount == 0 && topUp.GroupBuyId == 0 && topUp.AgentPrepayId == 0 &&
		topUp.UserId == order.UserId && topUp.PaymentMethod == order.PaymentMethod &&
		epayCallbackAmountMatches(strconv.FormatFloat(topUp.Money, 'f', 6, 64), order.Money)
}

func gmpayCallbackSignatureParams(body []byte) (map[string]any, error) {
	var params map[string]any
	if err := common.Unmarshal(body, &params); err != nil || len(params) == 0 {
		return nil, errors.New("invalid gmpay callback")
	}
	allowed := map[string]struct{}{
		"pid":                  {},
		"trade_id":             {},
		"order_id":             {},
		"amount":               {},
		"actual_amount":        {},
		"receive_address":      {},
		"token":                {},
		"network":              {},
		"block_transaction_id": {},
		"signature":            {},
		"status":               {},
	}
	for key, value := range params {
		if _, ok := allowed[key]; !ok {
			return nil, errors.New("unsupported gmpay callback field")
		}
		if _, ok := service.GMPayCanonicalParameter(value); !ok {
			return nil, errors.New("invalid gmpay callback field")
		}
	}
	for _, key := range []string{"pid", "trade_id", "order_id", "receive_address", "token", "block_transaction_id", "signature"} {
		value, ok := params[key].(string)
		if !ok || strings.TrimSpace(value) == "" {
			return nil, errors.New("invalid gmpay callback identifier")
		}
	}
	for _, key := range []string{"amount", "actual_amount", "status"} {
		value, ok := service.GMPayCanonicalParameter(params[key])
		if !ok || strings.TrimSpace(value) == "" {
			return nil, errors.New("incomplete gmpay callback")
		}
	}
	amount, amountOK := service.GMPayCanonicalParameter(params["amount"])
	actualAmount, actualAmountOK := service.GMPayCanonicalParameter(params["actual_amount"])
	receiveAddress, receiveAddressOK := params["receive_address"].(string)
	token, tokenOK := params["token"].(string)
	networkValue, networkPresent := params["network"]
	network, networkOK := networkValue.(string)
	if !amountOK || !actualAmountOK || !receiveAddressOK || !tokenOK || !gmpayPositiveDecimal(amount) ||
		!gmpayPositiveActualDecimal(actualAmount) || strings.TrimSpace(token) == "" {
		return nil, errors.New("invalid gmpay callback audit data")
	}
	if networkPresent {
		if !networkOK || strings.TrimSpace(network) == "" || !service.IsGMPayAddress(network, receiveAddress) {
			return nil, errors.New("invalid gmpay callback asset")
		}
	} else if strings.TrimSpace(receiveAddress) == "" {
		return nil, errors.New("invalid gmpay callback receive address")
	}
	return params, nil
}

// gmpayCallbackMatchesOrderAsset binds the callback to the asset encoded in
// the existing payment_method column. EPUSDT versions that predate multi-chain
// callbacks omit network, so the order's canonical method supplies it.
func gmpayCallbackMatchesOrderAsset(params map[string]any, paymentMethod string) bool {
	expectedToken, expectedNetwork, ok := parseGMPayPaymentMethod(paymentMethod)
	if !ok {
		return false
	}
	token, tokenOK := params["token"].(string)
	address, addressOK := params["receive_address"].(string)
	if !tokenOK || !addressOK || strings.ToLower(strings.TrimSpace(token)) != expectedToken {
		return false
	}
	if networkValue, present := params["network"]; present {
		network, networkOK := networkValue.(string)
		if !networkOK || !gmpayNetworksMatch(network, expectedNetwork) {
			return false
		}
	}
	return service.IsGMPayAddress(expectedNetwork, address)
}

func gmpayNetworksMatch(actual, expected string) bool {
	actual = strings.TrimSpace(actual)
	expected = strings.TrimSpace(expected)
	if actual == "" || expected == "" {
		return false
	}
	actualCanonical, actualKnown := service.NormalizeGMPayNetwork(actual)
	expectedCanonical, expectedKnown := service.NormalizeGMPayNetwork(expected)
	if actualKnown && expectedKnown {
		return actualCanonical == expectedCanonical
	}
	return strings.EqualFold(actual, expected)
}

func gmpayPositiveDecimal(value string) bool {
	amount, err := service.ParseGMPayAmount(value, false)
	return err == nil && amount.GreaterThan(decimal.Zero)
}

func gmpayPositiveActualDecimal(value string) bool {
	amount, err := service.ParseGMPayActualAmount(value)
	return err == nil && amount.GreaterThan(decimal.Zero)
}

func writeGMPayNotifyResult(c *gin.Context, ok bool) {
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.Status(http.StatusOK)
	if ok {
		_, _ = c.Writer.WriteString("ok")
		return
	}
	_, _ = c.Writer.WriteString("fail")
}
