package controller

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

func subscriptionEpayPaymentMethodAllowed(paymentMethod string) bool {
	if paymentMethod == model.PaymentMethodAlipay || paymentMethod == model.PaymentMethodWechatPay ||
		!operation_setting.ContainsPayMethod(paymentMethod) {
		return false
	}
	if operation_setting.IsGMPayNativePaymentGatewayMode() {
		return paymentMethod == gmpayNativePaymentMethod
	}
	return true
}

func subscriptionOrderMatchesEffectiveGatewayMode(order *model.SubscriptionOrder) bool {
	if order == nil {
		return false
	}
	if operation_setting.IsGMPayNativePaymentGatewayMode() {
		return order.PaymentMethod == gmpayNativePaymentMethod
	}
	return order.PaymentMethod != gmpayNativePaymentMethod
}

func subscriptionRequestGMPay(c *gin.Context, req SubscriptionEpayPayRequest, plan *model.SubscriptionPlan, userID int) {
	epayCfg := epayConfigForAgent(0)
	if !epayCfg.Enabled || epayCfg.Client == nil {
		common.ApiErrorMsg(c, "当前管理员未配置支付信息")
		return
	}

	callbackAddress := strings.TrimRight(service.GetCallbackAddress(), "/")
	notifyURL, err := url.Parse(callbackAddress + "/api/user/gmpay/notify")
	if err != nil {
		common.ApiErrorMsg(c, "回调地址配置错误")
		return
	}
	returnURL, err := url.Parse(callbackAddress + "/wallet")
	if err != nil {
		common.ApiErrorMsg(c, "回调地址配置错误")
		return
	}

	tradeNo := fmt.Sprintf("SUB%s%d", common.GetRandomString(10), time.Now().Unix())
	order := &model.SubscriptionOrder{
		UserId:          userID,
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

	data, err := createGMPayNativeCheckout(
		c.Request.Context(),
		epayCfg,
		req.PaymentMethod,
		tradeNo,
		fmt.Sprintf("SUB:%s", plan.Title),
		plan.PriceAmount,
		notifyURL,
		returnURL,
	)
	if err == nil {
		c.JSON(http.StatusOK, gin.H{"message": "success", "data": data})
		return
	}
	_ = model.FailPendingSubscriptionOrder(tradeNo, model.PaymentProviderEpay)
	common.ApiErrorMsg(c, "拉起支付失败")
}

// TryCompleteGMPaySubscriptionOrder settles a platform-owned subscription
// when orderID identifies one. The caller must validate the GMPay callback's
// PID, signature, success status, and audit fields before calling it.
//
// handled is false only when no subscription order exists. Once an order is
// recognized, any ownership, protocol, or amount mismatch is terminal and the
// caller must not fall through to another product settlement path.
func TryCompleteGMPaySubscriptionOrder(orderID string, signedAmount string, providerPayload string, expectedAgentID int) (handled bool, err error) {
	order := model.GetSubscriptionOrderByTradeNo(orderID)
	if order == nil {
		return false, nil
	}
	if expectedAgentID != 0 {
		return true, errors.New("subscription orders are platform-owned")
	}
	owner, ownerErr := model.GetUserById(order.UserId, false)
	if ownerErr != nil || owner == nil || owner.AgentId != 0 {
		return true, errors.New("gmpay subscription owner is not a platform user")
	}
	if order.PaymentProvider != model.PaymentProviderEpay || order.PaymentMethod != gmpayNativePaymentMethod {
		return true, model.ErrPaymentMethodMismatch
	}
	if !epayCallbackAmountMatches(signedAmount, order.Money) {
		return true, errors.New("gmpay subscription amount mismatch")
	}
	return true, model.CompleteSubscriptionOrder(orderID, providerPayload, model.PaymentProviderEpay, gmpayNativePaymentMethod)
}
