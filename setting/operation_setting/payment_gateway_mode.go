package operation_setting

import (
	"fmt"
	"strings"
	"sync"
)

const (
	PaymentGatewayModeOptionKey          = "PaymentGatewayMode"
	EffectivePaymentGatewayModeOptionKey = "EffectivePaymentGatewayMode"
	PaymentGatewayModeEpayLegacy         = "epay_legacy"
	PaymentGatewayModeGMPayNative        = "gmpay_native"
)

var paymentGatewayModeState = struct {
	sync.RWMutex
	effective string
	frozen    bool
}{
	effective: PaymentGatewayModeEpayLegacy,
}

// NormalizePaymentGatewayMode validates the persisted startup option. An
// absent value intentionally keeps existing installations on Legacy EPay.
func NormalizePaymentGatewayMode(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return PaymentGatewayModeEpayLegacy, nil
	}
	switch value {
	case PaymentGatewayModeEpayLegacy, PaymentGatewayModeGMPayNative:
		return value, nil
	default:
		return "", fmt.Errorf("unsupported payment gateway mode %q", value)
	}
}

// FreezePaymentGatewayMode is called once during startup, after database
// options have loaded and before the HTTP server starts. A persisted option
// update does not call this function, so it cannot hot-switch payment
// protocols in a running process.
func FreezePaymentGatewayMode(configured string) error {
	normalized, err := NormalizePaymentGatewayMode(configured)
	if err != nil {
		return err
	}
	paymentGatewayModeState.Lock()
	defer paymentGatewayModeState.Unlock()
	if paymentGatewayModeState.frozen {
		if paymentGatewayModeState.effective == normalized {
			return nil
		}
		return fmt.Errorf("payment gateway mode is already frozen as %s", paymentGatewayModeState.effective)
	}
	paymentGatewayModeState.effective = normalized
	paymentGatewayModeState.frozen = true
	return nil
}

func GetEffectivePaymentGatewayMode() string {
	paymentGatewayModeState.RLock()
	defer paymentGatewayModeState.RUnlock()
	return paymentGatewayModeState.effective
}

func IsLegacyEpayPaymentGatewayMode() bool {
	return GetEffectivePaymentGatewayMode() == PaymentGatewayModeEpayLegacy
}

func IsGMPayNativePaymentGatewayMode() bool {
	return GetEffectivePaymentGatewayMode() == PaymentGatewayModeGMPayNative
}

// SetEffectivePaymentGatewayModeForTest temporarily replaces startup-frozen
// state so package-level handler tests can exercise both isolated protocols.
// Production code must use FreezePaymentGatewayMode during startup.
func SetEffectivePaymentGatewayModeForTest(mode string) func() {
	normalized, err := NormalizePaymentGatewayMode(mode)
	if err != nil {
		panic(err)
	}
	paymentGatewayModeState.Lock()
	previousEffective := paymentGatewayModeState.effective
	previousFrozen := paymentGatewayModeState.frozen
	paymentGatewayModeState.effective = normalized
	paymentGatewayModeState.frozen = false
	paymentGatewayModeState.Unlock()
	return func() {
		paymentGatewayModeState.Lock()
		paymentGatewayModeState.effective = previousEffective
		paymentGatewayModeState.frozen = previousFrozen
		paymentGatewayModeState.Unlock()
	}
}
