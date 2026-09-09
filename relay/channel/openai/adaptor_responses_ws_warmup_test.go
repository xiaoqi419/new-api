package openai

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestResponsesWebsocketWarmupHandshakeFailureDoesNotFallbackToHTTP(t *testing.T) {
	payload := `{"model":"gpt-5","input":"hello","stream":true,"generate":false}`
	var httpRequests int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			httpRequests++
		}
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test", ChannelSetting: dto.ChannelSettings{UpstreamTransport: dto.UpstreamTransportWebsocket}}}
	adaptor := &Adaptor{ChannelType: constant.ChannelTypeOpenAI}

	response, err := adaptor.DoRequest(c, info, strings.NewReader(payload))
	require.Error(t, err)
	require.Nil(t, response)
	require.Zero(t, httpRequests)
	var apiErr *types.NewAPIError
	require.ErrorAs(t, err, &apiErr)
	require.True(t, types.IsSkipRetryError(apiErr))
}

func TestResponsesWebsocketRequestWithoutGenerateFallsBackToHTTP(t *testing.T) {
	payload := `{"model":"gpt-5","input":"hello","stream":true}`
	var httpRequests int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		httpRequests++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"resp-test"}`))
	}))
	defer srv.Close()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test", ChannelSetting: dto.ChannelSettings{UpstreamTransport: dto.UpstreamTransportWebsocket}}}
	adaptor := &Adaptor{ChannelType: constant.ChannelTypeOpenAI}

	response, err := adaptor.DoRequest(c, info, strings.NewReader(payload))
	require.NoError(t, err)
	require.NotNil(t, response)
	require.Equal(t, 1, httpRequests)
}

func TestResponsesWarmupFinalPayloadRejectsHTTPTransport(t *testing.T) {
	var upstreamRequests int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		upstreamRequests++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
	adaptor := &Adaptor{ChannelType: constant.ChannelTypeOpenAI}

	response, err := adaptor.DoRequest(c, info, strings.NewReader(`{"model":"gpt-5","input":"hello","generate":false}`))
	require.Error(t, err)
	require.Nil(t, response)
	require.Zero(t, upstreamRequests)
	var apiErr *types.NewAPIError
	require.ErrorAs(t, err, &apiErr)
	require.True(t, types.IsSkipRetryError(apiErr))
	require.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
}
