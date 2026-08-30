package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
)

func TestIsEpayMAPIAllowedPaymentMethod(t *testing.T) {
	previousPayMethods := operation_setting.PayMethods
	operation_setting.PayMethods = []map[string]string{
		{"type": "alipay"},
		{"type": "wxpay"},
		{"type": "custom1"},
		{"type": model.PaymentMethodAlipay},
		{"type": model.PaymentMethodWechatPay},
	}
	t.Cleanup(func() {
		operation_setting.PayMethods = previousPayMethods
	})

	testCases := []struct {
		name    string
		method  string
		allowed bool
	}{
		{name: "configured Epay Alipay", method: "alipay", allowed: true},
		{name: "configured Epay WeChat", method: "wxpay", allowed: true},
		{name: "configured custom Epay method", method: "custom1", allowed: true},
		{name: "official Alipay direct method", method: model.PaymentMethodAlipay, allowed: false},
		{name: "official WeChat direct method", method: model.PaymentMethodWechatPay, allowed: false},
		{name: "unconfigured method", method: "unionpay", allowed: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.allowed, isEpayMAPIAllowedPaymentMethod(tc.method))
		})
	}
}

func TestEpayFamilyPaymentMethodUsesFrozenGatewayMode(t *testing.T) {
	previousPayMethods := operation_setting.PayMethods
	operation_setting.PayMethods = []map[string]string{{"type": "alipay"}, {"type": gmpayNativePaymentMethod}}
	t.Cleanup(func() { operation_setting.PayMethods = previousPayMethods })

	restoreLegacy := operation_setting.SetEffectivePaymentGatewayModeForTest(operation_setting.PaymentGatewayModeEpayLegacy)
	assert.True(t, isEpayMAPIAllowedPaymentMethod("alipay"))
	assert.True(t, isEpayMAPIAllowedPaymentMethod(gmpayNativePaymentMethod))
	assert.False(t, shouldUseGMPayNative("alipay"))
	assert.False(t, shouldUseGMPayNative(gmpayNativePaymentMethod))
	restoreLegacy()

	restoreNative := operation_setting.SetEffectivePaymentGatewayModeForTest(operation_setting.PaymentGatewayModeGMPayNative)
	t.Cleanup(restoreNative)
	assert.False(t, isEpayMAPIAllowedPaymentMethod("alipay"))
	assert.True(t, isEpayMAPIAllowedPaymentMethod(gmpayNativePaymentMethod))
	assert.False(t, shouldUseGMPayNative("alipay"))
	assert.True(t, shouldUseGMPayNative(gmpayNativePaymentMethod))
}
