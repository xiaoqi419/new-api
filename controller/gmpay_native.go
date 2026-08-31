package controller

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

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
	if credited {
		model.RecordTopupLog(topUp.UserId, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%f", logger.LogQuota(quotaToAdd), topUp.Money), c.ClientIP(), topUp.PaymentMethod, "gmpay")
		model.CreateInviterRebate(topUp.UserId, topUp.Id, topUp.TradeNo, quotaToAdd)
		model.GrantTopupLotteryCards(topUp.UserId, quotaToAdd)
		if model.OnTopUpSuccess != nil {
			model.OnTopUpSuccess(topUp, quotaToAdd)
		}
	}
	writeGMPayNotifyResult(c, true)
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
		!gmpayPositiveDecimal(actualAmount) || strings.TrimSpace(token) == "" {
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
	amount, err := decimal.NewFromString(value)
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
