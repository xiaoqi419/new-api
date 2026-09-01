package service

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/shopspring/decimal"
)

// GMPayQuoteBinding is the short-lived, server-owned record associated with a
// Native checkout. TopUp.Money and TopUp.PaymentMethod remain the durable
// settlement authority; this record carries the richer quote metadata for
// same-process callback/audit checks without adding a database column.
//
// The registry is deliberately best-effort. A process restart may evict it,
// in which case callback processing falls back to the durable amount and asset
// binding already persisted on the order. No client-controlled value is ever
// written into this registry.
type GMPayQuoteBinding struct {
	TradeNo       string
	PaymentMethod string
	Token         string
	Network       string
	Quote         GMPayFeeQuote
	StoredAt      time.Time
}

const (
	maxGMPayQuoteBindings   = 4096
	maxGMPayQuoteBindingTTL = 24 * time.Hour
)

var (
	// ErrGMPayQuoteBindingMissing is returned by callers when a quoted order
	// has lost its short-lived server-side quote record.  The sentinel lives in
	// the service package so controllers can fail closed without exposing any
	// quote details to the client.
	ErrGMPayQuoteBindingMissing = errors.New("gmpay quote binding is missing")
	// ErrGMPayQuoteBindingInvalid identifies a binding that no longer matches
	// the durable order or whose quote metadata is malformed/expired.
	ErrGMPayQuoteBindingInvalid = errors.New("gmpay quote binding is invalid")
)

var gmpayQuoteBindings = struct {
	sync.Mutex
	entries map[string]GMPayQuoteBinding
}{entries: make(map[string]GMPayQuoteBinding)}

// StoreGMPayQuoteBinding records a validated quote after the pending order has
// been inserted. It returns an error for malformed bindings and never accepts
// an expired quote.
func StoreGMPayQuoteBinding(tradeNo, paymentMethod, token, network string, quote GMPayFeeQuote) error {
	tradeNo = strings.TrimSpace(tradeNo)
	if tradeNo == "" || len(tradeNo) > 255 {
		return fmt.Errorf("%w: trade number", ErrGMPayQuoteBindingInvalid)
	}
	canonicalNetwork, ok := NormalizeGMPayNetwork(network)
	if !ok {
		return fmt.Errorf("%w: network", ErrGMPayQuoteBindingInvalid)
	}
	canonicalToken := strings.ToUpper(strings.TrimSpace(token))
	if canonicalToken != "USDT" && canonicalToken != "USDC" {
		return fmt.Errorf("%w: token", ErrGMPayQuoteBindingInvalid)
	}
	canonicalPaymentMethod := strings.ToLower(strings.TrimSpace(paymentMethod))
	if !validGMPayQuotePaymentMethod(canonicalPaymentMethod, canonicalToken, canonicalNetwork) {
		return fmt.Errorf("%w: payment method", ErrGMPayQuoteBindingInvalid)
	}
	canonicalPaymentMethod = canonicalizeGMPayQuotePaymentMethod(canonicalPaymentMethod, canonicalToken, canonicalNetwork)
	now := time.Now().UTC()
	normalizedQuote, err := normalizeGMPayQuote(quote, canonicalNetwork, now)
	if err != nil {
		return err
	}

	binding := GMPayQuoteBinding{
		TradeNo:       tradeNo,
		PaymentMethod: canonicalPaymentMethod,
		Token:         canonicalToken,
		Network:       canonicalNetwork,
		Quote:         normalizedQuote,
		StoredAt:      now,
	}
	gmpayQuoteBindings.Lock()
	defer gmpayQuoteBindings.Unlock()
	pruneGMPayQuoteBindingsLocked(now)
	if len(gmpayQuoteBindings.entries) >= maxGMPayQuoteBindings {
		// Evict the oldest entry. The registry is an optimization, so bounded
		// memory is preferable to retaining a quote indefinitely under load.
		oldestKey := ""
		var oldest time.Time
		for key, entry := range gmpayQuoteBindings.entries {
			if oldestKey == "" || entry.StoredAt.Before(oldest) {
				oldestKey, oldest = key, entry.StoredAt
			}
		}
		if oldestKey != "" {
			delete(gmpayQuoteBindings.entries, oldestKey)
		}
	}
	gmpayQuoteBindings.entries[tradeNo] = binding
	return nil
}

// GetGMPayQuoteBinding returns a copy of a non-expired binding. It is safe to
// call from callback handlers and never exposes the mutable registry map.
func GetGMPayQuoteBinding(tradeNo string) (GMPayQuoteBinding, bool) {
	tradeNo = strings.TrimSpace(tradeNo)
	if tradeNo == "" {
		return GMPayQuoteBinding{}, false
	}
	now := time.Now().UTC()
	gmpayQuoteBindings.Lock()
	defer gmpayQuoteBindings.Unlock()
	pruneGMPayQuoteBindingsLocked(now)
	binding, ok := gmpayQuoteBindings.entries[tradeNo]
	return binding, ok
}

// DeleteGMPayQuoteBinding releases the best-effort record after a checkout
// fails or a callback has settled. It is intentionally idempotent.
func DeleteGMPayQuoteBinding(tradeNo string) {
	if strings.TrimSpace(tradeNo) == "" {
		return
	}
	gmpayQuoteBindings.Lock()
	delete(gmpayQuoteBindings.entries, strings.TrimSpace(tradeNo))
	gmpayQuoteBindings.Unlock()
}

// ValidateGMPayQuoteBinding checks callback data against the server-generated
// binding. Callers must still perform the durable TopUp.Money and payment
// method checks; this function is an additional metadata consistency check.
func ValidateGMPayQuoteBinding(binding GMPayQuoteBinding, paymentMethod, token, network string, totalAmount decimal.Decimal) bool {
	now := time.Now().UTC()
	if strings.TrimSpace(binding.TradeNo) == "" || binding.StoredAt.IsZero() || binding.StoredAt.After(now) {
		return false
	}
	canonicalToken := strings.ToUpper(strings.TrimSpace(token))
	canonicalNetwork, ok := NormalizeGMPayNetwork(network)
	if !ok || canonicalNetwork != strings.ToLower(strings.TrimSpace(binding.Network)) ||
		canonicalToken != strings.ToUpper(strings.TrimSpace(binding.Token)) {
		return false
	}
	canonicalPaymentMethod := strings.ToLower(strings.TrimSpace(paymentMethod))
	if !validGMPayQuotePaymentMethod(canonicalPaymentMethod, canonicalToken, canonicalNetwork) ||
		canonicalPaymentMethod != strings.ToLower(strings.TrimSpace(binding.PaymentMethod)) {
		return false
	}
	if totalAmount.LessThanOrEqual(decimal.Zero) || !decimalIsFinite(totalAmount) {
		return false
	}
	quote, err := normalizeGMPayQuote(binding.Quote, canonicalNetwork, now)
	if err != nil {
		return false
	}
	// The checkout amount is quantized to cents before it is persisted. Compare
	// at that same precision so a binary float loaded from TopUp.Money cannot
	// create a false mismatch while still rejecting any material difference.
	return quote.TotalAmount.Equal(totalAmount.Round(2))
}

// validGMPayQuotePaymentMethod verifies that the durable payment method is an
// encoding of the same token/network pair as the quote.  The ordinary wallet
// uses either the historical `usdt.tron` spelling for USDT/TRON or the
// extended `usdt.<network>.<token>` form.  A `gmpay.<network>.<token>` prefix
// is reserved for dynamic/fallback wallet quotes so callbacks can fail closed
// after a process restart when the in-memory binding is gone.
func validGMPayQuotePaymentMethod(paymentMethod, token, network string) bool {
	parts := strings.Split(strings.ToLower(strings.TrimSpace(paymentMethod)), ".")
	if len(parts) == 2 {
		methodNetwork, known := NormalizeGMPayNetwork(parts[1])
		return parts[0] == "usdt" && known && methodNetwork == network && token == "USDT" && network == "tron"
	}
	if len(parts) != 3 || (parts[0] != "usdt" && parts[0] != "gmpay") {
		return false
	}
	methodNetwork, known := NormalizeGMPayNetwork(parts[1])
	return known && methodNetwork == network && parts[2] == strings.ToLower(token) && validGMPayQuotePart(parts[1]) && validGMPayQuotePart(parts[2])
}

func canonicalizeGMPayQuotePaymentMethod(paymentMethod, token, network string) string {
	parts := strings.Split(strings.ToLower(strings.TrimSpace(paymentMethod)), ".")
	if len(parts) == 2 {
		return "usdt.tron"
	}
	if len(parts) == 3 {
		return parts[0] + "." + network + "." + strings.ToLower(token)
	}
	return paymentMethod
}

func validGMPayQuotePart(value string) bool {
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

// normalizeGMPayQuote validates every server-owned quote field at the point
// where it enters or is read from the binding registry.  In particular, expiry
// is checked against the current clock rather than StoredAt; a callback cannot
// reuse an otherwise valid quote after its TTL has elapsed.
func normalizeGMPayQuote(quote GMPayFeeQuote, network string, now time.Time) (GMPayFeeQuote, error) {
	source, err := NormalizeGMPayFeeSource(quote.Source)
	if err != nil {
		return GMPayFeeQuote{}, fmt.Errorf("%w: source", ErrGMPayQuoteBindingInvalid)
	}
	quote.Source = source
	if quote.BaseAmount.LessThanOrEqual(decimal.Zero) || !decimalIsFinite(quote.BaseAmount) ||
		quote.FeeAmount.IsNegative() || !decimalIsFinite(quote.FeeAmount) ||
		quote.TotalAmount.LessThanOrEqual(decimal.Zero) || !decimalIsFinite(quote.TotalAmount) ||
		!quote.BaseAmount.Add(quote.FeeAmount).Equal(quote.TotalAmount) {
		return GMPayFeeQuote{}, fmt.Errorf("%w: amount", ErrGMPayQuoteBindingInvalid)
	}

	if source == GMPayFeeSourceGatewayIncluded {
		// Gateway-included quotes are retained only for compatibility with old
		// callers; ordinary dynamic orders never persist this source.
		return quote, nil
	}
	if quote.QuotedAt.IsZero() || quote.ExpiresAt.IsZero() || quote.QuotedAt.After(now) ||
		!quote.ExpiresAt.After(quote.QuotedAt) || !quote.ExpiresAt.After(now) ||
		quote.ExpiresAt.Sub(now) > maxGMPayQuoteBindingTTL {
		return GMPayFeeQuote{}, fmt.Errorf("%w: expiry", ErrGMPayQuoteBindingInvalid)
	}
	quote.SettlementCurrency = strings.ToUpper(strings.TrimSpace(quote.SettlementCurrency))
	if quote.SettlementCurrency == "" || !currencyPattern.MatchString(quote.SettlementCurrency) {
		return GMPayFeeQuote{}, fmt.Errorf("%w: settlement currency", ErrGMPayQuoteBindingInvalid)
	}

	switch source {
	case GMPayFeeSourceChainNetworkEstimate:
		quote.NativeAsset = strings.ToUpper(strings.TrimSpace(quote.NativeAsset))
		if quote.NativeAsset == "" || quote.NativeAsset != expectedNativeAsset(network) ||
			quote.NativeAmount.IsNegative() || !decimalIsFinite(quote.NativeAmount) ||
			strings.TrimSpace(quote.EstimatorVersion) == "" || strings.TrimSpace(quote.Evidence.RPCMethod) == "" ||
			(quote.FeeAmount.IsZero() && (!quote.Subsidized || strings.TrimSpace(quote.Evidence.RPCMethod) == "")) {
			return GMPayFeeQuote{}, fmt.Errorf("%w: chain estimate metadata", ErrGMPayQuoteBindingInvalid)
		}
	case GMPayFeeSourceAdminFallback:
		// An administrator fallback is a fiat rule, so native-chain metadata is
		// intentionally optional.  Its source and validity window are mandatory
		// and make the distinction from a gateway service fee explicit.
	default:
		return GMPayFeeQuote{}, fmt.Errorf("%w: source", ErrGMPayQuoteBindingInvalid)
	}
	return quote, nil
}

func pruneGMPayQuoteBindingsLocked(now time.Time) {
	for key, binding := range gmpayQuoteBindings.entries {
		if binding.Quote.ExpiresAt.IsZero() || !binding.Quote.ExpiresAt.After(now) {
			delete(gmpayQuoteBindings.entries, key)
		}
	}
}
