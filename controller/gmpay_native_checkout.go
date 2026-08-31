package controller

import (
	"context"
	"errors"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

func resolveGMPayAsset(ctx context.Context, epayCfg tenantEpayConfig, paymentMethod, token, network string) (string, string, error) {
	if !shouldUseGMPayNative(paymentMethod) || !operation_setting.ContainsPayMethod(paymentMethod) {
		return "", "", errors.New("gmpay native payment method is unavailable")
	}
	token = strings.TrimSpace(token)
	network = strings.TrimSpace(network)
	if (token == "") != (network == "") {
		return "", "", errors.New("gmpay payment asset must include token and network")
	}
	// Preserve the historic API contract for clients that predate the asset
	// selector. The wallet UI now always sends an explicit pair after reading
	// supported_assets; this fallback is only for legacy non-wallet callers
	// (subscriptions, group buys, and existing integrations).
	if token == "" && network == "" {
		return "usdt", "tron", nil
	}
	if !epayCfg.Enabled || epayCfg.Client == nil || epayCfg.Client.Config == nil || epayCfg.Client.BaseUrl == nil {
		return "", "", errors.New("gmpay merchant client is not configured")
	}
	client, err := newGMPayNativeClient(epayCfg.Client.BaseUrl.String(), epayCfg.Client.Config.PartnerID, epayCfg.Client.Config.Key)
	if err != nil {
		return "", "", err
	}
	assets, err := client.SupportedAssetsAllFresh(ctx)
	if err != nil {
		return "", "", err
	}
	token = strings.ToLower(token)
	network = strings.ToLower(network)
	if !validGMPayAssetPart(token) || !validGMPayAssetPart(network) {
		return "", "", errors.New("gmpay payment asset is invalid")
	}
	if normalizedNetwork, ok := service.NormalizeGMPayNetwork(network); ok {
		network = normalizedNetwork
	}
	for _, asset := range assets {
		if asset.Network != network {
			continue
		}
		for _, supportedToken := range asset.Tokens {
			if strings.EqualFold(supportedToken, token) {
				return token, network, nil
			}
		}
	}
	return "", "", errors.New("gmpay payment asset is unavailable")
}

func resolveGMPayWalletAsset(ctx context.Context, epayCfg tenantEpayConfig, paymentMethod, token, network string) (string, string, error) {
	if !shouldUseGMPayNative(paymentMethod) || !operation_setting.ContainsPayMethod(paymentMethod) {
		return "", "", errors.New("gmpay native payment method is unavailable")
	}
	token = strings.ToLower(strings.TrimSpace(token))
	network = strings.ToLower(strings.TrimSpace(network))
	if token == "" || network == "" {
		return "", "", errors.New("gmpay wallet payment asset must be explicit")
	}
	if !validGMPayAssetPart(token) || !validGMPayAssetPart(network) {
		return "", "", errors.New("gmpay payment asset is invalid")
	}
	if token != "usdt" {
		return "", "", errors.New("gmpay wallet only accepts USDT")
	}
	var networkKnown bool
	network, networkKnown = service.NormalizeGMPayNetwork(network)
	if !networkKnown {
		return "", "", errors.New("gmpay payment network is unavailable")
	}
	if !epayCfg.Enabled || epayCfg.Client == nil || epayCfg.Client.Config == nil || epayCfg.Client.BaseUrl == nil {
		return "", "", errors.New("gmpay merchant client is not configured")
	}
	client, err := newGMPayNativeClient(epayCfg.Client.BaseUrl.String(), epayCfg.Client.Config.PartnerID, epayCfg.Client.Config.Key)
	if err != nil {
		return "", "", err
	}
	assets, err := client.SupportedAssetsFresh(ctx)
	if err != nil {
		return "", "", err
	}
	for _, asset := range assets {
		if asset.Network != network {
			continue
		}
		for _, supportedToken := range asset.Tokens {
			if strings.EqualFold(supportedToken, "USDT") {
				return "usdt", network, nil
			}
		}
	}
	return "", "", errors.New("gmpay wallet payment asset is unavailable")
}

// bindGMPayNativeOrderAsset persists the selected network/token using the
// existing payment_method column. This gives callbacks an order-level asset
// binding without adding schema or migration work.
func bindGMPayNativeOrderAsset(tradeNo, paymentMethod string) error {
	if strings.TrimSpace(tradeNo) == "" || len(paymentMethod) > 50 || !isGMPayNativeOrderPaymentMethod(paymentMethod) {
		return errors.New("gmpay order asset binding is invalid")
	}
	if model.DB == nil {
		// Provider checkout unit tests may exercise this helper without opening
		// a database; production request paths always initialize model.DB.
		return nil
	}
	bound := false
	if topUp := model.GetTopUpByTradeNo(tradeNo); topUp != nil {
		if topUp.PaymentProvider != model.PaymentProviderEpay || topUp.Status != common.TopUpStatusPending {
			return errors.New("gmpay top-up order is not pending")
		}
		if isGMPayNativeOrderPaymentMethod(topUp.PaymentMethod) && topUp.PaymentMethod != gmpayNativePaymentMethod && topUp.PaymentMethod != paymentMethod {
			return errors.New("gmpay top-up asset is already bound")
		}
		topUp.PaymentMethod = paymentMethod
		if err := topUp.Update(); err != nil {
			return err
		}
		bound = true
	}
	if order := model.GetSubscriptionOrderByTradeNo(tradeNo); order != nil {
		if order.PaymentProvider != model.PaymentProviderEpay || order.Status != common.TopUpStatusPending {
			return errors.New("gmpay subscription order is not pending")
		}
		if isGMPayNativeOrderPaymentMethod(order.PaymentMethod) && order.PaymentMethod != gmpayNativePaymentMethod && order.PaymentMethod != paymentMethod {
			return errors.New("gmpay subscription asset is already bound")
		}
		order.PaymentMethod = paymentMethod
		if err := order.Update(); err != nil {
			return err
		}
		bound = true
	}
	if !bound {
		// Shared checkout helpers are also exercised by provider-level tests
		// before a local order is inserted. The real wallet, subscription,
		// group-buy and agent flows all persist their order before calling this
		// helper; an unknown trade number cannot later settle a callback.
		return nil
	}
	return nil
}

// gmpayPaymentMethodForAsset stores the selected asset in the existing
// payment_method column, avoiding a schema change while giving callbacks a
// durable order-level binding. The legacy TRON spelling remains unchanged.
func gmpayPaymentMethodForAsset(token, network string) string {
	token = strings.ToLower(strings.TrimSpace(token))
	if normalizedNetwork, ok := service.NormalizeGMPayNetwork(network); ok {
		network = normalizedNetwork
	} else {
		network = strings.ToLower(strings.TrimSpace(network))
	}
	if token == "usdt" && network == "tron" {
		return gmpayNativePaymentMethod
	}
	return "usdt." + network + "." + token
}

func parseGMPayPaymentMethod(paymentMethod string) (token, network string, ok bool) {
	parts := strings.Split(strings.ToLower(strings.TrimSpace(paymentMethod)), ".")
	if len(parts) == 2 && parts[0] == "usdt" && parts[1] == "tron" {
		return "usdt", "tron", true
	}
	if len(parts) != 3 || parts[0] != "usdt" || parts[1] == "" || parts[2] == "" {
		return "", "", false
	}
	if !validGMPayAssetPart(parts[1]) || !validGMPayAssetPart(parts[2]) {
		return "", "", false
	}
	return parts[2], parts[1], true
}

func validGMPayAssetPart(value string) bool {
	if len(value) == 0 || len(value) > 32 {
		return false
	}
	for i := 0; i < len(value); i++ {
		char := value[i]
		if (char < 'a' || char > 'z') && (char < '0' || char > '9') && char != '_' && char != '-' {
			return false
		}
	}
	return true
}

func isGMPayNativeOrderPaymentMethod(paymentMethod string) bool {
	_, _, ok := parseGMPayPaymentMethod(paymentMethod)
	return ok
}

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
	asset ...string,
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
	var token, network string
	if len(asset) > 0 {
		token = asset[0]
	}
	if len(asset) > 1 {
		network = asset[1]
	}
	token, network, err = resolveGMPayAsset(ctx, epayCfg, paymentMethod, token, network)
	if err != nil {
		return nil, err
	}
	assetPaymentMethod := gmpayPaymentMethodForAsset(token, network)
	if err := bindGMPayNativeOrderAsset(tradeNo, assetPaymentMethod); err != nil {
		return nil, err
	}
	checkout, err := client.CreateOrder(ctx, service.GMPayCreateOrderRequest{
		OrderID:     tradeNo,
		Amount:      strconv.FormatFloat(payMoney, 'f', 2, 64),
		NotifyURL:   notifyURL,
		RedirectURL: returnURL,
		Name:        name,
		Token:       token,
		Network:     network,
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
	data["asset_payment_method"] = assetPaymentMethod
	return data, nil
}
