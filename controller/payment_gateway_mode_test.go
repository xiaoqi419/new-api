package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func performPaymentGatewayModeApplyRequest(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/option/payment_gateway_mode/apply", bytes.NewBufferString(body))
	ApplyPaymentGatewayMode(context)
	return recorder
}

func performPaymentGatewayModeStatusRequest(t *testing.T, path string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, path, nil)
	GetPaymentGatewayModeStatus(context)
	return recorder
}

func TestGetPaymentGatewayModeStatusRejectsMissingOrFreeFormTarget(t *testing.T) {
	for _, path := range []string{
		"/api/option/payment_gateway_mode/status",
		"/api/option/payment_gateway_mode/status?target_mode=domain_auto",
		"/api/option/payment_gateway_mode/status?target_mode=",
		"/api/option/payment_gateway_mode/status?target_mode=gmpay_native&target_mode=epay_legacy",
		"/api/option/payment_gateway_mode/status?target_mode=gmpay_native&host=node-a",
	} {
		t.Run(path, func(t *testing.T) {
			recorder := performPaymentGatewayModeStatusRequest(t, path)

			assert.Equal(t, http.StatusBadRequest, recorder.Code)
			var response struct {
				Success bool   `json:"success"`
				Code    string `json:"code"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			assert.False(t, response.Success)
			assert.Equal(t, service.PaymentGatewayModeApplyReasonInvalidRequest, response.Code)
		})
	}
}

func TestApplyPaymentGatewayModeRejectsUnknownFieldsBeforeServiceWork(t *testing.T) {
	cases := []string{
		`{"target_mode":"gmpay_native","expected_effective_mode":"epay_legacy","expected_desired_mode":"epay_legacy","request_id":"request-1","command":"restart"}`,
		`{"target_mode":"gmpay_native","expected_effective_mode":"epay_legacy","expected_desired_mode":"epay_legacy","request_id":"request-1","container":"prod"}`,
		`{"target_mode":"gmpay_native","expected_effective_mode":"epay_legacy","expected_desired_mode":"epay_legacy","request_id":"request-1","host":"node-a"}`,
		`{"target_mode":"gmpay_native","expected_effective_mode":"epay_legacy","expected_desired_mode":"epay_legacy","request_id":"request-1","url":"https://example.invalid"}`,
	}
	for _, body := range cases {
		t.Run(body, func(t *testing.T) {
			recorder := performPaymentGatewayModeApplyRequest(t, body)
			assert.Equal(t, http.StatusBadRequest, recorder.Code)
			assert.Contains(t, recorder.Body.String(), service.PaymentGatewayModeApplyReasonInvalidRequest)
		})
	}
}

func TestApplyPaymentGatewayModeRejectsTrailingJSONBeforeServiceWork(t *testing.T) {
	body := `{"target_mode":"gmpay_native","expected_effective_mode":"epay_legacy","expected_desired_mode":"epay_legacy","request_id":"request-1"}{}`
	recorder := performPaymentGatewayModeApplyRequest(t, body)

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), service.PaymentGatewayModeApplyReasonInvalidRequest)
}

func TestApplyPaymentGatewayModeRejectsIncompleteFixedSchemaBeforeDatabaseAccess(t *testing.T) {
	for _, body := range []string{
		`{"expected_effective_mode":"epay_legacy","expected_desired_mode":"epay_legacy","request_id":"request-1"}`,
		`{"target_mode":"gmpay_native","expected_desired_mode":"epay_legacy","request_id":"request-1"}`,
		`{"target_mode":"gmpay_native","expected_effective_mode":"epay_legacy","request_id":"request-1"}`,
	} {
		t.Run(body, func(t *testing.T) {
			recorder := performPaymentGatewayModeApplyRequest(t, body)

			assert.Equal(t, http.StatusBadRequest, recorder.Code)
			var response struct {
				Success bool   `json:"success"`
				Code    string `json:"code"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			assert.False(t, response.Success)
			assert.Equal(t, service.PaymentGatewayModeApplyReasonInvalidRequest, response.Code)
		})
	}
}
