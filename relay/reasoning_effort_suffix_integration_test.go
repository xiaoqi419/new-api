package relay

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReasoningEffortSuffixProductionWirePaths(t *testing.T) {
	savedPolicy := model_setting.GetGlobalSettings().ChatCompletionsToResponsesPolicy
	t.Cleanup(func() { model_setting.GetGlobalSettings().ChatCompletionsToResponsesPolicy = savedPolicy })
	for _, path := range []string{"chat", "responses", "chat-via-responses"} {
		for _, stream := range []bool{false, true} {
			for _, passthrough := range []bool{false, true} {
				if path == "chat-via-responses" && passthrough {
					continue
				}
				t.Run(fmt.Sprintf("%s/stream=%t/passthrough=%t", path, stream, passthrough), func(t *testing.T) {
					model_setting.GetGlobalSettings().ChatCompletionsToResponsesPolicy = model_setting.ChatCompletionsToResponsesPolicy{Enabled: path == "chat-via-responses", AllChannels: true, ModelPatterns: []string{".*"}}
					captured := make(chan []byte, 1)
					server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						body, err := io.ReadAll(r.Body)
						if err != nil {
							t.Error(err)
						}
						captured <- body
						if path != "chat" {
							assert.Equal(t, "/v1/responses", r.URL.Path)
						}
						// Stop at the upstream boundary; settlement is verified separately.
						http.Error(w, "captured", http.StatusBadRequest)
					}))
					defer server.Close()
					payload := fmt.Sprintf(`{"model":"gpt-5.6-sol","messages":[{"role":"user","content":"hi"}],"reasoning_effort":"low","stream":%t,"future":9007199254740993}`, stream)
					var request dto.Request = &dto.GeneralOpenAIRequest{}
					relayMode, format, url := relayconstant.RelayModeChatCompletions, types.RelayFormatOpenAI, "/v1/chat/completions"
					if path == "responses" {
						payload = fmt.Sprintf(`{"model":"gpt-5.6-sol","input":"hi","reasoning":{"effort":"low","summary":"auto"},"stream":%t,"future":9007199254740993}`, stream)
						request = &dto.OpenAIResponsesRequest{}
						relayMode, format, url = relayconstant.RelayModeResponses, types.RelayFormatOpenAIResponses, "/v1/responses"
					}
					require.NoError(t, common.Unmarshal([]byte(payload), request))
					c, _ := gin.CreateTestContext(httptest.NewRecorder())
					c.Request = httptest.NewRequest(http.MethodPost, url, strings.NewReader(payload))
					c.Set(string(constant.ContextKeyChannelType), constant.ChannelTypeOpenAI)
					c.Set(string(constant.ContextKeyChannelBaseUrl), server.URL)
					c.Set(string(constant.ContextKeyChannelKey), "test-key")
					c.Set(string(constant.ContextKeyOriginalModel), "gpt-5.6-sol")
					c.Set(string(constant.ContextKeyChannelSetting), dto.ChannelSettings{ReasoningEffortToModelSuffix: true, PassThroughBodyEnabled: passthrough})
					c.Set("model_mapping", `{"gpt-5.6-sol":"gpt-5.6-mapped"}`)
					info := &relaycommon.RelayInfo{OriginModelName: "gpt-5.6-sol", RelayMode: relayMode, RelayFormat: format, RequestURLPath: url, Request: request, IsStream: stream}
					var apiErr *types.NewAPIError
					if path == "responses" {
						apiErr = ResponsesHelper(c, info)
					} else {
						apiErr = TextHelper(c, info)
					}
					require.Error(t, apiErr)
					select {
					case body := <-captured:
						var actual map[string]any
						require.NoError(t, common.Unmarshal(body, &actual))
						assert.Equal(t, "gpt-5.6-mapped-low", actual["model"])
						assert.NotContains(t, actual, "reasoning_effort")
						if reasoning, ok := actual["reasoning"].(map[string]any); ok {
							assert.NotContains(t, reasoning, "effort")
						}
						if path == "responses" {
							assert.Equal(t, map[string]any{"summary": "auto"}, actual["reasoning"])
						}
						if passthrough {
							assert.Contains(t, string(body), `"future":9007199254740993`)
						}
					default:
						t.Fatalf("request never reached upstream: %v", apiErr)
					}
					assert.Equal(t, "gpt-5.6-sol", info.GetBillingModelName())
					switch original := request.(type) {
					case *dto.GeneralOpenAIRequest:
						assert.Equal(t, "low", original.ReasoningEffort)
					case *dto.OpenAIResponsesRequest:
						require.NotNil(t, original.Reasoning)
						assert.Equal(t, "low", original.Reasoning.Effort)
					}
				})
			}
		}
	}
}

func TestReasoningEffortSuffixRejectsInvalidBeforeUpstream(t *testing.T) {
	for _, responses := range []bool{false, true} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
		c.Set(string(constant.ContextKeyChannelType), constant.ChannelTypeOpenAI)
		c.Set(string(constant.ContextKeyOriginalModel), "gpt-5.6-sol")
		c.Set(string(constant.ContextKeyChannelSetting), dto.ChannelSettings{ReasoningEffortToModelSuffix: true})
		info := &relaycommon.RelayInfo{OriginModelName: "gpt-5.6-sol", RelayMode: relayconstant.RelayModeChatCompletions, RelayFormat: types.RelayFormatOpenAI, Request: &dto.GeneralOpenAIRequest{Model: "gpt-5.6-sol", ReasoningEffort: "fast"}}
		var apiErr *types.NewAPIError
		if responses {
			info.RelayMode, info.RelayFormat = relayconstant.RelayModeResponses, types.RelayFormatOpenAIResponses
			info.Request = &dto.OpenAIResponsesRequest{Model: "gpt-5.6-sol", Reasoning: &dto.Reasoning{Effort: "fast"}}
			apiErr = ResponsesHelper(c, info)
		} else {
			apiErr = TextHelper(c, info)
		}
		require.Error(t, apiErr)
		assert.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
		assert.Contains(t, apiErr.Error(), "invalid reasoning effort")
	}
}
