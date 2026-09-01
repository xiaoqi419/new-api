package service

import (
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseGMPayFeeConfigAndQuote(t *testing.T) {
	raw := `{"version":1,"enabled":true,"default":{"mode":"fixed","value":"5.00"},"overrides":{"USDC:ERC20":{"mode":"percent","value":"1.50"}},"max_fee":"20.00","max_total":"100000.00"}`
	cfg, err := ParseGMPayFeeConfig(raw)
	require.NoError(t, err)
	assert.True(t, cfg.Enabled)
	assert.Equal(t, "USDC:ethereum", func() string {
		for key := range cfg.Overrides {
			return key
		}
		return ""
	}())

	previous := common.OptionMap
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{GMPayFeeConfigOptionKey: raw}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})

	fixed, err := GMPayFeeQuoteForAsset(decimal.NewFromInt(30), "USDT", "tron")
	require.NoError(t, err)
	assert.Equal(t, "30.00", fixed.BaseAmount.StringFixed(2))
	assert.Equal(t, "5.00", fixed.FeeAmount.StringFixed(2))
	assert.Equal(t, "35.00", fixed.TotalAmount.StringFixed(2))
	assert.Equal(t, GMPayFeeSourceAdminFixed, fixed.Source)

	percent, err := GMPayFeeQuoteForAsset(decimal.NewFromInt(30), "USDC", "erc20")
	require.NoError(t, err)
	assert.Equal(t, "0.45", percent.FeeAmount.StringFixed(2))
	assert.Equal(t, "30.45", percent.TotalAmount.StringFixed(2))
	assert.Equal(t, GMPayFeeSourceAdminPercent, percent.Source)
}

func TestGMPayFeeConfigRejectsUnsafeRules(t *testing.T) {
	testCases := []string{
		`{"version":2,"enabled":true}`,
		`{"version":1,"enabled":true,"default":{"mode":"unknown","value":"1"}}`,
		`{"version":1,"enabled":true,"default":{"mode":"fixed","value":"-1"}}`,
		`{"version":1,"enabled":true,"default":{"mode":"percent","value":"100.01"}}`,
		`{"version":1,"enabled":true,"overrides":{"BTC:tron":{"mode":"fixed","value":"1"}}}`,
		`{"version":1,"enabled":true,"default":{"mode":"fixed","value":"1.0000001"}}`,
		`{"version":1,"enabled":true,"overrides":{"USDC:erc20":{"mode":"fixed","value":"1"},"USDC:ethereum":{"mode":"fixed","value":"2"}}}`,
		`{"version":1,"fallback_enabled":true,"fallback_mode":"percent","fallback_value":"1000","max_fee":"100000"}`,
	}
	for _, raw := range testCases {
		_, err := ParseGMPayFeeConfig(raw)
		assert.Error(t, err, raw)
	}
}

func TestParseGMPayFeeConfigInfersLegacyDefaultMode(t *testing.T) {
	cfg, err := ParseGMPayFeeConfig(`{"version":1,"enabled":true,"default":{"mode":"percent","value":"50"},"max_fee":"100000"}`)
	require.NoError(t, err)
	assert.Equal(t, "percent", cfg.FallbackMode)
	assert.Equal(t, "50", cfg.Default.Value)
}

func TestParseGMPayFeeConfigRequiresFallbackModeForFallbackValue(t *testing.T) {
	_, err := ParseGMPayFeeConfig(`{"version":1,"fallback_enabled":true,"fallback_value":"5"}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "fallback_mode")
}

func TestNormalizeGMPayFeeSourceIsStrict(t *testing.T) {
	for _, source := range []string{
		GMPayFeeSourceGatewayQuote,
		GMPayFeeSourceGatewayIncluded,
		GMPayFeeSourceAdminFixed,
		GMPayFeeSourceAdminPercent,
		" ADMIN_FIXED ",
	} {
		canonical, err := NormalizeGMPayFeeSource(source)
		require.NoError(t, err)
		assert.NotEmpty(t, canonical)
	}
	canonical, err := NormalizeGMPayFeeSource("")
	require.NoError(t, err)
	assert.Equal(t, GMPayFeeSourceGatewayIncluded, canonical)
	for _, source := range []string{"client", "<script>", "gateway_quote\nextra"} {
		_, err := NormalizeGMPayFeeSource(source)
		assert.Error(t, err, source)
	}
}

func TestParseGMPayAmountRejectsOutOfRangeAndPrecision(t *testing.T) {
	for _, value := range []string{
		"0",
		"-1",
		"1.0000001",
		"1000000000.01",
		"1e1000",
		strings.Repeat("9", 129),
	} {
		_, err := ParseGMPayAmount(value, false)
		assert.Error(t, err, value)
	}
	zero, err := ParseGMPayAmount("0", true)
	require.NoError(t, err)
	assert.True(t, zero.IsZero())
	valid, err := ParseGMPayAmount("1000000000.00", false)
	require.NoError(t, err)
	assert.Equal(t, "1000000000", valid.String())
}

func TestGMPayFeeDisabledUsesGatewayIncludedAmount(t *testing.T) {
	previous := common.OptionMap
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{GMPayFeeConfigOptionKey: `{"version":1,"enabled":false}`}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})

	base, parseErr := decimal.NewFromString("12.345")
	require.NoError(t, parseErr)
	quote, err := GMPayFeeQuoteForAsset(base, "USDT", "tron")
	require.NoError(t, err)
	assert.Equal(t, "12.34", quote.BaseAmount.StringFixed(2))
	assert.True(t, quote.FeeAmount.IsZero())
	assert.Equal(t, GMPayFeeSourceGatewayIncluded, quote.Source)
}

func TestGMPayFeeQuoteFromNetworkQuoteRequiresAuditableEvidence(t *testing.T) {
	previous := common.OptionMap
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{GMPayFeeConfigOptionKey: `{"version":1,"max_fee":"20.00","max_total":"100000.00"}`}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})

	now := time.Now().UTC()
	valid := NetworkFeeQuote{
		Token:              "USDT",
		Network:            "ethereum",
		Source:             ChainNetworkEstimateSource,
		EstimatorVersion:   "chain-network-v1+builtin",
		NativeAsset:        "ETH",
		NativeAmount:       decimal.RequireFromString("0.00002"),
		FeeAmount:          decimal.RequireFromString("0.06"),
		BaseAmount:         decimal.NewFromInt(1),
		TotalAmount:        decimal.RequireFromString("1.06"),
		SettlementCurrency: "USD",
		QuotedAt:           now.Add(-time.Second),
		ExpiresAt:          now.Add(time.Minute),
		Confidence:         "high",
		Evidence: NetworkFeeEvidence{
			RPCMethod:      "eth_estimateGas",
			RPCSource:      "cloudflare-eth.com",
			PriceSource:    "api.coingecko.com",
			PriceTimestamp: now.Unix(),
		},
	}
	quote, err := GMPayFeeQuoteFromNetworkQuote(valid, decimal.NewFromInt(1), "USDT", "ethereum", "USD")
	require.NoError(t, err)
	assert.Equal(t, "1.06", quote.TotalAmount.StringFixed(2))

	for name, mutate := range map[string]func(*NetworkFeeQuote){
		"missing rpc evidence": func(candidate *NetworkFeeQuote) { candidate.Evidence.RPCMethod = "" },
		"missing rpc source":   func(candidate *NetworkFeeQuote) { candidate.Evidence.RPCSource = "" },
		"missing price source": func(candidate *NetworkFeeQuote) { candidate.Evidence.PriceSource = "" },
		"missing price timestamp": func(candidate *NetworkFeeQuote) {
			candidate.Evidence.PriceTimestamp = 0
		},
		"expired quote": func(candidate *NetworkFeeQuote) { candidate.ExpiresAt = now.Add(-time.Second) },
	} {
		t.Run(name, func(t *testing.T) {
			candidate := valid
			mutate(&candidate)
			_, err := GMPayFeeQuoteFromNetworkQuote(candidate, decimal.NewFromInt(1), "USDT", "ethereum", "USD")
			require.Error(t, err)
			assert.ErrorIs(t, err, ErrGMPayFeeUnavailable)
		})
	}
}
