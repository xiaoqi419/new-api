package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateOptionRejectsEffectivePaymentGatewayMode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPut, "/api/option/", strings.NewReader(
		`{"key":"EffectivePaymentGatewayMode","value":"gmpay_native"}`,
	))

	UpdateOption(ctx)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "只读")
}

func TestUpdateOptionRejectsInvalidGMPayFeeConfigBeforePersistence(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPut, "/api/option/", strings.NewReader(
		`{"key":"GMPayFeeConfig","value":"{\"version\":1,\"enabled\":true,\"default\":{\"mode\":\"percent\",\"value\":\"100.01\"}}"}`,
	))

	UpdateOption(ctx)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "percentage fee")
}

func TestGetOptionsExposesConfiguredAndEffectiveGatewayModesSeparately(t *testing.T) {
	gin.SetMode(gin.TestMode)
	restoreMode := operation_setting.SetEffectivePaymentGatewayModeForTest(operation_setting.PaymentGatewayModeEpayLegacy)
	t.Cleanup(restoreMode)
	common.OptionMapRWMutex.Lock()
	previousMap := common.OptionMap
	common.OptionMap = map[string]string{
		operation_setting.PaymentGatewayModeOptionKey: operation_setting.PaymentGatewayModeGMPayNative,
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousMap
		common.OptionMapRWMutex.Unlock()
	})

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	GetOptions(ctx)

	var response struct {
		Success bool `json:"success"`
		Data    []struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	values := make(map[string]string, len(response.Data))
	for _, option := range response.Data {
		values[option.Key] = option.Value
	}
	assert.Equal(t, operation_setting.PaymentGatewayModeGMPayNative, values[operation_setting.PaymentGatewayModeOptionKey])
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, values[operation_setting.EffectivePaymentGatewayModeOptionKey])
}
