package openai

import (
	"io"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// TestResponsesWebsocketLiveBridge is an opt-in integration check. It keeps
// credentials outside the repository and exercises the same bridge used by
// the OpenAI adaptor, rather than probing CPA with a standalone websocket
// client. Set CPA_WS_LIVE_BASE_URL, CPA_WS_LIVE_KEY and optionally
// CPA_WS_LIVE_MODEL to run it.
func TestResponsesWebsocketLiveBridge(t *testing.T) {
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("CPA_WS_LIVE_BASE_URL")), "/")
	key := strings.TrimSpace(os.Getenv("CPA_WS_LIVE_KEY"))
	if baseURL == "" || key == "" {
		t.Skip("set CPA_WS_LIVE_BASE_URL and CPA_WS_LIVE_KEY for the live CPA bridge check")
	}
	modelName := strings.TrimSpace(os.Getenv("CPA_WS_LIVE_MODEL"))
	if modelName == "" {
		modelName = "gpt-5.6-sol"
	}

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	info := &relaycommon.RelayInfo{
		RelayMode:      relayconstant.RelayModeResponses,
		IsStream:       true,
		RequestURLPath: "/v1/responses",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: baseURL,
			ChannelType:    constant.ChannelTypeOpenAI,
			ApiKey:         key,
			ChannelSetting: dto.ChannelSettings{UpstreamTransport: dto.UpstreamTransportWebsocket},
		},
	}
	payload := []byte(`{"model":"` + modelName + `","input":"Reply with one short word.","stream":true}`)
	resp, err := doResponsesWebsocketRequest(c, info, payload)
	require.NoError(t, err)
	require.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	text := string(body)
	require.Contains(t, text, `"type":"response.completed"`)
	require.Contains(t, text, `"usage"`)
}
