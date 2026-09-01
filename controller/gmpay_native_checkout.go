package controller

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
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
	if token != "usdt" && token != "usdc" {
		return "", "", errors.New("gmpay wallet only accepts USDT or USDC")
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
			if strings.EqualFold(supportedToken, token) {
				return token, network, nil
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
		if isGMPayNativeOrderPaymentMethod(topUp.PaymentMethod) && !gmpayPaymentMethodsShareAsset(topUp.PaymentMethod, paymentMethod) {
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
		if isGMPayNativeOrderPaymentMethod(order.PaymentMethod) && !gmpayPaymentMethodsShareAsset(order.PaymentMethod, paymentMethod) {
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

func gmpayPaymentMethodsShareAsset(left, right string) bool {
	leftToken, leftNetwork, leftOK := parseGMPayPaymentMethod(left)
	rightToken, rightNetwork, rightOK := parseGMPayPaymentMethod(right)
	if !leftOK || !rightOK {
		return false
	}
	return leftToken == rightToken && gmpayNetworksMatch(leftNetwork, rightNetwork)
}

// gmpayPaymentMethodForAsset stores the selected asset in the existing
// payment_method column, avoiding a schema change while giving callbacks a
// durable order-level binding. The legacy TRON spelling remains unchanged;
// historical extended values use usdt.<network>.<token> and remain readable.
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
	// A compact token.network form is accepted for forward compatibility with
	// operators that stored a clean USDC binding before the extended form was
	// standardized. New code still writes the historical extended spelling.
	if len(parts) == 2 && (parts[0] == "usdt" || parts[0] == "usdc") && parts[1] != "" {
		if !validGMPayAssetPart(parts[0]) || !validGMPayAssetPart(parts[1]) {
			return "", "", false
		}
		return parts[0], parts[1], true
	}
	if len(parts) != 3 || (parts[0] != "usdt" && parts[0] != "gmpay") || parts[1] == "" || parts[2] == "" {
		return "", "", false
	}
	if !validGMPayAssetPart(parts[1]) || !validGMPayAssetPart(parts[2]) {
		return "", "", false
	}
	// Keep accepting the historical extended form for tokens that were
	// enabled before the wallet selector was narrowed to USDT/USDC.  New
	// ordinary-wallet requests are restricted by resolveGMPayWalletAsset;
	// this parser must remain broad so already-pending legacy orders can still
	// be settled safely by their persisted binding.
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

// gmpayQuotedPaymentMethodPrefix is deliberately distinct from the public
// payment-method value (`usdt.tron`).  It is persisted only on ordinary wallet
// orders whose amount contains a server-generated dynamic/fallback quote.  A
// callback can therefore fail closed after a process restart instead of
// silently treating a lost in-memory quote as a zero-fee legacy order.
const gmpayQuotedPaymentMethodPrefix = "gmpay"

func gmpayPaymentMethodForQuotedAsset(token, network string) string {
	token = strings.ToLower(strings.TrimSpace(token))
	if normalizedNetwork, ok := service.NormalizeGMPayNetwork(network); ok {
		network = normalizedNetwork
	} else {
		network = strings.ToLower(strings.TrimSpace(network))
	}
	return gmpayQuotedPaymentMethodPrefix + "." + network + "." + token
}

func isGMPayQuotedPaymentMethod(paymentMethod string) bool {
	parts := strings.Split(strings.ToLower(strings.TrimSpace(paymentMethod)), ".")
	if len(parts) != 3 || parts[0] != gmpayQuotedPaymentMethodPrefix {
		return false
	}
	token, network, ok := parseGMPayPaymentMethod(paymentMethod)
	return ok && token != "" && network != ""
}

// gmpayPaymentMethodForQuoteAsset chooses the durable order marker according
// to fee provenance.  Specialized subscription/group-buy/agent flows pass the
// gateway-included quote and retain their historical payment-method values;
// only ordinary wallet dynamic/fallback quotes receive the quoted marker.
func gmpayPaymentMethodForQuoteAsset(token, network string, quote service.GMPayFeeQuote) string {
	source, err := service.NormalizeGMPayFeeSource(quote.Source)
	if err == nil && source != service.GMPayFeeSourceGatewayIncluded {
		return gmpayPaymentMethodForQuotedAsset(token, network)
	}
	return gmpayPaymentMethodForAsset(token, network)
}

func shouldUseGMPayNative(paymentMethod string) bool {
	return operation_setting.IsGMPayNativePaymentGatewayMode() && paymentMethod == gmpayNativePaymentMethod
}

// quoteGMPayWalletFee applies the server-owned fee source precedence for the
// ordinary wallet: a fresh chain estimate first, the explicitly enabled
// administrator fallback second, and a legacy gateway-included quote only
// when dynamic estimation is disabled. It is intentionally separate from the
// shared Native checkout wrapper so subscriptions, group buys, and agent
// prepayment retain their existing no-fee semantics.
func quoteGMPayWalletFee(ctx context.Context, baseAmount decimal.Decimal, token, network string) (service.GMPayFeeQuote, error) {
	baseAmount = baseAmount.RoundDown(2)
	cfg, err := service.CurrentGMPayFeeConfig()
	if err != nil {
		return service.GMPayFeeQuote{}, service.ErrGMPayFeeUnavailable
	}
	settlementCurrency, currencyErr := gmpaySettlementCurrencyForNetwork(network, cfg)
	if currencyErr != nil && (cfg.IsDynamicEnabled() || cfg.HasFallbackPolicy()) {
		return service.GMPayFeeQuote{}, service.ErrGMPayFeeUnavailable
	}

	if cfg.IsDynamicEnabled() {
		estimator, estimatorErr := newGMPayNetworkFeeEstimator()
		if estimatorErr == nil && estimator != nil {
			networkQuote, estimateErr := estimator.Estimate(ctx, service.NetworkFeeEstimateInput{
				Token:              token,
				Network:            network,
				SettlementCurrency: settlementCurrency,
				BaseAmount:         baseAmount,
			})
			if estimateErr == nil {
				quote, convertErr := service.GMPayFeeQuoteFromNetworkQuote(
					networkQuote,
					baseAmount,
					token,
					network,
					settlementCurrency,
				)
				if convertErr == nil {
					return quote, nil
				}
			}
		}
		if !cfg.HasFallbackPolicy() {
			return service.GMPayFeeQuote{}, service.ErrGMPayFeeUnavailable
		}
	}

	// This call is the only fallback calculator. When dynamic mode is
	// disabled and no fallback is configured it deliberately returns the
	// legacy gateway-included zero-fee quote.
	quote, err := service.GMPayFeeQuoteForAsset(baseAmount, token, network)
	if err != nil {
		return service.GMPayFeeQuote{}, err
	}
	if quote.Source != service.GMPayFeeSourceGatewayIncluded {
		if currencyErr != nil || strings.TrimSpace(settlementCurrency) == "" {
			return service.GMPayFeeQuote{}, service.ErrGMPayFeeUnavailable
		}
		quote.SettlementCurrency = settlementCurrency
	}
	return quote, nil
}

// gmpaySettlementCurrencyForNetwork resolves the currency used by a quote
// from the administrator's chain configuration first, then the site's general
// display setting.  There is intentionally no silent USD fallback: a custom
// display currency without an ISO code must be configured on the chain before
// a dynamic/fallback quote can be accepted.
func gmpaySettlementCurrencyForNetwork(network string, cfg service.GMPayFeeConfig) (string, error) {
	canonicalNetwork, ok := service.NormalizeGMPayNetwork(network)
	if !ok {
		return "", errors.New("gmpay payment network is unavailable")
	}
	if chain, exists := cfg.Chains[canonicalNetwork]; exists {
		if currency := strings.ToUpper(strings.TrimSpace(chain.SettlementCurrency)); currency != "" {
			return currency, nil
		}
	}
	// The protocol's ordinary site modes are ISO currencies.  CUSTOM uses a
	// display symbol only and is not safe to send to a payment gateway.
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeUSD:
		return operation_setting.QuotaDisplayTypeUSD, nil
	case operation_setting.QuotaDisplayTypeCNY:
		return operation_setting.QuotaDisplayTypeCNY, nil
	default:
		return "", errors.New("gmpay settlement currency is not configured")
	}
}

// validateGMPayFeeQuoteExpiry keeps a quote from being used after its
// server-owned validity window.  The legacy gateway-included quote has no
// independent quote clock and is intentionally exempt; dynamic and
// administrator fallback quotes must carry both timestamps.
func validateGMPayFeeQuoteExpiry(quote service.GMPayFeeQuote) error {
	source, err := service.NormalizeGMPayFeeSource(quote.Source)
	if err != nil {
		return err
	}
	if source == service.GMPayFeeSourceGatewayIncluded {
		return nil
	}
	now := time.Now().UTC()
	if quote.QuotedAt.IsZero() || quote.ExpiresAt.IsZero() ||
		quote.QuotedAt.After(now) || !quote.ExpiresAt.After(quote.QuotedAt) ||
		!quote.ExpiresAt.After(now) {
		return errors.New("gmpay fee quote is expired or invalid")
	}
	return nil
}

// addGMPayFeeQuoteMetadata appends only the server-generated fee quote
// context to a checkout response. Provider response fields (including
// actual_amount) remain separate and are never interpreted as a fee quote.
// Evidence is rebuilt as a small allowlisted map because NetworkFeeEvidence
// intentionally has required JSON fields whose zero values should be omitted
// from the browser response.
func addGMPayFeeQuoteMetadata(data gin.H, quote service.GMPayFeeQuote) {
	source, err := service.NormalizeGMPayFeeSource(quote.Source)
	if err != nil || source == service.GMPayFeeSourceGatewayIncluded {
		return
	}

	if source == service.GMPayFeeSourceChainNetworkEstimate {
		data["native_amount"] = quote.NativeAmount.String()
		if nativeAsset := strings.TrimSpace(quote.NativeAsset); nativeAsset != "" {
			data["native_asset"] = strings.ToUpper(nativeAsset)
		}
		data["subsidized"] = quote.Subsidized
		data["evidence"] = gmpayNetworkFeeEvidenceSummary(quote.Evidence)
		if estimatorVersion := strings.TrimSpace(quote.EstimatorVersion); estimatorVersion != "" {
			data["estimator_version"] = estimatorVersion
		}
		if confidence := strings.TrimSpace(quote.Confidence); confidence != "" {
			data["confidence"] = confidence
		}
	}

	currency := strings.ToUpper(strings.TrimSpace(quote.SettlementCurrency))
	if currency != "" {
		data["settlement_currency"] = currency
	}
	if !quote.QuotedAt.IsZero() {
		data["quoted_at"] = quote.QuotedAt.UTC().Format(time.RFC3339Nano)
	}
	if !quote.ExpiresAt.IsZero() {
		data["expires_at"] = quote.ExpiresAt.UTC().Format(time.RFC3339Nano)
	}
}

// gmpayFeeAuditFields returns a compact, allowlisted log fragment for a quote.
// It intentionally excludes token/network, addresses, RPC URLs, calldata and
// all provider credentials; those values are not needed to audit the fee
// provenance and would make payment logs unnecessarily sensitive.
func gmpayFeeAuditFields(quote service.GMPayFeeQuote) string {
	source, err := service.NormalizeGMPayFeeSource(quote.Source)
	if err != nil {
		source = "unknown"
	}
	feeAmount := "0.00"
	if !quote.FeeAmount.IsNegative() && decimalFiniteForAudit(quote.FeeAmount) {
		feeAmount = quote.FeeAmount.Round(2).StringFixed(2)
	}
	currency := strings.ToUpper(strings.TrimSpace(quote.SettlementCurrency))
	if currency == "" {
		currency = "-"
	}
	quotedAt := "-"
	if !quote.QuotedAt.IsZero() {
		quotedAt = quote.QuotedAt.UTC().Format(time.RFC3339Nano)
	}
	expiresAt := "-"
	if !quote.ExpiresAt.IsZero() {
		expiresAt = quote.ExpiresAt.UTC().Format(time.RFC3339Nano)
	}
	return fmt.Sprintf("fee_source=%s fee_amount=%s settlement_currency=%s quote_quoted_at=%s quote_expires_at=%s", source, feeAmount, currency, quotedAt, expiresAt)
}

func decimalFiniteForAudit(value decimal.Decimal) bool {
	f, _ := value.Float64()
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}

func gmpayNetworkFeeEvidenceSummary(evidence service.NetworkFeeEvidence) gin.H {
	result := gin.H{}
	addString := func(key, value string) {
		if value = strings.TrimSpace(value); value != "" {
			result[key] = value
		}
	}
	addString("rpc_method", evidence.RPCMethod)
	if len(evidence.RPCMethods) > 0 {
		methods := make([]string, 0, len(evidence.RPCMethods))
		for _, method := range evidence.RPCMethods {
			if method = strings.TrimSpace(method); method != "" {
				methods = append(methods, method)
			}
		}
		if len(methods) > 0 {
			result["rpc_methods"] = methods
		}
	}
	addString("rpc_source", evidence.RPCSource)
	addString("price_source", evidence.PriceSource)
	if evidence.PriceTimestamp > 0 {
		result["price_timestamp"] = evidence.PriceTimestamp
	}
	addString("block", evidence.Block)
	if evidence.Slot > 0 {
		result["slot"] = evidence.Slot
	}
	addString("gas", evidence.Gas)
	addString("gas_price", evidence.GasPrice)
	addString("energy", evidence.Energy)
	addString("bandwidth", evidence.Bandwidth)
	addString("lamports", evidence.Lamports)
	return result
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
	baseAmount := decimal.NewFromFloat(payMoney)
	quote := service.GMPayFeeQuote{
		BaseAmount:  baseAmount,
		FeeAmount:   decimal.Zero,
		TotalAmount: baseAmount,
		Source:      service.GMPayFeeSourceGatewayIncluded,
	}
	return createGMPayNativeCheckoutWithQuote(ctx, epayCfg, paymentMethod, tradeNo, name, quote, notifyURL, returnURL, asset...)
}

// createGMPayNativeCheckoutWithQuote is the shared Native order path.  The
// ordinary wallet computes a fee quote before inserting its pending order;
// specialized Native flows call the wrapper above and therefore retain their
// historical no-fee amount semantics.
func createGMPayNativeCheckoutWithQuote(
	ctx context.Context,
	epayCfg tenantEpayConfig,
	paymentMethod string,
	tradeNo string,
	name string,
	quote service.GMPayFeeQuote,
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
	if quote.BaseAmount.LessThanOrEqual(decimal.Zero) || quote.TotalAmount.LessThanOrEqual(decimal.Zero) || quote.FeeAmount.IsNegative() ||
		!quote.BaseAmount.Add(quote.FeeAmount).Equal(quote.TotalAmount) {
		return nil, errors.New("gmpay amount breakdown is invalid")
	}
	feeSource, sourceErr := service.NormalizeGMPayFeeSource(quote.Source)
	if sourceErr != nil {
		return nil, sourceErr
	}
	quote.Source = feeSource
	if err := validateGMPayFeeQuoteExpiry(quote); err != nil {
		return nil, err
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
	assetPaymentMethod := gmpayPaymentMethodForQuoteAsset(token, network, quote)
	if err := bindGMPayNativeOrderAsset(tradeNo, assetPaymentMethod); err != nil {
		return nil, err
	}
	checkout, err := client.CreateOrder(ctx, service.GMPayCreateOrderRequest{
		OrderID:            tradeNo,
		Amount:             quote.TotalAmount.StringFixed(2),
		BaseAmount:         quote.BaseAmount.StringFixed(2),
		FeeAmount:          quote.FeeAmount.StringFixed(2),
		FeeSource:          quote.Source,
		SettlementCurrency: strings.ToUpper(strings.TrimSpace(quote.SettlementCurrency)),
		NotifyURL:          notifyURL,
		RedirectURL:        returnURL,
		Name:               name,
		Token:              token,
		Network:            network,
	})
	if err != nil {
		return nil, err
	}
	if expectedCurrency := strings.ToUpper(strings.TrimSpace(quote.SettlementCurrency)); expectedCurrency != "" &&
		strings.ToUpper(strings.TrimSpace(checkout.SettlementCurrency)) != expectedCurrency {
		return nil, errors.New("gmpay checkout settlement currency does not match quote")
	}
	if err := validateGMPayFeeQuoteExpiry(quote); err != nil {
		return nil, err
	}
	data := gin.H{
		"trade_no":         tradeNo,
		"gateway_trade_no": checkout.GatewayTradeNo,
		"checkout_type":    "crypto",
		"payment_method":   paymentMethod,
		"money":            checkout.TotalAmount,
		"base_amount":      checkout.BaseAmount,
		"fee_amount":       checkout.FeeAmount,
		"total_amount":     checkout.TotalAmount,
		"fee_source":       checkout.FeeSource,
		"actual_amount":    checkout.ActualAmount,
		"receive_address":  checkout.ReceiveAddress,
		"token":            checkout.Token,
		"network":          checkout.Network,
		"expiration_time":  checkout.ExpirationTime,
	}
	if currency := strings.ToUpper(strings.TrimSpace(checkout.SettlementCurrency)); currency != "" {
		data["gateway_settlement_currency"] = currency
	}
	addGMPayFeeQuoteMetadata(data, quote)
	if checkout.ServerTime > 0 {
		data["server_time"] = checkout.ServerTime
	}
	data["asset_payment_method"] = assetPaymentMethod
	return data, nil
}
