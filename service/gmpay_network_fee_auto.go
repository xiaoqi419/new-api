package service

// Built-in chain network fee estimation.  This estimator intentionally owns a
// closed set of public endpoints and representative transfer contexts so an
// administrator does not have to provision RPC URLs, price feeds, calldata,
// or wallet addresses merely to enable dynamic GMPay pricing.

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
)

const builtinNetworkFeeEstimatorVersion = NetworkFeeEstimatorVersion + "+builtin"

// BuiltinNetworkFeeEstimator is a fail-closed estimator backed by fixed,
// public RPC and market-data endpoints.  The HTTP client and clock are
// injectable only for deterministic tests; production callers should use
// NewBuiltinNetworkFeeEstimator.
type BuiltinNetworkFeeEstimator struct {
	configured *ConfiguredNetworkFeeEstimator
	now        func() time.Time
}

func NewBuiltinNetworkFeeEstimator() (*BuiltinNetworkFeeEstimator, error) {
	return newBuiltinNetworkFeeEstimator(nil, nil)
}

func NewBuiltinNetworkFeeEstimatorWithHTTPClient(client *http.Client) (*BuiltinNetworkFeeEstimator, error) {
	return newBuiltinNetworkFeeEstimator(client, nil)
}

func NewBuiltinNetworkFeeEstimatorWithClock(client *http.Client, now func() time.Time) (*BuiltinNetworkFeeEstimator, error) {
	return newBuiltinNetworkFeeEstimator(client, now)
}

// NewAutomaticNetworkFeeEstimator is a concise integration seam for callers
// that want the no-configuration estimator without exposing implementation
// details.
func NewAutomaticNetworkFeeEstimator() (NetworkFeeEstimator, error) {
	return NewBuiltinNetworkFeeEstimator()
}

// NewAutomaticGMPayNetworkFeeEstimator is the GMPay-specific spelling kept
// for controller integrations and external callers.
func NewAutomaticGMPayNetworkFeeEstimator() (NetworkFeeEstimator, error) {
	return NewBuiltinNetworkFeeEstimator()
}

// BuiltinNetworkFeeSupported reports whether the closed preset has a
// representative transfer definition for the selected asset.
func BuiltinNetworkFeeSupported(network, token string) bool {
	_, ok := normalizeEstimatorNetwork(network)
	if !ok {
		return false
	}
	token = strings.ToUpper(strings.TrimSpace(token))
	return (token == "USDT" || token == "USDC")
}

// BuiltinNetworkFeeSupportedNetworks returns canonical network identifiers
// advertised by the preset.
func BuiltinNetworkFeeSupportedNetworks() []string {
	return []string{"tron", "ethereum", "binance", "solana"}
}

func newBuiltinNetworkFeeEstimator(client *http.Client, now func() time.Time) (*BuiltinNetworkFeeEstimator, error) {
	config := NetworkFeeEstimatorConfig{
		Version:                  NetworkFeeEstimatorConfigVersion,
		DynamicEnabled:           true,
		TimeoutMilliseconds:      int(defaultNetworkFeeTimeout / time.Millisecond),
		MaxResponseBytes:         defaultNetworkFeeResponseLimit,
		MaxRetries:               1,
		CacheTTLSeconds:          int(defaultNetworkFeeCacheTTL / time.Second),
		QuoteTTLSeconds:          int(defaultNetworkFeeQuoteTTL / time.Second),
		PriceMaxAgeSeconds:       int(defaultNetworkFeePriceMaxAge / time.Second),
		MaxPriceDeviationPercent: defaultNetworkFeeMaxPriceDeviation,
		MaxFee:                   maxNetworkFeeAbsolute,
		MaxTotal:                 maxNetworkFeeAbsolute,
		Chains: map[string]NetworkFeeChainConfig{
			"tron": {
				RPCURL:             "https://api.trongrid.io",
				PriceURL:           "https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd,cny&include_last_updated_at=true",
				NativeAsset:        "TRX",
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"api.trongrid.io"},
				PriceAllowedHosts:  []string{"api.coingecko.com"},
			},
			"ethereum": {
				RPCURL:             "https://cloudflare-eth.com",
				PriceURL:           "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,cny&include_last_updated_at=true",
				NativeAsset:        "ETH",
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"cloudflare-eth.com"},
				PriceAllowedHosts:  []string{"api.coingecko.com"},
			},
			"binance": {
				RPCURL:             "https://bsc-dataseed.binance.org",
				PriceURL:           "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd,cny&include_last_updated_at=true",
				NativeAsset:        "BNB",
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"bsc-dataseed.binance.org"},
				PriceAllowedHosts:  []string{"api.coingecko.com"},
			},
			// Solana uses a fixed canonical SPL transferChecked message with
			// synthetic accounts; getFeeForMessage prices the message without
			// requiring a live wallet or signing key.
			"solana": {
				RPCURL:             "https://api.mainnet-beta.solana.com",
				PriceURL:           "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd,cny&include_last_updated_at=true",
				NativeAsset:        "SOL",
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"api.mainnet-beta.solana.com"},
				PriceAllowedHosts:  []string{"api.coingecko.com"},
			},
		},
	}
	configured, err := newNetworkFeeEstimator(config, client, now)
	if err != nil {
		return nil, err
	}
	if now == nil {
		now = time.Now
	}
	return &BuiltinNetworkFeeEstimator{configured: configured, now: now}, nil
}

func (estimator *BuiltinNetworkFeeEstimator) Estimate(ctx context.Context, input NetworkFeeEstimateInput) (NetworkFeeQuote, error) {
	if estimator == nil || estimator.configured == nil || ctx == nil {
		return NetworkFeeQuote{}, fmt.Errorf("%w: estimator is unavailable", ErrNetworkFeeUnavailable)
	}
	network, ok := normalizeEstimatorNetwork(input.Network)
	if !ok {
		return NetworkFeeQuote{}, fmt.Errorf("%w: unsupported network", ErrNetworkFeeUnavailable)
	}
	chain, ok := estimator.configured.config.chains[network]
	if !ok {
		return NetworkFeeQuote{}, fmt.Errorf("%w: network is unavailable", ErrNetworkFeeUnavailable)
	}
	token := strings.ToUpper(strings.TrimSpace(input.Token))
	if token != "USDT" && token != "USDC" {
		return NetworkFeeQuote{}, fmt.Errorf("%w: token is unsupported", ErrNetworkFeeUnavailable)
	}
	currency := strings.ToUpper(strings.TrimSpace(input.SettlementCurrency))
	if currency == "" {
		currency = chain.settlementCurrency
	}
	if currency != "USD" && currency != "CNY" {
		return NetworkFeeQuote{}, fmt.Errorf("%w: settlement currency is unsupported", ErrNetworkFeeUnavailable)
	}
	if input.BaseAmount.LessThanOrEqual(decimal.Zero) || input.BaseAmount.GreaterThan(estimator.configured.config.maxTotal) {
		return NetworkFeeQuote{}, fmt.Errorf("%w: base amount is out of bounds", ErrNetworkFeeUnavailable)
	}
	if !isEmptyNetworkFeeTransaction(input.Transaction) {
		return NetworkFeeQuote{}, fmt.Errorf("%w: transaction context cannot override built-in context", ErrNetworkFeeUnavailable)
	}
	transaction, err := builtinTransferContext(network, token)
	if err != nil {
		return NetworkFeeQuote{}, fmt.Errorf("%w: %v", ErrNetworkFeeUnavailable, err)
	}
	now := estimator.now().UTC()
	if now.IsZero() {
		return NetworkFeeQuote{}, fmt.Errorf("%w: estimator clock is invalid", ErrNetworkFeeUnavailable)
	}
	key := networkFeeQuoteCacheKey(network, NetworkFeeEstimateInput{Token: token, Network: network, SettlementCurrency: currency, BaseAmount: input.BaseAmount}, transaction)
	if cached, found := estimator.configured.quoteCache.get(key, now); found && estimator.configured.cachedQuoteIsFresh(cached, now) {
		return cached, nil
	}
	ctx, cancel := context.WithTimeout(ctx, estimator.configured.config.timeout)
	defer cancel()
	var latestSlot uint64
	if network == "solana" {
		transaction, latestSlot, err = estimator.refreshBuiltinSolanaBlockhash(ctx, chain, transaction)
		if err != nil {
			return NetworkFeeQuote{}, fmt.Errorf("%w: %v", ErrNetworkFeeUnavailable, err)
		}
	}
	var raw chainRawNetworkEstimate
	switch network {
	case "tron":
		raw, err = estimator.estimateBuiltinTRON(ctx, chain, token, transaction)
	case "ethereum", "binance":
		raw, err = estimator.configured.estimateEVM(ctx, chain, token, transaction)
	case "solana":
		raw, err = estimator.configured.estimateSolana(ctx, chain, token, transaction)
	}
	if err != nil {
		return NetworkFeeQuote{}, fmt.Errorf("%w: %v", ErrNetworkFeeUnavailable, err)
	}
	price, timestamp, source, err := estimator.fetchBuiltinPrice(ctx, chain, network, currency, now)
	if err != nil {
		return NetworkFeeQuote{}, fmt.Errorf("%w: %v", ErrNetworkFeeUnavailable, err)
	}
	fee := raw.NativeAmount.Mul(price)
	if fee.IsNegative() || !decimalIsFinite(fee) || fee.GreaterThan(estimator.configured.config.maxFee) {
		return NetworkFeeQuote{}, fmt.Errorf("%w: fee exceeds configured bound", ErrNetworkFeeUnavailable)
	}
	total := input.BaseAmount.Add(fee)
	if !decimalIsFinite(total) || total.GreaterThan(estimator.configured.config.maxTotal) {
		return NetworkFeeQuote{}, fmt.Errorf("%w: total exceeds configured bound", ErrNetworkFeeUnavailable)
	}
	raw.Evidence.PriceSource = source
	raw.Evidence.PriceTimestamp = timestamp.Unix()
	if raw.Evidence.RPCSource == "" {
		raw.Evidence.RPCSource = endpointSource(chain.rpcURL)
	}
	if network == "solana" {
		raw.Evidence.RPCMethods = append([]string{"getLatestBlockhash"}, raw.Evidence.RPCMethods...)
		if latestSlot > 0 {
			raw.Evidence.Slot = latestSlot
		}
	}
	quote := NetworkFeeQuote{Token: token, Network: network, Source: ChainNetworkEstimateSource, EstimatorVersion: builtinNetworkFeeEstimatorVersion, NativeAsset: chain.nativeAsset, NativeAmount: raw.NativeAmount, FeeAmount: fee, BaseAmount: input.BaseAmount, TotalAmount: total, SettlementCurrency: currency, QuotedAt: now, ExpiresAt: now.Add(estimator.configured.config.quoteTTL), Confidence: raw.Confidence, Subsidized: raw.Subsidized, Evidence: raw.Evidence}
	estimator.configured.quoteCache.put(key, quote, now, estimator.configured.config.cacheTTL)
	return quote, nil
}

func (estimator *BuiltinNetworkFeeEstimator) refreshBuiltinSolanaBlockhash(ctx context.Context, chain parsedNetworkFeeChainConfig, transaction NetworkFeeTransactionContext) (NetworkFeeTransactionContext, uint64, error) {
	result, err := estimator.configured.callJSONRPC(ctx, chain.rpcURL, "getLatestBlockhash", []any{map[string]string{"commitment": "confirmed"}})
	if err != nil {
		return transaction, 0, err
	}
	fields, err := objectFields(result.Raw)
	if err != nil {
		return transaction, 0, errors.New("solana latest blockhash response is invalid")
	}
	valueRaw, ok := findJSONField(fields, "value")
	if !ok || common.GetJsonType(valueRaw) != "object" {
		return transaction, 0, errors.New("solana latest blockhash value is missing")
	}
	valueFields, err := objectFields(valueRaw)
	if err != nil {
		return transaction, 0, errors.New("solana latest blockhash value is invalid")
	}
	blockhashRaw, ok := findJSONField(valueFields, "blockhash")
	if !ok || common.GetJsonType(blockhashRaw) != "string" {
		return transaction, 0, errors.New("solana latest blockhash is missing")
	}
	blockhash := strings.TrimSpace(common.JsonRawMessageToString(blockhashRaw))
	if _, err := solanaAddressBytes(blockhash); err != nil {
		return transaction, 0, errors.New("solana latest blockhash is invalid")
	}
	transaction.RecentBlockhash = blockhash
	var slot uint64
	if contextRaw, ok := findJSONField(fields, "context"); ok && common.GetJsonType(contextRaw) == "object" {
		if contextFields, contextErr := objectFields(contextRaw); contextErr == nil {
			if slotRaw, slotOK := findJSONField(contextFields, "slot"); slotOK {
				slot, _ = parseUnsignedInteger(slotRaw)
			}
		}
	}
	return transaction, slot, nil
}

// estimateBuiltinTRON prices a canonical TRC-20 transfer using chain burn
// parameters and the node's energy simulation.  It deliberately does not ask
// for account resources: the synthetic representative sender is not a real
// wallet and therefore cannot have meaningful bandwidth/energy balances.  A
// zero-resource assumption is conservative for the network cost and remains
// fully dynamic because both fee rates and energy are read from the node.
func (estimator *BuiltinNetworkFeeEstimator) estimateBuiltinTRON(ctx context.Context, chain parsedNetworkFeeChainConfig, token string, transaction NetworkFeeTransactionContext) (chainRawNetworkEstimate, error) {
	from := strings.TrimSpace(transaction.From)
	recipient := strings.TrimSpace(firstNonEmpty(transaction.Recipient, transaction.To))
	contract := strings.TrimSpace(firstNonEmpty(transaction.TokenContract, transaction.Contract))
	if !IsGMPayAddress("tron", from) || !IsGMPayAddress("tron", recipient) || !IsGMPayAddress("tron", contract) {
		return chainRawNetworkEstimate{}, ErrNetworkFeeContextMissing
	}
	data := strings.TrimSpace(firstNonEmpty(transaction.Data, transaction.Calldata))
	selector, parameter, err := prepareTRONTRC20Call(contract, recipient, data, transaction.FunctionSelector)
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	chainParamsResult, err := estimator.configured.callTRON(ctx, chain.rpcURL, "/wallet/getchainparameters", map[string]any{})
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	energyFee, bandwidthFee, err := parseTRONChainFees(chainParamsResult.Raw)
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	payload := map[string]any{"owner_address": from, "contract_address": contract, "function_selector": selector, "parameter": parameter, "visible": true}
	energyResult, energyErr := estimator.configured.callTRON(ctx, chain.rpcURL, "/wallet/estimateenergy", payload)
	methods := []string{"wallet/getchainparameters"}
	var energy decimal.Decimal
	if energyErr == nil {
		energy, err = parseTRONEnergy(energyResult.Raw)
		methods = append(methods, "wallet/estimateenergy")
	} else {
		constantResult, constantErr := estimator.configured.callTRON(ctx, chain.rpcURL, "/wallet/triggerconstantcontract", payload)
		if constantErr != nil {
			return chainRawNetworkEstimate{}, energyErr
		}
		energy, err = parseTRONEnergy(constantResult.Raw)
		methods = append(methods, "wallet/triggerconstantcontract")
	}
	if err != nil || energy.IsNegative() {
		return chainRawNetworkEstimate{}, errors.New("tron energy estimate is invalid")
	}
	bandwidth := decimal.NewFromInt(345)
	sun := energy.Mul(energyFee).Add(bandwidth.Mul(bandwidthFee))
	if sun.IsNegative() || !decimalIsFinite(sun) {
		return chainRawNetworkEstimate{}, errors.New("tron resource cost is invalid")
	}
	return chainRawNetworkEstimate{NativeAmount: sun.Div(decimal.RequireFromString(tronSunPerTRX)), Confidence: "medium", Subsidized: sun.IsZero(), Evidence: NetworkFeeEvidence{RPCMethod: methods[0], RPCMethods: methods, Energy: energy.String(), Bandwidth: bandwidth.String()}}, nil
}

func builtinTransferContext(network, token string) (NetworkFeeTransactionContext, error) {
	const syntheticEVMAddress = "0x0000000000000000000000000000000000000001"
	const syntheticTRONAddress = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
	const syntheticSolanaPayer = "11111111111111111111111111111111"
	const syntheticSolanaSource = "So11111111111111111111111111111111111111112"
	const syntheticSolanaDestination = "Vote111111111111111111111111111111111111111"
	const syntheticSolanaBlockhash = "11111111111111111111111111111111"
	switch network {
	case "ethereum", "binance":
		contracts := map[string]map[string]string{
			"ethereum": {"USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7", "USDC": "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"},
			"binance":  {"USDT": "0x55d398326f99059ff775485246999027b3197955", "USDC": "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"},
		}
		contract := contracts[network][token]
		if contract == "" {
			return NetworkFeeTransactionContext{}, errors.New("token contract is unavailable")
		}
		return NetworkFeeTransactionContext{From: syntheticEVMAddress, Recipient: syntheticEVMAddress, TokenContract: contract, Calldata: builtinERC20Calldata(syntheticEVMAddress)}, nil
	case "tron":
		contract := map[string]string{"USDT": "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj", "USDC": "TEkxiTehnzSmSe2XqrBjgG9wRkX4z6a6Q"}[token]
		if contract == "" {
			return NetworkFeeTransactionContext{}, errors.New("token contract is unavailable")
		}
		decoded, ok := decodeGMPayBase58(syntheticTRONAddress)
		if !ok || len(decoded) < 21 {
			return NetworkFeeTransactionContext{}, errors.New("synthetic TRON address is invalid")
		}
		data := "a9059cbb" + strings.Repeat("0", 24) + hex.EncodeToString(decoded[1:21]) + strings.Repeat("0", 63) + "1"
		return NetworkFeeTransactionContext{From: syntheticTRONAddress, Recipient: syntheticTRONAddress, TokenContract: contract, Data: data, FunctionSelector: tronTRC20TransferSignature, BandwidthBytes: 345}, nil
	case "solana":
		mint := map[string]string{
			"USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
			"USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
		}[token]
		if mint == "" {
			return NetworkFeeTransactionContext{}, errors.New("token mint is unavailable")
		}
		return NetworkFeeTransactionContext{
			Payer: syntheticSolanaPayer, From: syntheticSolanaPayer,
			SourceTokenAccount: syntheticSolanaSource, RecipientTokenAccount: syntheticSolanaDestination,
			TokenMint: mint, TransferInstruction: "transferChecked", TransferAmountBaseUnits: "1",
			TokenDecimals: 6, RecentBlockhash: syntheticSolanaBlockhash, TokenProgramID: solanaTokenProgramID,
		}, nil
	default:
		return NetworkFeeTransactionContext{}, errors.New("network is unsupported")
	}
}

func builtinERC20Calldata(recipient string) string {
	return "0x" + evmERC20TransferSelector + strings.Repeat("0", 24) + strings.TrimPrefix(strings.ToLower(recipient), "0x") + strings.Repeat("0", 63) + "1"
}

func (estimator *BuiltinNetworkFeeEstimator) fetchBuiltinPrice(ctx context.Context, chain parsedNetworkFeeChainConfig, network, currency string, now time.Time) (decimal.Decimal, time.Time, string, error) {
	if chain.priceURL == nil {
		return decimal.Zero, time.Time{}, "", errors.New("price source is unavailable")
	}
	var body []byte
	for attempt := 0; attempt <= estimator.configured.config.maxRetries; attempt++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, chain.priceURL.String(), nil)
		if err != nil {
			return decimal.Zero, time.Time{}, "", err
		}
		request.Header.Set("Accept", "application/json")
		response, err := estimator.configured.httpClient.Do(request)
		if err != nil {
			if attempt < estimator.configured.config.maxRetries {
				continue
			}
			return decimal.Zero, time.Time{}, "", err
		}
		if response == nil || response.Body == nil {
			return decimal.Zero, time.Time{}, "", errors.New("price source response is invalid")
		}
		if responseErr := validateNetworkFeeResponse(response, chain.priceURL); responseErr != nil {
			response.Body.Close()
			return decimal.Zero, time.Time{}, "", responseErr
		}
		body, err = io.ReadAll(io.LimitReader(response.Body, estimator.configured.config.responseLimit+1))
		status := response.StatusCode
		response.Body.Close()
		if err != nil || int64(len(body)) > estimator.configured.config.responseLimit {
			return decimal.Zero, time.Time{}, "", errors.New("price source response exceeds size limit")
		}
		if status >= 500 && attempt < estimator.configured.config.maxRetries {
			continue
		}
		if status < 200 || status >= 300 {
			return decimal.Zero, time.Time{}, "", fmt.Errorf("price source returned http status %d", status)
		}
		break
	}
	var fields map[string]map[string]json.RawMessage
	if err := common.Unmarshal(body, &fields); err != nil {
		return decimal.Zero, time.Time{}, "", errors.New("price source response is invalid")
	}
	id := map[string]string{"tron": "tron", "ethereum": "ethereum", "binance": "binancecoin", "solana": "solana"}[network]
	nested, ok := fields[id]
	if !ok {
		return decimal.Zero, time.Time{}, "", errors.New("price source asset is missing")
	}
	priceRaw, ok := nested[strings.ToLower(currency)]
	if !ok {
		return decimal.Zero, time.Time{}, "", errors.New("price source currency is missing")
	}
	price, err := parseNetworkFeeDecimal(common.JsonRawMessageToString(priceRaw), false)
	if err != nil || price.GreaterThan(decimal.RequireFromString(maxNetworkFeePrice)) {
		return decimal.Zero, time.Time{}, "", errors.New("price source price is invalid")
	}
	timestampRaw, ok := nested["last_updated_at"]
	if !ok {
		return decimal.Zero, time.Time{}, "", errors.New("price source timestamp is missing")
	}
	timestamp, err := parseNetworkFeeTimestamp(timestampRaw)
	if err != nil || timestamp.After(now.Add(5*time.Minute)) || now.Sub(timestamp) > estimator.configured.config.priceMaxAge {
		return decimal.Zero, time.Time{}, "", errors.New("price source timestamp is stale")
	}
	return price, timestamp, endpointSource(chain.priceURL), nil
}

var _ NetworkFeeEstimator = (*BuiltinNetworkFeeEstimator)(nil)
