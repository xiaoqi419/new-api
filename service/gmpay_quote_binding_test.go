package service

import (
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func validGMPayAdminFallbackQuote(now time.Time) GMPayFeeQuote {
	return GMPayFeeQuote{
		BaseAmount:         decimal.NewFromInt(30),
		FeeAmount:          decimal.NewFromInt(5),
		TotalAmount:        decimal.NewFromInt(35),
		Source:             GMPayFeeSourceAdminFallback,
		SettlementCurrency: "USD",
		QuotedAt:           now.Add(-time.Second),
		ExpiresAt:          now.Add(5 * time.Minute),
	}
}

func TestStoreAndValidateGMPayQuoteBindingCanonicalizesAndChecksAllAmounts(t *testing.T) {
	now := time.Now().UTC()
	tradeNo := "quote-binding-canonicalization"
	quote := validGMPayAdminFallbackQuote(now)
	require.NoError(t, StoreGMPayQuoteBinding(tradeNo, "gmpay.trc20.usdt", "usdt", "trc20", quote))
	t.Cleanup(func() { DeleteGMPayQuoteBinding(tradeNo) })

	binding, ok := GetGMPayQuoteBinding(tradeNo)
	require.True(t, ok)
	assert.Equal(t, "gmpay.tron.usdt", binding.PaymentMethod)
	assert.Equal(t, "USDT", binding.Token)
	assert.Equal(t, "tron", binding.Network)
	assert.Equal(t, "admin_fallback", binding.Quote.Source)
	assert.Equal(t, "USD", binding.Quote.SettlementCurrency)
	assert.True(t, ValidateGMPayQuoteBinding(binding, "gmpay.tron.usdt", "USDT", "TRON", decimal.NewFromFloat(35)))

	mutated := binding
	mutated.Quote.FeeAmount = decimal.NewFromInt(4)
	assert.False(t, ValidateGMPayQuoteBinding(mutated, "gmpay.tron.usdt", "USDT", "TRON", decimal.NewFromInt(35)))
	mutated = binding
	mutated.Quote.SettlementCurrency = ""
	assert.False(t, ValidateGMPayQuoteBinding(mutated, "gmpay.tron.usdt", "USDT", "TRON", decimal.NewFromInt(35)))
}

func TestStoreGMPayQuoteBindingRejectsIncompleteChainEvidence(t *testing.T) {
	now := time.Now().UTC()
	quote := validGMPayAdminFallbackQuote(now)
	quote.Source = GMPayFeeSourceChainNetworkEstimate
	quote.NativeAsset = "TRX"
	quote.NativeAmount = decimal.NewFromFloat(0.12)
	quote.EstimatorVersion = "chain-network-v1"
	// A chain quote without an RPC method is not auditable and must not enter
	// the binding registry, even if its amount arithmetic is valid.
	err := StoreGMPayQuoteBinding("quote-binding-no-evidence", "gmpay.tron.usdt", "USDT", "tron", quote)
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrGMPayQuoteBindingInvalid)
}

func TestValidateGMPayQuoteBindingUsesCurrentTimeForExpiry(t *testing.T) {
	now := time.Now().UTC()
	binding := GMPayQuoteBinding{
		TradeNo:       "quote-binding-expired",
		PaymentMethod: "gmpay.tron.usdt",
		Token:         "USDT",
		Network:       "tron",
		StoredAt:      now.Add(-10 * time.Minute),
		Quote: GMPayFeeQuote{
			BaseAmount:         decimal.NewFromInt(30),
			FeeAmount:          decimal.NewFromInt(5),
			TotalAmount:        decimal.NewFromInt(35),
			Source:             GMPayFeeSourceAdminFallback,
			SettlementCurrency: "USD",
			QuotedAt:           now.Add(-6 * time.Minute),
			ExpiresAt:          now.Add(-time.Second),
		},
	}
	assert.False(t, ValidateGMPayQuoteBinding(binding, binding.PaymentMethod, binding.Token, binding.Network, decimal.NewFromInt(35)))
}

func TestStoreGMPayQuoteBindingRejectsPaymentMethodAssetMismatch(t *testing.T) {
	quote := validGMPayAdminFallbackQuote(time.Now().UTC())
	err := StoreGMPayQuoteBinding("quote-binding-mismatch", "gmpay.ethereum.usdc", "USDT", "tron", quote)
	require.Error(t, err)
	assert.True(t, strings.Contains(err.Error(), "payment method"))
}
