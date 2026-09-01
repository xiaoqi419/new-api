package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
)

// GMPayFeeConfigOptionKey is intentionally a regular Option key.  Keeping the
// serialized value in the existing option store means no schema migration is
// required for installations that use SQLite, MySQL, or PostgreSQL.
const GMPayFeeConfigOptionKey = "GMPayFeeConfig"

const (
	GMPayFeeConfigVersion         = 1
	GMPayFeeSourceGatewayQuote    = "gateway_quote"
	GMPayFeeSourceGatewayIncluded = "gateway_included"
	GMPayFeeSourceAdminFixed      = "admin_fixed"
	GMPayFeeSourceAdminPercent    = "admin_percent"

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
	case GMPayFeeSourceGatewayQuote,
		GMPayFeeSourceGatewayIncluded,
		GMPayFeeSourceAdminFixed,
		GMPayFeeSourceAdminPercent:
		return source, nil
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

// GMPayFeeConfig is the versioned, administrator-controlled fallback policy.
// Overrides use the canonical "TOKEN:network" key (for example,
// "USDC:ethereum").
type GMPayFeeConfig struct {
	Version   int                     `json:"version"`
	Enabled   bool                    `json:"enabled"`
	Default   GMPayFeeRule            `json:"default"`
	Overrides map[string]GMPayFeeRule `json:"overrides"`
	MaxFee    string                  `json:"max_fee"`
	MaxTotal  string                  `json:"max_total"`
}

// GMPayFeeQuote is the server-authoritative amount breakdown returned to the
// controller.  Decimal values are never populated from client input.
type GMPayFeeQuote struct {
	BaseAmount  decimal.Decimal
	FeeAmount   decimal.Decimal
	TotalAmount decimal.Decimal
	Source      string
}

func defaultGMPayFeeConfig() GMPayFeeConfig {
	return GMPayFeeConfig{
		Version:   GMPayFeeConfigVersion,
		Enabled:   false,
		Overrides: make(map[string]GMPayFeeRule),
		MaxFee:    gmpayFeeDefaultMaxFee,
		MaxTotal:  gmpayFeeDefaultMaxTotal,
	}
}

// ParseGMPayFeeConfig validates a serialized administrator policy.  A blank
// value means "disabled"; a non-blank value is rejected when its schema,
// decimal bounds, mode, or asset key is invalid.
func ParseGMPayFeeConfig(raw string) (GMPayFeeConfig, error) {
	cfg := defaultGMPayFeeConfig()
	if strings.TrimSpace(raw) == "" {
		return cfg, nil
	}

	var fields map[string]json.RawMessage
	if err := common.Unmarshal([]byte(raw), &fields); err != nil || fields == nil {
		return cfg, errors.New("gmpay fee config must be a JSON object")
	}
	for key := range fields {
		switch key {
		case "version", "enabled", "default", "overrides", "max_fee", "max_total":
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

	maxFee, err := parseGMPayFeeString(cfg.MaxFee, true)
	absoluteLimit, _ := decimal.NewFromString(gmpayFeeAbsoluteLimit)
	if err != nil || maxFee.GreaterThan(absoluteLimit) {
		return cfg, errors.New("gmpay fee max_fee is out of bounds")
	}
	maxTotal, err := parseGMPayFeeString(cfg.MaxTotal, true)
	if err != nil || maxTotal.IsZero() || maxTotal.GreaterThan(absoluteLimit) {
		return cfg, errors.New("gmpay fee max_total is out of bounds")
	}

	if defaultRaw, ok := fields["default"]; ok {
		rule, err := parseGMPayFeeRule(defaultRaw, maxFee)
		if err != nil {
			return cfg, fmt.Errorf("invalid gmpay default fee: %w", err)
		}
		cfg.Default = rule
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
	return cfg, nil
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

// GMPayFeeQuoteForAsset computes a bounded, two-decimal fallback quote.  When
// the policy is absent or disabled, the gateway's amount is treated as the
// total and the fee is explicitly zero.  This preserves existing deployments
// until an administrator enables a fee rule.
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
	if !cfg.Enabled {
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
	if rule.Mode == "fixed" {
		quote.Source = GMPayFeeSourceAdminFixed
	} else {
		quote.Source = GMPayFeeSourceAdminPercent
	}
	return quote, nil
}
