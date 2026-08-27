package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func newChannelFailoverPoolRetryContext(path string) *gin.Context {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	body := `{"model":"gpt-test","messages":[{"role":"user","content":"hello"}]}`
	if path == "/v1/responses" {
		body = `{"model":"gpt-test","input":"hello"}`
	}
	ctx.Request = httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyChannelFailoverPoolTextRequest, true)
	common.SetContextKey(ctx, constant.ContextKeyChannelFailoverPoolID, "openai-production")
	return ctx
}

func TestShouldRetryAllowsChannelFailoverPoolForAutoDisableStatusBeforeFirstByte(t *testing.T) {
	originalDisableRanges := operation_setting.AutomaticDisableStatusCodeRanges
	operation_setting.AutomaticDisableStatusCodeRanges = []operation_setting.StatusCodeRange{{Start: http.StatusServiceUnavailable, End: http.StatusServiceUnavailable}}
	t.Cleanup(func() { operation_setting.AutomaticDisableStatusCodeRanges = originalDisableRanges })
	ctx := newChannelFailoverPoolRetryContext("/v1/chat/completions")
	err := types.NewErrorWithStatusCode(errors.New("upstream unavailable"), types.ErrorCodeBadResponseStatusCode, http.StatusServiceUnavailable)

	assert.True(t, shouldRetry(ctx, err, 1))
}

func TestShouldRetryStopsChannelFailoverPoolAfterFirstByte(t *testing.T) {
	ctx := newChannelFailoverPoolRetryContext("/v1/responses")
	ctx.Writer.WriteHeader(http.StatusOK)
	ctx.Writer.WriteHeaderNow()
	err := types.NewErrorWithStatusCode(errors.New("upstream unavailable"), types.ErrorCodeBadResponseStatusCode, http.StatusServiceUnavailable)

	assert.False(t, shouldRetry(ctx, err, 1))
}

func TestShouldRetryStopsChannelFailoverPoolForSkipRetryError(t *testing.T) {
	ctx := newChannelFailoverPoolRetryContext("/v1/chat/completions")
	err := types.NewErrorWithStatusCode(errors.New("content blocked"), types.ErrorCodeBadResponseStatusCode, http.StatusServiceUnavailable, types.ErrOptionWithSkipRetry())

	assert.False(t, shouldRetry(ctx, err, 1))
}

func TestPoolExhaustionPreservesLastUpstreamError(t *testing.T) {
	ctx := newChannelFailoverPoolRetryContext("/v1/chat/completions")
	lastUpstreamError := types.NewErrorWithStatusCode(errors.New("backup upstream unavailable"), types.ErrorCodeBadResponseStatusCode, http.StatusServiceUnavailable)
	selectionError := types.NewError(errors.New("no eligible pool member"), types.ErrorCodeGetChannelFailed)

	assert.Same(t, lastUpstreamError, poolExhaustionError(ctx, lastUpstreamError, selectionError))
}
