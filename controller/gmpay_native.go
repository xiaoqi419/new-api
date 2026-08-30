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
	if err != nil || !pidOK || !orderIDOK || !amountOK || !statusOK || !signatureOK ||
		strings.TrimSpace(pid) == "" || strings.TrimSpace(orderID) == "" || strings.TrimSpace(signature) == "" ||
		subtle.ConstantTimeCompare([]byte(pid), []byte(expectedPID)) != 1 ||
		!service.VerifyGMPaySignature(params, signature, secret) || status != "2" {
		writeGMPayNotifyResult(c, false)
		return
	}

	topUp := model.GetTopUpByTradeNo(orderID)
	if topUp == nil || topUp.PaymentProvider != model.PaymentProviderEpay || topUp.PaymentMethod != gmpayNativePaymentMethod ||
		topUp.GroupBuyId != 0 || topUp.AgentPrepayId != 0 || !epayCallbackAmountMatches(amount, topUp.Money) ||
		!verifyTopupAgentOwnership(c, topUp, expectedAgentID, "GMPay") {
		writeGMPayNotifyResult(c, false)
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
	if !amountOK || !actualAmountOK || !receiveAddressOK || !tokenOK || !gmpayPositiveDecimal(amount) ||
		!gmpayPositiveDecimal(actualAmount) || !service.IsGMPayTronAddress(receiveAddress) || token != "USDT" {
		return nil, errors.New("invalid gmpay callback audit data")
	}
	return params, nil
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
