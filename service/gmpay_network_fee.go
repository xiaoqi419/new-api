package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
)

// ChainNetworkEstimateSource is the only source label emitted by the dynamic
// estimator. It describes an estimate of the downstream chain operation and
// must not be presented as a GMPay platform-service fee.
const ChainNetworkEstimateSource = "chain_network_estimate"

const (
	NetworkFeeEstimatorConfigVersion = 1
	NetworkFeeEstimatorVersion       = "chain-network-v1"

	defaultNetworkFeeTimeout                 = 5 * time.Second
	defaultNetworkFeeResponseLimit           = int64(1 << 20)
	defaultNetworkFeeQuoteTTL                = 5 * time.Minute
	defaultNetworkFeeCacheTTL                = 15 * time.Second
	defaultNetworkFeePriceMaxAge             = 2 * time.Minute
	defaultNetworkFeeMaxPriceDeviation       = "25"
	defaultNetworkFeeMaxRetries              = 0
	maxNetworkFeeTimeout                     = 30 * time.Second
	maxNetworkFeeResponseLimit               = int64(8 << 20)
	maxNetworkFeeQuoteTTL                    = 24 * time.Hour
	maxNetworkFeeCacheTTL                    = 24 * time.Hour
	maxNetworkFeePriceMaxAge                 = 24 * time.Hour
	maxNetworkFeeMaxPriceDeviation           = "100"
	maxNetworkFeeRetries                     = 2
	maxNetworkFeeCacheEntries                = 256
	maxNetworkFeeDecimalScale          int32 = 18
	maxNetworkFeePrice                       = "1000000000000"
	maxNetworkFeeAbsolute                    = "1000000000.00"
	tronSunPerTRX                            = "1000000"
	evmWeiPerNative                          = "1000000000000000000"
	solanaLamportsPerSOL                     = "1000000000"
	maxNetworkFeeContextLength               = 512 * 1024
	maxNetworkFeePriceSources                = 8
	maxSolanaTokenDecimals             uint8 = 18
	evmERC20TransferSelector                 = "a9059cbb"
	tronTRC20TransferSelector                = "a9059cbb"
	tronTRC20TransferSignature               = "transfer(address,uint256)"
	solanaTokenProgramID                     = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
	solanaToken2022ProgramID                 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
)

var (
	// ErrNetworkFeeUnavailable is returned for any RPC, price, validation, or
	// bound failure. Callers should fail closed or explicitly choose their
	// administrator fallback policy.
	ErrNetworkFeeUnavailable = errors.New("chain network fee estimate unavailable")
	// ErrNetworkFeeContextMissing distinguishes an absent representative
	// transaction from an unavailable external service.
	ErrNetworkFeeContextMissing = errors.New("chain network fee transaction context is missing")
	// ErrInsufficientContext is an integration-friendly alias for
	// ErrNetworkFeeContextMissing.  Adapters may return this sentinel when the
	// server has not configured an exact representative transaction; callers
	// should fail closed instead of inventing a fixed fee.
	ErrInsufficientContext = ErrNetworkFeeContextMissing

	evMAddressPattern   = regexp.MustCompile(`^0x[0-9a-fA-F]{40}$`)
	hexDataPattern      = regexp.MustCompile(`^(?:0x)?[0-9a-fA-F]+$`)
	identifierPattern   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
	currencyPattern     = regexp.MustCompile(`^[A-Z][A-Z0-9]{2,7}$`)
	allowedEndpointHost = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]*$`)
)

// NetworkFeeEstimator is the internal chain-cost abstraction used by payment
// creation. The estimator owns all endpoint and price-source configuration;
// an input can select an enabled asset but cannot provide a URL.
type NetworkFeeEstimator interface {
	Estimate(context.Context, NetworkFeeEstimateInput) (NetworkFeeQuote, error)
}

// NetworkFeeTransactionContext is a server-configured representative
// collection transaction. Alias fields are accepted to keep integrations
// readable across the three protocol families:
//
//   - EVM: From, Recipient/To, TokenContract/Contract, Data/Calldata
//   - TRON: From, Recipient/To, TokenContract/Contract, Data, FunctionSelector
//   - Solana: Payer/From, Recipient/To, TokenMint, Message
//
// It is intentionally data-only. Endpoint URLs and credentials never belong
// here and are rejected when supplied through configuration parsing.
type NetworkFeeTransactionContext struct {
	From          string `json:"from,omitempty"`
	Payer         string `json:"payer,omitempty"`
	To            string `json:"to,omitempty"`
	Recipient     string `json:"recipient,omitempty"`
	TokenContract string `json:"token_contract,omitempty"`
	Contract      string `json:"contract,omitempty"`
	TokenMint     string `json:"token_mint,omitempty"`
	// Solana collection context. These fields let the estimator construct (or
	// cross-check) a controlled transfer/transferChecked instruction instead of
	// trusting an opaque message whose accounts could refer to another mint or
	// recipient.
	SourceTokenAccount      string `json:"source_token_account,omitempty"`
	RecipientTokenAccount   string `json:"recipient_token_account,omitempty"`
	TransferInstruction     string `json:"transfer_instruction,omitempty"`
	TransferAmountBaseUnits string `json:"transfer_amount_base_units,omitempty"`
	TokenDecimals           uint8  `json:"token_decimals,omitempty"`
	RecentBlockhash         string `json:"recent_blockhash,omitempty"`
	TokenProgramID          string `json:"token_program_id,omitempty"`
	InstructionData         string `json:"instruction_data,omitempty"`
	Data                    string `json:"data,omitempty"`
	Calldata                string `json:"calldata,omitempty"`
	Message                 string `json:"message,omitempty"`
	FunctionSelector        string `json:"function_selector,omitempty"`
	BandwidthBytes          uint64 `json:"bandwidth_bytes,omitempty"`
	ComputeUnits            uint64 `json:"compute_units,omitempty"`
	// PriorityFeePerUnit and PriorityFeeLamports are optional, server-side
	// Solana settings. They are decimal strings to avoid float precision loss.
	PriorityFeePerUnit  string `json:"priority_fee_per_unit,omitempty"`
	PriorityFeeLamports string `json:"priority_fee_lamports,omitempty"`
	Batch               bool   `json:"batch,omitempty"`
}

// NetworkFeeEstimateInput identifies the selected payment asset and supplies
// the server-owned representative transaction context. The BaseAmount is the
// amount credited to the user, not the amount sent to the gateway.
type NetworkFeeEstimateInput struct {
	Token              string                       `json:"token"`
	Network            string                       `json:"network"`
	SettlementCurrency string                       `json:"settlement_currency"`
	BaseAmount         decimal.Decimal              `json:"-"`
	Transaction        NetworkFeeTransactionContext `json:"transaction"`
}

// NetworkFeeChainConfig contains server-side endpoints and the context for
// one supported network. RPCAllowedHosts and PriceAllowedHosts are exact host
// allowlists; loopback hosts are permitted for local test/development
// fixtures when an allowlist is omitted.
type NetworkFeeChainConfig struct {
	RPCURL   string `json:"rpc_url"`
	PriceURL string `json:"price_url"`
	// PriceURLs is the preferred multi-source representation. PriceURL is
	// retained as a backwards-compatible first source for existing options.
	PriceURLs          []string                     `json:"price_urls,omitempty"`
	NativeAsset        string                       `json:"native_asset"`
	SettlementCurrency string                       `json:"settlement_currency,omitempty"`
	RPCAllowedHosts    []string                     `json:"rpc_allowed_hosts,omitempty"`
	PriceAllowedHosts  []string                     `json:"price_allowed_hosts,omitempty"`
	Transaction        NetworkFeeTransactionContext `json:"transaction,omitempty"`
}

// NetworkFeeEstimatorConfig is a versioned, JSON-friendly server setting.
// Decimal limits remain strings at this boundary and are parsed with
// shopspring/decimal before an estimator is created.
type NetworkFeeEstimatorConfig struct {
	Version                  int                              `json:"version"`
	DynamicEnabled           bool                             `json:"dynamic_enabled"`
	Chains                   map[string]NetworkFeeChainConfig `json:"chains"`
	TimeoutMilliseconds      int                              `json:"timeout_ms,omitempty"`
	MaxResponseBytes         int64                            `json:"max_response_bytes,omitempty"`
	MaxRetries               int                              `json:"max_retries,omitempty"`
	CacheTTLSeconds          int                              `json:"cache_ttl_seconds,omitempty"`
	QuoteTTLSeconds          int                              `json:"quote_ttl_seconds,omitempty"`
	PriceMaxAgeSeconds       int                              `json:"price_max_age_seconds,omitempty"`
	MaxPriceDeviationPercent string                           `json:"max_price_deviation_percent,omitempty"`
	MaxFee                   string                           `json:"max_fee,omitempty"`
	MaxTotal                 string                           `json:"max_total,omitempty"`
}

// NetworkFeeEvidence is a controlled, non-secret summary of the RPC and
// price observations used for a quote. It deliberately contains no calldata,
// addresses, credentials, or complete endpoint URLs.
type NetworkFeeEvidence struct {
	RPCMethod      string   `json:"rpc_method"`
	RPCMethods     []string `json:"rpc_methods,omitempty"`
	RPCSource      string   `json:"rpc_source,omitempty"`
	PriceSource    string   `json:"price_source,omitempty"`
	PriceTimestamp int64    `json:"price_timestamp"`
	Block          string   `json:"block,omitempty"`
	Slot           uint64   `json:"slot,omitempty"`
	Gas            string   `json:"gas,omitempty"`
	GasPrice       string   `json:"gas_price,omitempty"`
	Energy         string   `json:"energy,omitempty"`
	Bandwidth      string   `json:"bandwidth,omitempty"`
	Lamports       string   `json:"lamports,omitempty"`
}

// NetworkFeeQuote is a server-generated, auditable chain network estimate.
// NativeAmount and FeeAmount are exact decimals; callers may format them for
// the two-decimal gateway checkout only after validating TotalAmount.
type NetworkFeeQuote struct {
	Token              string
	Network            string
	Source             string
	EstimatorVersion   string
	NativeAsset        string
	NativeAmount       decimal.Decimal
	FeeAmount          decimal.Decimal
	BaseAmount         decimal.Decimal
	TotalAmount        decimal.Decimal
	SettlementCurrency string
	QuotedAt           time.Time
	ExpiresAt          time.Time
	Confidence         string
	Subsidized         bool
	Evidence           NetworkFeeEvidence
}

type parsedNetworkFeeConfig struct {
	dynamicEnabled    bool
	chains            map[string]parsedNetworkFeeChainConfig
	timeout           time.Duration
	responseLimit     int64
	maxRetries        int
	cacheTTL          time.Duration
	quoteTTL          time.Duration
	priceMaxAge       time.Duration
	maxPriceDeviation decimal.Decimal
	maxFee            decimal.Decimal
	maxTotal          decimal.Decimal
}

type parsedNetworkFeeChainConfig struct {
	rpcURL             *url.URL
	priceURL           *url.URL // legacy first source alias
	priceURLs          []*url.URL
	nativeAsset        string
	settlementCurrency string
	rpcAllowedHosts    []string
	priceAllowedHosts  []string
	transaction        NetworkFeeTransactionContext
}

// ConfiguredNetworkFeeEstimator implements NetworkFeeEstimator. Its config is
// immutable after construction, which prevents a request from swapping an
// endpoint or price source while an estimate is in progress.
type ConfiguredNetworkFeeEstimator struct {
	config            parsedNetworkFeeConfig
	httpClient        *http.Client
	now               func() time.Time
	quoteCache        networkFeeQuoteCache
	priceMu           sync.Mutex
	priceObservations map[string]decimal.Decimal
}

// networkFeeQuoteCache is deliberately bounded and local to one immutable
// estimator. Quotes are only retained for a short, configured period; expired
// entries are removed on reads/writes and the oldest entry is evicted when the
// hard cap is reached. This prevents a request-controlled transaction context
// from growing process memory without limit.
type networkFeeQuoteCache struct {
	mu      sync.Mutex
	entries map[string]networkFeeQuoteCacheEntry
}

type networkFeeQuoteCacheEntry struct {
	quote     NetworkFeeQuote
	expiresAt time.Time
	lastUsed  time.Time
}

type networkFeeRPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
}

type networkFeeRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   json.RawMessage `json:"error"`
}

type networkFeeRPCError struct {
	// Message is intentionally ignored because the remote controls it and
	// callers may include returned errors in application logs.
	Code int `json:"code"`
}

type networkFeeCallResult struct {
	Raw       json.RawMessage
	RPCMethod string
	Block     string
	Slot      uint64
}

// ParseNetworkFeeEstimatorConfig validates the versioned JSON setting without
// accepting unknown fields, arbitrary endpoint schemes, or unbounded decimal
// limits. A blank value means that dynamic estimation is not configured.
func ParseNetworkFeeEstimatorConfig(raw string) (NetworkFeeEstimatorConfig, error) {
	config := defaultNetworkFeeEstimatorConfig()
	if strings.TrimSpace(raw) == "" {
		return config, nil
	}

	var fields map[string]json.RawMessage
	if err := common.Unmarshal([]byte(raw), &fields); err != nil || fields == nil {
		return config, errors.New("network fee config must be a JSON object")
	}
	for key := range fields {
		switch key {
		case "version", "dynamic_enabled", "chains", "timeout_ms", "max_response_bytes", "max_retries", "cache_ttl_seconds", "quote_ttl_seconds", "price_max_age_seconds", "max_price_deviation_percent", "max_fee", "max_total":
		default:
			return config, fmt.Errorf("network fee config contains unknown field %q", key)
		}
	}
	versionRaw, ok := fields["version"]
	if !ok || common.GetJsonType(versionRaw) != "number" || common.Unmarshal(versionRaw, &config.Version) != nil || config.Version != NetworkFeeEstimatorConfigVersion {
		return config, errors.New("unsupported network fee config version")
	}
	if value, ok := fields["dynamic_enabled"]; ok {
		if common.GetJsonType(value) != "boolean" || common.Unmarshal(value, &config.DynamicEnabled) != nil {
			return config, errors.New("network fee dynamic_enabled must be boolean")
		}
	}
	if value, ok := fields["timeout_ms"]; ok {
		if err := unmarshalJSONInt(value, &config.TimeoutMilliseconds); err != nil {
			return config, errors.New("network fee timeout_ms is invalid")
		}
	}
	if value, ok := fields["max_response_bytes"]; ok {
		if err := unmarshalJSONInt64(value, &config.MaxResponseBytes); err != nil {
			return config, errors.New("network fee max_response_bytes is invalid")
		}
	}
	if value, ok := fields["max_retries"]; ok {
		if err := unmarshalJSONInt(value, &config.MaxRetries); err != nil {
			return config, errors.New("network fee max_retries is invalid")
		}
	}
	if value, ok := fields["cache_ttl_seconds"]; ok {
		if err := unmarshalJSONInt(value, &config.CacheTTLSeconds); err != nil {
			return config, errors.New("network fee cache_ttl_seconds is invalid")
		}
	}
	if value, ok := fields["quote_ttl_seconds"]; ok {
		if err := unmarshalJSONInt(value, &config.QuoteTTLSeconds); err != nil {
			return config, errors.New("network fee quote_ttl_seconds is invalid")
		}
	}
	if value, ok := fields["price_max_age_seconds"]; ok {
		if err := unmarshalJSONInt(value, &config.PriceMaxAgeSeconds); err != nil {
			return config, errors.New("network fee price_max_age_seconds is invalid")
		}
	}
	if value, ok := fields["max_price_deviation_percent"]; ok {
		if common.GetJsonType(value) != "string" && common.GetJsonType(value) != "number" {
			return config, errors.New("network fee max_price_deviation_percent is invalid")
		}
		config.MaxPriceDeviationPercent = strings.TrimSpace(common.JsonRawMessageToString(value))
	}
	for key, target := range map[string]*string{"max_fee": &config.MaxFee, "max_total": &config.MaxTotal} {
		if value, ok := fields[key]; ok {
			if common.GetJsonType(value) != "string" && common.GetJsonType(value) != "number" {
				return config, fmt.Errorf("network fee %s is invalid", key)
			}
			*target = strings.TrimSpace(common.JsonRawMessageToString(value))
		}
	}

	chainsRaw, ok := fields["chains"]
	if !ok {
		return config, errors.New("network fee chains are required")
	}
	var rawChains map[string]json.RawMessage
	if common.GetJsonType(chainsRaw) != "object" || common.Unmarshal(chainsRaw, &rawChains) != nil || rawChains == nil || len(rawChains) == 0 {
		return config, errors.New("network fee chains must be a non-empty object")
	}
	config.Chains = make(map[string]NetworkFeeChainConfig, len(rawChains))
	for rawNetwork, rawChain := range rawChains {
		network, ok := normalizeEstimatorNetwork(rawNetwork)
		if !ok {
			return config, fmt.Errorf("network fee network %q is unsupported", rawNetwork)
		}
		chain, err := parseNetworkFeeChainConfig(rawChain, network)
		if err != nil {
			return config, fmt.Errorf("invalid network fee config for %s: %w", network, err)
		}
		if _, exists := config.Chains[network]; exists {
			return config, fmt.Errorf("duplicate network fee network %q", network)
		}
		config.Chains[network] = chain
	}
	if _, err := normalizeNetworkFeeEstimatorConfig(config); err != nil {
		return config, err
	}
	return config, nil
}

// NewNetworkFeeEstimator constructs an immutable estimator using the default
// HTTP client. Endpoint and bound validation happens before any network call.
func NewNetworkFeeEstimator(config NetworkFeeEstimatorConfig) (*ConfiguredNetworkFeeEstimator, error) {
	return newNetworkFeeEstimator(config, nil, nil)
}

// NewNetworkFeeEstimatorWithHTTPClient is useful for deterministic tests and
// deployments that already manage an HTTP transport. The client timeout is
// still bounded by the estimator's context deadline.
func NewNetworkFeeEstimatorWithHTTPClient(config NetworkFeeEstimatorConfig, client *http.Client) (*ConfiguredNetworkFeeEstimator, error) {
	return newNetworkFeeEstimator(config, client, nil)
}

// NewNetworkFeeEstimatorWithClock is a deterministic test seam for timestamp
// and expiry checks. Production callers should use NewNetworkFeeEstimator.
func NewNetworkFeeEstimatorWithClock(config NetworkFeeEstimatorConfig, client *http.Client, now func() time.Time) (*ConfiguredNetworkFeeEstimator, error) {
	return newNetworkFeeEstimator(config, client, now)
}

func newNetworkFeeEstimator(config NetworkFeeEstimatorConfig, client *http.Client, now func() time.Time) (*ConfiguredNetworkFeeEstimator, error) {
	parsed, err := normalizeNetworkFeeEstimatorConfig(config)
	if err != nil {
		return nil, err
	}
	if client == nil {
		client = &http.Client{Timeout: parsed.timeout}
	}
	// Endpoint and price-source URLs are administrator-controlled, but they
	// still must not be allowed to follow a redirect into a different origin.
	// Clone the caller's client so a test/deployment client is not mutated, then
	// unconditionally disable redirects for this narrowly scoped estimator.
	clientCopy := *client
	clientCopy.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}
	if now == nil {
		now = time.Now
	}
	return &ConfiguredNetworkFeeEstimator{
		config:            parsed,
		httpClient:        &clientCopy,
		now:               now,
		quoteCache:        networkFeeQuoteCache{entries: make(map[string]networkFeeQuoteCacheEntry)},
		priceObservations: make(map[string]decimal.Decimal),
	}, nil
}

func defaultNetworkFeeEstimatorConfig() NetworkFeeEstimatorConfig {
	return NetworkFeeEstimatorConfig{
		Version:                  NetworkFeeEstimatorConfigVersion,
		Chains:                   make(map[string]NetworkFeeChainConfig),
		TimeoutMilliseconds:      int(defaultNetworkFeeTimeout / time.Millisecond),
		MaxResponseBytes:         defaultNetworkFeeResponseLimit,
		MaxRetries:               defaultNetworkFeeMaxRetries,
		CacheTTLSeconds:          int(defaultNetworkFeeCacheTTL / time.Second),
		QuoteTTLSeconds:          int(defaultNetworkFeeQuoteTTL / time.Second),
		PriceMaxAgeSeconds:       int(defaultNetworkFeePriceMaxAge / time.Second),
		MaxPriceDeviationPercent: defaultNetworkFeeMaxPriceDeviation,
		MaxFee:                   maxNetworkFeeAbsolute,
		MaxTotal:                 maxNetworkFeeAbsolute,
	}
}

func parseNetworkFeeChainConfig(raw json.RawMessage, network string) (NetworkFeeChainConfig, error) {
	if common.GetJsonType(raw) != "object" {
		return NetworkFeeChainConfig{}, errors.New("chain config must be an object")
	}
	var fields map[string]json.RawMessage
	if common.Unmarshal(raw, &fields) != nil || fields == nil {
		return NetworkFeeChainConfig{}, errors.New("chain config must be an object")
	}
	for key := range fields {
		switch key {
		case "rpc_url", "price_url", "price_urls", "native_asset", "settlement_currency", "rpc_allowed_hosts", "price_allowed_hosts", "transaction":
		default:
			return NetworkFeeChainConfig{}, fmt.Errorf("unknown field %q", key)
		}
	}
	var config NetworkFeeChainConfig
	for key, target := range map[string]*string{
		"rpc_url": &config.RPCURL, "price_url": &config.PriceURL, "native_asset": &config.NativeAsset, "settlement_currency": &config.SettlementCurrency,
	} {
		if value, ok := fields[key]; ok {
			if common.GetJsonType(value) != "string" {
				return config, fmt.Errorf("%s must be a string", key)
			}
			*target = strings.TrimSpace(common.JsonRawMessageToString(value))
		}
	}
	if value, ok := fields["rpc_allowed_hosts"]; ok {
		if err := common.Unmarshal(value, &config.RPCAllowedHosts); err != nil {
			return config, errors.New("rpc_allowed_hosts must be an array")
		}
	}
	if value, ok := fields["price_allowed_hosts"]; ok {
		if err := common.Unmarshal(value, &config.PriceAllowedHosts); err != nil {
			return config, errors.New("price_allowed_hosts must be an array")
		}
	}
	if value, ok := fields["price_urls"]; ok {
		if common.GetJsonType(value) != "array" || common.Unmarshal(value, &config.PriceURLs) != nil {
			return config, errors.New("price_urls must be an array")
		}
		if len(config.PriceURLs) > maxNetworkFeePriceSources {
			return config, errors.New("price_urls contains too many sources")
		}
		for index := range config.PriceURLs {
			config.PriceURLs[index] = strings.TrimSpace(config.PriceURLs[index])
			if config.PriceURLs[index] == "" {
				return config, errors.New("price_urls contains an empty source")
			}
		}
	}
	if value, ok := fields["transaction"]; ok {
		transaction, err := parseNetworkFeeTransactionContext(value)
		if err != nil {
			return config, err
		}
		config.Transaction = transaction
	}
	if config.NativeAsset == "" {
		config.NativeAsset = expectedNativeAsset(network)
	}
	return config, nil
}

// parseNetworkFeeTransactionContext keeps the representative transaction
// schema closed. In particular, gateway fee/price fields are not accepted as
// an accidental input to chain estimation; only the fields needed to build a
// protocol request can cross the configuration boundary.
func parseNetworkFeeTransactionContext(raw json.RawMessage) (NetworkFeeTransactionContext, error) {
	if common.GetJsonType(raw) != "object" {
		return NetworkFeeTransactionContext{}, errors.New("transaction must be an object")
	}
	var fields map[string]json.RawMessage
	if common.Unmarshal(raw, &fields) != nil || fields == nil {
		return NetworkFeeTransactionContext{}, errors.New("transaction must be an object")
	}
	for key := range fields {
		switch key {
		case "from", "payer", "to", "recipient", "token_contract", "contract", "token_mint", "source_token_account", "recipient_token_account", "transfer_instruction", "transfer_amount_base_units", "token_decimals", "recent_blockhash", "token_program_id", "instruction_data", "data", "calldata", "message", "function_selector", "bandwidth_bytes", "compute_units", "priority_fee_per_unit", "priority_fee_lamports", "batch":
		default:
			return NetworkFeeTransactionContext{}, fmt.Errorf("unknown transaction field %q", key)
		}
	}
	var transaction NetworkFeeTransactionContext
	if common.Unmarshal(raw, &transaction) != nil {
		return NetworkFeeTransactionContext{}, errors.New("transaction contains an invalid field")
	}
	if transaction.BandwidthBytes > math.MaxInt64 || transaction.ComputeUnits > math.MaxInt64 {
		return NetworkFeeTransactionContext{}, errors.New("transaction integer field is out of bounds")
	}
	if transaction.TokenDecimals > maxSolanaTokenDecimals {
		return NetworkFeeTransactionContext{}, errors.New("transaction token decimals are out of bounds")
	}
	if strings.TrimSpace(transaction.TransferAmountBaseUnits) != "" {
		if _, err := parseNetworkFeeIntegerDecimal(transaction.TransferAmountBaseUnits, true); err != nil {
			return NetworkFeeTransactionContext{}, errors.New("transaction transfer amount is invalid")
		}
	}
	if strings.TrimSpace(transaction.TransferInstruction) != "" {
		instruction, err := normalizeSolanaTransferInstruction(transaction.TransferInstruction)
		if err != nil {
			return NetworkFeeTransactionContext{}, err
		}
		transaction.TransferInstruction = instruction
	}
	if strings.TrimSpace(transaction.RecentBlockhash) != "" && len(strings.TrimSpace(transaction.RecentBlockhash)) > maxNetworkFeeContextLength {
		return NetworkFeeTransactionContext{}, errors.New("transaction recent blockhash is too long")
	}
	if strings.TrimSpace(transaction.TokenProgramID) != "" && len(strings.TrimSpace(transaction.TokenProgramID)) > maxNetworkFeeContextLength {
		return NetworkFeeTransactionContext{}, errors.New("transaction token program id is too long")
	}
	for _, value := range []string{transaction.PriorityFeePerUnit, transaction.PriorityFeeLamports} {
		if strings.TrimSpace(value) == "" {
			continue
		}
		if _, err := parseNetworkFeeDecimal(value, true); err != nil {
			return NetworkFeeTransactionContext{}, errors.New("transaction priority fee is invalid")
		}
	}
	return transaction, nil
}

func normalizeNetworkFeeEstimatorConfig(config NetworkFeeEstimatorConfig) (parsedNetworkFeeConfig, error) {
	parsed := parsedNetworkFeeConfig{chains: make(map[string]parsedNetworkFeeChainConfig), dynamicEnabled: config.DynamicEnabled}
	if config.Version != 0 && config.Version != NetworkFeeEstimatorConfigVersion {
		return parsed, errors.New("unsupported network fee config version")
	}
	if len(config.Chains) == 0 {
		return parsed, errors.New("network fee config has no chains")
	}
	timeout := defaultNetworkFeeTimeout
	if config.TimeoutMilliseconds != 0 {
		if config.TimeoutMilliseconds < 100 || time.Duration(config.TimeoutMilliseconds)*time.Millisecond > maxNetworkFeeTimeout {
			return parsed, errors.New("network fee timeout is out of bounds")
		}
		timeout = time.Duration(config.TimeoutMilliseconds) * time.Millisecond
	}
	responseLimit := config.MaxResponseBytes
	if responseLimit == 0 {
		responseLimit = defaultNetworkFeeResponseLimit
	}
	if responseLimit < 1024 || responseLimit > maxNetworkFeeResponseLimit {
		return parsed, errors.New("network fee response limit is out of bounds")
	}
	retries := config.MaxRetries
	if retries < 0 || retries > maxNetworkFeeRetries {
		return parsed, errors.New("network fee retry count is out of bounds")
	}
	cacheTTL := defaultNetworkFeeCacheTTL
	if config.CacheTTLSeconds != 0 {
		if config.CacheTTLSeconds < 1 || time.Duration(config.CacheTTLSeconds)*time.Second > maxNetworkFeeCacheTTL {
			return parsed, errors.New("network fee cache TTL is out of bounds")
		}
		cacheTTL = time.Duration(config.CacheTTLSeconds) * time.Second
	}
	quoteTTL := defaultNetworkFeeQuoteTTL
	if config.QuoteTTLSeconds != 0 {
		if config.QuoteTTLSeconds < 1 || time.Duration(config.QuoteTTLSeconds)*time.Second > maxNetworkFeeQuoteTTL {
			return parsed, errors.New("network fee quote TTL is out of bounds")
		}
		quoteTTL = time.Duration(config.QuoteTTLSeconds) * time.Second
	}
	priceMaxAge := defaultNetworkFeePriceMaxAge
	if config.PriceMaxAgeSeconds != 0 {
		if config.PriceMaxAgeSeconds < 1 || time.Duration(config.PriceMaxAgeSeconds)*time.Second > maxNetworkFeePriceMaxAge {
			return parsed, errors.New("network fee price max age is out of bounds")
		}
		priceMaxAge = time.Duration(config.PriceMaxAgeSeconds) * time.Second
	}
	maxPriceDeviationValue := strings.TrimSpace(config.MaxPriceDeviationPercent)
	if maxPriceDeviationValue == "" {
		maxPriceDeviationValue = defaultNetworkFeeMaxPriceDeviation
	}
	maxPriceDeviation, err := parseNetworkFeeDecimal(maxPriceDeviationValue, true)
	if err != nil {
		return parsed, fmt.Errorf("network fee max price deviation is invalid: %w", err)
	}
	maxPriceDeviationLimit, _ := decimal.NewFromString(maxNetworkFeeMaxPriceDeviation)
	if maxPriceDeviation.GreaterThan(maxPriceDeviationLimit) {
		return parsed, errors.New("network fee max price deviation is out of bounds")
	}
	maxFeeValue := strings.TrimSpace(config.MaxFee)
	if maxFeeValue == "" {
		maxFeeValue = maxNetworkFeeAbsolute
	}
	maxFee, err := parseNetworkFeeDecimal(maxFeeValue, true)
	if err != nil {
		return parsed, fmt.Errorf("network fee max_fee is invalid: %w", err)
	}
	maxTotalValue := strings.TrimSpace(config.MaxTotal)
	if maxTotalValue == "" {
		maxTotalValue = maxNetworkFeeAbsolute
	}
	maxTotal, err := parseNetworkFeeDecimal(maxTotalValue, false)
	if err != nil {
		return parsed, fmt.Errorf("network fee max_total is invalid: %w", err)
	}
	absolute, _ := decimal.NewFromString(maxNetworkFeeAbsolute)
	if maxFee.GreaterThan(absolute) || maxTotal.GreaterThan(absolute) {
		return parsed, errors.New("network fee limits exceed system absolute bound")
	}
	parsed.timeout = timeout
	parsed.responseLimit = responseLimit
	parsed.maxRetries = retries
	parsed.cacheTTL = cacheTTL
	parsed.quoteTTL = quoteTTL
	parsed.priceMaxAge = priceMaxAge
	parsed.maxPriceDeviation = maxPriceDeviation
	parsed.maxFee = maxFee
	parsed.maxTotal = maxTotal
	for rawNetwork, chain := range config.Chains {
		network, ok := normalizeEstimatorNetwork(rawNetwork)
		if !ok {
			return parsed, fmt.Errorf("network fee network %q is unsupported", rawNetwork)
		}
		if _, exists := parsed.chains[network]; exists {
			return parsed, fmt.Errorf("duplicate network fee network %q", network)
		}
		if strings.TrimSpace(chain.RPCURL) == "" {
			return parsed, fmt.Errorf("network fee %s requires rpc_url", network)
		}
		rpcURL, err := validateNetworkFeeEndpoint(chain.RPCURL, chain.RPCAllowedHosts)
		if err != nil {
			return parsed, fmt.Errorf("network fee %s rpc_url: %w", network, err)
		}
		if err := validateNetworkFeeHostList(chain.PriceAllowedHosts); err != nil {
			return parsed, fmt.Errorf("network fee %s price_allowed_hosts: %w", network, err)
		}
		priceValues := make([]string, 0, len(chain.PriceURLs)+1)
		appendPrice := func(value string) {
			value = strings.TrimSpace(value)
			if value == "" {
				return
			}
			for _, existing := range priceValues {
				if existing == value {
					return
				}
			}
			priceValues = append(priceValues, value)
		}
		// Keep the legacy singular field first so an unchanged configuration
		// preserves its cache/evidence source identity. The array can add
		// independent sources without breaking old callers.
		appendPrice(chain.PriceURL)
		for _, value := range chain.PriceURLs {
			appendPrice(value)
		}
		if len(priceValues) == 0 {
			return parsed, fmt.Errorf("network fee %s requires price_url or price_urls", network)
		}
		if len(priceValues) > maxNetworkFeePriceSources {
			return parsed, fmt.Errorf("network fee %s has too many price sources", network)
		}
		priceURLs := make([]*url.URL, 0, len(priceValues))
		for _, value := range priceValues {
			priceURL, priceErr := validateNetworkFeeEndpoint(value, chain.PriceAllowedHosts)
			if priceErr != nil {
				return parsed, fmt.Errorf("network fee %s price_url: %w", network, priceErr)
			}
			duplicate := false
			for _, existing := range priceURLs {
				if existing.String() == priceURL.String() {
					duplicate = true
					break
				}
			}
			if !duplicate {
				priceURLs = append(priceURLs, priceURL)
			}
		}
		if len(priceURLs) == 0 {
			return parsed, fmt.Errorf("network fee %s has no valid price sources", network)
		}
		nativeAsset := strings.ToUpper(strings.TrimSpace(chain.NativeAsset))
		if nativeAsset == "" {
			nativeAsset = expectedNativeAsset(network)
		}
		if nativeAsset != expectedNativeAsset(network) {
			return parsed, fmt.Errorf("network fee %s native_asset must be %s", network, expectedNativeAsset(network))
		}
		settlementCurrency := strings.ToUpper(strings.TrimSpace(chain.SettlementCurrency))
		if settlementCurrency != "" && !currencyPattern.MatchString(settlementCurrency) {
			return parsed, fmt.Errorf("network fee %s settlement_currency is invalid", network)
		}
		if err := validateNetworkFeeHostList(chain.RPCAllowedHosts); err != nil {
			return parsed, fmt.Errorf("network fee %s rpc_allowed_hosts: %w", network, err)
		}
		parsed.chains[network] = parsedNetworkFeeChainConfig{
			rpcURL:             rpcURL,
			priceURL:           priceURLs[0],
			priceURLs:          priceURLs,
			nativeAsset:        nativeAsset,
			settlementCurrency: settlementCurrency,
			rpcAllowedHosts:    append([]string(nil), chain.RPCAllowedHosts...),
			priceAllowedHosts:  append([]string(nil), chain.PriceAllowedHosts...),
			transaction:        chain.Transaction,
		}
	}
	return parsed, nil
}

// Estimate performs a bounded, fresh quote against the configured chain RPC
// and native-asset price endpoint. It never reads gateway fee fields.
func (estimator *ConfiguredNetworkFeeEstimator) Estimate(ctx context.Context, input NetworkFeeEstimateInput) (NetworkFeeQuote, error) {
	if estimator == nil {
		return NetworkFeeQuote{}, fmt.Errorf("%w: estimator is nil", ErrNetworkFeeUnavailable)
	}
	if ctx == nil {
		return NetworkFeeQuote{}, fmt.Errorf("%w: context is nil", ErrNetworkFeeUnavailable)
	}
	if !estimator.config.dynamicEnabled {
		return NetworkFeeQuote{}, fmt.Errorf("%w: dynamic estimation is disabled", ErrNetworkFeeUnavailable)
	}
	network, ok := normalizeEstimatorNetwork(input.Network)
	if !ok {
		return NetworkFeeQuote{}, fmt.Errorf("%w: unsupported network", ErrNetworkFeeUnavailable)
	}
	chain, ok := estimator.config.chains[network]
	if !ok {
		return NetworkFeeQuote{}, fmt.Errorf("%w: network is not configured", ErrNetworkFeeUnavailable)
	}
	token := strings.ToUpper(strings.TrimSpace(input.Token))
	if token != "USDT" && token != "USDC" && !(network == "tron" && token == "TRX") {
		return NetworkFeeQuote{}, fmt.Errorf("%w: token is unsupported", ErrNetworkFeeUnavailable)
	}
	settlementCurrency := strings.ToUpper(strings.TrimSpace(input.SettlementCurrency))
	if settlementCurrency == "" {
		settlementCurrency = chain.settlementCurrency
	}
	if !currencyPattern.MatchString(settlementCurrency) {
		return NetworkFeeQuote{}, fmt.Errorf("%w: settlement currency is invalid", ErrNetworkFeeUnavailable)
	}
	if input.BaseAmount.LessThanOrEqual(decimal.Zero) || input.BaseAmount.GreaterThan(estimator.config.maxTotal) {
		return NetworkFeeQuote{}, fmt.Errorf("%w: base amount is out of bounds", ErrNetworkFeeUnavailable)
	}
	// The representative transaction is a server-owned security boundary.  Do
	// not accept any transaction fields supplied by the checkout request: even
	// a value that happens to match the configured context would make it too
	// easy for a future caller to accidentally re-introduce request-controlled
	// calldata, payer, or recipient data.  A missing server context is an
	// explicit inability to estimate, never permission to invent a fee.
	if !isEmptyNetworkFeeTransaction(input.Transaction) {
		return NetworkFeeQuote{}, fmt.Errorf("%w: %w: request transaction context cannot override configured context", ErrNetworkFeeUnavailable, ErrInsufficientContext)
	}
	transaction := chain.transaction
	if isEmptyNetworkFeeTransaction(transaction) {
		return NetworkFeeQuote{}, fmt.Errorf("%w: %w: configured transaction context is missing", ErrNetworkFeeUnavailable, ErrInsufficientContext)
	}
	now := estimator.now().UTC()
	if now.IsZero() {
		return NetworkFeeQuote{}, fmt.Errorf("%w: estimator clock is invalid", ErrNetworkFeeUnavailable)
	}
	if err := ctx.Err(); err != nil {
		return NetworkFeeQuote{}, fmt.Errorf("%w: request context is done: %v", ErrNetworkFeeUnavailable, err)
	}
	cacheKey := networkFeeQuoteCacheKey(network, NetworkFeeEstimateInput{
		Token:              token,
		Network:            network,
		SettlementCurrency: settlementCurrency,
		BaseAmount:         input.BaseAmount,
		Transaction:        transaction,
	}, transaction)
	if cached, ok := estimator.quoteCache.get(cacheKey, now); ok {
		if estimator.cachedQuoteIsFresh(cached, now) {
			return cached, nil
		}
		estimator.quoteCache.delete(cacheKey)
	}
	ctx, cancel := context.WithTimeout(ctx, estimator.config.timeout)
	defer cancel()

	var rawEstimate chainRawNetworkEstimate
	var err error
	switch network {
	case "tron":
		rawEstimate, err = estimator.estimateTRON(ctx, chain, token, transaction)
	case "ethereum", "binance":
		rawEstimate, err = estimator.estimateEVM(ctx, chain, token, transaction)
	case "solana":
		rawEstimate, err = estimator.estimateSolana(ctx, chain, token, transaction)
	default:
		err = errors.New("network is unsupported")
	}
	if err != nil {
		// Preserve the typed cause (notably ErrInsufficientContext) while
		// consistently exposing the fail-closed unavailable sentinel to callers.
		return NetworkFeeQuote{}, fmt.Errorf("%w: %w", ErrNetworkFeeUnavailable, err)
	}
	price, priceTimestamp, priceSource, err := estimator.fetchNativePrice(ctx, chain, settlementCurrency, now)
	if err != nil {
		return NetworkFeeQuote{}, fmt.Errorf("%w: %w", ErrNetworkFeeUnavailable, err)
	}
	if rawEstimate.NativeAmount.IsNegative() {
		return NetworkFeeQuote{}, fmt.Errorf("%w: native amount is negative", ErrNetworkFeeUnavailable)
	}
	fee := rawEstimate.NativeAmount.Mul(price)
	if fee.IsNegative() || !decimalIsFinite(fee) || fee.GreaterThan(estimator.config.maxFee) {
		return NetworkFeeQuote{}, fmt.Errorf("%w: fee exceeds configured bound", ErrNetworkFeeUnavailable)
	}
	total := input.BaseAmount.Add(fee)
	if !decimalIsFinite(total) || total.GreaterThan(estimator.config.maxTotal) {
		return NetworkFeeQuote{}, fmt.Errorf("%w: total exceeds configured bound", ErrNetworkFeeUnavailable)
	}
	quotedAt := now
	expiresAt := quotedAt.Add(estimator.config.quoteTTL)
	evidence := rawEstimate.Evidence
	evidence.PriceTimestamp = priceTimestamp.Unix()
	evidence.PriceSource = priceSource
	if evidence.RPCSource == "" {
		evidence.RPCSource = endpointSource(chain.rpcURL)
	}
	if evidence.RPCMethod == "" && len(evidence.RPCMethods) > 0 {
		evidence.RPCMethod = evidence.RPCMethods[0]
	}
	quote := NetworkFeeQuote{
		Token:              token,
		Network:            network,
		Source:             ChainNetworkEstimateSource,
		EstimatorVersion:   NetworkFeeEstimatorVersion,
		NativeAsset:        chain.nativeAsset,
		NativeAmount:       rawEstimate.NativeAmount,
		FeeAmount:          fee,
		BaseAmount:         input.BaseAmount,
		TotalAmount:        total,
		SettlementCurrency: settlementCurrency,
		QuotedAt:           quotedAt,
		ExpiresAt:          expiresAt,
		Confidence:         rawEstimate.Confidence,
		Subsidized:         rawEstimate.Subsidized,
		Evidence:           evidence,
	}
	if !quote.ExpiresAt.After(quote.QuotedAt) {
		return NetworkFeeQuote{}, fmt.Errorf("%w: quote expiry is invalid", ErrNetworkFeeUnavailable)
	}
	estimator.quoteCache.put(cacheKey, quote, now, estimator.config.cacheTTL)
	return quote, nil
}

// cachedQuoteIsFresh re-applies the price observation age bound on every
// cache hit.  Cache TTL and price max-age are independently configurable; a
// long cache must never turn an otherwise stale price observation into a new
// payment quote.
func (estimator *ConfiguredNetworkFeeEstimator) cachedQuoteIsFresh(quote NetworkFeeQuote, now time.Time) bool {
	if estimator == nil || quote.ExpiresAt.IsZero() || !quote.ExpiresAt.After(now) {
		return false
	}
	if quote.Evidence.PriceTimestamp <= 0 {
		return false
	}
	priceTimestamp := time.Unix(quote.Evidence.PriceTimestamp, 0).UTC()
	return !priceTimestamp.After(now.Add(5*time.Minute)) && now.Sub(priceTimestamp) <= estimator.config.priceMaxAge
}

// networkFeeQuoteCacheKey returns a stable, non-sensitive key for one
// estimation request. Transaction contents (which may include addresses and
// calldata/message) are represented only by a SHA-256 digest; endpoint URLs,
// credentials, and raw transaction data never enter the key. The plain fields
// make it possible to reason about cache partitions while the digest prevents
// collisions between otherwise identical selectors.
func networkFeeQuoteCacheKey(network string, input NetworkFeeEstimateInput, transaction NetworkFeeTransactionContext) string {
	network, ok := normalizeEstimatorNetwork(network)
	if !ok {
		network = strings.ToLower(strings.TrimSpace(network))
	}
	token := strings.ToUpper(strings.TrimSpace(input.Token))
	currency := strings.ToUpper(strings.TrimSpace(input.SettlementCurrency))
	method := networkFeeCacheMethod(network)
	return fmt.Sprintf("v1|network=%s|method=%s|token=%s|currency=%s|base=%s|tx=%s",
		network,
		method,
		token,
		currency,
		input.BaseAmount.String(),
		networkFeeTransactionDigest(transaction),
	)
}

func networkFeeCacheMethod(network string) string {
	switch network {
	case "tron":
		return "wallet/getaccountresource"
	case "ethereum", "binance":
		return "eth_estimateGas"
	case "solana":
		return "getFeeForMessage"
	default:
		return "unknown"
	}
}

func networkFeeTransactionDigest(transaction NetworkFeeTransactionContext) string {
	// Normalize aliases and whitespace before hashing so equivalent server
	// representations share a cache entry, while retaining every field that can
	// affect an RPC request or its fee calculation.
	canonical := struct {
		From                    string `json:"from,omitempty"`
		Payer                   string `json:"payer,omitempty"`
		To                      string `json:"to,omitempty"`
		Recipient               string `json:"recipient,omitempty"`
		TokenContract           string `json:"token_contract,omitempty"`
		Contract                string `json:"contract,omitempty"`
		TokenMint               string `json:"token_mint,omitempty"`
		SourceTokenAccount      string `json:"source_token_account,omitempty"`
		RecipientTokenAccount   string `json:"recipient_token_account,omitempty"`
		TransferInstruction     string `json:"transfer_instruction,omitempty"`
		TransferAmountBaseUnits string `json:"transfer_amount_base_units,omitempty"`
		TokenDecimals           uint8  `json:"token_decimals,omitempty"`
		RecentBlockhash         string `json:"recent_blockhash,omitempty"`
		TokenProgramID          string `json:"token_program_id,omitempty"`
		InstructionData         string `json:"instruction_data,omitempty"`
		Data                    string `json:"data,omitempty"`
		Calldata                string `json:"calldata,omitempty"`
		Message                 string `json:"message,omitempty"`
		FunctionSelector        string `json:"function_selector,omitempty"`
		BandwidthBytes          uint64 `json:"bandwidth_bytes,omitempty"`
		ComputeUnits            uint64 `json:"compute_units,omitempty"`
		PriorityFeePerUnit      string `json:"priority_fee_per_unit,omitempty"`
		PriorityFeeLamports     string `json:"priority_fee_lamports,omitempty"`
		Batch                   bool   `json:"batch,omitempty"`
	}{
		From:                    strings.TrimSpace(transaction.From),
		Payer:                   strings.TrimSpace(transaction.Payer),
		To:                      strings.TrimSpace(transaction.To),
		Recipient:               strings.TrimSpace(transaction.Recipient),
		TokenContract:           strings.TrimSpace(transaction.TokenContract),
		Contract:                strings.TrimSpace(transaction.Contract),
		TokenMint:               strings.TrimSpace(transaction.TokenMint),
		SourceTokenAccount:      strings.TrimSpace(transaction.SourceTokenAccount),
		RecipientTokenAccount:   strings.TrimSpace(transaction.RecipientTokenAccount),
		TransferInstruction:     strings.TrimSpace(transaction.TransferInstruction),
		TransferAmountBaseUnits: strings.TrimSpace(transaction.TransferAmountBaseUnits),
		TokenDecimals:           transaction.TokenDecimals,
		RecentBlockhash:         strings.TrimSpace(transaction.RecentBlockhash),
		TokenProgramID:          strings.TrimSpace(transaction.TokenProgramID),
		InstructionData:         strings.TrimSpace(transaction.InstructionData),
		Data:                    strings.TrimSpace(transaction.Data),
		Calldata:                strings.TrimSpace(transaction.Calldata),
		Message:                 strings.TrimSpace(transaction.Message),
		FunctionSelector:        strings.TrimSpace(transaction.FunctionSelector),
		BandwidthBytes:          transaction.BandwidthBytes,
		ComputeUnits:            transaction.ComputeUnits,
		PriorityFeePerUnit:      strings.TrimSpace(transaction.PriorityFeePerUnit),
		PriorityFeeLamports:     strings.TrimSpace(transaction.PriorityFeeLamports),
		Batch:                   transaction.Batch,
	}
	payload, err := common.Marshal(canonical)
	if err != nil {
		// The canonical value contains only primitive fields and cannot fail to
		// marshal. Keep a deterministic fallback if that invariant ever changes.
		payload = []byte(fmt.Sprintf("%#v", canonical))
	}
	digest := sha256.Sum256(payload)
	return hex.EncodeToString(digest[:])
}

func (cache *networkFeeQuoteCache) get(key string, now time.Time) (NetworkFeeQuote, bool) {
	if cache == nil || key == "" {
		return NetworkFeeQuote{}, false
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.entries == nil {
		return NetworkFeeQuote{}, false
	}
	entry, ok := cache.entries[key]
	if !ok {
		return NetworkFeeQuote{}, false
	}
	if !now.Before(entry.expiresAt) {
		delete(cache.entries, key)
		return NetworkFeeQuote{}, false
	}
	entry.lastUsed = now
	cache.entries[key] = entry
	return cloneNetworkFeeQuote(entry.quote), true
}

func (cache *networkFeeQuoteCache) put(key string, quote NetworkFeeQuote, now time.Time, ttl time.Duration) {
	if cache == nil || key == "" || ttl <= 0 || !now.Before(quote.ExpiresAt) {
		return
	}
	expiresAt := now.Add(ttl)
	if quote.ExpiresAt.Before(expiresAt) {
		expiresAt = quote.ExpiresAt
	}
	if !expiresAt.After(now) {
		return
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.entries == nil {
		cache.entries = make(map[string]networkFeeQuoteCacheEntry)
	}
	for existingKey, entry := range cache.entries {
		if !now.Before(entry.expiresAt) {
			delete(cache.entries, existingKey)
		}
	}
	if _, exists := cache.entries[key]; !exists && len(cache.entries) >= maxNetworkFeeCacheEntries {
		cache.evictOldestLocked()
	}
	cache.entries[key] = networkFeeQuoteCacheEntry{
		quote:     cloneNetworkFeeQuote(quote),
		expiresAt: expiresAt,
		lastUsed:  now,
	}
}

func (cache *networkFeeQuoteCache) delete(key string) {
	if cache == nil || key == "" {
		return
	}
	cache.mu.Lock()
	delete(cache.entries, key)
	cache.mu.Unlock()
}

func (cache *networkFeeQuoteCache) evictOldestLocked() {
	var oldestKey string
	var oldest time.Time
	for key, entry := range cache.entries {
		if oldestKey == "" || entry.lastUsed.Before(oldest) {
			oldestKey = key
			oldest = entry.lastUsed
		}
	}
	if oldestKey != "" {
		delete(cache.entries, oldestKey)
	}
}

func cloneNetworkFeeQuote(quote NetworkFeeQuote) NetworkFeeQuote {
	quote.Evidence.RPCMethods = append([]string(nil), quote.Evidence.RPCMethods...)
	return quote
}

type chainRawNetworkEstimate struct {
	NativeAmount decimal.Decimal
	Evidence     NetworkFeeEvidence
	Confidence   string
	Subsidized   bool
}

func (estimator *ConfiguredNetworkFeeEstimator) estimateEVM(ctx context.Context, chain parsedNetworkFeeChainConfig, token string, transaction NetworkFeeTransactionContext) (chainRawNetworkEstimate, error) {
	from := strings.TrimSpace(transaction.From)
	contract := strings.TrimSpace(firstNonEmpty(transaction.TokenContract, transaction.Contract))
	recipient := strings.TrimSpace(firstNonEmpty(transaction.Recipient, transaction.To))
	data := strings.TrimSpace(firstNonEmpty(transaction.Calldata, transaction.Data))
	if !evMAddressPattern.MatchString(from) || !evMAddressPattern.MatchString(contract) || !evMAddressPattern.MatchString(recipient) {
		return chainRawNetworkEstimate{}, ErrNetworkFeeContextMissing
	}
	if !validNetworkFeeHexData(data) || len(data) > maxNetworkFeeContextLength {
		return chainRawNetworkEstimate{}, ErrNetworkFeeContextMissing
	}
	if err := validateEVMERC20TransferCalldata(data, recipient); err != nil {
		return chainRawNetworkEstimate{}, err
	}
	txObject := map[string]any{"from": from, "to": contract, "data": data}
	gasResult, err := estimator.callJSONRPC(ctx, chain.rpcURL, "eth_estimateGas", []any{txObject})
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	gas, err := parseHexQuantity(gasResult.Raw)
	if err != nil || gas.LessThanOrEqual(decimal.Zero) {
		return chainRawNetworkEstimate{}, errors.New("eth_estimateGas returned an invalid quantity")
	}

	methods := []string{"eth_estimateGas"}
	gasPrice := decimal.Zero
	gasPriceResult, gasPriceErr := estimator.callJSONRPC(ctx, chain.rpcURL, "eth_gasPrice", []any{})
	if gasPriceErr == nil {
		gasPrice, err = parseHexQuantity(gasPriceResult.Raw)
		if err != nil || gasPrice.LessThanOrEqual(decimal.Zero) {
			gasPriceErr = errors.New("eth_gasPrice returned an invalid quantity")
		}
	}
	if gasPriceErr == nil {
		methods = append(methods, "eth_gasPrice")
	}

	baseFee, priorityFee, block, feeHistoryErr := estimator.evmFeeHistory(ctx, chain.rpcURL)
	if feeHistoryErr == nil {
		methods = append(methods, "eth_feeHistory")
		candidate := baseFee.Add(priorityFee)
		if gasPriceErr != nil || candidate.GreaterThan(gasPrice) {
			gasPrice = candidate
		}
	} else if gasPriceErr != nil {
		return chainRawNetworkEstimate{}, fmt.Errorf("gas price unavailable: %v; fee history: %v", gasPriceErr, feeHistoryErr)
	}
	if gasPrice.LessThanOrEqual(decimal.Zero) {
		return chainRawNetworkEstimate{}, errors.New("gas price is zero")
	}
	nativeAmount := gas.Mul(gasPrice).Div(decimal.RequireFromString(evmWeiPerNative))
	if !decimalIsFinite(nativeAmount) {
		return chainRawNetworkEstimate{}, errors.New("evm native amount is invalid")
	}
	return chainRawNetworkEstimate{
		NativeAmount: nativeAmount,
		Confidence:   "high",
		Evidence: NetworkFeeEvidence{
			RPCMethod:  "eth_estimateGas",
			RPCMethods: methods,
			Block:      block,
			Gas:        gas.String(),
			GasPrice:   gasPrice.String(),
		},
	}, nil
}

func validateEVMERC20TransferCalldata(data, recipient string) error {
	dataBytes, err := decodeHexBytes(data)
	if err != nil {
		return fmt.Errorf("%w: EVM ERC-20 calldata is invalid", ErrInsufficientContext)
	}
	if len(dataBytes) != 68 {
		return fmt.Errorf("%w: EVM ERC-20 calldata must contain exactly 68 bytes", ErrInsufficientContext)
	}
	if !strings.EqualFold(hex.EncodeToString(dataBytes[:4]), evmERC20TransferSelector) {
		return fmt.Errorf("%w: EVM ERC-20 calldata selector is invalid", ErrInsufficientContext)
	}
	recipient = strings.TrimSpace(recipient)
	if !evMAddressPattern.MatchString(recipient) {
		return fmt.Errorf("%w: EVM ERC-20 recipient is invalid", ErrInsufficientContext)
	}
	recipientBytes, err := hex.DecodeString(recipient[2:])
	if err != nil || len(recipientBytes) != 20 {
		return fmt.Errorf("%w: EVM ERC-20 recipient is invalid", ErrInsufficientContext)
	}
	if !bytes.Equal(dataBytes[4:16], make([]byte, 12)) || !bytes.Equal(dataBytes[16:36], recipientBytes) {
		return fmt.Errorf("%w: EVM ERC-20 calldata recipient does not match context", ErrInsufficientContext)
	}
	if new(big.Int).SetBytes(dataBytes[36:]).Sign() <= 0 {
		return fmt.Errorf("%w: EVM ERC-20 calldata amount must be non-zero", ErrInsufficientContext)
	}
	return nil
}

func (estimator *ConfiguredNetworkFeeEstimator) evmFeeHistory(ctx context.Context, endpoint *url.URL) (decimal.Decimal, decimal.Decimal, string, error) {
	result, err := estimator.callJSONRPC(ctx, endpoint, "eth_feeHistory", []any{"0x1", "latest", []int{50}})
	if err != nil {
		return decimal.Zero, decimal.Zero, "", err
	}
	var history struct {
		OldestBlock   string     `json:"oldestBlock"`
		BaseFeePerGas []string   `json:"baseFeePerGas"`
		Reward        [][]string `json:"reward"`
	}
	if err := common.Unmarshal(result.Raw, &history); err != nil || len(history.BaseFeePerGas) == 0 {
		return decimal.Zero, decimal.Zero, "", errors.New("eth_feeHistory response is invalid")
	}
	baseFee, err := parseHexQuantityString(history.BaseFeePerGas[len(history.BaseFeePerGas)-1])
	if err != nil {
		return decimal.Zero, decimal.Zero, "", err
	}
	priorityFee := decimal.Zero
	if len(history.Reward) == 0 || len(history.Reward[len(history.Reward)-1]) == 0 {
		// A base fee without a priority fee is not an all-in gas price and would
		// systematically underquote transactions.  Let estimateEVM fall back to
		// eth_gasPrice when available; otherwise fail closed.
		return decimal.Zero, decimal.Zero, "", errors.New("eth_feeHistory priority fee is unavailable")
	}
	priorityFee, err = parseHexQuantityString(history.Reward[len(history.Reward)-1][0])
	if err != nil {
		return decimal.Zero, decimal.Zero, "", err
	}
	if priorityFee.LessThanOrEqual(decimal.Zero) {
		// Treat an explicit zero priority fee as unavailable as well.  Unless the
		// provider can supply an all-in eth_gasPrice value, using base fee alone
		// would underquote the transaction.
		return decimal.Zero, decimal.Zero, "", errors.New("eth_feeHistory priority fee is unavailable")
	}
	if baseFee.LessThanOrEqual(decimal.Zero) && priorityFee.LessThanOrEqual(decimal.Zero) {
		return decimal.Zero, decimal.Zero, "", errors.New("eth_feeHistory fees are zero")
	}
	return baseFee, priorityFee, history.OldestBlock, nil
}

func (estimator *ConfiguredNetworkFeeEstimator) estimateSolana(ctx context.Context, chain parsedNetworkFeeChainConfig, token string, transaction NetworkFeeTransactionContext) (chainRawNetworkEstimate, error) {
	payer := strings.TrimSpace(firstNonEmpty(transaction.Payer, transaction.From))
	recipient := strings.TrimSpace(firstNonEmpty(transaction.Recipient, transaction.To, transaction.RecipientTokenAccount))
	mint := strings.TrimSpace(transaction.TokenMint)
	if !IsGMPayAddress("solana", payer) || !IsGMPayAddress("solana", recipient) || !IsGMPayAddress("solana", mint) {
		return chainRawNetworkEstimate{}, ErrNetworkFeeContextMissing
	}

	// Prefer constructing a canonical transferChecked message whenever the
	// explicit collection fields are present. If an older configuration only
	// has a prebuilt message, parse it and prove that its payer, destination,
	// mint, token program and transfer instruction agree with the configured
	// context before sending it to getFeeForMessage.
	message, parsedMessage, err := prepareSolanaMessage(transaction)
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	result, err := estimator.callJSONRPC(ctx, chain.rpcURL, "getFeeForMessage", []any{message, map[string]string{"commitment": "confirmed"}})
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	lamports, slot, err := parseSolanaFeeResult(result.Raw)
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	methods := []string{"getFeeForMessage"}
	if strings.TrimSpace(transaction.PriorityFeeLamports) != "" {
		priority, parseErr := parseNetworkFeeIntegerDecimal(transaction.PriorityFeeLamports, true)
		if parseErr != nil {
			return chainRawNetworkEstimate{}, fmt.Errorf("priority fee is invalid: %w", parseErr)
		}
		lamports = lamports.Add(priority)
	} else if strings.TrimSpace(transaction.PriorityFeePerUnit) != "" {
		if transaction.ComputeUnits == 0 {
			return chainRawNetworkEstimate{}, ErrNetworkFeeContextMissing
		}
		unit, parseErr := parseNetworkFeeDecimal(transaction.PriorityFeePerUnit, true)
		if parseErr != nil {
			return chainRawNetworkEstimate{}, fmt.Errorf("priority fee is invalid: %w", parseErr)
		}
		// Solana's compute unit price is expressed in micro-lamports per
		// compute unit. Convert the product back to lamports and round up to
		// the next whole lamport, matching the protocol's prioritization-fee
		// calculation.
		priorityLamports := unit.Mul(decimal.NewFromInt(int64(transaction.ComputeUnits))).Div(decimal.NewFromInt(1_000_000)).Ceil()
		lamports = lamports.Add(priorityLamports)
	}
	if lamports.IsNegative() || !decimalIsFinite(lamports) {
		return chainRawNetworkEstimate{}, errors.New("solana lamports are invalid")
	}
	nativeAmount := lamports.Div(decimal.RequireFromString(solanaLamportsPerSOL))
	evidence := NetworkFeeEvidence{RPCMethod: "getFeeForMessage", RPCMethods: methods, Lamports: lamports.String(), Slot: slot}
	if parsedMessage.versioned {
		evidence.RPCSource = "solana-v0-message"
	} else {
		evidence.RPCSource = "solana-legacy-message"
	}
	return chainRawNetworkEstimate{NativeAmount: nativeAmount, Evidence: evidence, Confidence: "high", Subsidized: lamports.IsZero()}, nil
}

// solanaCompiledInstruction and solanaParsedMessage contain only the parts of
// a Solana legacy/v0 message needed to prove the representative transfer
// context. Address-table lookup addresses are deliberately not resolved: a
// context that depends on an unresolved lookup cannot be trusted and is
// rejected by validateSolanaMessageContext.
type solanaCompiledInstruction struct {
	programIDIndex uint8
	accountIndices []uint8
	data           []byte
}

type solanaParsedMessage struct {
	versioned          bool
	requiredSignatures uint8
	accountKeys        [][]byte
	recentBlockhash    []byte
	instructions       []solanaCompiledInstruction
}

func prepareSolanaMessage(transaction NetworkFeeTransactionContext) (string, solanaParsedMessage, error) {
	if solanaHasConstructionFields(transaction) {
		constructed, err := buildSolanaTransferMessage(transaction)
		if err != nil {
			return "", solanaParsedMessage{}, err
		}
		parsed, err := parseSolanaMessage(constructed)
		if err != nil {
			return "", solanaParsedMessage{}, fmt.Errorf("%w: constructed message is invalid", ErrInsufficientContext)
		}
		if err := validateSolanaMessageContext(parsed, transaction); err != nil {
			return "", solanaParsedMessage{}, err
		}
		// If a legacy opaque message is retained alongside the structured fields,
		// require byte-for-byte identity with the controlled construction. This
		// prevents an operator from editing payer/mint fields while the RPC still
		// receives an unrelated message.
		if strings.TrimSpace(transaction.Message) != "" {
			opaque, err := decodeSolanaMessage(transaction.Message)
			if err != nil || !bytes.Equal(opaque, constructed) {
				return "", solanaParsedMessage{}, fmt.Errorf("%w: configured message differs from structured context", ErrInsufficientContext)
			}
		}
		return base64.StdEncoding.EncodeToString(constructed), parsed, nil
	}
	decoded, err := decodeSolanaMessage(transaction.Message)
	if err != nil {
		return "", solanaParsedMessage{}, err
	}
	parsed, err := parseSolanaMessage(decoded)
	if err != nil {
		return "", solanaParsedMessage{}, fmt.Errorf("%w: message cannot be parsed", ErrInsufficientContext)
	}
	if err := validateSolanaMessageContext(parsed, transaction); err != nil {
		return "", solanaParsedMessage{}, err
	}
	return base64.StdEncoding.EncodeToString(decoded), parsed, nil
}

func solanaHasConstructionFields(transaction NetworkFeeTransactionContext) bool {
	return strings.TrimSpace(transaction.SourceTokenAccount) != "" ||
		strings.TrimSpace(transaction.RecipientTokenAccount) != "" ||
		strings.TrimSpace(transaction.TransferInstruction) != "" ||
		strings.TrimSpace(transaction.TransferAmountBaseUnits) != "" ||
		strings.TrimSpace(transaction.RecentBlockhash) != "" ||
		strings.TrimSpace(transaction.TokenProgramID) != "" ||
		strings.TrimSpace(transaction.InstructionData) != ""
}

func decodeSolanaMessage(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > maxNetworkFeeContextLength {
		return nil, ErrNetworkFeeContextMissing
	}
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(value)
	}
	if err != nil || len(decoded) == 0 || len(decoded) > maxNetworkFeeContextLength {
		return nil, ErrNetworkFeeContextMissing
	}
	return decoded, nil
}

func solanaAddressBytes(value string) ([]byte, error) {
	decoded, ok := decodeGMPayBase58(strings.TrimSpace(value))
	if !ok || len(decoded) != 32 {
		return nil, ErrNetworkFeeContextMissing
	}
	return decoded, nil
}

func solanaKnownProgramBytes(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		value = solanaTokenProgramID
	}
	if value != solanaTokenProgramID && value != solanaToken2022ProgramID {
		return nil, ErrNetworkFeeContextMissing
	}
	return solanaAddressBytes(value)
}

// normalizeSolanaTransferInstruction keeps the administrator-facing schema
// readable while reducing the two SPL Token instruction spellings to the
// protocol names used by the serializer. An empty value is intentionally
// preserved for legacy opaque messages; structured construction defaults to
// transferChecked so the configured mint is encoded and bound in the message.
func normalizeSolanaTransferInstruction(value string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "":
		return "", nil
	case "transfer":
		return "transfer", nil
	case "transferchecked", "transfer_checked", "transfer-checked":
		return "transferChecked", nil
	default:
		return "", fmt.Errorf("%w: unsupported Solana transfer instruction", ErrInsufficientContext)
	}
}

func buildSolanaTransferMessage(transaction NetworkFeeTransactionContext) ([]byte, error) {
	payer := firstNonEmpty(transaction.Payer, transaction.From)
	recipientOwner := firstNonEmpty(transaction.Recipient, transaction.To)
	sourceToken := strings.TrimSpace(transaction.SourceTokenAccount)
	destinationToken := strings.TrimSpace(firstNonEmpty(transaction.RecipientTokenAccount, recipientOwner))
	// The destination token account is sufficient to construct an SPL transfer;
	// older editor schemas did not collect the owning wallet separately. Keep
	// the owner optional and only add it to the message when explicitly set.
	if recipientOwner == "" {
		recipientOwner = destinationToken
	}
	mint := strings.TrimSpace(transaction.TokenMint)
	if payer == "" || destinationToken == "" || sourceToken == "" || mint == "" || strings.TrimSpace(transaction.TransferAmountBaseUnits) == "" || strings.TrimSpace(transaction.RecentBlockhash) == "" {
		return nil, fmt.Errorf("%w: payer, token accounts, mint, amount and recent blockhash are required", ErrInsufficientContext)
	}
	if transaction.TokenDecimals > maxSolanaTokenDecimals {
		return nil, fmt.Errorf("%w: token decimals are out of bounds", ErrInsufficientContext)
	}
	payerBytes, err := solanaAddressBytes(payer)
	if err != nil {
		return nil, err
	}
	sourceBytes, err := solanaAddressBytes(sourceToken)
	if err != nil {
		return nil, err
	}
	destinationBytes, err := solanaAddressBytes(destinationToken)
	if err != nil {
		return nil, err
	}
	mintBytes, err := solanaAddressBytes(mint)
	if err != nil {
		return nil, err
	}
	transferInstruction, err := normalizeSolanaTransferInstruction(transaction.TransferInstruction)
	if err != nil {
		return nil, err
	}
	if transferInstruction == "" {
		transferInstruction = "transferChecked"
	}
	// A transfer with aliased account keys would make the instruction's role
	// binding ambiguous (for example, treating the mint as the destination),
	// so require distinct controlled accounts before serializing the message.
	if bytes.Equal(payerBytes, sourceBytes) || bytes.Equal(payerBytes, destinationBytes) || bytes.Equal(payerBytes, mintBytes) ||
		bytes.Equal(sourceBytes, destinationBytes) || bytes.Equal(sourceBytes, mintBytes) || bytes.Equal(destinationBytes, mintBytes) {
		return nil, fmt.Errorf("%w: Solana account context contains duplicate accounts", ErrInsufficientContext)
	}
	programBytes, err := solanaKnownProgramBytes(transaction.TokenProgramID)
	if err != nil {
		return nil, err
	}
	blockhash, ok := decodeGMPayBase58(strings.TrimSpace(transaction.RecentBlockhash))
	if !ok || len(blockhash) != 32 {
		return nil, fmt.Errorf("%w: recent blockhash is invalid", ErrInsufficientContext)
	}
	amount, err := parseNetworkFeeIntegerDecimal(transaction.TransferAmountBaseUnits, true)
	if err != nil {
		return nil, fmt.Errorf("%w: transfer amount is invalid", ErrInsufficientContext)
	}
	maxUint64 := decimal.NewFromBigInt(new(big.Int).SetUint64(^uint64(0)), 0)
	if amount.GreaterThan(maxUint64) {
		return nil, fmt.Errorf("%w: transfer amount exceeds uint64", ErrInsufficientContext)
	}
	amountBytes := make([]byte, 8)
	binary.LittleEndian.PutUint64(amountBytes, amount.BigInt().Uint64())
	var instructionData []byte
	var instructionAccountCount int
	if transferInstruction == "transferChecked" {
		instructionData = append([]byte{12}, amountBytes...)
		instructionData = append(instructionData, transaction.TokenDecimals)
		instructionAccountCount = 4
	} else {
		instructionData = append([]byte{3}, amountBytes...)
		instructionAccountCount = 3
	}
	if configuredData := strings.TrimSpace(transaction.InstructionData); configuredData != "" {
		provided, decodeErr := decodeHexBytes(configuredData)
		if decodeErr != nil || !bytes.Equal(provided, instructionData) {
			return nil, fmt.Errorf("%w: instruction_data does not match transfer context", ErrInsufficientContext)
		}
	}

	keys := make([][]byte, 0, 6)
	addKey := func(key []byte) uint8 {
		for index, existing := range keys {
			if bytes.Equal(existing, key) {
				return uint8(index)
			}
		}
		keys = append(keys, append([]byte(nil), key...))
		return uint8(len(keys) - 1)
	}
	payerIndex := addKey(payerBytes)
	sourceIndex := addKey(sourceBytes)
	destinationIndex := addKey(destinationBytes)
	mintIndex := addKey(mintBytes)
	programIndex := addKey(programBytes)
	if strings.TrimSpace(firstNonEmpty(transaction.Recipient, transaction.To)) != "" {
		if recipientBytes, recipientErr := solanaAddressBytes(recipientOwner); recipientErr == nil && !bytes.Equal(recipientBytes, destinationBytes) {
			addKey(recipientBytes)
		}
	}
	if payerIndex != 0 || sourceIndex == 0 || destinationIndex == 0 || mintIndex == 0 || programIndex == 0 {
		return nil, fmt.Errorf("%w: Solana account context is ambiguous", ErrInsufficientContext)
	}
	readonlyUnsigned := uint8(0)
	for index := 1; index < len(keys); index++ {
		if index == int(mintIndex) || index == int(programIndex) || (!bytes.Equal(keys[index], sourceBytes) && !bytes.Equal(keys[index], destinationBytes)) {
			readonlyUnsigned++
		}
	}
	message := make([]byte, 0, 256)
	message = append(message, 1, 0, readonlyUnsigned)
	message = appendSolanaShortVec(message, len(keys))
	for _, key := range keys {
		message = append(message, key...)
	}
	message = append(message, blockhash...)
	message = appendSolanaShortVec(message, 1)
	message = append(message, programIndex)
	message = appendSolanaShortVec(message, instructionAccountCount)
	// SPL Token transferChecked uses the canonical account order source, mint,
	// destination, authority. The plain transfer instruction omits mint and
	// uses source, destination, authority. Keep both orders explicit so RPC
	// simulation and opaque-message validation agree on the authorized transfer.
	if transferInstruction == "transferChecked" {
		message = append(message, sourceIndex, mintIndex, destinationIndex, payerIndex)
	} else {
		message = append(message, sourceIndex, destinationIndex, payerIndex)
	}
	message = appendSolanaShortVec(message, len(instructionData))
	message = append(message, instructionData...)
	return message, nil
}

func decodeHexBytes(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	if strings.HasPrefix(value, "0x") || strings.HasPrefix(value, "0X") {
		value = value[2:]
	}
	if value == "" || len(value)%2 != 0 || !hexDataPattern.MatchString(value) {
		return nil, errors.New("hex bytes are invalid")
	}
	decoded, err := hex.DecodeString(value)
	if err != nil {
		return nil, err
	}
	return decoded, nil
}

func appendSolanaShortVec(dst []byte, value int) []byte {
	for value >= 0x80 {
		dst = append(dst, byte(value)|0x80)
		value >>= 7
	}
	return append(dst, byte(value))
}

func readSolanaShortVec(raw []byte, offset *int, limit int) (int, error) {
	if offset == nil || limit < 0 {
		return 0, errors.New("short vector is invalid")
	}
	var value uint64
	for shift := uint(0); shift <= 28; shift += 7 {
		if *offset >= len(raw) {
			return 0, errors.New("short vector is truncated")
		}
		current := raw[*offset]
		*offset = *offset + 1
		value |= uint64(current&0x7f) << shift
		if current&0x80 == 0 {
			// Solana short vectors use the shortest representation. A terminating
			// zero payload after a continuation byte would be an overlong encoding
			// (for example 0x80,0x00 for zero) and is rejected as malformed.
			if shift > 0 && current&0x7f == 0 {
				return 0, errors.New("short vector is not canonically encoded")
			}
			if value > uint64(limit) {
				return 0, errors.New("short vector exceeds limit")
			}
			return int(value), nil
		}
	}
	return 0, errors.New("short vector overflows")
}

func parseSolanaMessage(raw []byte) (solanaParsedMessage, error) {
	if len(raw) < 3 || len(raw) > maxNetworkFeeContextLength {
		return solanaParsedMessage{}, errors.New("Solana message is invalid")
	}
	offset := 0
	versioned := raw[0]&0x80 != 0
	if versioned {
		if raw[0]&0x7f != 0 { // only v0 is currently supported
			return solanaParsedMessage{}, errors.New("unsupported Solana message version")
		}
		offset++
	}
	if len(raw)-offset < 3 {
		return solanaParsedMessage{}, errors.New("Solana message header is truncated")
	}
	required := raw[offset]
	readonlySigned := raw[offset+1]
	readonlyUnsigned := raw[offset+2]
	offset += 3
	accountCount, err := readSolanaShortVec(raw, &offset, 256)
	if err != nil || accountCount == 0 || int(required) > accountCount || int(readonlySigned) > int(required) || int(readonlyUnsigned) > accountCount-int(required) {
		return solanaParsedMessage{}, errors.New("Solana message account header is invalid")
	}
	if len(raw)-offset < accountCount*32+32 {
		return solanaParsedMessage{}, errors.New("Solana message accounts are truncated")
	}
	accounts := make([][]byte, accountCount)
	for index := range accounts {
		accounts[index] = append([]byte(nil), raw[offset:offset+32]...)
		offset += 32
	}
	blockhash := append([]byte(nil), raw[offset:offset+32]...)
	offset += 32
	instructionCount, err := readSolanaShortVec(raw, &offset, 1024)
	if err != nil {
		return solanaParsedMessage{}, errors.New("Solana message instructions are invalid")
	}
	instructions := make([]solanaCompiledInstruction, 0, instructionCount)
	for index := 0; index < instructionCount; index++ {
		if offset >= len(raw) {
			return solanaParsedMessage{}, errors.New("Solana instruction is truncated")
		}
		programIndex := raw[offset]
		offset++
		if int(programIndex) >= accountCount {
			return solanaParsedMessage{}, errors.New("Solana instruction program index is invalid")
		}
		accountIndexCount, readErr := readSolanaShortVec(raw, &offset, 256)
		if readErr != nil || offset+accountIndexCount > len(raw) {
			return solanaParsedMessage{}, errors.New("Solana instruction account list is invalid")
		}
		indices := append([]byte(nil), raw[offset:offset+accountIndexCount]...)
		offset += accountIndexCount
		for _, accountIndex := range indices {
			if int(accountIndex) >= accountCount {
				return solanaParsedMessage{}, errors.New("Solana instruction account index is invalid")
			}
		}
		dataCount, readErr := readSolanaShortVec(raw, &offset, maxNetworkFeeContextLength)
		if readErr != nil || dataCount > len(raw)-offset {
			return solanaParsedMessage{}, errors.New("Solana instruction data is invalid")
		}
		data := append([]byte(nil), raw[offset:offset+dataCount]...)
		offset += dataCount
		instructions = append(instructions, solanaCompiledInstruction{programIDIndex: programIndex, accountIndices: indices, data: data})
	}
	if versioned {
		lookupCount, readErr := readSolanaShortVec(raw, &offset, 256)
		if readErr != nil {
			return solanaParsedMessage{}, errors.New("Solana address lookup table list is invalid")
		}
		for index := 0; index < lookupCount; index++ {
			if offset+32 > len(raw) {
				return solanaParsedMessage{}, errors.New("Solana address lookup table is truncated")
			}
			offset += 32
			writableCount, writableErr := readSolanaShortVec(raw, &offset, 256)
			if writableErr != nil || offset+writableCount > len(raw) {
				return solanaParsedMessage{}, errors.New("Solana writable lookup indexes are invalid")
			}
			offset += writableCount
			readonlyCount, readonlyErr := readSolanaShortVec(raw, &offset, 256)
			if readonlyErr != nil || offset+readonlyCount > len(raw) {
				return solanaParsedMessage{}, errors.New("Solana readonly lookup indexes are invalid")
			}
			offset += readonlyCount
		}
	}
	if offset != len(raw) {
		return solanaParsedMessage{}, errors.New("Solana message has trailing bytes")
	}
	return solanaParsedMessage{versioned: versioned, requiredSignatures: required, accountKeys: accounts, recentBlockhash: blockhash, instructions: instructions}, nil
}

func validateSolanaMessageContext(message solanaParsedMessage, transaction NetworkFeeTransactionContext) error {
	if transaction.TokenDecimals > maxSolanaTokenDecimals {
		return fmt.Errorf("%w: token decimals are out of bounds", ErrInsufficientContext)
	}
	payer := firstNonEmpty(transaction.Payer, transaction.From)
	recipientOwner := firstNonEmpty(transaction.Recipient, transaction.To)
	recipientToken := strings.TrimSpace(transaction.RecipientTokenAccount)
	if recipientOwner == "" {
		recipientOwner = recipientToken
	}
	mint := strings.TrimSpace(transaction.TokenMint)
	payerBytes, err := solanaAddressBytes(payer)
	if err != nil {
		return ErrInsufficientContext
	}
	if recipientOwner == "" {
		return ErrInsufficientContext
	}
	recipientBytes, err := solanaAddressBytes(recipientOwner)
	if err != nil {
		return ErrInsufficientContext
	}
	mintBytes, err := solanaAddressBytes(mint)
	if err != nil {
		return ErrInsufficientContext
	}
	if message.requiredSignatures == 0 || len(message.accountKeys) == 0 || !bytes.Equal(message.accountKeys[0], payerBytes) {
		return fmt.Errorf("%w: payer is not the message fee payer", ErrInsufficientContext)
	}
	// Compiled messages normally deduplicate account keys. Rejecting duplicate
	// static keys here keeps role lookup unambiguous even for hand-crafted
	// opaque messages (otherwise a source/mint/recipient index could alias the
	// same key while still passing a byte comparison).
	for index, account := range message.accountKeys {
		for previous := 0; previous < index; previous++ {
			if bytes.Equal(account, message.accountKeys[previous]) {
				return fmt.Errorf("%w: message contains duplicate account keys", ErrInsufficientContext)
			}
		}
	}
	findAccount := func(key []byte) int {
		for index, account := range message.accountKeys {
			if bytes.Equal(account, key) {
				return index
			}
		}
		return -1
	}
	recipientTokenBytes := recipientBytes
	if recipientToken != "" {
		recipientTokenBytes, err = solanaAddressBytes(recipientToken)
		if err != nil {
			return ErrInsufficientContext
		}
	}
	payerIndex := findAccount(payerBytes)
	recipientIndex := findAccount(recipientTokenBytes)
	mintIndex := findAccount(mintBytes)
	if payerIndex != 0 || recipientIndex < 0 || mintIndex < 0 {
		return fmt.Errorf("%w: payer, recipient or mint is absent from message accounts", ErrInsufficientContext)
	}
	if recipientIndex == payerIndex || recipientIndex == mintIndex || mintIndex == payerIndex {
		return fmt.Errorf("%w: payer, recipient and mint accounts must be distinct", ErrInsufficientContext)
	}
	if strings.TrimSpace(firstNonEmpty(transaction.Recipient, transaction.To)) != "" && recipientToken != "" && !bytes.Equal(recipientBytes, recipientTokenBytes) && findAccount(recipientBytes) < 0 {
		return fmt.Errorf("%w: recipient owner is absent from message accounts", ErrInsufficientContext)
	}
	if value := strings.TrimSpace(transaction.SourceTokenAccount); value != "" {
		sourceBytes, sourceErr := solanaAddressBytes(value)
		sourceIndex := findAccount(sourceBytes)
		if sourceErr != nil || sourceIndex < 0 {
			return fmt.Errorf("%w: source token account is absent", ErrInsufficientContext)
		}
		if sourceIndex == payerIndex || sourceIndex == recipientIndex || sourceIndex == mintIndex {
			return fmt.Errorf("%w: source token account aliases another transfer account", ErrInsufficientContext)
		}
	}
	programBytes, programErr := solanaKnownProgramBytes(transaction.TokenProgramID)
	if programErr != nil {
		return ErrInsufficientContext
	}
	programIndex := findAccount(programBytes)
	if programIndex < 0 {
		return fmt.Errorf("%w: token program is absent", ErrInsufficientContext)
	}
	var expectedAmount *big.Int
	if value := strings.TrimSpace(transaction.TransferAmountBaseUnits); value != "" {
		parsedAmount, parseErr := parseNetworkFeeIntegerDecimal(value, true)
		if parseErr != nil || parsedAmount.GreaterThan(decimal.NewFromBigInt(new(big.Int).SetUint64(^uint64(0)), 0)) {
			return ErrInsufficientContext
		}
		expectedAmount = parsedAmount.BigInt()
	}
	var expectedInstruction []byte
	if value := strings.TrimSpace(transaction.InstructionData); value != "" {
		expectedInstruction, err = decodeHexBytes(value)
		if err != nil {
			return ErrInsufficientContext
		}
	}
	expectedTransferInstruction, transferErr := normalizeSolanaTransferInstruction(transaction.TransferInstruction)
	if transferErr != nil {
		return ErrInsufficientContext
	}
	var expectedAmountBytes []byte
	if expectedAmount != nil {
		expectedAmountBytes = make([]byte, 8)
		binary.LittleEndian.PutUint64(expectedAmountBytes, expectedAmount.Uint64())
	}
	if value := strings.TrimSpace(transaction.RecentBlockhash); value != "" {
		blockhash, blockErr := decodeGMPayBase58(value)
		if !blockErr || len(blockhash) != 32 || !bytes.Equal(blockhash, message.recentBlockhash) {
			return fmt.Errorf("%w: recent blockhash does not match message", ErrInsufficientContext)
		}
	}
	transferFound := false
	for _, instruction := range message.instructions {
		if int(instruction.programIDIndex) != programIndex {
			continue
		}
		if len(instruction.data) == 0 {
			continue
		}
		opcode := instruction.data[0]
		if opcode != 12 && opcode != 3 {
			continue
		}
		if expectedTransferInstruction == "transferChecked" && opcode != 12 {
			continue
		}
		if expectedTransferInstruction == "transfer" && opcode != 3 {
			continue
		}
		if expectedInstruction != nil && !bytes.Equal(expectedInstruction, instruction.data) {
			continue
		}
		if opcode == 12 {
			if len(instruction.data) != 10 || len(instruction.accountIndices) != 4 {
				continue
			}
			if int(instruction.accountIndices[0]) >= len(message.accountKeys) || int(instruction.accountIndices[1]) >= len(message.accountKeys) || int(instruction.accountIndices[2]) >= len(message.accountKeys) || int(instruction.accountIndices[3]) >= len(message.accountKeys) {
				continue
			}
			if int(instruction.accountIndices[1]) != mintIndex || int(instruction.accountIndices[2]) != recipientIndex || int(instruction.accountIndices[3]) != payerIndex {
				continue
			}
			if source := strings.TrimSpace(transaction.SourceTokenAccount); source != "" {
				sourceBytes, _ := solanaAddressBytes(source)
				if int(instruction.accountIndices[0]) != findAccount(sourceBytes) {
					continue
				}
			}
			if expectedAmountBytes != nil && !bytes.Equal(instruction.data[1:9], expectedAmountBytes) {
				continue
			}
			if strings.TrimSpace(transaction.TransferAmountBaseUnits) != "" && instruction.data[9] != transaction.TokenDecimals {
				continue
			}
			transferFound = true
		} else {
			if len(instruction.data) != 9 || len(instruction.accountIndices) != 3 || int(instruction.accountIndices[0]) >= len(message.accountKeys) || int(instruction.accountIndices[1]) >= len(message.accountKeys) || int(instruction.accountIndices[2]) >= len(message.accountKeys) {
				continue
			}
			if int(instruction.accountIndices[1]) != recipientIndex || int(instruction.accountIndices[2]) != payerIndex {
				continue
			}
			if source := strings.TrimSpace(transaction.SourceTokenAccount); source != "" {
				sourceBytes, _ := solanaAddressBytes(source)
				if int(instruction.accountIndices[0]) != findAccount(sourceBytes) {
					continue
				}
			}
			if expectedAmountBytes != nil && !bytes.Equal(instruction.data[1:9], expectedAmountBytes) {
				continue
			}
			transferFound = true
		}
		if transferFound {
			break
		}
	}
	if !transferFound {
		return fmt.Errorf("%w: message has no transfer bound to payer, recipient and mint", ErrInsufficientContext)
	}
	return nil
}

func parseSolanaFeeResult(raw json.RawMessage) (decimal.Decimal, uint64, error) {
	if common.GetJsonType(raw) == "number" || common.GetJsonType(raw) == "string" {
		value := strings.TrimSpace(common.JsonRawMessageToString(raw))
		fee, err := parseNetworkFeeIntegerDecimal(value, true)
		return fee, 0, err
	}
	if common.GetJsonType(raw) != "object" {
		return decimal.Zero, 0, errors.New("getFeeForMessage result is invalid")
	}
	var fields map[string]json.RawMessage
	if common.Unmarshal(raw, &fields) != nil {
		return decimal.Zero, 0, errors.New("getFeeForMessage result is invalid")
	}
	valueRaw, ok := findJSONField(fields, "value")
	if !ok || common.GetJsonType(valueRaw) == "null" {
		return decimal.Zero, 0, errors.New("getFeeForMessage returned no fee")
	}
	fee, err := parseNetworkFeeIntegerDecimal(common.JsonRawMessageToString(valueRaw), true)
	if err != nil {
		return decimal.Zero, 0, err
	}
	slot := uint64(0)
	if contextRaw, ok := findJSONField(fields, "context"); ok && common.GetJsonType(contextRaw) == "object" {
		var contextFields map[string]json.RawMessage
		if common.Unmarshal(contextRaw, &contextFields) == nil {
			if slotRaw, ok := findJSONField(contextFields, "slot"); ok {
				slot, _ = parseUnsignedInteger(slotRaw)
			}
		}
	}
	return fee, slot, nil
}

func (estimator *ConfiguredNetworkFeeEstimator) estimateTRON(ctx context.Context, chain parsedNetworkFeeChainConfig, token string, transaction NetworkFeeTransactionContext) (chainRawNetworkEstimate, error) {
	from := strings.TrimSpace(firstNonEmpty(transaction.From, transaction.Payer))
	recipient := strings.TrimSpace(firstNonEmpty(transaction.Recipient, transaction.To))
	contract := strings.TrimSpace(firstNonEmpty(transaction.TokenContract, transaction.Contract))
	data := strings.TrimSpace(firstNonEmpty(transaction.Data, transaction.Calldata))
	if !IsGMPayAddress("tron", from) || !IsGMPayAddress("tron", recipient) {
		return chainRawNetworkEstimate{}, ErrNetworkFeeContextMissing
	}
	if transaction.BandwidthBytes == 0 {
		return chainRawNetworkEstimate{}, fmt.Errorf("%w: bandwidth_bytes is required", ErrNetworkFeeContextMissing)
	}
	resources, err := estimator.callTRON(ctx, chain.rpcURL, "/wallet/getaccountresource", map[string]any{"address": from, "visible": true})
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	resourceFields, err := objectFields(resources.Raw)
	if err != nil {
		return chainRawNetworkEstimate{}, errors.New("tron account resources are invalid")
	}
	freeNetLimit, err := tronRequiredField(resourceFields, "freeNetLimit")
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	freeNetUsed, err := tronRequiredField(resourceFields, "freeNetUsed")
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	netLimit, err := tronRequiredField(resourceFields, "NetLimit")
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	netUsed, err := tronRequiredField(resourceFields, "NetUsed")
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	energyLimit := decimal.Zero
	energyUsed := decimal.Zero
	if token != "TRX" {
		energyLimit, err = tronRequiredField(resourceFields, "EnergyLimit")
		if err != nil {
			return chainRawNetworkEstimate{}, err
		}
		energyUsed, err = tronRequiredField(resourceFields, "EnergyUsed")
		if err != nil {
			return chainRawNetworkEstimate{}, err
		}
	}
	availableBandwidth := subtractUnsigned(freeNetLimit, freeNetUsed).Add(subtractUnsigned(netLimit, netUsed))
	availableEnergy := subtractUnsigned(energyLimit, energyUsed)

	chainParamsResult, err := estimator.callTRON(ctx, chain.rpcURL, "/wallet/getchainparameters", map[string]any{})
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}
	energyFee, bandwidthFee, err := parseTRONChainFees(chainParamsResult.Raw)
	if err != nil {
		return chainRawNetworkEstimate{}, err
	}

	energyRequired := decimal.Zero
	methods := []string{"wallet/getaccountresource", "wallet/getchainparameters"}
	if token != "TRX" {
		functionSelector, parameter, contextErr := prepareTRONTRC20Call(contract, recipient, data, transaction.FunctionSelector)
		if contextErr != nil {
			return chainRawNetworkEstimate{}, contextErr
		}
		if len(parameter) > maxNetworkFeeContextLength {
			return chainRawNetworkEstimate{}, ErrNetworkFeeContextMissing
		}
		payload := map[string]any{
			"owner_address":    from,
			"contract_address": contract,
			// TRON's HTTP API accepts the Solidity signature here (rather than
			// the four-byte selector). The selector was nevertheless derived and
			// checked against the ABI calldata by prepareTRONTRC20Call.
			"function_selector": functionSelector,
			"parameter":         parameter,
			"visible":           true,
		}
		energyResult, energyErr := estimator.callTRON(ctx, chain.rpcURL, "/wallet/estimateenergy", payload)
		if energyErr == nil {
			energyRequired, err = parseTRONEnergy(energyResult.Raw)
			if err != nil {
				return chainRawNetworkEstimate{}, err
			}
			methods = append(methods, "wallet/estimateenergy")
		} else {
			// Older nodes may expose triggerconstantcontract instead of
			// estimateenergy. It still requires the same real transaction
			// context; no fixed energy value is used as a fallback.
			constantResult, constantErr := estimator.callTRON(ctx, chain.rpcURL, "/wallet/triggerconstantcontract", payload)
			if constantErr != nil {
				return chainRawNetworkEstimate{}, energyErr
			}
			energyRequired, err = parseTRONEnergy(constantResult.Raw)
			if err != nil {
				return chainRawNetworkEstimate{}, err
			}
			methods = append(methods, "wallet/triggerconstantcontract")
		}
	}
	bandwidthNeed := decimal.NewFromInt(int64(transaction.BandwidthBytes))
	bandwidthShortfall := subtractUnsigned(bandwidthNeed, availableBandwidth)
	energyShortfall := subtractUnsigned(energyRequired, availableEnergy)
	sun := bandwidthShortfall.Mul(bandwidthFee).Add(energyShortfall.Mul(energyFee))
	if sun.IsNegative() || !decimalIsFinite(sun) {
		return chainRawNetworkEstimate{}, errors.New("tron resource cost is invalid")
	}
	nativeAmount := sun.Div(decimal.RequireFromString(tronSunPerTRX))
	return chainRawNetworkEstimate{
		NativeAmount: nativeAmount,
		Confidence:   "high",
		Subsidized:   sun.IsZero(),
		Evidence: NetworkFeeEvidence{
			RPCMethod:  methods[0],
			RPCMethods: methods,
			Energy:     energyRequired.String(),
			Bandwidth:  bandwidthNeed.String(),
		},
	}, nil
}

// prepareTRONTRC20Call normalizes a representative TRC-20 transfer into the
// exact payload expected by wallet/estimateenergy and
// wallet/triggerconstantcontract. A complete calldata value may include the
// four-byte selector; when it does, the selector is derived and checked. If a
// separate selector is configured, it must be the canonical transfer selector
// and calldata must contain exactly the two ABI words (recipient, amount).
func prepareTRONTRC20Call(contract, recipient, data string, configuredSelector string) (string, string, error) {
	if !IsGMPayAddress("tron", contract) || !IsGMPayAddress("tron", recipient) {
		return "", "", ErrInsufficientContext
	}
	data = strings.TrimSpace(data)
	if data == "" || len(data) > maxNetworkFeeContextLength {
		return "", "", ErrInsufficientContext
	}
	dataBytes, err := decodeHexBytes(data)
	if err != nil {
		return "", "", fmt.Errorf("%w: TRC20 calldata is invalid", ErrInsufficientContext)
	}

	selector, err := normalizeTRONTransferSelector(configuredSelector)
	if err != nil {
		if strings.TrimSpace(configuredSelector) != "" {
			return "", "", err
		}
		// No selector field is acceptable only when the complete calldata starts
		// with a known selector. Deriving an arbitrary four-byte value would let
		// an unrelated contract method masquerade as a transfer.
		if len(dataBytes) != 68 || hex.EncodeToString(dataBytes[:4]) != tronTRC20TransferSelector {
			return "", "", fmt.Errorf("%w: TRC20 function selector is missing", ErrInsufficientContext)
		}
		selector = tronTRC20TransferSignature
	} else {
		// A separate selector accepts either parameter-only ABI data (64 bytes)
		// or complete calldata (68 bytes) whose prefix agrees with it.
		switch len(dataBytes) {
		case 68:
			if !strings.EqualFold(hex.EncodeToString(dataBytes[:4]), tronTRC20TransferSelector) {
				return "", "", fmt.Errorf("%w: TRC20 calldata selector does not match function_selector", ErrInsufficientContext)
			}
			dataBytes = dataBytes[4:]
		case 64:
			// Already parameter-only.
		default:
			return "", "", fmt.Errorf("%w: TRC20 transfer calldata has an invalid length", ErrInsufficientContext)
		}
	}
	// A selector derived from complete calldata has already been stripped above;
	// keep this guard to make the invariant obvious if the derivation path is
	// refactored later.
	if len(dataBytes) == 68 {
		dataBytes = dataBytes[4:]
	}
	if len(dataBytes) != 64 {
		return "", "", fmt.Errorf("%w: TRC20 transfer calldata must contain exactly two ABI words", ErrInsufficientContext)
	}
	// ABI address words are 32 bytes with the 20-byte account in the least
	// significant position. Compare it to the checked Base58Check TRON
	// recipient so a valid-looking payload cannot redirect the estimate.
	recipientDecoded, ok := decodeGMPayBase58(strings.TrimSpace(recipient))
	if !ok || len(recipientDecoded) != 25 || recipientDecoded[0] != 0x41 {
		return "", "", ErrInsufficientContext
	}
	recipientPayload := recipientDecoded[1:21]
	if !bytes.Equal(dataBytes[:12], make([]byte, 12)) || !bytes.Equal(dataBytes[12:32], recipientPayload) {
		return "", "", fmt.Errorf("%w: TRC20 calldata recipient does not match context", ErrInsufficientContext)
	}
	return selector, hex.EncodeToString(dataBytes), nil
}

func normalizeTRONTransferSelector(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", ErrInsufficientContext
	}
	if strings.EqualFold(value, tronTRC20TransferSignature) {
		return tronTRC20TransferSignature, nil
	}
	selector := strings.TrimPrefix(strings.TrimPrefix(value, "0x"), "0X")
	if len(selector) == 8 && strings.EqualFold(selector, tronTRC20TransferSelector) && hexDataPattern.MatchString(selector) {
		return tronTRC20TransferSignature, nil
	}
	return "", fmt.Errorf("%w: unsupported TRC20 function selector", ErrInsufficientContext)
}

func parseTRONEnergy(raw json.RawMessage) (decimal.Decimal, error) {
	fields, err := objectFields(raw)
	if err != nil {
		return decimal.Zero, errors.New("tron energy estimate is invalid")
	}
	for _, key := range []string{"energy_required", "energy_used", "energy_limit"} {
		if value, ok := findJSONField(fields, key); ok {
			return parseNetworkFeeIntegerDecimal(common.JsonRawMessageToString(value), true)
		}
	}
	if resultRaw, ok := findJSONField(fields, "result"); ok && common.GetJsonType(resultRaw) == "object" {
		resultFields, _ := objectFields(resultRaw)
		for _, key := range []string{"energy_required", "energy_used"} {
			if value, ok := findJSONField(resultFields, key); ok {
				return parseNetworkFeeIntegerDecimal(common.JsonRawMessageToString(value), true)
			}
		}
	}
	return decimal.Zero, errors.New("tron energy estimate has no energy value")
}

func parseTRONChainFees(raw json.RawMessage) (decimal.Decimal, decimal.Decimal, error) {
	fields, err := objectFields(raw)
	if err != nil {
		return decimal.Zero, decimal.Zero, errors.New("tron chain parameters are invalid")
	}
	parametersRaw, ok := findJSONField(fields, "chainParameter")
	if !ok {
		parametersRaw, ok = findJSONField(fields, "chain_parameters")
	}
	if !ok || common.GetJsonType(parametersRaw) != "array" {
		return decimal.Zero, decimal.Zero, errors.New("tron chain parameters are missing")
	}
	var parameters []map[string]json.RawMessage
	if common.Unmarshal(parametersRaw, &parameters) != nil {
		return decimal.Zero, decimal.Zero, errors.New("tron chain parameters are invalid")
	}
	energyFee := decimal.Zero
	bandwidthFee := decimal.Zero
	energySeen := false
	bandwidthSeen := false
	for _, parameter := range parameters {
		keyRaw, keyOK := findJSONField(parameter, "key")
		if !keyOK || common.GetJsonType(keyRaw) != "string" {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(common.JsonRawMessageToString(keyRaw)))
		var target *decimal.Decimal
		var seen *bool
		switch key {
		case "getenergyfee":
			target = &energyFee
			seen = &energySeen
		case "gettransactionfee":
			target = &bandwidthFee
			seen = &bandwidthSeen
		default:
			// TronGrid returns many chain parameters that are unrelated to
			// burn fees. Their value may be absent or malformed; neither should
			// make an otherwise usable fee response fail closed.
			continue
		}
		valueRaw, valueOK := findJSONField(parameter, "value")
		if !valueOK {
			return decimal.Zero, decimal.Zero, fmt.Errorf("tron chain parameter %s is missing value", key)
		}
		value, parseErr := parseNetworkFeeIntegerDecimal(common.JsonRawMessageToString(valueRaw), true)
		if parseErr != nil {
			return decimal.Zero, decimal.Zero, fmt.Errorf("tron chain parameter %s is invalid: %w", key, parseErr)
		}
		*target = value
		*seen = true
	}
	if !energySeen || !bandwidthSeen {
		return decimal.Zero, decimal.Zero, errors.New("tron chain burn fees are missing")
	}
	if energyFee.IsNegative() || bandwidthFee.IsNegative() || (energyFee.IsZero() && bandwidthFee.IsZero()) {
		return decimal.Zero, decimal.Zero, errors.New("tron chain burn fees are unavailable")
	}
	return energyFee, bandwidthFee, nil
}

func (estimator *ConfiguredNetworkFeeEstimator) callJSONRPC(ctx context.Context, endpoint *url.URL, method string, params []any) (networkFeeCallResult, error) {
	methodLabel := networkFeeRPCMethodLabel(method)
	payload, err := common.Marshal(networkFeeRPCRequest{JSONRPC: "2.0", ID: 1, Method: method, Params: params})
	if err != nil {
		return networkFeeCallResult{}, err
	}
	for attempt := 0; attempt <= estimator.config.maxRetries; attempt++ {
		request, requestErr := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(payload))
		if requestErr != nil {
			return networkFeeCallResult{}, requestErr
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Accept", "application/json")
		response, requestErr := estimator.httpClient.Do(request)
		if requestErr != nil {
			if attempt < estimator.config.maxRetries {
				continue
			}
			return networkFeeCallResult{}, requestErr
		}
		if responseErr := validateNetworkFeeResponse(response, endpoint); responseErr != nil {
			if response != nil && response.Body != nil {
				response.Body.Close()
			}
			return networkFeeCallResult{}, responseErr
		}
		body, readErr := readNetworkFeeBody(response, estimator.config.responseLimit)
		status := response.StatusCode
		response.Body.Close()
		if readErr != nil {
			return networkFeeCallResult{}, readErr
		}
		if status < http.StatusOK || status >= http.StatusMultipleChoices {
			if status >= http.StatusInternalServerError && attempt < estimator.config.maxRetries {
				continue
			}
			return networkFeeCallResult{}, fmt.Errorf("rpc returned http status %d", status)
		}
		var rpcResponse networkFeeRPCResponse
		if common.Unmarshal(body, &rpcResponse) != nil || rpcResponse.JSONRPC != "2.0" {
			return networkFeeCallResult{}, errors.New("rpc response is invalid")
		}
		// JSON-RPC responses must carry the request id. Rejecting an absent or
		// mismatched id prevents a stale response from being interpreted as the
		// quote for this transaction.
		if id, idErr := parseUnsignedInteger(rpcResponse.ID); idErr != nil || id != 1 {
			return networkFeeCallResult{}, errors.New("rpc response id is invalid")
		}
		if len(rpcResponse.Error) > 0 && common.GetJsonType(rpcResponse.Error) != "null" {
			var remote networkFeeRPCError
			classification := "remote_error"
			if common.Unmarshal(rpcResponse.Error, &remote) == nil {
				classification = networkFeeRPCErrorClassification(remote.Code)
			}
			return networkFeeCallResult{}, fmt.Errorf("rpc method %s failed: %s", methodLabel, classification)
		}
		if len(rpcResponse.Result) == 0 || common.GetJsonType(rpcResponse.Result) == "null" {
			return networkFeeCallResult{}, fmt.Errorf("rpc method %s returned no result", methodLabel)
		}
		return networkFeeCallResult{Raw: rpcResponse.Result, RPCMethod: method}, nil
	}
	return networkFeeCallResult{}, errors.New("rpc request failed")
}

func networkFeeRPCMethodLabel(method string) string {
	method = strings.TrimSpace(method)
	if !identifierPattern.MatchString(method) {
		return "unknown"
	}
	return method
}

func networkFeeRPCErrorClassification(code int) string {
	switch code {
	case -32700:
		return "parse_error"
	case -32600:
		return "invalid_request"
	case -32601:
		return "method_not_found"
	case -32602:
		return "invalid_params"
	case -32603:
		return "internal_error"
	default:
		if code >= -32099 && code <= -32000 {
			return "server_error"
		}
		return "remote_error"
	}
}

func (estimator *ConfiguredNetworkFeeEstimator) callTRON(ctx context.Context, endpoint *url.URL, path string, payload map[string]any) (networkFeeCallResult, error) {
	body, err := common.Marshal(payload)
	if err != nil {
		return networkFeeCallResult{}, err
	}
	tronURL := *endpoint
	tronURL.Path = strings.TrimSuffix(tronURL.Path, "/") + path
	for attempt := 0; attempt <= estimator.config.maxRetries; attempt++ {
		request, requestErr := http.NewRequestWithContext(ctx, http.MethodPost, tronURL.String(), bytes.NewReader(body))
		if requestErr != nil {
			return networkFeeCallResult{}, requestErr
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Accept", "application/json")
		response, requestErr := estimator.httpClient.Do(request)
		if requestErr != nil {
			if attempt < estimator.config.maxRetries {
				continue
			}
			return networkFeeCallResult{}, requestErr
		}
		if responseErr := validateNetworkFeeResponse(response, &tronURL); responseErr != nil {
			if response != nil && response.Body != nil {
				response.Body.Close()
			}
			return networkFeeCallResult{}, responseErr
		}
		responseBody, readErr := readNetworkFeeBody(response, estimator.config.responseLimit)
		status := response.StatusCode
		response.Body.Close()
		if readErr != nil {
			return networkFeeCallResult{}, readErr
		}
		if status < http.StatusOK || status >= http.StatusMultipleChoices {
			if status >= http.StatusInternalServerError && attempt < estimator.config.maxRetries {
				continue
			}
			return networkFeeCallResult{}, fmt.Errorf("tron rpc returned http status %d", status)
		}
		var fields map[string]json.RawMessage
		if common.Unmarshal(responseBody, &fields) != nil || fields == nil {
			return networkFeeCallResult{}, errors.New("tron rpc response is invalid")
		}
		if resultRaw, ok := findJSONField(fields, "result"); ok && common.GetJsonType(resultRaw) == "object" {
			resultFields, _ := objectFields(resultRaw)
			if successRaw, successOK := findJSONField(resultFields, "result"); successOK && common.GetJsonType(successRaw) == "boolean" {
				var success bool
				if common.Unmarshal(successRaw, &success) == nil && !success {
					return networkFeeCallResult{}, errors.New("tron rpc result failed")
				}
			}
		}
		return networkFeeCallResult{Raw: responseBody, RPCMethod: strings.TrimPrefix(path, "/")}, nil
	}
	return networkFeeCallResult{}, errors.New("tron rpc request failed")
}

type networkFeePriceObservation struct {
	price     decimal.Decimal
	timestamp time.Time
	source    string
	endpoint  *url.URL
}

// fetchNativePrice obtains every configured price source and requires them to
// agree before returning a value. A singular legacy price_url still follows
// the historical-observation guard; when price_urls contains multiple
// independent endpoints, a partial response is a hard failure rather than an
// opportunity to silently trust whichever source happened to answer first.
func (estimator *ConfiguredNetworkFeeEstimator) fetchNativePrice(ctx context.Context, chain parsedNetworkFeeChainConfig, settlementCurrency string, now time.Time) (decimal.Decimal, time.Time, string, error) {
	endpoints := chain.priceURLs
	if len(endpoints) == 0 && chain.priceURL != nil {
		endpoints = []*url.URL{chain.priceURL}
	}
	if len(endpoints) == 0 {
		return decimal.Zero, time.Time{}, "", errors.New("price source is not configured")
	}
	observations := make([]networkFeePriceObservation, 0, len(endpoints))
	for _, endpoint := range endpoints {
		observation, err := estimator.fetchPriceSource(ctx, endpoint, chain.nativeAsset, settlementCurrency, now)
		if err != nil {
			return decimal.Zero, time.Time{}, "", fmt.Errorf("price source %s: %w", endpointSource(endpoint), err)
		}
		if err := estimator.checkPriceDeviation(endpoint, settlementCurrency, observation.price); err != nil {
			return decimal.Zero, time.Time{}, "", err
		}
		observation.endpoint = endpoint
		observations = append(observations, observation)
	}
	if err := validateNetworkFeePriceConsensus(observations, estimator.config.maxPriceDeviation); err != nil {
		return decimal.Zero, time.Time{}, "", err
	}
	for _, observation := range observations {
		estimator.recordPriceObservation(observation.endpoint, settlementCurrency, observation.price)
	}
	prices := make([]decimal.Decimal, len(observations))
	for index, observation := range observations {
		prices[index] = observation.price
	}
	sort.Slice(prices, func(i, j int) bool { return prices[i].LessThan(prices[j]) })
	median := prices[len(prices)/2]
	if len(prices)%2 == 0 {
		median = prices[len(prices)/2-1].Add(prices[len(prices)/2]).Div(decimal.NewFromInt(2))
	}
	// Use the oldest accepted timestamp so a consensus quote never outlives
	// the freshness bound of one of its contributing sources.
	oldest := observations[0].timestamp
	for _, observation := range observations[1:] {
		if observation.timestamp.Before(oldest) {
			oldest = observation.timestamp
		}
	}
	sources := make([]string, len(observations))
	for index, observation := range observations {
		sources[index] = observation.source
	}
	return median, oldest, strings.Join(sources, ","), nil
}

func (estimator *ConfiguredNetworkFeeEstimator) fetchPriceSource(ctx context.Context, endpoint *url.URL, nativeAsset, settlementCurrency string, now time.Time) (networkFeePriceObservation, error) {
	if endpoint == nil {
		return networkFeePriceObservation{}, errors.New("price source endpoint is invalid")
	}
	for attempt := 0; attempt <= estimator.config.maxRetries; attempt++ {
		request, requestErr := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
		if requestErr != nil {
			return networkFeePriceObservation{}, requestErr
		}
		request.Header.Set("Accept", "application/json")
		response, requestErr := estimator.httpClient.Do(request)
		if requestErr != nil {
			if attempt < estimator.config.maxRetries {
				continue
			}
			return networkFeePriceObservation{}, requestErr
		}
		if responseErr := validateNetworkFeeResponse(response, endpoint); responseErr != nil {
			if response != nil && response.Body != nil {
				response.Body.Close()
			}
			return networkFeePriceObservation{}, responseErr
		}
		body, readErr := readNetworkFeeBody(response, estimator.config.responseLimit)
		status := response.StatusCode
		response.Body.Close()
		if readErr != nil {
			return networkFeePriceObservation{}, readErr
		}
		if status < http.StatusOK || status >= http.StatusMultipleChoices {
			if status >= http.StatusInternalServerError && attempt < estimator.config.maxRetries {
				continue
			}
			return networkFeePriceObservation{}, fmt.Errorf("price source returned http status %d", status)
		}
		price, timestamp, currency, err := parseNetworkFeePriceForAsset(body, nativeAsset, settlementCurrency)
		if err != nil {
			return networkFeePriceObservation{}, err
		}
		if currency != "" && currency != settlementCurrency {
			return networkFeePriceObservation{}, errors.New("price source currency does not match settlement currency")
		}
		if timestamp.After(now.Add(5*time.Minute)) || now.Sub(timestamp) > estimator.config.priceMaxAge {
			return networkFeePriceObservation{}, errors.New("price source timestamp is stale or in the future")
		}
		if price.LessThanOrEqual(decimal.Zero) || price.GreaterThan(decimal.RequireFromString(maxNetworkFeePrice)) {
			return networkFeePriceObservation{}, errors.New("price source value is out of bounds")
		}
		return networkFeePriceObservation{price: price, timestamp: timestamp, source: endpointSource(endpoint)}, nil
	}
	return networkFeePriceObservation{}, errors.New("price source request failed")
}

func validateNetworkFeePriceConsensus(observations []networkFeePriceObservation, maxDeviation decimal.Decimal) error {
	if len(observations) <= 1 {
		return nil
	}
	minimum := observations[0].price
	maximum := observations[0].price
	for _, observation := range observations[1:] {
		if observation.price.LessThan(minimum) {
			minimum = observation.price
		}
		if observation.price.GreaterThan(maximum) {
			maximum = observation.price
		}
	}
	if minimum.LessThanOrEqual(decimal.Zero) {
		return errors.New("price source consensus contains a non-positive value")
	}
	deviation := maximum.Sub(minimum).Div(minimum).Mul(decimal.NewFromInt(100))
	if deviation.GreaterThan(maxDeviation) {
		return fmt.Errorf("price source consensus deviation %.8s%% exceeds configured limit %.8s%%", deviation.String(), maxDeviation.String())
	}
	return nil
}

// validatePriceDeviation compares a fresh observation with the previous
// accepted observation for the same source/currency pair. It is retained as a
// compatibility seam for single-source callers; multi-source fetching uses
// checkPriceDeviation and records observations only after consensus succeeds.
func (estimator *ConfiguredNetworkFeeEstimator) validatePriceDeviation(chain parsedNetworkFeeChainConfig, settlementCurrency string, price decimal.Decimal) error {
	endpoint := chain.priceURL
	if endpoint == nil && len(chain.priceURLs) > 0 {
		endpoint = chain.priceURLs[0]
	}
	if err := estimator.checkPriceDeviation(endpoint, settlementCurrency, price); err != nil {
		return err
	}
	estimator.recordPriceObservation(endpoint, settlementCurrency, price)
	return nil
}

func (estimator *ConfiguredNetworkFeeEstimator) checkPriceDeviation(endpoint *url.URL, settlementCurrency string, price decimal.Decimal) error {
	if estimator == nil || estimator.config.maxPriceDeviation.IsZero() || endpoint == nil {
		return nil
	}
	key := networkFeePriceObservationKey(endpoint, settlementCurrency)
	estimator.priceMu.Lock()
	previous, ok := estimator.priceObservations[key]
	estimator.priceMu.Unlock()
	if ok && previous.GreaterThan(decimal.Zero) {
		deviation := price.Sub(previous).Abs().Div(previous).Mul(decimal.NewFromInt(100))
		if deviation.GreaterThan(estimator.config.maxPriceDeviation) {
			return fmt.Errorf("price source deviation %.8s%% exceeds configured limit %.8s%%", deviation.String(), estimator.config.maxPriceDeviation.String())
		}
	}
	return nil
}

func (estimator *ConfiguredNetworkFeeEstimator) recordPriceObservation(endpoint *url.URL, settlementCurrency string, price decimal.Decimal) {
	if estimator == nil || endpoint == nil {
		return
	}
	key := networkFeePriceObservationKey(endpoint, settlementCurrency)
	estimator.priceMu.Lock()
	if estimator.priceObservations == nil {
		estimator.priceObservations = make(map[string]decimal.Decimal)
	}
	estimator.priceObservations[key] = price
	estimator.priceMu.Unlock()
}

func networkFeePriceObservationKey(endpoint *url.URL, settlementCurrency string) string {
	if endpoint == nil {
		return "|" + strings.ToUpper(strings.TrimSpace(settlementCurrency))
	}
	return endpoint.String() + "|" + strings.ToUpper(strings.TrimSpace(settlementCurrency))
}

func parseNetworkFeePrice(body []byte, expectedCurrency string) (decimal.Decimal, time.Time, string, error) {
	return parseNetworkFeePriceForAsset(body, "", expectedCurrency)
}

func parseNetworkFeePriceForAsset(body []byte, expectedAsset, expectedCurrency string) (decimal.Decimal, time.Time, string, error) {
	var fields map[string]json.RawMessage
	if common.Unmarshal(body, &fields) != nil || fields == nil {
		return decimal.Zero, time.Time{}, "", errors.New("price source response is invalid")
	}
	if err := validateNetworkFeePriceMetadata(fields, expectedAsset, expectedCurrency); err != nil {
		return decimal.Zero, time.Time{}, "", err
	}
	priceRaw, ok := findPriceValue(fields, strings.ToLower(expectedCurrency))
	if !ok {
		return decimal.Zero, time.Time{}, "", errors.New("price source response has no price")
	}
	price, err := parseNetworkFeeDecimal(common.JsonRawMessageToString(priceRaw), false)
	if err != nil {
		return decimal.Zero, time.Time{}, "", fmt.Errorf("price source price is invalid: %w", err)
	}
	timestampRaw, ok := findTimestampValue(fields)
	if !ok {
		return decimal.Zero, time.Time{}, "", errors.New("price source timestamp is required")
	}
	timestamp, err := parseNetworkFeeTimestamp(timestampRaw)
	if err != nil {
		return decimal.Zero, time.Time{}, "", err
	}
	currency := ""
	if currencyRaw, ok := findJSONField(fields, "currency"); ok && common.GetJsonType(currencyRaw) == "string" {
		currency = strings.ToUpper(strings.TrimSpace(common.JsonRawMessageToString(currencyRaw)))
		if currency != "" && !currencyPattern.MatchString(currency) {
			return decimal.Zero, time.Time{}, "", errors.New("price source currency is invalid")
		}
	}
	return price, timestamp, currency, nil
}

// validateNetworkFeePriceMetadata prevents a response for a different asset
// or quote currency from being interpreted as the configured native-asset
// price.  Metadata is optional for compatibility with simple feeds; whenever
// an asset/symbol/base/quote field is present, however, its identity is
// checked strictly. Objects nested under common envelope fields are visited as
// well so a mismatched pair cannot hide in a provider-specific payload.
func validateNetworkFeePriceMetadata(fields map[string]json.RawMessage, expectedAsset, expectedCurrency string) error {
	expectedAsset = strings.ToUpper(strings.TrimSpace(expectedAsset))
	expectedCurrency = strings.ToUpper(strings.TrimSpace(expectedCurrency))
	if expectedAsset == "" && expectedCurrency == "" {
		return nil
	}
	for key, raw := range fields {
		lowerKey := strings.ToLower(strings.TrimSpace(key))
		switch lowerKey {
		case "asset", "native_asset", "base_asset", "base":
			if common.GetJsonType(raw) != "string" {
				return errors.New("price source asset metadata is invalid")
			}
			value := strings.ToUpper(strings.TrimSpace(common.JsonRawMessageToString(raw)))
			if value == "" || (expectedAsset != "" && value != expectedAsset) {
				return errors.New("price source asset does not match configured native asset")
			}
		case "symbol":
			if common.GetJsonType(raw) != "string" {
				return errors.New("price source symbol metadata is invalid")
			}
			if !networkFeePriceSymbolMatches(common.JsonRawMessageToString(raw), expectedAsset, expectedCurrency) {
				return errors.New("price source symbol does not match configured pair")
			}
		case "quote", "quote_asset", "quote_currency", "currency":
			if common.GetJsonType(raw) != "string" {
				return errors.New("price source quote metadata is invalid")
			}
			value := strings.ToUpper(strings.TrimSpace(common.JsonRawMessageToString(raw)))
			if value == "" || (expectedCurrency != "" && value != expectedCurrency) {
				return errors.New("price source quote currency does not match settlement currency")
			}
		}

		switch common.GetJsonType(raw) {
		case "object":
			nested, err := objectFields(raw)
			if err != nil {
				return errors.New("price source metadata object is invalid")
			}
			if err := validateNetworkFeePriceMetadata(nested, expectedAsset, expectedCurrency); err != nil {
				return err
			}
		case "array":
			var nestedValues []json.RawMessage
			if common.Unmarshal(raw, &nestedValues) != nil {
				return errors.New("price source metadata array is invalid")
			}
			for _, nestedRaw := range nestedValues {
				if common.GetJsonType(nestedRaw) != "object" {
					continue
				}
				nested, err := objectFields(nestedRaw)
				if err != nil {
					return errors.New("price source metadata object is invalid")
				}
				if err := validateNetworkFeePriceMetadata(nested, expectedAsset, expectedCurrency); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func networkFeePriceSymbolMatches(value, expectedAsset, expectedCurrency string) bool {
	value = strings.ToUpper(strings.TrimSpace(value))
	if value == "" {
		return false
	}
	if expectedAsset != "" && value == expectedAsset {
		return true
	}
	if expectedAsset == "" {
		return expectedCurrency == "" || value == expectedCurrency
	}
	// Accept common pair spellings such as ETH/USD, ETH-USD, ETH_USD and
	// ETHUSD, while rejecting a symbol that merely contains the asset as a
	// substring (for example WETHUSD when ETH is expected).
	parts := strings.FieldsFunc(value, func(r rune) bool {
		return r == '/' || r == '-' || r == '_' || r == ':' || r == '.' || r == ' '
	})
	if len(parts) == 2 {
		return parts[0] == expectedAsset && (expectedCurrency == "" || parts[1] == expectedCurrency)
	}
	if expectedCurrency == "" {
		return value == expectedAsset
	}
	return value == expectedAsset+expectedCurrency
}

func findPriceValue(fields map[string]json.RawMessage, expectedCurrency string) (json.RawMessage, bool) {
	// Only explicit market-price fields are accepted. A generic `amount` key is
	// commonly an order/payment amount (and in GMPay responses means the fiat
	// checkout amount), so treating it as a native-asset price can under/over
	// charge every subsequent order.
	for _, key := range []string{"price", "value", "last_price", "last", "rate"} {
		if raw, ok := findJSONField(fields, key); ok && isJSONScalar(raw) {
			return raw, true
		}
	}
	if expectedCurrency != "" {
		if raw, ok := findJSONField(fields, expectedCurrency); ok && isJSONScalar(raw) {
			return raw, true
		}
		// Some feeds (including CoinPaprika) nest the selected quote inside
		// an object, for example {"quotes":{"USD":{"price":...}}}.
		// Walk only the explicitly requested currency key so unrelated quote
		// values cannot be mistaken for the settlement price.
		if raw, ok := findJSONField(fields, expectedCurrency); ok && common.GetJsonType(raw) == "object" {
			if nested, err := objectFields(raw); err == nil {
				if value, found := findPriceValue(nested, expectedCurrency); found {
					return value, true
				}
			}
		}
	}
	for _, key := range []string{"data", "result", "payload", "quotes"} {
		if raw, ok := findJSONField(fields, key); ok {
			if common.GetJsonType(raw) == "object" {
				var nested map[string]json.RawMessage
				if common.Unmarshal(raw, &nested) == nil {
					if value, found := findPriceValue(nested, expectedCurrency); found {
						return value, true
					}
				}
			}
		}
	}
	return nil, false
}

func findTimestampValue(fields map[string]json.RawMessage) (json.RawMessage, bool) {
	for _, key := range []string{"timestamp", "updated_at", "last_updated_at", "last_updated", "lastUpdated", "time"} {
		if raw, ok := findJSONField(fields, key); ok && isJSONScalar(raw) {
			return raw, true
		}
	}
	for _, key := range []string{"data", "result", "payload"} {
		if raw, ok := findJSONField(fields, key); ok && common.GetJsonType(raw) == "object" {
			var nested map[string]json.RawMessage
			if common.Unmarshal(raw, &nested) == nil {
				if value, found := findTimestampValue(nested); found {
					return value, true
				}
			}
		}
	}
	return nil, false
}

func parseNetworkFeeTimestamp(raw json.RawMessage) (time.Time, error) {
	if common.GetJsonType(raw) != "number" && common.GetJsonType(raw) != "string" {
		return time.Time{}, errors.New("price source timestamp is invalid")
	}
	value := strings.TrimSpace(common.JsonRawMessageToString(raw))
	if value == "" {
		return time.Time{}, errors.New("price source timestamp is invalid")
	}
	// Price providers commonly return RFC3339/RFC3339Nano timestamps. Accept
	// those alongside Unix seconds/milliseconds while keeping the numeric path
	// strict and bounded.
	if strings.ContainsAny(value, "TtZz:-") {
		parsed, err := time.Parse(time.RFC3339Nano, value)
		if err != nil {
			parsed, err = time.Parse(time.RFC3339, value)
		}
		if err != nil || parsed.IsZero() {
			return time.Time{}, errors.New("price source timestamp is invalid")
		}
		return parsed.UTC(), nil
	}
	if strings.ContainsAny(value, ".eE+") {
		return time.Time{}, errors.New("price source timestamp is invalid")
	}
	seconds, err := strconv.ParseInt(value, 10, 64)
	if err != nil || seconds <= 0 {
		return time.Time{}, errors.New("price source timestamp is invalid")
	}
	if seconds > 100000000000 {
		seconds /= 1000
	}
	return time.Unix(seconds, 0).UTC(), nil
}

func parseNetworkFeeDecimal(value string, allowZero bool) (decimal.Decimal, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return decimal.Zero, errors.New("decimal is empty")
	}
	amount, err := decimal.NewFromString(value)
	if err != nil || (!allowZero && amount.LessThanOrEqual(decimal.Zero)) || (allowZero && amount.IsNegative()) {
		return decimal.Zero, errors.New("decimal must be non-negative")
	}
	if amount.Exponent() < -maxNetworkFeeDecimalScale || !decimalIsFinite(amount) {
		return decimal.Zero, errors.New("decimal is out of range")
	}
	return amount, nil
}

func parseNetworkFeeIntegerDecimal(value string, allowZero bool) (decimal.Decimal, error) {
	amount, err := parseNetworkFeeDecimal(value, allowZero)
	if err != nil || amount.Exponent() < 0 {
		return decimal.Zero, errors.New("integer value is invalid")
	}
	return amount, nil
}

func parseHexQuantity(raw json.RawMessage) (decimal.Decimal, error) {
	if common.GetJsonType(raw) != "string" {
		return decimal.Zero, errors.New("hex quantity must be a string")
	}
	return parseHexQuantityString(common.JsonRawMessageToString(raw))
}

func parseHexQuantityString(value string) (decimal.Decimal, error) {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, "0x") || len(value) <= 2 || len(value) > 66 {
		return decimal.Zero, errors.New("hex quantity is invalid")
	}
	integer := new(big.Int)
	if _, ok := integer.SetString(value[2:], 16); !ok {
		return decimal.Zero, errors.New("hex quantity is invalid")
	}
	return decimal.NewFromBigInt(integer, 0), nil
}

func parseUnsignedInteger(raw json.RawMessage) (uint64, error) {
	if common.GetJsonType(raw) != "number" && common.GetJsonType(raw) != "string" {
		return 0, errors.New("integer is invalid")
	}
	value := strings.TrimSpace(common.JsonRawMessageToString(raw))
	if value == "" || strings.ContainsAny(value, ".eE+-") {
		return 0, errors.New("integer is invalid")
	}
	return strconv.ParseUint(value, 10, 64)
}

func objectFields(raw json.RawMessage) (map[string]json.RawMessage, error) {
	if common.GetJsonType(raw) != "object" {
		return nil, errors.New("object expected")
	}
	var fields map[string]json.RawMessage
	if common.Unmarshal(raw, &fields) != nil || fields == nil {
		return nil, errors.New("object expected")
	}
	return fields, nil
}

func findJSONField(fields map[string]json.RawMessage, name string) (json.RawMessage, bool) {
	if value, ok := fields[name]; ok {
		return value, true
	}
	for key, value := range fields {
		if strings.EqualFold(key, name) {
			return value, true
		}
	}
	return nil, false
}

func tronField(fields map[string]json.RawMessage, name string) decimal.Decimal {
	raw, ok := findJSONField(fields, name)
	if !ok {
		return decimal.Zero
	}
	value, err := parseNetworkFeeIntegerDecimal(common.JsonRawMessageToString(raw), true)
	if err != nil {
		return decimal.Zero
	}
	return value
}

func tronRequiredField(fields map[string]json.RawMessage, name string) (decimal.Decimal, error) {
	raw, ok := findJSONField(fields, name)
	if !ok {
		return decimal.Zero, fmt.Errorf("tron account resources missing %s", name)
	}
	value, err := parseNetworkFeeIntegerDecimal(common.JsonRawMessageToString(raw), true)
	if err != nil {
		return decimal.Zero, fmt.Errorf("tron account resources %s is invalid", name)
	}
	return value, nil
}

func subtractUnsigned(left, right decimal.Decimal) decimal.Decimal {
	if left.LessThanOrEqual(right) {
		return decimal.Zero
	}
	return left.Sub(right)
}

func unmarshalJSONInt(raw json.RawMessage, destination *int) error {
	if common.GetJsonType(raw) != "number" {
		return errors.New("integer expected")
	}
	return common.Unmarshal(raw, destination)
}

func unmarshalJSONInt64(raw json.RawMessage, destination *int64) error {
	if common.GetJsonType(raw) != "number" {
		return errors.New("integer expected")
	}
	return common.Unmarshal(raw, destination)
}

func normalizeEstimatorNetwork(value string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "tron", "trc20", "trc-20":
		return "tron", true
	case "ethereum", "eth", "erc20", "erc-20":
		return "ethereum", true
	case "binance", "bsc", "bnb", "bep20", "bep-20", "binance-smart-chain":
		return "binance", true
	case "solana", "sol", "spl":
		return "solana", true
	default:
		return "", false
	}
}

func expectedNativeAsset(network string) string {
	switch network {
	case "tron":
		return "TRX"
	case "ethereum":
		return "ETH"
	case "binance":
		return "BNB"
	case "solana":
		return "SOL"
	default:
		return ""
	}
}

func validateNetworkFeeEndpoint(value string, allowedHosts []string) (*url.URL, error) {
	endpoint, err := url.Parse(strings.TrimSpace(value))
	if err != nil || endpoint == nil || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.Fragment != "" {
		return nil, errors.New("endpoint URL is invalid")
	}
	if endpoint.Scheme != "https" && endpoint.Scheme != "http" {
		return nil, errors.New("endpoint URL must use HTTP or HTTPS")
	}
	host := strings.ToLower(endpoint.Hostname())
	if !allowedEndpointHost.MatchString(host) && net.ParseIP(host) == nil {
		return nil, errors.New("endpoint host is invalid")
	}
	// Plain HTTP is retained only for explicit loopback test fixtures.  Any
	// remotely reachable endpoint must use TLS; an allowlist alone does not
	// protect credentials or payloads sent over cleartext HTTP.
	if endpoint.Scheme == "http" && !isLoopbackHost(host) {
		return nil, errors.New("non-loopback endpoint must use HTTPS")
	}
	if len(allowedHosts) == 0 {
		if !isLoopbackHost(host) {
			return nil, errors.New("endpoint host allowlist is required")
		}
	} else if !networkFeeHostAllowed(host, allowedHosts) {
		return nil, errors.New("endpoint host is not allowlisted")
	}
	return endpoint, nil
}

func validateNetworkFeeHostList(hosts []string) error {
	for _, rawHost := range hosts {
		host := strings.ToLower(strings.TrimSpace(rawHost))
		if strings.Contains(host, "://") || host == "" || (!allowedEndpointHost.MatchString(host) && net.ParseIP(host) == nil) {
			return errors.New("host allowlist contains an invalid host")
		}
	}
	return nil
}

func networkFeeHostAllowed(host string, allowedHosts []string) bool {
	for _, allowed := range allowedHosts {
		allowed = strings.ToLower(strings.TrimSpace(allowed))
		if allowed == host {
			return true
		}
	}
	return false
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	parsed := net.ParseIP(host)
	return parsed != nil && parsed.IsLoopback()
}

func endpointSource(endpoint *url.URL) string {
	if endpoint == nil {
		return ""
	}
	return strings.ToLower(endpoint.Hostname())
}

// validateNetworkFeeResponse rejects redirects and cross-origin responses
// before their body can be interpreted as an RPC or price result. The client
// also disables redirect following, but checking the response request here
// protects callers that provide a custom RoundTripper in tests or deployments.
func validateNetworkFeeResponse(response *http.Response, endpoint *url.URL) error {
	if response == nil {
		return errors.New("network fee response is empty")
	}
	if response.StatusCode >= http.StatusMultipleChoices && response.StatusCode < 400 {
		return errors.New("network fee endpoint redirects are not allowed")
	}
	if endpoint == nil || response.Request == nil || response.Request.URL == nil {
		return nil
	}
	requestURL := response.Request.URL
	if !sameNetworkFeeOrigin(endpoint, requestURL) {
		return errors.New("network fee endpoint response origin does not match configured endpoint")
	}
	return nil
}

func sameNetworkFeeOrigin(left, right *url.URL) bool {
	if left == nil || right == nil {
		return false
	}
	return strings.EqualFold(left.Scheme, right.Scheme) &&
		strings.EqualFold(left.Hostname(), right.Hostname()) &&
		canonicalNetworkFeePort(left) == canonicalNetworkFeePort(right)
}

func canonicalNetworkFeePort(value *url.URL) string {
	if value == nil {
		return ""
	}
	port := value.Port()
	if port != "" {
		return port
	}
	switch strings.ToLower(value.Scheme) {
	case "https":
		return "443"
	case "http":
		return "80"
	default:
		return ""
	}
}

func readNetworkFeeBody(response *http.Response, limit int64) ([]byte, error) {
	if response == nil || response.Body == nil {
		return nil, errors.New("network fee response is empty")
	}
	if response.ContentLength > limit {
		return nil, errors.New("network fee response exceeds size limit")
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > limit {
		return nil, errors.New("network fee response exceeds size limit")
	}
	return body, nil
}

func validNetworkFeeHexData(value string) bool {
	value = strings.TrimSpace(value)
	if len(value) < 2 || !hexDataPattern.MatchString(value) {
		return false
	}
	if strings.HasPrefix(value, "0x") {
		value = value[2:]
	}
	return len(value)%2 == 0
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func isEmptyNetworkFeeTransaction(transaction NetworkFeeTransactionContext) bool {
	return transaction == (NetworkFeeTransactionContext{})
}

func isJSONScalar(raw json.RawMessage) bool {
	typ := common.GetJsonType(raw)
	return typ == "number" || typ == "string"
}

func decimalIsFinite(value decimal.Decimal) bool {
	floatValue, _ := value.Float64()
	return !math.IsNaN(floatValue) && !math.IsInf(floatValue, 0)
}
