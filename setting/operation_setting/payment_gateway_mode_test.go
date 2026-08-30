package operation_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizePaymentGatewayMode(t *testing.T) {
	testCases := []struct {
		name    string
		value   string
		want    string
		wantErr bool
	}{
		{name: "missing defaults to legacy", value: "", want: PaymentGatewayModeEpayLegacy},
		{name: "whitespace defaults to legacy", value: "  ", want: PaymentGatewayModeEpayLegacy},
		{name: "legacy is accepted", value: PaymentGatewayModeEpayLegacy, want: PaymentGatewayModeEpayLegacy},
		{name: "native is accepted", value: PaymentGatewayModeGMPayNative, want: PaymentGatewayModeGMPayNative},
		{name: "unknown is rejected", value: "auto", wantErr: true},
		{name: "case variants are rejected", value: "GMPAY_NATIVE", wantErr: true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizePaymentGatewayMode(tc.value)
			if tc.wantErr {
				require.Error(t, err)
				assert.Empty(t, got)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestFreezePaymentGatewayModeRejectsInvalidWithoutChangingEffectiveMode(t *testing.T) {
	restore := SetEffectivePaymentGatewayModeForTest(PaymentGatewayModeEpayLegacy)
	t.Cleanup(restore)

	require.Error(t, FreezePaymentGatewayMode("unexpected"))
	assert.Equal(t, PaymentGatewayModeEpayLegacy, GetEffectivePaymentGatewayMode())

	require.NoError(t, FreezePaymentGatewayMode(PaymentGatewayModeGMPayNative))
	assert.Equal(t, PaymentGatewayModeGMPayNative, GetEffectivePaymentGatewayMode())
	assert.True(t, IsGMPayNativePaymentGatewayMode())
	assert.False(t, IsLegacyEpayPaymentGatewayMode())
	require.Error(t, FreezePaymentGatewayMode(PaymentGatewayModeEpayLegacy))
	assert.Equal(t, PaymentGatewayModeGMPayNative, GetEffectivePaymentGatewayMode())
}
