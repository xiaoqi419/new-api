package controller

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

type SubscriptionEpayPayRequest struct {
	PlanId        int    `json:"plan_id"`
	PaymentMethod string `json:"payment_method"`
}

func SubscriptionRequestEpay(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	var req SubscriptionEpayPayRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if !requirePlatformNativePaymentUser(c) {
		return
	}

	plan, err := model.GetSubscriptionPlanById(req.PlanId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !plan.Enabled {
		common.ApiErrorMsg(c, "套餐未启用")
		return
	}
	if plan.PriceAmount < 0.01 || (operation_setting.IsGMPayNativePaymentGatewayMode() && plan.PriceAmount <= 0.01) {
		common.ApiErrorMsg(c, "套餐金额过低")
		return
	}
	if !subscriptionEpayPaymentMethodAllowed(req.PaymentMethod) {
		common.ApiErrorMsg(c, "支付方式不存在")
		return
	}

	userId := c.GetInt("id")
	if plan.MaxPurchasePerUser > 0 {
		count, err := model.CountUserSubscriptionsByPlan(userId, plan.Id)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if count >= int64(plan.MaxPurchasePerUser) {
			common.ApiErrorMsg(c, "已达到该套餐购买上限")
			return
		}
	}
	if operation_setting.IsGMPayNativePaymentGatewayMode() {
		subscriptionRequestGMPay(c, req, plan, userId)
		return
	}

	callBackAddress := service.GetCallbackAddress()
	returnUrl, err := url.Parse(callBackAddress + "/api/subscription/epay/return")
	if err != nil {
		common.ApiErrorMsg(c, "回调地址配置错误")
		return
	}
	notifyUrl, err := url.Parse(callBackAddress + "/api/subscription/epay/notify")
	if err != nil {
		common.ApiErrorMsg(c, "回调地址配置错误")
		return
	}

	tradeNo := fmt.Sprintf("%s%d", common.GetRandomString(6), time.Now().Unix())
	tradeNo = fmt.Sprintf("SUBUSR%dNO%s", userId, tradeNo)

	client := GetEpayClient()
	if client == nil {
		common.ApiErrorMsg(c, "当前管理员未配置支付信息")
		return
	}

	order := &model.SubscriptionOrder{
		UserId:          userId,
		PlanId:          plan.Id,
		Money:           plan.PriceAmount,
		TradeNo:         tradeNo,
		PaymentMethod:   req.PaymentMethod,
		PaymentProvider: model.PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := order.Insert(); err != nil {
		common.ApiErrorMsg(c, "创建订单失败")
		return
	}
	money := strconv.FormatFloat(plan.PriceAmount, 'f', 2, 64)
	mapiClient, err := service.NewEpayMAPIClient(client, nil)
	if err == nil {
		checkout, checkoutErr := mapiClient.CreateCheckout(c.Request.Context(), service.EpayMAPIRequest{
			PaymentMethod: req.PaymentMethod,
			TradeNo:       tradeNo,
			Name:          fmt.Sprintf("SUB:%s", plan.Title),
			Money:         money,
			ClientIP:      c.ClientIP(),
			Device:        epay.PC,
			NotifyURL:     notifyUrl,
			ReturnURL:     returnUrl,
		})
		if checkoutErr == nil {
			c.JSON(http.StatusOK, gin.H{"message": "success", "data": gin.H{
				"trade_no":         tradeNo,
				"gateway_trade_no": checkout.GatewayTradeNo,
				"checkout_type":    checkout.CheckoutType,
				"checkout_value":   checkout.CheckoutValue,
				"payment_method":   req.PaymentMethod,
				"money":            money,
			}})
			return
		}
		err = checkoutErr
	}
	if err != nil {
		_ = model.FailPendingSubscriptionOrder(tradeNo, model.PaymentProviderEpay)
		common.ApiErrorMsg(c, "拉起支付失败")
		return
	}
}

// GetSubscriptionEpayStatus returns an Epay subscription order status for its owner only.
func GetSubscriptionEpayStatus(c *gin.Context) {
	tradeNo := c.Query("trade_no")
	if tradeNo == "" {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	order := model.GetSubscriptionOrderByTradeNoAndUserId(tradeNo, c.GetInt("id"))
	if order == nil || order.PaymentProvider != model.PaymentProviderEpay || !subscriptionOrderMatchesEffectiveGatewayMode(order) {
		common.ApiErrorMsg(c, "订单不存在")
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": gin.H{"status": order.Status}})
}

func SubscriptionEpayNotify(c *gin.Context) {
	if !operation_setting.IsLegacyEpayPaymentGatewayMode() {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	var params map[string]string

	if c.Request.Method == "POST" {
		// POST 请求：从 POST body 解析参数
		if err := c.Request.ParseForm(); err != nil {
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

	if len(params) == 0 {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	client := GetEpayClient()
	if client == nil {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	verifyInfo, err := client.Verify(params)
	if err != nil || !verifyInfo.VerifyStatus {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	if verifyInfo.TradeStatus != epay.StatusTradeSuccess {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	// Validate the signed amount before taking the process lock or completing
	// the subscription, so a valid callback cannot settle a different order
	// amount.
	order := model.GetSubscriptionOrderByTradeNo(verifyInfo.ServiceTradeNo)
	if order == nil || !epayCallbackAmountMatches(verifyInfo.Money, order.Money) {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	LockOrder(verifyInfo.ServiceTradeNo)
	defer UnlockOrder(verifyInfo.ServiceTradeNo)

	if err := model.CompleteSubscriptionOrder(verifyInfo.ServiceTradeNo, common.GetJsonString(verifyInfo), model.PaymentProviderEpay, verifyInfo.Type); err != nil {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	_, _ = c.Writer.Write([]byte("success"))
}

// SubscriptionEpayReturn preserves the browser return route without settling payment.
// Subscription Epay payments are settled exclusively by SubscriptionEpayNotify.
func SubscriptionEpayReturn(c *gin.Context) {
	c.Redirect(http.StatusFound, paymentReturnPath("/wallet?pay=pending"))
}
