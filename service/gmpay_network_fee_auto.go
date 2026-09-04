package service

// Built-in chain network fee estimation.  This estimator intentionally owns a
// closed set of public endpoints and representative transfer contexts so an
// administrator does not have to provision RPC URLs, price feeds, calldata,
// or wallet addresses merely to enable dynamic GMPay pricing.

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"golang.org/x/sync/singleflight"
)

const (
	builtinNetworkFeeEstimatorVersion = NetworkFeeEstimatorVersion + "+builtin"
	builtinEVMTransferGasUnits        = "65000"
	builtinTRONUSDTTransferEnergy     = "64285"
	builtinTRONEmpiricalEnergyMethod  = "empirical_trc20_energy"
	builtinEVMEmpiricalGasMethod      = "empirical_erc20_gas"
	builtinSolanaTransferLamports     = "5000"
	builtinSolanaEmpiricalFeeMethod   = "empirical_spl_fee"
)

// BuiltinNetworkFeeEstimator is a fail-closed estimator backed by fixed,
// public RPC and market-data endpoints.  The HTTP client and clock are
// injectable only for deterministic tests; production callers should use
// NewBuiltinNetworkFeeEstimator.
type BuiltinNetworkFeeEstimator struct {
	configured  *ConfiguredNetworkFeeEstimator
	now         func() time.Time
	tronRPCURLs []*url.URL
	quoteMode   string
	priceMu     sync.Mutex
	priceCache  map[string]builtinPriceCacheEntry
	priceGroup  singleflight.Group
}

// builtinPriceCacheEntry stores only validated, fresh observations. The key
// space is the fixed set of built-in networks/currencies, so this cache cannot
// be expanded by request input.
type builtinPriceCacheEntry struct {
	price     decimal.Decimal
	timestamp time.Time
	source    string
	expiresAt time.Time
}

type builtinPriceResult struct {
	price     decimal.Decimal
	timestamp time.Time
	source    string
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
	builtinTRONRPCValues := []string{
		"https://api.tronstack.io",
		"https://tron-rpc.publicnode.com",
		"https://api.trongrid.io",
	}
	builtinTRONRPCAllowedHosts := []string{
		"api.tronstack.io",
		"tron-rpc.publicnode.com",
		"api.trongrid.io",
	}
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
				RPCURL:             builtinTRONRPCValues[0],
				PriceURL:           "https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd,cny&include_last_updated_at=true",
				NativeAsset:        "TRX",
				SettlementCurrency: "USD",
				RPCAllowedHosts:    builtinTRONRPCAllowedHosts,
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
	tronRPCURLs := make([]*url.URL, 0, len(builtinTRONRPCValues))
	for _, value := range builtinTRONRPCValues {
		endpoint, endpointErr := validateNetworkFeeEndpoint(value, builtinTRONRPCAllowedHosts)
		if endpointErr != nil {
			return nil, fmt.Errorf("builtin TRON RPC endpoint is invalid: %w", endpointErr)
		}
		tronRPCURLs = append(tronRPCURLs, endpoint)
	}
	if now == nil {
		now = time.Now
	}
	return &BuiltinNetworkFeeEstimator{
		configured:  configured,
		now:         now,
		tronRPCURLs: tronRPCURLs,
		priceCache:  make(map[string]builtinPriceCacheEntry),
	}, nil
}

func (estimator *BuiltinNetworkFeeEstimator) Estimate(ctx context.Context, input NetworkFeeEstimateInput) (NetworkFeeQuote, error) {
	if estimator == nil || estimator.configured == nil || ctx == nil {
		return NetworkFeeQuote{}, fmt.Errorf("%w: estimator is unavailable", ErrNetworkFeeUnavailable)
	}
	if err := ctx.Err(); err != nil {
		return NetworkFeeQuote{}, fmt.Errorf("%w: estimation context is canceled", ErrNetworkFeeUnavailable)
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
	// Solana quotes are deliberately never served from the generic cache. The
	// message fee is tied to a recent blockhash, so every quote must first fetch
	// a fresh blockhash and then query getFeeForMessage. EVM/TRON quotes retain
	// the short cache because their resource observations are not blockhash
	// bound.
	key := ""
	if network != "solana" {
		key = networkFeeQuoteCacheKey(network, NetworkFeeEstimateInput{Token: token, Network: network, SettlementCurrency: currency, BaseAmount: input.BaseAmount}, transaction)
		if cached, found := estimator.configured.quoteCache.get(key, now); found && estimator.configured.cachedQuoteIsFresh(cached, now) {
			return cached, nil
		}
	}
	requestCtx, cancel := context.WithTimeout(ctx, estimator.configured.config.timeout)
	defer cancel()
	var latestSlot uint64
	mode := estimator.resolvedQuoteMode()
	if network == "solana" && mode != GMPayQuoteModeEmpirical {
		transaction, latestSlot, err = estimator.refreshBuiltinSolanaBlockhash(requestCtx, chain, transaction)
		if err != nil {
			return NetworkFeeQuote{}, fmt.Errorf("%w: %v", ErrNetworkFeeUnavailable, err)
		}
	}
	var raw chainRawNetworkEstimate
	switch network {
	case "tron":
		raw, err = estimator.estimateBuiltinTRON(requestCtx, chain, token, transaction)
	case "ethereum", "binance":
		raw, err = estimator.estimateBuiltinEVM(requestCtx, chain, token, transaction)
	case "solana":
		raw, err = estimator.estimateBuiltinSolana(requestCtx, chain, token, transaction)
	}
	if err != nil {
		return NetworkFeeQuote{}, fmt.Errorf("%w: %v", ErrNetworkFeeUnavailable, err)
	}
	price, timestamp, source, err := estimator.fetchBuiltinPrice(requestCtx, chain, network, currency, now)
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
	if network == "solana" && mode != GMPayQuoteModeEmpirical {
		raw.Evidence.RPCMethods = append([]string{"getLatestBlockhash"}, raw.Evidence.RPCMethods...)
		if latestSlot > 0 {
			raw.Evidence.Slot = latestSlot
		}
	}
	quote := NetworkFeeQuote{Token: token, Network: network, Source: ChainNetworkEstimateSource, EstimatorVersion: builtinNetworkFeeEstimatorVersion, NativeAsset: chain.nativeAsset, NativeAmount: raw.NativeAmount, FeeAmount: fee, BaseAmount: input.BaseAmount, TotalAmount: total, SettlementCurrency: currency, QuotedAt: now, ExpiresAt: now.Add(estimator.configured.config.quoteTTL), Confidence: raw.Confidence, Subsidized: raw.Subsidized, Evidence: raw.Evidence}
	if network != "solana" {
		estimator.configured.quoteCache.put(key, quote, now, estimator.configured.config.cacheTTL)
	}
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
	decoded, err := solanaAddressBytes(blockhash)
	if err != nil || bytes.Equal(decoded, make([]byte, 32)) {
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
// zero-resource assumption is conservative for the network cost. Burn prices
// stay dynamic; when simulation reverts or is unavailable, energy falls back
// to the representative existing-holder constant rather than a reverted
// energy_used value.
//
// The built-in preset owns a small, exact allowlist of public TRON nodes. A
// single anonymous TronGrid endpoint is routinely rate-limited, so a transient
// 429/5xx/network failure must move the complete estimate to the next node.
// Keeping the chain-parameter and simulation calls on one node avoids mixing
// observations from different endpoints in one quote.
type tronSimulationUnavailableError struct {
	energyFee    decimal.Decimal
	bandwidthFee decimal.Decimal
	methods      []string
	err          error
}

func (err *tronSimulationUnavailableError) Error() string {
	if err == nil || err.err == nil {
		return "tron energy simulation is unavailable"
	}
	return err.err.Error()
}

func (err *tronSimulationUnavailableError) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.err
}

func (estimator *BuiltinNetworkFeeEstimator) resolvedQuoteMode() string {
	if estimator != nil {
		switch strings.ToLower(strings.TrimSpace(estimator.quoteMode)) {
		case GMPayQuoteModeSimulate, GMPayQuoteModeEmpirical, GMPayQuoteModeSimulateThenEmpirical:
			return strings.ToLower(strings.TrimSpace(estimator.quoteMode))
		}
	}
	cfg, err := CurrentGMPayFeeConfig()
	if err != nil {
		return GMPayQuoteModeSimulateThenEmpirical
	}
	return cfg.ResolvedQuoteMode()
}

func (estimator *BuiltinNetworkFeeEstimator) estimateBuiltinTRON(ctx context.Context, chain parsedNetworkFeeChainConfig, token string, transaction NetworkFeeTransactionContext) (chainRawNetworkEstimate, error) {
	rpcURLs := estimator.tronRPCURLs
	if len(rpcURLs) == 0 && chain.rpcURL != nil {
		rpcURLs = []*url.URL{chain.rpcURL}
	}
	var lastErr error
	var lastSimulation *tronSimulationUnavailableError
	var lastSimulationRPC *url.URL
	for _, rpcURL := range rpcURLs {
		raw, err := estimator.estimateBuiltinTRONAtRPC(ctx, rpcURL, token, transaction)
		if err == nil {
			raw.Evidence.RPCSource = endpointSource(rpcURL)
			return raw, nil
		}
		lastErr = err
		var simulationErr *tronSimulationUnavailableError
		if errors.As(err, &simulationErr) {
			lastSimulation = simulationErr
			lastSimulationRPC = rpcURL
		}
		if ctx.Err() != nil {
			return chainRawNetworkEstimate{}, ctx.Err()
		}
	}
	if lastSimulation != nil && estimator.resolvedQuoteMode() != GMPayQuoteModeSimulate {
		raw, err := empiricalTRONNetworkEstimate(lastSimulation.energyFee, lastSimulation.bandwidthFee, lastSimulation.methods)
		if err == nil {
			raw.Evidence.RPCSource = endpointSource(lastSimulationRPC)
			return raw, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		return chainRawNetworkEstimate{}, errors.New("tron RPC endpoints are unavailable")
	}
	return chainRawNetworkEstimate{}, fmt.Errorf("tron RPC endpoints are unavailable: %w", lastErr)
}

func (estimator *BuiltinNetworkFeeEstimator) estimateBuiltinTRONAtRPC(ctx context.Context, rpcURL *url.URL, token string, transaction NetworkFeeTransactionContext) (chainRawNetworkEstimate, error) {
	if rpcURL == nil {
		return chainRawNetworkEstimate{}, errors.New("tron RPC endpoint is unavailable")
	}
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
	chainParamsResult, err := estimator.configured.callTRON(ctx, rpcURL, "/wallet/getchainparameters", map[string]any{})
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	energyFee, bandwidthFee, err := parseTRONChainFees(chainParamsResult.Raw)
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	if estimator.resolvedQuoteMode() == GMPayQuoteModeEmpirical {
		return empiricalTRONNetworkEstimate(energyFee, bandwidthFee, []string{"wallet/getchainparameters"})
	}
	payload := map[string]any{"owner_address": from, "contract_address": contract, "function_selector": selector, "parameter": parameter, "visible": true}
	energyResult, energyErr := estimator.configured.callTRON(ctx, rpcURL, "/wallet/estimateenergy", payload)
	methods := []string{"wallet/getchainparameters"}
	var energy decimal.Decimal
	simulationErr := energyErr
	if energyErr == nil {
		energy, simulationErr = parseTRONEnergy(energyResult.Raw)
		if simulationErr == nil && energy.GreaterThan(decimal.Zero) {
			methods = append(methods, "wallet/estimateenergy")
		} else if simulationErr == nil {
			simulationErr = errors.New("tron wallet/estimateenergy returned non-positive energy")
		}
	}
	if simulationErr != nil {
		constantResult, constantErr := estimator.configured.callTRON(ctx, rpcURL, "/wallet/triggerconstantcontract", payload)
		if constantErr == nil {
			energy, err = parseTRONEnergy(constantResult.Raw)
			if err == nil && energy.GreaterThan(decimal.Zero) {
				methods = append(methods, "wallet/triggerconstantcontract")
				simulationErr = nil
			} else if err == nil {
				simulationErr = errors.New("tron wallet/triggerconstantcontract returned non-positive energy")
			} else {
				simulationErr = err
			}
		} else {
			simulationErr = fmt.Errorf("tron energy simulation failed: %w", constantErr)
		}
	}
	if simulationErr != nil || energy.LessThanOrEqual(decimal.Zero) {
		if simulationErr == nil {
			simulationErr = errors.New("tron energy simulation returned non-positive energy")
		}
		return chainRawNetworkEstimate{}, &tronSimulationUnavailableError{
			energyFee:    energyFee,
			bandwidthFee: bandwidthFee,
			methods:      methods,
			err:          simulationErr,
		}
	}
	return tronNetworkEstimateFromEnergy(energy, energyFee, bandwidthFee, methods)
}

func empiricalTRONNetworkEstimate(energyFee, bandwidthFee decimal.Decimal, methods []string) (chainRawNetworkEstimate, error) {
	copied := append([]string{}, methods...)
	copied = append(copied, builtinTRONEmpiricalEnergyMethod)
	return tronNetworkEstimateFromEnergy(decimal.RequireFromString(builtinTRONUSDTTransferEnergy), energyFee, bandwidthFee, copied)
}

func tronNetworkEstimateFromEnergy(energy, energyFee, bandwidthFee decimal.Decimal, methods []string) (chainRawNetworkEstimate, error) {
	if len(methods) == 0 {
		methods = []string{"wallet/getchainparameters"}
	}
	bandwidth := decimal.NewFromInt(345)
	sun := energy.Mul(energyFee).Add(bandwidth.Mul(bandwidthFee))
	if sun.IsNegative() || !decimalIsFinite(sun) {
		return chainRawNetworkEstimate{}, errors.New("tron resource cost is invalid")
	}
	return chainRawNetworkEstimate{NativeAmount: sun.Div(decimal.RequireFromString(tronSunPerTRX)), Confidence: "medium", Subsidized: sun.IsZero(), Evidence: NetworkFeeEvidence{RPCMethod: methods[0], RPCMethods: methods, Energy: energy.String(), Bandwidth: bandwidth.String()}}, nil
}

// estimateBuiltinEVM first attempts an exact eth_estimateGas call. Public RPC
// nodes commonly reject a representative ERC-20 transfer from a synthetic
// sender because that address intentionally has no token balance. In that
// case, use a bounded representative transfer quantity and combine it with
// current gas-price observations. The estimate remains dynamic with chain
// conditions while its confidence is lowered to reflect the preset quantity.
func (estimator *BuiltinNetworkFeeEstimator) estimateBuiltinEVM(ctx context.Context, chain parsedNetworkFeeChainConfig, token string, transaction NetworkFeeTransactionContext) (chainRawNetworkEstimate, error) {
	from := strings.TrimSpace(transaction.From)
	contract := strings.TrimSpace(firstNonEmpty(transaction.TokenContract, transaction.Contract))
	recipient := strings.TrimSpace(firstNonEmpty(transaction.Recipient, transaction.To))
	data := strings.TrimSpace(firstNonEmpty(transaction.Calldata, transaction.Data))
	if !evMAddressPattern.MatchString(from) || !evMAddressPattern.MatchString(contract) || !evMAddressPattern.MatchString(recipient) ||
		!validNetworkFeeHexData(data) || len(data) > maxNetworkFeeContextLength {
		return chainRawNetworkEstimate{}, ErrNetworkFeeContextMissing
	}
	if err := validateEVMERC20TransferCalldata(data, recipient); err != nil {
		return chainRawNetworkEstimate{}, err
	}
	mode := estimator.resolvedQuoteMode()
	if mode != GMPayQuoteModeEmpirical {
		exact, exactErr := estimator.configured.estimateEVM(ctx, chain, token, transaction)
		if exactErr == nil {
			return exact, nil
		}
		if mode == GMPayQuoteModeSimulate {
			return chainRawNetworkEstimate{}, exactErr
		}
	}

	gas := decimal.RequireFromString(builtinEVMTransferGasUnits)
	gasPrice := decimal.Zero
	methods := make([]string, 0, 2)
	gasPriceResult, gasPriceErr := estimator.configured.callJSONRPC(ctx, chain.rpcURL, "eth_gasPrice", []any{})
	if gasPriceErr == nil {
		gasPrice, gasPriceErr = parseHexQuantity(gasPriceResult.Raw)
		if gasPriceErr == nil && gasPrice.GreaterThan(decimal.Zero) {
			methods = append(methods, "eth_gasPrice")
		} else {
			gasPriceErr = errors.New("eth_gasPrice returned an invalid quantity")
		}
	}
	baseFee, priorityFee, block, feeHistoryErr := estimator.configured.evmFeeHistory(ctx, chain.rpcURL)
	if feeHistoryErr == nil {
		candidate := baseFee.Add(priorityFee)
		if candidate.GreaterThan(decimal.Zero) {
			methods = append(methods, "eth_feeHistory")
			if gasPriceErr != nil || candidate.GreaterThan(gasPrice) {
				gasPrice = candidate
			}
		}
	}
	if gasPrice.LessThanOrEqual(decimal.Zero) || len(methods) == 0 {
		return chainRawNetworkEstimate{}, fmt.Errorf("evm gas price unavailable: gas price: %v; fee history: %v", gasPriceErr, feeHistoryErr)
	}
	nativeAmount := gas.Mul(gasPrice).Div(decimal.RequireFromString(evmWeiPerNative))
	if nativeAmount.IsNegative() || !decimalIsFinite(nativeAmount) {
		return chainRawNetworkEstimate{}, errors.New("evm representative network cost is invalid")
	}
	methods = append([]string{builtinEVMEmpiricalGasMethod}, methods...)
	return chainRawNetworkEstimate{
		NativeAmount: nativeAmount,
		Confidence:   "medium",
		Evidence: NetworkFeeEvidence{
			RPCMethod:  methods[0],
			RPCMethods: methods,
			Block:      block,
			Gas:        gas.String(),
			GasPrice:   gasPrice.String(),
		},
	}, nil
}

func (estimator *BuiltinNetworkFeeEstimator) estimateBuiltinSolana(ctx context.Context, chain parsedNetworkFeeChainConfig, token string, transaction NetworkFeeTransactionContext) (chainRawNetworkEstimate, error) {
	mode := estimator.resolvedQuoteMode()
	if mode != GMPayQuoteModeEmpirical {
		raw, err := estimator.configured.estimateSolana(ctx, chain, token, transaction)
		if err == nil {
			return raw, nil
		}
		if mode == GMPayQuoteModeSimulate {
			return chainRawNetworkEstimate{}, err
		}
	}
	lamports := decimal.RequireFromString(builtinSolanaTransferLamports)
	nativeAmount := lamports.Div(decimal.RequireFromString(solanaLamportsPerSOL))
	if nativeAmount.IsNegative() || !decimalIsFinite(nativeAmount) {
		return chainRawNetworkEstimate{}, errors.New("solana representative network cost is invalid")
	}
	return chainRawNetworkEstimate{
		NativeAmount: nativeAmount,
		Confidence:   "medium",
		Evidence: NetworkFeeEvidence{
			RPCMethod:  builtinSolanaEmpiricalFeeMethod,
			RPCMethods: []string{builtinSolanaEmpiricalFeeMethod},
			Lamports:   lamports.String(),
		},
	}, nil
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
		contract := map[string]string{"USDT": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "USDC": "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8"}[token]
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

// fetchBuiltinPrice first uses the configured CoinGecko endpoint and then a
// fixed CoinPaprika endpoint when the primary source is unavailable or fails
// validation.  No endpoint, host, asset, or currency is accepted from a
// request; the fallback is part of the built-in preset.
func (estimator *BuiltinNetworkFeeEstimator) fetchBuiltinPrice(ctx context.Context, chain parsedNetworkFeeChainConfig, network, currency string, now time.Time) (decimal.Decimal, time.Time, string, error) {
	if estimator == nil || estimator.configured == nil || chain.priceURL == nil {
		return decimal.Zero, time.Time{}, "", errors.New("price source is unavailable")
	}
	key := network + "|" + strings.ToUpper(currency)
	if cached, ok := estimator.getBuiltinPriceCache(key, now); ok {
		return cached.price, cached.timestamp, cached.source, nil
	}
	resultCh := estimator.priceGroup.DoChan(key, func() (any, error) {
		// Do not attach the shared request to the first caller's cancellation
		// signal: a status probe may be canceled while other probes still need
		// the same quote. Preserve the configured timeout and, when present, the
		// first caller's deadline as an absolute upper bound.
		requestTimeout := estimator.configured.config.timeout
		if deadline, ok := ctx.Deadline(); ok {
			if remaining := time.Until(deadline); remaining < requestTimeout {
				requestTimeout = remaining
			}
		}
		if requestTimeout <= 0 {
			return nil, context.DeadlineExceeded
		}
		sharedCtx, cancel := context.WithTimeout(context.Background(), requestTimeout)
		defer cancel()
		// A concurrent caller may have populated the cache while this request
		// was waiting for the singleflight slot.
		if cached, ok := estimator.getBuiltinPriceCache(key, now); ok {
			return builtinPriceResult{price: cached.price, timestamp: cached.timestamp, source: cached.source}, nil
		}
		price, timestamp, source, primaryErr := estimator.fetchBuiltinPriceSource(sharedCtx, chain, network, currency, now, chain.priceURL)
		if primaryErr == nil {
			estimator.putBuiltinPriceCache(key, builtinPriceCacheEntry{price: price, timestamp: timestamp, source: source}, now)
			return builtinPriceResult{price: price, timestamp: timestamp, source: source}, nil
		}
		fallback, fallbackErr := builtinCoinPaprikaEndpoint(network)
		if fallbackErr == nil && fallback.String() != chain.priceURL.String() {
			price, timestamp, source, fallbackErr = estimator.fetchBuiltinPriceSource(sharedCtx, chain, network, currency, now, fallback)
			if fallbackErr == nil {
				estimator.putBuiltinPriceCache(key, builtinPriceCacheEntry{price: price, timestamp: timestamp, source: source}, now)
				return builtinPriceResult{price: price, timestamp: timestamp, source: source}, nil
			}
			return nil, fmt.Errorf("primary price source unavailable: %v; fallback price source unavailable: %v", primaryErr, fallbackErr)
		}
		return nil, primaryErr
	})
	var result singleflight.Result
	select {
	case result = <-resultCh:
	case <-ctx.Done():
		return decimal.Zero, time.Time{}, "", ctx.Err()
	}
	if result.Err != nil {
		return decimal.Zero, time.Time{}, "", result.Err
	}
	value, ok := result.Val.(builtinPriceResult)
	if !ok {
		return decimal.Zero, time.Time{}, "", errors.New("price source result is invalid")
	}
	return value.price, value.timestamp, value.source, nil
}

func (estimator *BuiltinNetworkFeeEstimator) fetchBuiltinPriceSource(ctx context.Context, chain parsedNetworkFeeChainConfig, network, currency string, now time.Time, endpoint *url.URL) (decimal.Decimal, time.Time, string, error) {
	body, err := estimator.requestBuiltinPriceBody(ctx, endpoint)
	if err != nil {
		return decimal.Zero, time.Time{}, "", err
	}
	if endpointSource(endpoint) == "api.coingecko.com" {
		return parseBuiltinCoinGeckoPrice(body, network, currency, now, estimator.configured.config.priceMaxAge, endpoint)
	}
	price, timestamp, _, err := parseBuiltinCoinPaprikaPrice(body, network, currency, now, estimator.configured.config.priceMaxAge, endpoint)
	if err != nil {
		return decimal.Zero, time.Time{}, "", err
	}
	return price, timestamp, endpointSource(endpoint), nil
}

func (estimator *BuiltinNetworkFeeEstimator) requestBuiltinPriceBody(ctx context.Context, endpoint *url.URL) ([]byte, error) {
	if endpoint == nil {
		return nil, errors.New("price source endpoint is unavailable")
	}
	var body []byte
	for attempt := 0; attempt <= estimator.configured.config.maxRetries; attempt++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
		if err != nil {
			return nil, err
		}
		request.Header.Set("Accept", "application/json")
		response, err := estimator.configured.httpClient.Do(request)
		if err != nil {
			if attempt < estimator.configured.config.maxRetries {
				continue
			}
			return nil, err
		}
		if response == nil || response.Body == nil {
			return nil, errors.New("price source response is invalid")
		}
		if responseErr := validateNetworkFeeResponse(response, endpoint); responseErr != nil {
			response.Body.Close()
			return nil, responseErr
		}
		body, err = io.ReadAll(io.LimitReader(response.Body, estimator.configured.config.responseLimit+1))
		status := response.StatusCode
		response.Body.Close()
		if err != nil {
			return nil, errors.New("price source response is invalid")
		}
		if int64(len(body)) > estimator.configured.config.responseLimit {
			return nil, errors.New("price source response exceeds size limit")
		}
		if status >= 500 && attempt < estimator.configured.config.maxRetries {
			continue
		}
		if status < 200 || status >= 300 {
			return nil, fmt.Errorf("price source returned http status %d", status)
		}
		return body, nil
	}
	return nil, errors.New("price source request failed")
}

func parseBuiltinCoinGeckoPrice(body []byte, network, currency string, now time.Time, maxAge time.Duration, endpoint *url.URL) (decimal.Decimal, time.Time, string, error) {
	var fields map[string]map[string]json.RawMessage
	if err := common.Unmarshal(body, &fields); err != nil || fields == nil {
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
	if err != nil || price.LessThanOrEqual(decimal.Zero) || price.GreaterThan(decimal.RequireFromString(maxNetworkFeePrice)) {
		return decimal.Zero, time.Time{}, "", errors.New("price source price is invalid")
	}
	timestampRaw, ok := nested["last_updated_at"]
	if !ok {
		return decimal.Zero, time.Time{}, "", errors.New("price source timestamp is missing")
	}
	timestamp, err := parseNetworkFeeTimestamp(timestampRaw)
	if err != nil || timestamp.After(now.Add(5*time.Minute)) || now.Sub(timestamp) > maxAge {
		return decimal.Zero, time.Time{}, "", errors.New("price source timestamp is stale")
	}
	return price, timestamp, endpointSource(endpoint), nil
}

func parseBuiltinCoinPaprikaPrice(body []byte, network, currency string, now time.Time, maxAge time.Duration, endpoint *url.URL) (decimal.Decimal, time.Time, string, error) {
	var fields map[string]json.RawMessage
	if err := common.Unmarshal(body, &fields); err != nil || fields == nil {
		return decimal.Zero, time.Time{}, "", errors.New("price source response is invalid")
	}
	slug, ok := builtinCoinPaprikaSlug(network)
	if !ok {
		return decimal.Zero, time.Time{}, "", errors.New("price source network is unsupported")
	}
	idRaw, ok := findJSONField(fields, "id")
	if !ok || common.GetJsonType(idRaw) != "string" || !strings.EqualFold(strings.TrimSpace(common.JsonRawMessageToString(idRaw)), slug) {
		return decimal.Zero, time.Time{}, "", errors.New("price source asset id does not match configured network")
	}
	symbolRaw, ok := findJSONField(fields, "symbol")
	if !ok || common.GetJsonType(symbolRaw) != "string" || !strings.EqualFold(strings.TrimSpace(common.JsonRawMessageToString(symbolRaw)), expectedNativeAsset(network)) {
		return decimal.Zero, time.Time{}, "", errors.New("price source asset symbol does not match configured network")
	}
	quotesRaw, ok := findJSONField(fields, "quotes")
	if !ok || common.GetJsonType(quotesRaw) != "object" {
		return decimal.Zero, time.Time{}, "", errors.New("price source quotes are missing")
	}
	quotes, err := objectFields(quotesRaw)
	if err != nil {
		return decimal.Zero, time.Time{}, "", errors.New("price source quotes are invalid")
	}
	selectedQuoteRaw, ok := findJSONField(quotes, currency)
	if !ok || common.GetJsonType(selectedQuoteRaw) != "object" {
		return decimal.Zero, time.Time{}, "", errors.New("price source settlement quote is missing")
	}
	selectedQuote, err := objectFields(selectedQuoteRaw)
	if err != nil {
		return decimal.Zero, time.Time{}, "", errors.New("price source settlement quote is invalid")
	}
	quotePriceRaw, ok := findJSONField(selectedQuote, "price")
	if !ok || !isJSONScalar(quotePriceRaw) {
		return decimal.Zero, time.Time{}, "", errors.New("price source settlement quote price is missing")
	}
	quotePrice, err := parseNetworkFeeDecimal(common.JsonRawMessageToString(quotePriceRaw), false)
	if err != nil || quotePrice.GreaterThan(decimal.RequireFromString(maxNetworkFeePrice)) {
		return decimal.Zero, time.Time{}, "", errors.New("price source settlement quote price is invalid")
	}
	price, timestamp, responseCurrency, err := parseNetworkFeePriceForAsset(body, expectedNativeAsset(network), currency)
	if err != nil {
		return decimal.Zero, time.Time{}, "", err
	}
	if !price.Equal(quotePrice) {
		return decimal.Zero, time.Time{}, "", errors.New("price source price does not match settlement quote")
	}
	if responseCurrency != "" && responseCurrency != currency {
		return decimal.Zero, time.Time{}, "", errors.New("price source currency does not match settlement currency")
	}
	if timestamp.After(now.Add(5*time.Minute)) || now.Sub(timestamp) > maxAge {
		return decimal.Zero, time.Time{}, "", errors.New("price source timestamp is stale")
	}
	if price.LessThanOrEqual(decimal.Zero) || price.GreaterThan(decimal.RequireFromString(maxNetworkFeePrice)) {
		return decimal.Zero, time.Time{}, "", errors.New("price source price is invalid")
	}
	return price, timestamp, endpointSource(endpoint), nil
}

func builtinCoinPaprikaEndpoint(network string) (*url.URL, error) {
	slug, ok := builtinCoinPaprikaSlug(network)
	if !ok {
		return nil, errors.New("price source network is unsupported")
	}
	return validateNetworkFeeEndpoint("https://api.coinpaprika.com/v1/tickers/"+slug+"?quotes=USD,CNY", []string{"api.coinpaprika.com"})
}

func builtinCoinPaprikaSlug(network string) (string, bool) {
	slug, ok := map[string]string{
		"tron":     "trx-tron",
		"ethereum": "eth-ethereum",
		"binance":  "bnb-binance-coin",
		"solana":   "sol-solana",
	}[network]
	return slug, ok
}

func (estimator *BuiltinNetworkFeeEstimator) getBuiltinPriceCache(key string, now time.Time) (builtinPriceCacheEntry, bool) {
	estimator.priceMu.Lock()
	defer estimator.priceMu.Unlock()
	entry, ok := estimator.priceCache[key]
	if !ok || !entry.expiresAt.After(now) || entry.timestamp.After(now.Add(5*time.Minute)) || now.Sub(entry.timestamp) > estimator.configured.config.priceMaxAge {
		if ok {
			delete(estimator.priceCache, key)
		}
		return builtinPriceCacheEntry{}, false
	}
	return entry, true
}

func (estimator *BuiltinNetworkFeeEstimator) putBuiltinPriceCache(key string, entry builtinPriceCacheEntry, now time.Time) {
	estimator.priceMu.Lock()
	defer estimator.priceMu.Unlock()
	if estimator.priceCache == nil {
		estimator.priceCache = make(map[string]builtinPriceCacheEntry)
	}
	if len(estimator.priceCache) >= 16 {
		for existingKey := range estimator.priceCache {
			delete(estimator.priceCache, existingKey)
			break
		}
	}
	entry.expiresAt = now.Add(estimator.configured.config.cacheTTL)
	estimator.priceCache[key] = entry
}

var _ NetworkFeeEstimator = (*BuiltinNetworkFeeEstimator)(nil)
