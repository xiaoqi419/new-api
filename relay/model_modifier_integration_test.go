package relay

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResponsesHelperRejectsInvalidModelModifierBeforeUpstream(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		http.Error(w, "upstream should not be called", http.StatusBadGateway)
	}))
	defer server.Close()

	model := "gpt-6-astra@effort:unsupported"
	request := &dto.OpenAIResponsesRequest{
		Model: model,
		Input: json.RawMessage(`[{"role":"user","content":"hello"}]`),
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Set(string(constant.ContextKeyChannelType), constant.ChannelTypeOpenAI)
	c.Set(string(constant.ContextKeyChannelBaseUrl), server.URL)
	c.Set(string(constant.ContextKeyChannelKey), "test-key")
	c.Set(string(constant.ContextKeyOriginalModel), model)

	info := &relaycommon.RelayInfo{
		OriginModelName: model,
		RelayMode:       relayconstant.RelayModeResponses,
		RelayFormat:     types.RelayFormatOpenAIResponses,
		RequestURLPath:  "/v1/responses",
		Request:         request,
	}

	newAPIError := ResponsesHelper(c, info)

	require.Error(t, newAPIError)
	assert.Equal(t, http.StatusBadRequest, newAPIError.StatusCode)
	assert.Zero(t, requests.Load())
}

func TestResponsesHelperAppliesModelModifiersToUpstreamRequest(t *testing.T) {
	var body bytes.Buffer
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = body.ReadFrom(r.Body)
		http.Error(w, "stop after inspecting request", http.StatusBadRequest)
	}))
	defer server.Close()

	model := "gpt-6-astra@effort:high@temperature:0"
	request := &dto.OpenAIResponsesRequest{
		Model: model,
		Input: json.RawMessage(`[{"role":"user","content":"hello"}]`),
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Set(string(constant.ContextKeyChannelType), constant.ChannelTypeOpenAI)
	c.Set(string(constant.ContextKeyChannelBaseUrl), server.URL)
	c.Set(string(constant.ContextKeyChannelKey), "test-key")
	c.Set(string(constant.ContextKeyOriginalModel), model)

	info := &relaycommon.RelayInfo{
		OriginModelName: model,
		RelayMode:       relayconstant.RelayModeResponses,
		RelayFormat:     types.RelayFormatOpenAIResponses,
		RequestURLPath:  "/v1/responses",
		Request:         request,
	}

	newAPIError := ResponsesHelper(c, info)

	require.Error(t, newAPIError)
	var upstream struct {
		Model     string `json:"model"`
		Reasoning *struct {
			Effort string `json:"effort"`
		} `json:"reasoning"`
		Temperature *float64 `json:"temperature"`
	}
	require.NoError(t, common.Unmarshal(body.Bytes(), &upstream))
	assert.Equal(t, "gpt-6-astra", upstream.Model)
	require.NotNil(t, upstream.Reasoning)
	assert.Equal(t, "high", upstream.Reasoning.Effort)
	require.NotNil(t, upstream.Temperature)
	assert.Equal(t, float64(0), *upstream.Temperature)
}

func TestPrimaryRelayHelpersRejectInvalidModelModifierBeforeUpstream(t *testing.T) {
	model := "gpt-6-astra@topp:not-a-number"
	tests := []struct {
		name    string
		request dto.Request
		relay   func(*gin.Context, *relaycommon.RelayInfo) *types.NewAPIError
		format  types.RelayFormat
	}{
		{
			name:    "chat",
			request: &dto.GeneralOpenAIRequest{Model: model},
			relay:   TextHelper,
			format:  types.RelayFormatOpenAI,
		},
		{
			name:    "claude",
			request: &dto.ClaudeRequest{Model: model},
			relay:   ClaudeHelper,
			format:  types.RelayFormatClaude,
		},
		{
			name:    "gemini",
			request: &dto.GeminiChatRequest{},
			relay:   GeminiHelper,
			format:  types.RelayFormatGemini,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
			c.Set(string(constant.ContextKeyChannelType), constant.ChannelTypeOpenAI)
			c.Set(string(constant.ContextKeyOriginalModel), model)
			info := &relaycommon.RelayInfo{
				OriginModelName: model,
				RelayFormat:     tt.format,
				Request:         tt.request,
			}
			newAPIError := tt.relay(c, info)
			require.Error(t, newAPIError)
			assert.Equal(t, http.StatusBadRequest, newAPIError.StatusCode)
		})
	}
}

func TestApplyReasoningModelSuffixMappedModifiersOverrideOrigin(t *testing.T) {
	origin := "gpt-6-astra@effort:low"
	mapped := "gpt-6-astra@effort:high"
	request := &dto.GeneralOpenAIRequest{Model: origin}
	info := &relaycommon.RelayInfo{
		OriginModelName: origin,
		Request:         request,
		ChannelMeta:     &relaycommon.ChannelMeta{UpstreamModelName: mapped},
		RelayFormat:     types.RelayFormatOpenAI,
	}

	require.NoError(t, helper.ApplyReasoningModelSuffix(nil, info, request))
	assert.Equal(t, "gpt-6-astra", request.Model)
	assert.Equal(t, "gpt-6-astra", info.UpstreamModelName)
	assert.Equal(t, "high", request.ReasoningEffort)
	assert.NotNil(t, info.ReasoningConversion)
	assert.Equal(t, "high", info.ReasoningConversion.Effort)
}
