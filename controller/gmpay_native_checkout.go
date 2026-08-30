package controller

import (
	"context"
	"errors"
	"net/url"
	"strconv"

	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

func shouldUseGMPayNative(paymentMethod string) bool {
	return operation_setting.IsGMPayNativePaymentGatewayMode() && paymentMethod == gmpayNativePaymentMethod
}

// createGMPayNativeCheckout is the shared server-side Native checkout path for
// wallets, subscriptions, group buys, and agent prepayment. It never exposes
// the hosted cashier URL or merchant credentials.
func createGMPayNativeCheckout(
	ctx context.Context,
	epayCfg tenantEpayConfig,
	paymentMethod string,
	tradeNo string,
	name string,
	payMoney float64,
	notifyURL *url.URL,
	returnURL *url.URL,
) (gin.H, error) {
	if !shouldUseGMPayNative(paymentMethod) || !operation_setting.ContainsPayMethod(paymentMethod) {
		return nil, errors.New("gmpay native payment method is unavailable")
	}
	if !epayCfg.Enabled || epayCfg.Client == nil || epayCfg.Client.Config == nil || epayCfg.Client.BaseUrl == nil {
		return nil, errors.New("gmpay merchant client is not configured")
	}
	client, err := newGMPayNativeClient(
		epayCfg.Client.BaseUrl.String(),
		epayCfg.Client.Config.PartnerID,
		epayCfg.Client.Config.Key,
	)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, errors.New("gmpay client is not configured")
	}
	checkout, err := client.CreateOrder(ctx, service.GMPayCreateOrderRequest{
		OrderID:     tradeNo,
		Amount:      strconv.FormatFloat(payMoney, 'f', 2, 64),
		NotifyURL:   notifyURL,
		RedirectURL: returnURL,
		Name:        name,
	})
	if err != nil {
		return nil, err
	}
	data := gin.H{
		"trade_no":         tradeNo,
		"gateway_trade_no": checkout.GatewayTradeNo,
		"checkout_type":    "crypto",
		"payment_method":   paymentMethod,
		"money":            strconv.FormatFloat(payMoney, 'f', 2, 64),
		"actual_amount":    checkout.ActualAmount,
		"receive_address":  checkout.ReceiveAddress,
		"token":            checkout.Token,
		"network":          checkout.Network,
		"expiration_time":  checkout.ExpirationTime,
	}
	if checkout.ServerTime > 0 {
		data["server_time"] = checkout.ServerTime
	}
	return data, nil
}
