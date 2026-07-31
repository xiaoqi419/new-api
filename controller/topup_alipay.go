package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/smartwalle/alipay/v3"
)

var (
	alipayMu          sync.Mutex
	alipayFingerprint string
	alipayClient      *alipay.Client
)

func alipayConfigFingerprint() string {
	prod := "0"
	if setting.AlipayProduction {
		prod = "1"
	}
	return fmt.Sprintf("%s|%s|%s", setting.AlipayAppId, prod,
		common.Sha1([]byte(setting.AlipayPrivateKey+"|"+setting.AlipayPublicKey)))
}

// ensureAlipay 构建并缓存支付宝客户端，配置变更时自动重建。
func ensureAlipay() (*alipay.Client, error) {
	if !isAlipayConfigured() {
		return nil, errors.New("支付宝未配置")
	}
	fp := alipayConfigFingerprint()

	alipayMu.Lock()
	defer alipayMu.Unlock()
	if alipayClient != nil && alipayFingerprint == fp {
		return alipayClient, nil
	}

	client, err := alipay.New(setting.AlipayAppId, setting.AlipayPrivateKey, setting.AlipayProduction)
	if err != nil {
		return nil, fmt.Errorf("初始化支付宝客户端失败: %w", err)
	}
	if err := client.LoadAliPayPublicKey(setting.AlipayPublicKey); err != nil {
		return nil, fmt.Errorf("加载支付宝公钥失败: %w", err)
	}

	alipayClient = client
	alipayFingerprint = fp
	return client, nil
}

// RequestAlipay 创建支付宝电脑网站支付订单，返回跳转 URL。
func RequestAlipay(c *gin.Context) {
	var req EpayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	if !isAlipayTopUpEnabled() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "管理员未开启支付宝"})
		return
	}
	if req.Amount < getMinTopup(0) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getMinTopup(0))})
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

	client, err := ensureAlipay()
	if err != nil {
		logger.LogError(c.Request.Context(), "支付宝 初始化失败 error="+err.Error())
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付宝暂不可用"})
		return
	}

	tradeNo := fmt.Sprintf("USR%dNO%s%d", id, common.GetRandomString(4), time.Now().Unix())
	var p = alipay.TradePagePay{}
	p.NotifyURL = service.GetCallbackAddress() + "/api/user/alipay/notify"
	p.ReturnURL = paymentReturnPath("/console/log?show_history=true")
	p.Subject = fmt.Sprintf("TUC%d", req.Amount)
	p.OutTradeNo = tradeNo
	p.TotalAmount = strconv.FormatFloat(payMoney, 'f', 2, 64)
	p.ProductCode = "FAST_INSTANT_TRADE_PAY"

	payURL, err := client.TradePagePay(p)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("支付宝 下单失败 user_id=%d trade_no=%s error=%q", id, tradeNo, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		amount = decimal.NewFromInt(amount).Div(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart()
	}
	topUp := &model.TopUp{
		UserId:          id,
		Amount:          amount,
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodAlipay,
		PaymentProvider: model.PaymentProviderAlipay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("支付宝 创建订单失败 user_id=%d trade_no=%s error=%q", id, tradeNo, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("支付宝 订单创建成功 user_id=%d trade_no=%s amount=%d money=%.2f", id, tradeNo, req.Amount, payMoney))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"pay_url":  payURL.String(),
			"trade_no": tradeNo,
		},
	})
}

// AlipayNotify 处理支付宝异步回调。
func AlipayNotify(c *gin.Context) {
	ctx := c.Request.Context()
	if !isAlipayTopUpEnabled() {
		logger.LogWarn(ctx, "支付宝 回调被拒绝 reason=disabled")
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	client, err := ensureAlipay()
	if err != nil {
		logger.LogError(ctx, "支付宝 回调初始化失败 error="+err.Error())
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	noti, err := client.GetTradeNotification(c.Request)
	if err != nil || noti == nil {
		logger.LogWarn(ctx, fmt.Sprintf("支付宝 回调验签失败 error=%v", err))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	tradeNo := noti.OutTradeNo
	logger.LogInfo(ctx, fmt.Sprintf("支付宝 回调收到 trade_no=%s trade_status=%s", tradeNo, noti.TradeStatus))

	if noti.TradeStatus != alipay.TradeStatusSuccess && noti.TradeStatus != alipay.TradeStatusFinished {
		logger.LogInfo(ctx, fmt.Sprintf("支付宝 回调忽略非成功状态 trade_no=%s status=%s", tradeNo, noti.TradeStatus))
		alipay.ACKNotification(c.Writer)
		return
	}

	LockOrder(tradeNo)
	defer UnlockOrder(tradeNo)
	if err := model.RechargeOfficialOrder(tradeNo, model.PaymentProviderAlipay, "支付宝", c.ClientIP()); err != nil {
		logger.LogError(ctx, fmt.Sprintf("支付宝 入账失败 trade_no=%s error=%q", tradeNo, err.Error()))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	logger.LogInfo(ctx, "支付宝 入账成功 trade_no="+tradeNo)
	alipay.ACKNotification(c.Writer)
}

// isAlipayConfigured 仅判断凭据是否齐全（不含合规与开关）。
func isAlipayConfigured() bool {
	return setting.AlipayAppId != "" && setting.AlipayPrivateKey != "" && setting.AlipayPublicKey != ""
}
