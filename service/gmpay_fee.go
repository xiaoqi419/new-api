package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
)

// GMPayFeeConfigOptionKey is intentionally a regular Option key.  Keeping the
// serialized value in the existing option store means no schema migration is
// required for installations that use SQLite, MySQL, or PostgreSQL.
const GMPayFeeConfigOptionKey = "GMPayFeeConfig"

const (
	GMPayFeeConfigVersion = 1
	// GMPayFeeSourceChainNetworkEstimate identifies a quote derived from the
	// configured chain RPC and native-asset price source. Keep the value in one
	// place so controller and UI code cannot accidentally invent a new label.
	GMPayFeeSourceChainNetworkEstimate = ChainNetworkEstimateSource
	GMPayFeeSourceAdminFallback        = "admin_fallback"

	// The old source names remain exported for source compatibility with code
	// compiled against the first multi-asset checkout implementation. New
	// quotes use GMPayFeeSourceAdminFallback; both old admin constants resolve
	// to the canonical source so a fallback is never presented as a gateway
	// service fee.
	GMPayFeeSourceGatewayQuote    = "gateway_quote"
	GMPayFeeSourceGatewayIncluded = "gateway_included"
	GMPayFeeSourceAdminFixed      = GMPayFeeSourceAdminFallback
	GMPayFeeSourceAdminPercent    = GMPayFeeSourceAdminFallback

	gmpayFeeDefaultMaxFee   = "20.00"
	gmpayFeeDefaultMaxTotal = "100000.00"
	gmpayFeeAbsoluteLimit   = "1000000000.00"
	gmpayFeeMaxScale        = int32(6)
	gmpayFeeMaxOverrides    = 64
)

var ErrGMPayFeeUnavailable = errors.New("gmpay fee quote is unavailable")

// NormalizeGMPayFeeSource keeps the fee provenance exposed to the browser
// within the small, server-owned vocabulary.  FeeSource is metadata only,
// but accepting arbitrary strings would let an upstream response or a future
// caller inject misleading UI labels into the checkout payload.
func NormalizeGMPayFeeSource(value string) (string, error) {
	source := strings.ToLower(strings.TrimSpace(value))
	if source == "" {
		return GMPayFeeSourceGatewayIncluded, nil
	}
	switch source {
	case ChainNetworkEstimateSource:
		return ChainNetworkEstimateSource, nil
	case GMPayFeeSourceAdminFallback, "admin_fixed", "admin_percent":
		// The rule mode is already available in the server-side quote, so the
		// provenance label must stay one canonical value. This also prevents
		// old aliases from being rendered as a gateway platform fee.
		return GMPayFeeSourceAdminFallback, nil
	case GMPayFeeSourceGatewayQuote,
		GMPayFeeSourceGatewayIncluded,
		"gateway-included":
		return GMPayFeeSourceGatewayIncluded, nil
	default:
		return "", errors.New("gmpay fee source is unsupported")
	}
}

// IsGMPayFeeSource reports whether value is one of the server-defined fee
// provenance labels.  It is intentionally strict and case-insensitive; the
// normalizer should be used when the canonical value is needed.
func IsGMPayFeeSource(value string) bool {
	_, err := NormalizeGMPayFeeSource(value)
	return err == nil
}

// GMPayFeeRule is one fixed-amount or percentage fee rule.  Decimal values
// are kept as strings at the option boundary so binary floating point cannot
// change a configured amount while it is being loaded or saved.
type GMPayFeeRule struct {
	Mode  string `json:"mode"`
	Value string `json:"value"`
}

// GMPayFeeConfig is the versioned administrator-controlled payment-fee
// document. The first version of this feature only contained the fallback
// rule fields (Enabled/Default/Overrides/MaxFee/MaxTotal). Dynamic network
// estimation adds the estimator fields below while retaining those old JSON
// keys so an existing option can be read without a migration.
//
// Overrides use the canonical "TOKEN:network" key (for example,
// "USDC:ethereum"). The estimator's RPC and price-source values are kept in
// the same option document and are copied into NetworkFeeEstimatorConfig by
// NetworkFeeEstimatorConfig().
type GMPayFeeConfig struct {
	Version   int                     `json:"version"`
	Enabled   bool                    `json:"enabled"`
	Default   GMPayFeeRule            `json:"default"`
	Overrides map[string]GMPayFeeRule `json:"overrides"`
	MaxFee    string                  `json:"max_fee"`
	MaxTotal  string                  `json:"max_total"`

	DynamicEnabled      bool                             `json:"dynamic_enabled"`
	Chains              map[string]NetworkFeeChainConfig `json:"chains"`
	TimeoutMilliseconds int                              `json:"timeout_ms"`
	MaxResponseBytes    int64                            `json:"max_response_bytes"`
	MaxRetries          int                              `json:"max_retries"`
	QuoteTTLSeconds     int                              `json:"quote_ttl_seconds"`
	PriceMaxAgeSeconds  int                              `json:"price_max_age_seconds"`

	FallbackEnabled bool   `json:"fallback_enabled"`
	FallbackMode    string `json:"fallback_mode"`
	FallbackValue   string `json:"fallback_value"`

	// These aliases are accepted by the structured editor used by some
	// installations. The estimator consumes the canonical chains/timeout
	// fields above; the aliases are normalized while parsing.
	EstimatorMode              string          `json:"estimator_mode"`
	RPCReferences              json.RawMessage `json:"rpc_references"`
	PriceSourceReferences      json.RawMessage `json:"price_source_references"`
	RequestTimeoutMilliseconds int             `json:"request_timeout_ms"`
	CacheTTLSeconds            int             `json:"cache_ttl_seconds"`
	ResponseBodyLimitBytes     int64           `json:"response_body_limit_bytes"`
	MaxPriceDeviationPercent   string          `json:"max_price_deviation_percent"`
	Contexts                   json.RawMessage `json:"contexts"`

	// fallbackConfigured distinguishes a missing new-schema key from an
	// explicit false. It is intentionally private: callers should use
	// HasFallbackPolicy/IsDynamicEnabled rather than infer presence from the
	// zero value of a bool.
	dynamicConfigured  bool
	fallbackConfigured bool
}

// GMPayFeeQuote is the server-authoritative amount breakdown returned to the
// controller.  Decimal values are never populated from client input.
type GMPayFeeQuote struct {
	BaseAmount         decimal.Decimal
	FeeAmount          decimal.Decimal
	TotalAmount        decimal.Decimal
	Source             string
	NativeAsset        string
	NativeAmount       decimal.Decimal
	SettlementCurrency string
	QuotedAt           time.Time
	ExpiresAt          time.Time
	EstimatorVersion   string
	Confidence         string
	Subsidized         bool
	Evidence           NetworkFeeEvidence
}

func defaultGMPayFeeConfig() GMPayFeeConfig {
	return GMPayFeeConfig{
		Version:                  GMPayFeeConfigVersion,
		Enabled:                  false,
		Overrides:                make(map[string]GMPayFeeRule),
		MaxFee:                   gmpayFeeDefaultMaxFee,
		MaxTotal:                 gmpayFeeDefaultMaxTotal,
		EstimatorMode:            "rpc",
		CacheTTLSeconds:          0,
		FallbackEnabled:          false,
		FallbackMode:             "fixed",
		MaxPriceDeviationPercent: "",
	}
}

// ParseGMPayFeeConfig validates a serialized administrator policy.  A blank
// value means "disabled"; a non-blank value is rejected when its schema,
// decimal bounds, mode, or asset key is invalid.
func ParseGMPayFeeConfig(raw string) (GMPayFeeConfig, error) {
	cfg := defaultGMPayFeeConfig()
	fallbackModeProvided := false
	if strings.TrimSpace(raw) == "" {
		return cfg, nil
	}

	var fields map[string]json.RawMessage
	if err := common.Unmarshal([]byte(raw), &fields); err != nil || fields == nil {
		return cfg, errors.New("gmpay fee config must be a JSON object")
	}
	for key := range fields {
		switch key {
		case "version", "enabled", "default", "overrides", "max_fee", "max_total",
			"dynamic_enabled", "chains", "timeout_ms", "max_response_bytes", "max_retries",
			"quote_ttl_seconds", "price_max_age_seconds", "fallback_enabled", "fallback_mode",
			"fallback_value", "fallback_default", "estimator_mode", "rpc_references",
			"price_source_references", "request_timeout_ms", "cache_ttl_seconds",
			"response_body_limit_bytes", "max_price_deviation_percent", "contexts":
		default:
			return cfg, fmt.Errorf("gmpay fee config contains unknown field %q", key)
		}
	}

	versionRaw, ok := fields["version"]
	if !ok || common.GetJsonType(versionRaw) != "number" {
		return cfg, errors.New("gmpay fee config version is required")
	}
	var version int
	if err := common.Unmarshal(versionRaw, &version); err != nil || version != GMPayFeeConfigVersion {
		return cfg, errors.New("unsupported gmpay fee config version")
	}
	cfg.Version = version

	if enabledRaw, ok := fields["enabled"]; ok {
		if common.GetJsonType(enabledRaw) != "boolean" || common.Unmarshal(enabledRaw, &cfg.Enabled) != nil {
			return cfg, errors.New("gmpay fee config enabled must be boolean")
		}
	}
	if dynamicRaw, ok := fields["dynamic_enabled"]; ok {
		if common.GetJsonType(dynamicRaw) != "boolean" || common.Unmarshal(dynamicRaw, &cfg.DynamicEnabled) != nil {
			return cfg, errors.New("gmpay fee config dynamic_enabled must be boolean")
		}
		cfg.dynamicConfigured = true
	}
	if fallbackRaw, ok := fields["fallback_enabled"]; ok {
		if common.GetJsonType(fallbackRaw) != "boolean" || common.Unmarshal(fallbackRaw, &cfg.FallbackEnabled) != nil {
			return cfg, errors.New("gmpay fee config fallback_enabled must be boolean")
		}
		cfg.fallbackConfigured = true
	}
	if value, ok := fields["estimator_mode"]; ok {
		parsed, err := parseGMPayFeeIdentifier(value, "estimator_mode")
		if err != nil {
			return cfg, err
		}
		cfg.EstimatorMode = parsed
	}
	if value, ok := fields["fallback_mode"]; ok {
		if common.GetJsonType(value) != "string" {
			return cfg, errors.New("gmpay fee fallback_mode must be a string")
		}
		cfg.FallbackMode = strings.ToLower(strings.TrimSpace(common.JsonRawMessageToString(value)))
		if cfg.FallbackMode != "fixed" && cfg.FallbackMode != "percent" {
			return cfg, errors.New("gmpay fee fallback_mode must be fixed or percent")
		}
		fallbackModeProvided = true
	}
	if maxFeeRaw, ok := fields["max_fee"]; ok {
		value, err := parseGMPayFeeDecimal(maxFeeRaw, true)
		if err != nil {
			return cfg, fmt.Errorf("invalid gmpay fee max_fee: %w", err)
		}
		cfg.MaxFee = value.String()
	}
	if maxTotalRaw, ok := fields["max_total"]; ok {
		value, err := parseGMPayFeeDecimal(maxTotalRaw, true)
		if err != nil || value.IsZero() {
			return cfg, errors.New("invalid gmpay fee max_total")
		}
		cfg.MaxTotal = value.String()
	}
	if value, ok := fields["timeout_ms"]; ok {
		parsed, err := parseGMPayFeeInteger(value, 100, int64((30*time.Second)/time.Millisecond), "timeout_ms")
		if err != nil {
			return cfg, err
		}
		cfg.TimeoutMilliseconds = int(parsed)
	}
	if value, ok := fields["request_timeout_ms"]; ok {
		parsed, err := parseGMPayFeeInteger(value, 100, int64((30*time.Second)/time.Millisecond), "request_timeout_ms")
		if err != nil {
			return cfg, err
		}
		if cfg.TimeoutMilliseconds != 0 && cfg.TimeoutMilliseconds != int(parsed) {
			return cfg, errors.New("gmpay fee timeout fields disagree")
		}
		cfg.TimeoutMilliseconds = int(parsed)
		cfg.RequestTimeoutMilliseconds = int(parsed)
	}
	if value, ok := fields["max_response_bytes"]; ok {
		parsed, err := parseGMPayFeeInteger(value, 1024, int64(8<<20), "max_response_bytes")
		if err != nil {
			return cfg, err
		}
		cfg.MaxResponseBytes = parsed
	}
	if value, ok := fields["response_body_limit_bytes"]; ok {
		parsed, err := parseGMPayFeeInteger(value, 1024, int64(8<<20), "response_body_limit_bytes")
		if err != nil {
			return cfg, err
		}
		if cfg.MaxResponseBytes != 0 && cfg.MaxResponseBytes != parsed {
			return cfg, errors.New("gmpay fee response limit fields disagree")
		}
		cfg.MaxResponseBytes = parsed
		cfg.ResponseBodyLimitBytes = parsed
	}
	if value, ok := fields["max_retries"]; ok {
		parsed, err := parseGMPayFeeInteger(value, 0, 2, "max_retries")
		if err != nil {
			return cfg, err
		}
		cfg.MaxRetries = int(parsed)
	}
	if value, ok := fields["quote_ttl_seconds"]; ok {
		parsed, err := parseGMPayFeeInteger(value, 1, int64((24*time.Hour)/time.Second), "quote_ttl_seconds")
		if err != nil {
			return cfg, err
		}
		cfg.QuoteTTLSeconds = int(parsed)
	}
	if value, ok := fields["price_max_age_seconds"]; ok {
		parsed, err := parseGMPayFeeInteger(value, 1, int64((24*time.Hour)/time.Second), "price_max_age_seconds")
		if err != nil {
			return cfg, err
		}
		cfg.PriceMaxAgeSeconds = int(parsed)
	}
	if value, ok := fields["cache_ttl_seconds"]; ok {
		parsed, err := parseGMPayFeeInteger(value, 1, int64((24*time.Hour)/time.Second), "cache_ttl_seconds")
		if err != nil {
			return cfg, err
		}
		cfg.CacheTTLSeconds = int(parsed)
	}
	if value, ok := fields["max_price_deviation_percent"]; ok {
		parsed, err := parseGMPayFeeDecimal(value, true)
		if err != nil || parsed.GreaterThan(decimal.NewFromInt(100)) {
			return cfg, errors.New("gmpay fee max_price_deviation_percent is out of bounds")
		}
		cfg.MaxPriceDeviationPercent = parsed.String()
	}
	for _, key := range []string{"rpc_references", "price_source_references", "contexts"} {
		value, ok := fields[key]
		if !ok {
			continue
		}
		typ := common.GetJsonType(value)
		if typ != "object" && typ != "array" {
			return cfg, fmt.Errorf("gmpay fee %s must be an object or array", key)
		}
		if len(value) > 512*1024 {
			return cfg, fmt.Errorf("gmpay fee %s is too large", key)
		}
		switch key {
		case "rpc_references":
			cfg.RPCReferences = append(json.RawMessage(nil), value...)
		case "price_source_references":
			cfg.PriceSourceReferences = append(json.RawMessage(nil), value...)
		case "contexts":
			cfg.Contexts = append(json.RawMessage(nil), value...)
		}
	}

	maxFee, err := parseGMPayFeeString(cfg.MaxFee, true)
	absoluteLimit, _ := decimal.NewFromString(gmpayFeeAbsoluteLimit)
	if err != nil || maxFee.GreaterThan(absoluteLimit) {
		return cfg, errors.New("gmpay fee max_fee is out of bounds")
	}
	maxTotal, err := parseGMPayFeeString(cfg.MaxTotal, true)
	if err != nil || maxTotal.IsZero() || maxTotal.GreaterThan(absoluteLimit) {
		return cfg, errors.New("gmpay fee max_total is out of bounds")
	}

	if chainsRaw, ok := fields["chains"]; ok {
		if common.GetJsonType(chainsRaw) != "object" {
			return cfg, errors.New("gmpay fee chains must be an object")
		}
		var rawChains map[string]json.RawMessage
		if err := common.Unmarshal(chainsRaw, &rawChains); err != nil || rawChains == nil {
			return cfg, errors.New("invalid gmpay fee chains")
		}
		if len(rawChains) > 16 {
			return cfg, errors.New("gmpay fee chains contain too many networks")
		}
		cfg.Chains = make(map[string]NetworkFeeChainConfig, len(rawChains))
		for key, rawChain := range rawChains {
			network, ok := normalizeEstimatorNetwork(key)
			if !ok {
				return cfg, fmt.Errorf("gmpay fee network %q is unsupported", key)
			}
			chain, parseErr := parseNetworkFeeChainConfig(rawChain, network)
			if parseErr != nil {
				return cfg, fmt.Errorf("invalid gmpay fee config for %s: %w", network, parseErr)
			}
			if _, exists := cfg.Chains[network]; exists {
				return cfg, fmt.Errorf("duplicate gmpay fee network %q", network)
			}
			cfg.Chains[network] = chain
		}
	}
	if len(cfg.Chains) == 0 {
		if err := populateGMPayEstimatorChainsFromAliases(&cfg); err != nil {
			return cfg, err
		}
	}

	if defaultRaw, ok := fields["default"]; ok {
		rule, err := parseGMPayFeeRule(defaultRaw, maxFee)
		if err != nil {
			return cfg, fmt.Errorf("invalid gmpay default fee: %w", err)
		}
		cfg.Default = rule
		if !fallbackModeProvided {
			cfg.FallbackMode = rule.Mode
		}
	}
	if overridesRaw, ok := fields["overrides"]; ok {
		if common.GetJsonType(overridesRaw) != "object" {
			return cfg, errors.New("gmpay fee overrides must be an object")
		}
		var rawOverrides map[string]json.RawMessage
		if err := common.Unmarshal(overridesRaw, &rawOverrides); err != nil {
			return cfg, errors.New("invalid gmpay fee overrides")
		}
		if len(rawOverrides) > gmpayFeeMaxOverrides {
			return cfg, errors.New("gmpay fee overrides contain too many rules")
		}
		cfg.Overrides = make(map[string]GMPayFeeRule, len(rawOverrides))
		for key, rawRule := range rawOverrides {
			canonicalKey, err := canonicalGMPayFeeAssetKey(key)
			if err != nil {
				return cfg, err
			}
			if _, exists := cfg.Overrides[canonicalKey]; exists {
				return cfg, fmt.Errorf("duplicate gmpay fee override %q", canonicalKey)
			}
			rule, err := parseGMPayFeeRule(rawRule, maxFee)
			if err != nil {
				return cfg, fmt.Errorf("invalid gmpay fee override %q: %w", key, err)
			}
			cfg.Overrides[canonicalKey] = rule
		}
	}
	if fallbackDefaultRaw, ok := fields["fallback_default"]; ok {
		if _, defaultPresent := fields["default"]; defaultPresent {
			return cfg, errors.New("gmpay fee default and fallback_default cannot both be set")
		}
		rule, parseErr := parseGMPayFeeRule(fallbackDefaultRaw, maxFee)
		if parseErr != nil {
			return cfg, fmt.Errorf("invalid gmpay fallback fee: %w", parseErr)
		}
		cfg.Default = rule
		if !fallbackModeProvided {
			cfg.FallbackMode = rule.Mode
		}
	}
	if fallbackValueRaw, ok := fields["fallback_value"]; ok {
		if !fallbackModeProvided {
			return cfg, errors.New("gmpay fallback_mode is required with fallback_value")
		}
		value, parseErr := parseGMPayFeeDecimal(fallbackValueRaw, true)
		if parseErr != nil {
			return cfg, parseErr
		}
		switch cfg.FallbackMode {
		case "fixed":
			if value.GreaterThan(maxFee) {
				return cfg, errors.New("gmpay fallback value exceeds max_fee")
			}
		case "percent":
			if value.GreaterThan(decimal.NewFromInt(100)) {
				return cfg, errors.New("gmpay fallback percentage exceeds 100")
			}
		default:
			return cfg, errors.New("gmpay fallback_mode must be fixed or percent")
		}
		cfg.FallbackValue = value.String()
		cfg.Default = GMPayFeeRule{Mode: cfg.FallbackMode, Value: cfg.FallbackValue}
	}
	if cfg.FallbackMode != "" && cfg.Default.Mode != "" && cfg.FallbackMode != cfg.Default.Mode {
		return cfg, errors.New("gmpay fallback_mode does not match default rule")
	}
	if cfg.Default.Mode != "" {
		cfg.FallbackMode = cfg.Default.Mode
		if cfg.FallbackValue == "" {
			cfg.FallbackValue = cfg.Default.Value
		}
	}
	if !cfg.fallbackConfigured {
		// In version 1, enabled meant that the administrator wanted the fixed
		// or percentage rule applied. Treat it as the fallback switch only when
		// the new explicit switch is absent.
		cfg.FallbackEnabled = cfg.Enabled
	}
	if cfg.DynamicEnabled && len(cfg.Chains) == 0 {
		return cfg, errors.New("gmpay dynamic fee config requires chains")
	}
	if len(cfg.Chains) > 0 {
		if _, estimatorErr := NewNetworkFeeEstimator(cfg.NetworkFeeEstimatorConfig()); estimatorErr != nil {
			return cfg, fmt.Errorf("invalid gmpay network fee estimator: %w", estimatorErr)
		}
	}
	return cfg, nil
}

// populateGMPayEstimatorChainsFromAliases bridges the structured settings
// editor's reference/context shape to the estimator's canonical chain shape.
// References are intentionally treated as endpoint values only after the
// estimator's own HTTPS/host-allowlist validation; a request can never supply
// or override them. This also keeps older installations that persisted the
// alias fields usable without a database migration.
func populateGMPayEstimatorChainsFromAliases(cfg *GMPayFeeConfig) error {
	if cfg == nil || (len(cfg.RPCReferences) == 0 && len(cfg.PriceSourceReferences) == 0 && len(cfg.Contexts) == 0) {
		return nil
	}
	var rpcReferences map[string]json.RawMessage
	var priceReferences map[string]json.RawMessage
	var contexts map[string]json.RawMessage
	if len(cfg.RPCReferences) > 0 && (common.GetJsonType(cfg.RPCReferences) != "object" || common.Unmarshal(cfg.RPCReferences, &rpcReferences) != nil) {
		return errors.New("gmpay fee rpc_references must be an object")
	}
	if len(cfg.PriceSourceReferences) > 0 && (common.GetJsonType(cfg.PriceSourceReferences) != "object" || common.Unmarshal(cfg.PriceSourceReferences, &priceReferences) != nil) {
		return errors.New("gmpay fee price_source_references must be an object")
	}
	if len(cfg.Contexts) > 0 && (common.GetJsonType(cfg.Contexts) != "object" || common.Unmarshal(cfg.Contexts, &contexts) != nil) {
		return errors.New("gmpay fee contexts must be an object")
	}
	if len(rpcReferences) == 0 && len(priceReferences) == 0 {
		return nil
	}
	networks := make(map[string]struct{}, len(rpcReferences)+len(priceReferences))
	for rawNetwork := range rpcReferences {
		network, ok := normalizeEstimatorNetwork(rawNetwork)
		if !ok {
			return fmt.Errorf("gmpay fee network %q is unsupported", rawNetwork)
		}
		networks[network] = struct{}{}
	}
	for rawNetwork := range priceReferences {
		network, ok := normalizeEstimatorNetwork(rawNetwork)
		if !ok {
			return fmt.Errorf("gmpay fee network %q is unsupported", rawNetwork)
		}
		networks[network] = struct{}{}
	}
	cfg.Chains = make(map[string]NetworkFeeChainConfig, len(networks))
	for network := range networks {
		rpcURL, rpcOK, err := aliasStringValue(rpcReferences, network)
		if err != nil {
			return fmt.Errorf("invalid gmpay fee rpc reference for %s: %w", network, err)
		}
		priceURL, priceOK, err := aliasStringValue(priceReferences, network)
		if err != nil {
			return fmt.Errorf("invalid gmpay fee price reference for %s: %w", network, err)
		}
		if !rpcOK || !priceOK || rpcURL == "" || priceURL == "" {
			return fmt.Errorf("gmpay fee network %s requires both rpc and price references", network)
		}
		chain := NetworkFeeChainConfig{
			RPCURL:             rpcURL,
			PriceURL:           priceURL,
			NativeAsset:        expectedNativeAsset(network),
			SettlementCurrency: gmpaySettlementCurrencyForEstimator,
		}
		if rawContext, ok := aliasRawValue(contexts, network); ok {
			transaction, parseErr := parseNetworkFeeTransactionContext(rawContext)
			if parseErr != nil {
				return fmt.Errorf("invalid gmpay fee transaction context for %s: %w", network, parseErr)
			}
			chain.Transaction = transaction
		}
		cfg.Chains[network] = chain
	}
	return nil
}

const gmpaySettlementCurrencyForEstimator = "USD"

func aliasStringValue(values map[string]json.RawMessage, network string) (string, bool, error) {
	raw, ok := aliasRawValue(values, network)
	if !ok {
		return "", false, nil
	}
	if common.GetJsonType(raw) != "string" {
		return "", false, errors.New("reference must be a string")
	}
	return strings.TrimSpace(common.JsonRawMessageToString(raw)), true, nil
}

func aliasRawValue(values map[string]json.RawMessage, network string) (json.RawMessage, bool) {
	for rawNetwork, rawValue := range values {
		canonical, ok := normalizeEstimatorNetwork(rawNetwork)
		if ok && canonical == network {
			return rawValue, true
		}
	}
	return nil, false
}

// NetworkFeeEstimatorConfig returns the server-owned estimator portion of the
// GMPay option. A copy is returned so callers cannot mutate the configuration
// that was validated while it was read from OptionMap.
func (cfg GMPayFeeConfig) NetworkFeeEstimatorConfig() NetworkFeeEstimatorConfig {
	chains := make(map[string]NetworkFeeChainConfig, len(cfg.Chains))
	for network, chain := range cfg.Chains {
		chain.RPCAllowedHosts = append([]string(nil), chain.RPCAllowedHosts...)
		chain.PriceAllowedHosts = append([]string(nil), chain.PriceAllowedHosts...)
		chain.PriceURLs = append([]string(nil), chain.PriceURLs...)
		chains[network] = chain
	}
	config := NetworkFeeEstimatorConfig{
		Version:                  cfg.Version,
		DynamicEnabled:           cfg.DynamicEnabled,
		Chains:                   chains,
		TimeoutMilliseconds:      cfg.TimeoutMilliseconds,
		MaxResponseBytes:         cfg.MaxResponseBytes,
		MaxRetries:               cfg.MaxRetries,
		CacheTTLSeconds:          cfg.CacheTTLSeconds,
		QuoteTTLSeconds:          cfg.QuoteTTLSeconds,
		PriceMaxAgeSeconds:       cfg.PriceMaxAgeSeconds,
		MaxPriceDeviationPercent: cfg.MaxPriceDeviationPercent,
		MaxFee:                   cfg.MaxFee,
		MaxTotal:                 cfg.MaxTotal,
	}
	return config
}

// IsDynamicEnabled reports whether this option explicitly enables the
// chain-network estimator. The explicit field is deliberately separate from
// the legacy Enabled flag, which controls only the administrator fallback.
func (cfg GMPayFeeConfig) IsDynamicEnabled() bool {
	return cfg.DynamicEnabled
}

// HasFallbackPolicy reports whether an administrator has explicitly enabled
// a fixed or percentage fallback. Legacy version-1 configs map Enabled to the
// same policy for backward compatibility.
func (cfg GMPayFeeConfig) HasFallbackPolicy() bool {
	return cfg.FallbackEnabled
}

// CurrentNetworkFeeEstimator creates an immutable estimator from the current
// GMPay option. It never creates an estimator for a disabled dynamic policy,
// and malformed/missing configuration is returned as unavailable so callers
// can choose the explicit fallback or fail closed.
func CurrentNetworkFeeEstimator() (NetworkFeeEstimator, error) {
	cfg, err := CurrentGMPayFeeConfig()
	if err != nil {
		return nil, fmt.Errorf("%w: invalid gmpay fee config", ErrNetworkFeeUnavailable)
	}
	if !cfg.IsDynamicEnabled() {
		return nil, fmt.Errorf("%w: dynamic estimation is disabled", ErrNetworkFeeUnavailable)
	}
	estimator, err := NewNetworkFeeEstimator(cfg.NetworkFeeEstimatorConfig())
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrNetworkFeeUnavailable, err)
	}
	return estimator, nil
}

// GMPayFeeQuoteFromNetworkQuote converts a validated chain estimate into the
// two-decimal quote used by the GMPay checkout.  The conversion deliberately
// accepts only a chain-network estimate; gateway response fields are not a
// quote source.  expectedBaseAmount, token, network, and settlementCurrency
// must be the values derived by the server for the current request.
func GMPayFeeQuoteFromNetworkQuote(networkQuote NetworkFeeQuote, expectedBaseAmount decimal.Decimal, token, network, settlementCurrency string) (GMPayFeeQuote, error) {
	source, err := NormalizeGMPayFeeSource(networkQuote.Source)
	if err != nil || source != GMPayFeeSourceChainNetworkEstimate {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	if expectedBaseAmount.LessThanOrEqual(decimal.Zero) || !decimalIsFinite(expectedBaseAmount) ||
		networkQuote.BaseAmount.LessThanOrEqual(decimal.Zero) || !decimalIsFinite(networkQuote.BaseAmount) ||
		!networkQuote.BaseAmount.Equal(expectedBaseAmount) {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	if networkQuote.FeeAmount.IsNegative() || !decimalIsFinite(networkQuote.FeeAmount) ||
		networkQuote.TotalAmount.LessThanOrEqual(decimal.Zero) || !decimalIsFinite(networkQuote.TotalAmount) ||
		!networkQuote.BaseAmount.Add(networkQuote.FeeAmount).Equal(networkQuote.TotalAmount) {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	if networkQuote.NativeAmount.IsNegative() || !decimalIsFinite(networkQuote.NativeAmount) ||
		strings.TrimSpace(networkQuote.NativeAsset) == "" || strings.TrimSpace(networkQuote.EstimatorVersion) == "" {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	if networkQuote.FeeAmount.IsZero() && (!networkQuote.Subsidized || strings.TrimSpace(networkQuote.Evidence.RPCMethod) == "") {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	quotedAt := networkQuote.QuotedAt.UTC()
	expiresAt := networkQuote.ExpiresAt.UTC()
	now := time.Now().UTC()
	if quotedAt.IsZero() || expiresAt.IsZero() || !expiresAt.After(quotedAt) || !expiresAt.After(now) {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}

	expectedToken := strings.ToUpper(strings.TrimSpace(token))
	actualToken := strings.ToUpper(strings.TrimSpace(networkQuote.Token))
	if actualToken != expectedToken || (expectedToken != "USDT" && expectedToken != "USDC") {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	expectedNetwork, expectedNetworkKnown := NormalizeGMPayNetwork(network)
	quotedNetwork, quotedNetworkKnown := NormalizeGMPayNetwork(networkQuote.Network)
	if !expectedNetworkKnown || !quotedNetworkKnown || expectedNetwork != quotedNetwork {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	if strings.ToUpper(strings.TrimSpace(networkQuote.NativeAsset)) != expectedNativeAsset(expectedNetwork) {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	expectedCurrency := strings.ToUpper(strings.TrimSpace(settlementCurrency))
	quotedCurrency := strings.ToUpper(strings.TrimSpace(networkQuote.SettlementCurrency))
	if expectedCurrency == "" || quotedCurrency == "" || expectedCurrency != quotedCurrency {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}

	cfg, cfgErr := CurrentGMPayFeeConfig()
	if cfgErr != nil {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	maxFee, maxFeeErr := parseGMPayFeeString(cfg.MaxFee, true)
	maxTotal, maxTotalErr := parseGMPayFeeString(cfg.MaxTotal, true)
	absoluteLimit, absoluteErr := decimal.NewFromString(gmpayFeeAbsoluteLimit)
	if maxFeeErr != nil || maxTotalErr != nil || absoluteErr != nil || maxTotal.IsZero() ||
		networkQuote.FeeAmount.GreaterThan(maxFee) || networkQuote.TotalAmount.GreaterThan(maxTotal) ||
		networkQuote.FeeAmount.GreaterThan(absoluteLimit) || networkQuote.TotalAmount.GreaterThan(absoluteLimit) {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}

	// GMPay's fiat amount is sent with two decimal places.  Quantize both
	// components server-side so the frozen TopUp.Money and the signed gateway
	// amount cannot diverge because of a decimal-to-float conversion.
	baseAmount := expectedBaseAmount.RoundDown(2)
	feeAmount := networkQuote.FeeAmount.RoundDown(2)
	totalAmount := baseAmount.Add(feeAmount).RoundDown(2)
	if baseAmount.LessThanOrEqual(decimal.Zero) || feeAmount.IsNegative() ||
		(feeAmount.IsZero() && !networkQuote.Subsidized) ||
		totalAmount.LessThanOrEqual(decimal.Zero) || !baseAmount.Add(feeAmount).Equal(totalAmount) ||
		totalAmount.GreaterThan(maxTotal) || feeAmount.GreaterThan(maxFee) {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	return GMPayFeeQuote{
		BaseAmount:         baseAmount,
		FeeAmount:          feeAmount,
		TotalAmount:        totalAmount,
		Source:             GMPayFeeSourceChainNetworkEstimate,
		NativeAsset:        strings.ToUpper(strings.TrimSpace(networkQuote.NativeAsset)),
		NativeAmount:       networkQuote.NativeAmount,
		SettlementCurrency: quotedCurrency,
		QuotedAt:           quotedAt,
		ExpiresAt:          expiresAt,
		EstimatorVersion:   strings.TrimSpace(networkQuote.EstimatorVersion),
		Confidence:         strings.TrimSpace(networkQuote.Confidence),
		Subsidized:         networkQuote.Subsidized,
		Evidence:           networkQuote.Evidence,
	}, nil
}

func parseGMPayFeeRule(raw json.RawMessage, maxFee decimal.Decimal) (GMPayFeeRule, error) {
	if common.GetJsonType(raw) != "object" {
		return GMPayFeeRule{}, errors.New("fee rule must be an object")
	}
	var fields map[string]json.RawMessage
	if err := common.Unmarshal(raw, &fields); err != nil || fields == nil {
		return GMPayFeeRule{}, errors.New("fee rule must be an object")
	}
	for key := range fields {
		if key != "mode" && key != "value" {
			return GMPayFeeRule{}, fmt.Errorf("unknown fee rule field %q", key)
		}
	}
	modeRaw, modeOK := fields["mode"]
	valueRaw, valueOK := fields["value"]
	if !modeOK || !valueOK || common.GetJsonType(modeRaw) != "string" {
		return GMPayFeeRule{}, errors.New("fee rule mode and value are required")
	}
	var mode string
	if err := common.Unmarshal(modeRaw, &mode); err != nil {
		return GMPayFeeRule{}, errors.New("fee rule mode is invalid")
	}
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode != "fixed" && mode != "percent" {
		return GMPayFeeRule{}, errors.New("fee rule mode must be fixed or percent")
	}
	value, err := parseGMPayFeeDecimal(valueRaw, true)
	if err != nil {
		return GMPayFeeRule{}, err
	}
	if mode == "fixed" && value.GreaterThan(maxFee) {
		return GMPayFeeRule{}, errors.New("fixed fee exceeds max_fee")
	}
	if mode == "percent" && value.GreaterThan(decimal.NewFromInt(100)) {
		return GMPayFeeRule{}, errors.New("percentage fee exceeds 100")
	}
	return GMPayFeeRule{Mode: mode, Value: value.String()}, nil
}

func parseGMPayFeeDecimal(raw json.RawMessage, allowZero bool) (decimal.Decimal, error) {
	typ := common.GetJsonType(raw)
	if typ != "string" && typ != "number" {
		return decimal.Zero, errors.New("fee value must be a decimal string or number")
	}
	value := strings.TrimSpace(common.JsonRawMessageToString(raw))
	return parseGMPayFeeString(value, allowZero)
}

func parseGMPayFeeIdentifier(raw json.RawMessage, field string) (string, error) {
	if common.GetJsonType(raw) != "string" {
		return "", fmt.Errorf("gmpay fee %s must be a string", field)
	}
	value := strings.TrimSpace(common.JsonRawMessageToString(raw))
	if value == "" || !identifierPattern.MatchString(value) {
		return "", fmt.Errorf("gmpay fee %s is invalid", field)
	}
	return value, nil
}

func parseGMPayFeeInteger(raw json.RawMessage, minimum, maximum int64, field string) (int64, error) {
	typ := common.GetJsonType(raw)
	if typ != "number" && typ != "string" {
		return 0, fmt.Errorf("gmpay fee %s must be an integer", field)
	}
	value := strings.TrimSpace(common.JsonRawMessageToString(raw))
	if value == "" || strings.ContainsAny(value, ".eE+-") {
		return 0, fmt.Errorf("gmpay fee %s must be an integer", field)
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < minimum || parsed > maximum {
		return 0, fmt.Errorf("gmpay fee %s is out of bounds", field)
	}
	return parsed, nil
}

func parseGMPayFeeString(value string, allowZero bool) (decimal.Decimal, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return decimal.Zero, errors.New("fee value is empty")
	}
	amount, err := decimal.NewFromString(value)
	if err != nil || (!allowZero && !amount.GreaterThan(decimal.Zero)) || (allowZero && amount.IsNegative()) {
		return decimal.Zero, errors.New("fee value must be non-negative")
	}
	if amount.Exponent() < -gmpayFeeMaxScale {
		return decimal.Zero, errors.New("fee value has too many decimal places")
	}
	f, _ := amount.Float64()
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return decimal.Zero, errors.New("fee value must be finite")
	}
	return amount, nil
}

func canonicalGMPayFeeAssetKey(value string) (string, error) {
	parts := strings.Split(value, ":")
	if len(parts) != 2 {
		return "", errors.New("gmpay fee override key must be TOKEN:network")
	}
	token := strings.ToUpper(strings.TrimSpace(parts[0]))
	if token != "USDT" && token != "USDC" {
		return "", errors.New("gmpay fee override token is unsupported")
	}
	network, ok := NormalizeGMPayNetwork(parts[1])
	if !ok {
		return "", errors.New("gmpay fee override network is unsupported")
	}
	return token + ":" + network, nil
}

// CurrentGMPayFeeConfig reads the option map using a read lock.  A few older
// builds represented registered settings as a dotted key, so those keys are
// accepted as a compatibility fallback while the canonical key remains
// GMPayFeeConfig.
func CurrentGMPayFeeConfig() (GMPayFeeConfig, error) {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[GMPayFeeConfigOptionKey]
	if strings.TrimSpace(raw) == "" {
		for _, key := range []string{"billing_setting.gmpay_fee_config", "payment_setting.gmpay_fee_config"} {
			if candidate := common.OptionMap[key]; strings.TrimSpace(candidate) != "" {
				raw = candidate
				break
			}
		}
	}
	common.OptionMapRWMutex.RUnlock()
	return ParseGMPayFeeConfig(raw)
}

// GMPayFeeQuoteForAsset computes a bounded, two-decimal administrator
// fallback quote. Dynamic estimation is intentionally not attempted here;
// callers must invoke CurrentNetworkFeeEstimator first and call this function
// only after that attempt fails. When neither dynamic estimation nor the
// explicit fallback policy is enabled, the legacy gateway-included quote is
// retained for installations that have not opted into this capability. When
// dynamic mode is enabled, however, this function never turns an unavailable
// estimate into a silent zero-fee success.
func GMPayFeeQuoteForAsset(baseAmount decimal.Decimal, token, network string) (GMPayFeeQuote, error) {
	if baseAmount.LessThanOrEqual(decimal.Zero) {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	baseAmount = baseAmount.RoundDown(2)
	cfg, err := CurrentGMPayFeeConfig()
	if err != nil {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	maxTotal, _ := parseGMPayFeeString(cfg.MaxTotal, true)
	if maxTotal.IsZero() || baseAmount.GreaterThan(maxTotal) {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	quote := GMPayFeeQuote{BaseAmount: baseAmount, FeeAmount: decimal.Zero, TotalAmount: baseAmount, Source: GMPayFeeSourceGatewayIncluded}
	if !cfg.HasFallbackPolicy() {
		if cfg.IsDynamicEnabled() {
			return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
		}
		return quote, nil
	}

	canonicalKey, keyErr := canonicalGMPayFeeAssetKey(strings.ToUpper(strings.TrimSpace(token)) + ":" + strings.TrimSpace(network))
	if keyErr != nil {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	rule, ok := cfg.Overrides[canonicalKey]
	if !ok {
		rule = cfg.Default
	}
	if rule.Mode == "" {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	value, err := parseGMPayFeeString(rule.Value, true)
	if err != nil {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	fee := value
	if rule.Mode == "percent" {
		fee = baseAmount.Mul(value).Div(decimal.NewFromInt(100))
	}
	fee = fee.RoundDown(2)
	maxFee, err := parseGMPayFeeString(cfg.MaxFee, true)
	if err != nil || fee.GreaterThan(maxFee) {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	total := baseAmount.Add(fee).RoundDown(2)
	if total.GreaterThan(maxTotal) || !total.GreaterThan(decimal.Zero) {
		return GMPayFeeQuote{}, ErrGMPayFeeUnavailable
	}
	quote.FeeAmount = fee
	quote.TotalAmount = total
	quote.Source = GMPayFeeSourceAdminFallback
	quote.QuotedAt = time.Now().UTC()
	ttl := 5 * time.Minute
	if cfg.QuoteTTLSeconds > 0 {
		ttl = time.Duration(cfg.QuoteTTLSeconds) * time.Second
	}
	quote.ExpiresAt = quote.QuotedAt.Add(ttl)
	return quote, nil
}
