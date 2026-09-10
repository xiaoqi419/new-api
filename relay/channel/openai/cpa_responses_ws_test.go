package openai

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	coderwebsocket "github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
)

type synchronizedBuffer struct {
	mu sync.Mutex
	bytes.Buffer
}

func (b *synchronizedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.Buffer.Write(p)
}

func (b *synchronizedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.Buffer.String()
}

func TestCPAResponsesWebsocketErrorRedactsUnderlyingDetails(t *testing.T) {
	err := newCPAResponsesWebsocketError("dial failed", true, true, errors.New("https://cpa.example/v1/responses?api_key=secret"))
	require.Equal(t, "responses websocket dial failed", err.Error())
	var transportErr *cpaResponsesWebsocketError
	require.ErrorAs(t, err, &transportErr)
	require.True(t, transportErr.reused)
	require.True(t, transportErr.rebuilt)
}

func TestBuildResponsesWebsocketRequestEnvelope(t *testing.T) {
	payload := []byte(`{"model":"gpt-5","input":[{"role":"user","content":"hi"}],"stream":true,"metadata":{"large":9007199254740993}}`)
	got, err := buildResponsesWebsocketRequestEnvelope(payload)
	require.NoError(t, err)
	require.JSONEq(t, `{"type":"response.create","model":"gpt-5","input":[{"role":"user","content":"hi"}],"stream":true,"metadata":{"large":9007199254740993}}`, string(got))
	require.Contains(t, string(got), `9007199254740993`)
}

func TestBuildResponsesWebsocketRequestEnvelopeRejectsNull(t *testing.T) {
	_, err := buildResponsesWebsocketRequestEnvelope([]byte(`null`))
	require.Error(t, err)
}

func TestResponsesWebsocketURLCandidates(t *testing.T) {
	got, err := responsesWebsocketURLCandidates("https://cpa.example/v1/responses?api-version=preview")
	require.NoError(t, err)
	require.Equal(t, []string{
		"wss://cpa.example/v1/responses?api-version=preview",
		"wss://cpa.example/v1/responses/ws?api-version=preview",
		"wss://cpa.example/v1/ws?api-version=preview",
	}, got)
}

func TestResponsesWebsocketSessionHintUsesInboundSessionAndThreadHeaders(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	c.Request.Header.Set("Thread_id", "thread-123")
	require.Equal(t, "thread-123", responsesWebsocketSessionHint(c))

	c.Request.Header.Set("Thread_id", strings.Repeat("x", cpaResponsesWebsocketMaxSessionHintBytes+1))
	require.Empty(t, responsesWebsocketSessionHint(c), "oversized client affinity keys must not enter pool maps")
}

func TestResponsesWebsocketPoolKeyIncludesServerIdentityAndAllAuthHeaders(t *testing.T) {
	headersA := http.Header{
		"Authorization":       []string{"Bearer same"},
		"Api-Key":             []string{"azure-a"},
		"X-Client-Request-Id": []string{"request-a"},
	}
	headersB := http.Header{
		"Authorization":       []string{"Bearer same"},
		"Api-Key":             []string{"azure-b"},
		"X-Client-Request-Id": []string{"request-b"},
	}
	keyA := cpaResponsesWebsocketPoolKeyFor(headersA, "gpt-5", "https://cpa.example/v1/responses", cpaResponsesWebsocketPoolIdentity{UserID: 10, ChannelID: 20, ProxyURL: "http://proxy-a:8080"})
	keyB := cpaResponsesWebsocketPoolKeyFor(headersB, "gpt-5", "https://cpa.example/v1/responses", cpaResponsesWebsocketPoolIdentity{UserID: 11, ChannelID: 20, ProxyURL: "http://proxy-a:8080"})
	keyC := cpaResponsesWebsocketPoolKeyFor(headersA, "gpt-5", "https://cpa.example/v1/responses", cpaResponsesWebsocketPoolIdentity{UserID: 10, ChannelID: 20, ProxyURL: "http://proxy-b:8080"})
	require.NotEqual(t, keyA.String(), keyB.String(), "different users must not share a pool")
	require.NotEqual(t, keyA.String(), keyC.String(), "different proxy identities must not share a pool")
	require.NotEqual(t, keyA.AuthHash, keyB.AuthHash, "all authentication headers must be fingerprinted")
	require.NotContains(t, keyA.String(), "Bearer")
	require.NotContains(t, keyA.String(), "azure-a")
}

func TestResponsesWebsocketPoolKeySeparatesQueryValuesWithoutRetainingSecrets(t *testing.T) {
	headers := http.Header{"Authorization": []string{"Bearer same"}}
	identity := cpaResponsesWebsocketPoolIdentity{UserID: 10, ChannelID: 20, ApiKey: "channel-secret"}
	keyA := cpaResponsesWebsocketPoolKeyFor(headers, "gpt-5", "https://cpa.example/v1/responses?api-version=2025-01-01&api_key=secret-a", identity)
	keyB := cpaResponsesWebsocketPoolKeyFor(headers, "gpt-5", "https://cpa.example/v1/responses?api-version=2025-01-01&api_key=secret-b", identity)
	keyAAgain := cpaResponsesWebsocketPoolKeyFor(headers, "gpt-5", "https://cpa.example/v1/responses?api-version=2025-01-01&api_key=secret-a", identity)

	require.NotEqual(t, keyA.String(), keyB.String())
	require.Equal(t, keyA.String(), keyAAgain.String())
	require.NotContains(t, keyA.String(), "secret-a")
	require.NotContains(t, keyB.String(), "secret-b")
}

func TestResponsesWebsocketDialerHonorsChannelProxy(t *testing.T) {
	httpDialer, err := responsesWebsocketDialer("http://proxy.example:8080")
	require.NoError(t, err)
	require.NotNil(t, httpDialer.HTTPClient)

	socksDialer, err := responsesWebsocketDialer("socks5://proxy.example:1080")
	require.NoError(t, err)
	require.NotNil(t, socksDialer.HTTPClient)
}

func TestDoResponsesWebsocketRequestBridgesFramesToSSE(t *testing.T) {
	receivedEnvelope := make(chan []byte, 1)
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/ws" {
			http.NotFound(w, r)
			return
		}
		require.Equal(t, "Bearer test", r.Header.Get("Authorization"))
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		defer conn.Close()
		_, payload, err := conn.ReadMessage()
		require.NoError(t, err)
		receivedEnvelope <- append([]byte(nil), payload...)
		require.Contains(t, string(payload), `"type":"response.create"`)
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.output_text.delta","delta":"hi"}`)))
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}`)))
	}))
	defer srv.Close()
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
	resp, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true,"metadata":{"large":9007199254740993}}`))
	require.NoError(t, err)
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.True(t, strings.Contains(string(body), "data: {\"type\":\"response.completed\""))
	require.Contains(t, string(<-receivedEnvelope), `9007199254740993`)
}

func TestDoResponsesWebsocketRequestBridgesLargeFrame(t *testing.T) {
	largeOutput := strings.Repeat("x", 64<<10)
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		defer conn.Close()
		_, _, err = conn.ReadMessage()
		require.NoError(t, err)
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed","output":"`+largeOutput+`"}`)))
	}))
	defer srv.Close()

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
	resp, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
	require.NoError(t, err)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Contains(t, string(body), largeOutput)
}

func TestDoResponsesWebsocketRequestStopsOnTerminalEvents(t *testing.T) {
	for _, eventType := range []string{
		"response.completed",
		"response.done",
		"response.failed",
		"response.incomplete",
		"response.cancelled",
		"response.canceled",
	} {
		t.Run(eventType, func(t *testing.T) {
			closed := make(chan struct{})
			upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				conn, err := upgrader.Upgrade(w, r, nil)
				require.NoError(t, err)
				defer conn.Close()
				_, _, err = conn.ReadMessage()
				require.NoError(t, err)
				require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"`+eventType+`"}`)))
				// Keep the connection open. The client must close it after observing
				// the terminal event instead of waiting for a peer EOF.
				_, _, _ = conn.ReadMessage()
				close(closed)
			}))
			defer srv.Close()

			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
			info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
			resp, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
			require.NoError(t, err)
			defer resp.Body.Close()

			readDone := make(chan error, 1)
			go func() {
				_, readErr := io.ReadAll(resp.Body)
				readDone <- readErr
			}()
			select {
			case readErr := <-readDone:
				require.NoError(t, readErr)
			case <-time.After(2 * time.Second):
				t.Fatal("terminal response event left the SSE pipe blocked")
			}
			select {
			case <-closed:
			case <-time.After(2 * time.Second):
				t.Fatal("terminal response event did not close the websocket")
			}
		})
	}
}

func TestDoResponsesWebsocketRequestLogsTerminalTimingStages(t *testing.T) {
	previousWriter := gin.DefaultWriter
	var logs synchronizedBuffer
	gin.DefaultWriter = &logs
	t.Cleanup(func() { gin.DefaultWriter = previousWriter })

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "timing-test-request", r.Header.Get("X-Client-Request-Id"))
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		defer conn.Close()
		_, _, err = conn.ReadMessage()
		require.NoError(t, err)
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.created"}`)))
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.output_text.delta","delta":"ok"}`)))
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed"}`)))
	}))
	defer srv.Close()

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	c.Set(common.RequestIdKey, "timing-test-request")
	info := &relaycommon.RelayInfo{
		StartTime:      time.Now(),
		RelayMode:      relayconstant.RelayModeResponses,
		IsStream:       true,
		RequestURLPath: "/v1/responses",
		ChannelMeta:    &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"},
	}
	resp, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
	require.NoError(t, err)
	defer resp.Body.Close()
	_, err = io.ReadAll(resp.Body)
	require.NoError(t, err)

	var line string
	require.Eventually(t, func() bool {
		for _, candidate := range strings.Split(logs.String(), "\n") {
			if strings.Contains(candidate, "request_id=timing-test-request") {
				line = candidate
				return true
			}
		}
		return false
	}, time.Second, 10*time.Millisecond)
	t.Logf("staged timing sample: %s", strings.TrimSpace(line))
	require.Contains(t, line, "request_id=timing-test-request")
	stages := map[string]int64{}
	for _, field := range strings.Fields(line) {
		parts := strings.SplitN(field, "=", 2)
		if len(parts) != 2 || !strings.HasSuffix(parts[0], "_ms") {
			continue
		}
		value, parseErr := strconv.ParseInt(parts[1], 10, 64)
		require.NoError(t, parseErr)
		stages[parts[0]] = value
	}
	for _, name := range []string{
		"bridge_start_ms",
		"bridge_to_lease_ms",
		"upstream_first_event_ms",
		"upstream_first_text_ms",
		"upstream_terminal_ms",
		"bridge_terminal_write_ms",
		"cleanup_ms",
	} {
		value, ok := stages[name]
		require.Truef(t, ok, "timing line is missing %s", name)
		require.GreaterOrEqualf(t, value, int64(0), "timing stage %s must be non-negative", name)
	}
	require.GreaterOrEqual(t, stages["bridge_to_lease_ms"], stages["bridge_start_ms"])
	require.GreaterOrEqual(t, stages["upstream_first_event_ms"], stages["bridge_to_lease_ms"])
	require.GreaterOrEqual(t, stages["upstream_first_text_ms"], stages["upstream_first_event_ms"])
	require.GreaterOrEqual(t, stages["upstream_terminal_ms"], stages["upstream_first_text_ms"])
	require.GreaterOrEqual(t, stages["bridge_terminal_write_ms"], stages["upstream_terminal_ms"])
	require.GreaterOrEqual(t, stages["cleanup_ms"], int64(0))
}

func TestDoResponsesWebsocketRequestKeepsRelayRequestIDAfterHeaderOverrides(t *testing.T) {
	for _, testCase := range []struct {
		name            string
		headerOverrides map[string]interface{}
		incomingID      string
	}{
		{
			name:            "explicit override",
			headerOverrides: map[string]interface{}{"X-Client-Request-Id": "channel-override"},
		},
		{
			name:            "wildcard passthrough",
			headerOverrides: map[string]interface{}{"*": ""},
			incomingID:      "incoming-request-id",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			resetCPAResponsesWebsocketPools()
			defer resetCPAResponsesWebsocketPools()

			receivedHeader := make(chan string, 1)
			upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				receivedHeader <- r.Header.Get("X-Client-Request-Id")
				conn, err := upgrader.Upgrade(w, r, nil)
				require.NoError(t, err)
				defer conn.Close()
				_, _, err = conn.ReadMessage()
				require.NoError(t, err)
				require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed"}`)))
			}))
			defer srv.Close()

			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
			if testCase.incomingID != "" {
				c.Request.Header.Set("X-Client-Request-Id", testCase.incomingID)
			}
			c.Set(common.RequestIdKey, "relay-request-id")
			info := &relaycommon.RelayInfo{
				RelayMode:      relayconstant.RelayModeResponses,
				IsStream:       true,
				RequestURLPath: "/v1/responses",
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelBaseUrl:  srv.URL,
					ChannelType:     constant.ChannelTypeOpenAI,
					ApiKey:          "test",
					HeadersOverride: testCase.headerOverrides,
				},
			}
			resp, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
			require.NoError(t, err)
			defer resp.Body.Close()
			_, err = io.ReadAll(resp.Body)
			require.NoError(t, err)
			require.Equal(t, "relay-request-id", <-receivedHeader)
		})
	}
}

func TestResponsesWebsocketCancellationBeforeFirstFrame(t *testing.T) {
	accepted := make(chan struct{})
	closed := make(chan struct{})
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		defer conn.Close()
		require.NoError(t, conn.SetReadDeadline(time.Now().Add(5*time.Second)))
		_, _, err = conn.ReadMessage()
		require.NoError(t, err)
		close(accepted)
		_, _, _ = conn.ReadMessage()
		close(closed)
	}))
	defer srv.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil).WithContext(ctx)
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
	result := make(chan error, 1)
	go func() {
		_, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
		result <- err
	}()
	select {
	case <-accepted:
	case <-time.After(5 * time.Second):
		t.Fatal("websocket request was not received")
	}
	cancel()
	select {
	case err := <-result:
		require.Error(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("canceled request remained blocked before the first frame")
	}
	select {
	case <-closed:
	case <-time.After(5 * time.Second):
		t.Fatal("canceled request did not close the websocket")
	}
}

func TestResponsesWebsocketFirstFrameTimeoutIsBounded(t *testing.T) {
	previousTimeout := cpaResponsesWebsocketFirstFrameTimeout
	cpaResponsesWebsocketFirstFrameTimeout = 25 * time.Millisecond
	defer func() { cpaResponsesWebsocketFirstFrameTimeout = previousTimeout }()
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	accepted := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		defer conn.Close()
		_, _, err = conn.ReadMessage()
		require.NoError(t, err)
		close(accepted)
		// Keep the peer silent. The client-side first-frame deadline must
		// terminate the request instead of waiting forever.
		<-time.After(250 * time.Millisecond)
	}))
	defer srv.Close()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
	started := time.Now()
	_, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
	require.Error(t, err)
	require.Less(t, time.Since(started), 200*time.Millisecond)
	select {
	case <-accepted:
	case <-time.After(time.Second):
		t.Fatal("websocket request was not accepted")
	}
}

func TestResponsesWebsocketCancellationUnblocksUnreadBody(t *testing.T) {
	closed := make(chan struct{})
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		defer conn.Close()
		require.NoError(t, conn.SetReadDeadline(time.Now().Add(5*time.Second)))
		_, _, err = conn.ReadMessage()
		require.NoError(t, err)
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.created"}`)))
		_, _, _ = conn.ReadMessage()
		close(closed)
	}))
	defer srv.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil).WithContext(ctx)
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
	resp, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
	require.NoError(t, err)
	defer resp.Body.Close()
	cancel()
	readDone := make(chan error, 1)
	go func() {
		_, readErr := io.ReadAll(resp.Body)
		readDone <- readErr
	}()
	select {
	case <-readDone:
	case <-time.After(5 * time.Second):
		t.Fatal("canceled unread stream remained blocked")
	}
	select {
	case <-closed:
	case <-time.After(5 * time.Second):
		t.Fatal("canceled unread stream did not close the websocket")
	}
}

func TestResponsesWebsocketHandshakeFailureFallsBackWithSamePayload(t *testing.T) {
	payload := `{"model":"gpt-5","input":"hello","stream":true}`
	httpPayload := make(chan string, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer test", r.Header.Get("Authorization"))
		switch r.URL.Path {
		case "/v1/ws":
			w.WriteHeader(http.StatusUnauthorized)
		case "/v1/responses":
			if r.Method != http.MethodPost {
				http.NotFound(w, r)
				return
			}
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			httpPayload <- string(body)
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "data: {\"type\":\"response.completed\"}\n\n")
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	c.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test", ChannelSetting: dto.ChannelSettings{UpstreamTransport: dto.UpstreamTransportWebsocket}}}
	adaptor := &Adaptor{ChannelType: constant.ChannelTypeOpenAI}
	response, err := adaptor.DoRequest(c, info, strings.NewReader(payload))
	require.NoError(t, err)
	resp, ok := response.(*http.Response)
	require.True(t, ok)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Contains(t, string(body), "response.completed")
	require.Equal(t, payload, <-httpPayload)
}

func TestResponsesWebsocketMethodNotAllowedFallsBackWithSamePayload(t *testing.T) {
	payload := `{"model":"gpt-5","input":"hello","stream":true}`
	httpPayload := make(chan string, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer test", r.Header.Get("Authorization"))
		switch r.URL.Path {
		case "/v1/responses", "/v1/responses/ws", "/v1/ws":
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			httpPayload <- string(body)
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "data: {\"type\":\"response.completed\"}\n\n")
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	c.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test", ChannelSetting: dto.ChannelSettings{UpstreamTransport: dto.UpstreamTransportWebsocket}}}
	adaptor := &Adaptor{ChannelType: constant.ChannelTypeOpenAI}
	response, err := adaptor.DoRequest(c, info, strings.NewReader(payload))
	require.NoError(t, err)
	resp, ok := response.(*http.Response)
	require.True(t, ok)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Contains(t, string(body), "response.completed")
	require.Equal(t, payload, <-httpPayload)
}

func TestDoResponsesWebsocketRequestForwardsFirstProviderErrorWithoutReplay(t *testing.T) {
	for _, eventType := range []string{"error", "response.error"} {
		t.Run(eventType, func(t *testing.T) {
			var envelopes int
			upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/v1/ws" {
					http.NotFound(w, r)
					return
				}
				conn, err := upgrader.Upgrade(w, r, nil)
				require.NoError(t, err)
				defer conn.Close()
				_, _, err = conn.ReadMessage()
				require.NoError(t, err)
				envelopes++
				require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"`+eventType+`","status":404,"error":{"code":"model_not_found","message":"bad request"}}`)))
			}))
			defer srv.Close()
			gin.SetMode(gin.TestMode)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
			info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
			resp, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
			require.NoError(t, err)
			defer resp.Body.Close()
			body, readErr := io.ReadAll(resp.Body)
			require.NoError(t, readErr)
			require.Contains(t, string(body), `"type":"`+eventType+`"`)
			require.Contains(t, string(body), `"code":"model_not_found"`)
			require.Contains(t, string(body), `"message":"bad request"`)
			require.Equal(t, 1, envelopes)
		})
	}
}

func TestDoResponsesWebsocketRequestStopsOnProviderErrorAfterOutput(t *testing.T) {
	for _, eventType := range []string{"error", "response.error"} {
		t.Run(eventType, func(t *testing.T) {
			closed := make(chan struct{})
			upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/v1/ws" {
					http.NotFound(w, r)
					return
				}
				conn, err := upgrader.Upgrade(w, r, nil)
				require.NoError(t, err)
				defer conn.Close()
				_, _, err = conn.ReadMessage()
				require.NoError(t, err)
				require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.created"}`)))
				require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.in_progress"}`)))
				require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"`+eventType+`","error":{"message":"upstream failed"}}`)))
				// Keep the peer open until the client observes the protocol error and
				// closes the stream. This catches read loops that only stop on EOF.
				_, _, _ = conn.ReadMessage()
				close(closed)
			}))
			defer srv.Close()

			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
			info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
			resp, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
			require.NoError(t, err)
			defer resp.Body.Close()

			readDone := make(chan struct{})
			var body []byte
			var readErr error
			go func() {
				body, readErr = io.ReadAll(resp.Body)
				close(readDone)
			}()
			select {
			case <-readDone:
				require.NoError(t, readErr)
				require.Contains(t, string(body), `"type":"response.created"`)
				require.Contains(t, string(body), `"type":"response.in_progress"`)
				require.Contains(t, string(body), `"type":"`+eventType+`"`)
				require.Contains(t, string(body), `"message":"upstream failed"`)
			case <-time.After(5 * time.Second):
				t.Fatal("protocol error after output left the SSE pipe blocked")
			}
			select {
			case <-closed:
			case <-time.After(5 * time.Second):
				t.Fatal("protocol error after output did not close the websocket")
			}
		})
	}
}

func TestDoResponsesWebsocketRequestReportsAbruptDisconnectAfterFirstFrame(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		_, _, err = conn.ReadMessage()
		require.NoError(t, err)
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.created"}`)))
		require.NoError(t, conn.UnderlyingConn().Close())
	}))
	defer srv.Close()

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
	resp, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
	require.NoError(t, err)
	defer resp.Body.Close()
	body, readErr := io.ReadAll(resp.Body)
	require.EqualError(t, readErr, "responses websocket stream read failed")
	require.Contains(t, string(body), `"type":"response.created"`)
}

func TestResponsesWebsocketPoolReusesStableSessionAndPreviousResponse(t *testing.T) {
	resetCPAResponsesWebsocketPools()
	defer resetCPAResponsesWebsocketPools()
	var connections int
	var mu sync.Mutex
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			http.NotFound(w, r)
			return
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		mu.Lock()
		connections++
		mu.Unlock()
		defer conn.Close()
		for {
			_, payload, readErr := conn.ReadMessage()
			if readErr != nil {
				return
			}
			var request map[string]any
			require.NoError(t, common.Unmarshal(payload, &request))
			id := "resp-1"
			if request["previous_response_id"] != nil {
				id = "resp-2"
			}
			require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.created","response":{"id":"`+id+`"}}`)))
			require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed","response":{"id":"`+id+`"}}`)))
		}
	}))
	defer srv.Close()

	makeRequest := func(payload string, session string) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
		c.Request.Header.Set("X-Codex-Session-Id", session)
		info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
		resp, err := doResponsesWebsocketRequest(c, info, []byte(payload))
		require.NoError(t, err)
		defer resp.Body.Close()
		_, err = io.ReadAll(resp.Body)
		require.NoError(t, err)
	}
	makeRequest(`{"model":"gpt-5","stream":true}`, "session-a")
	makeRequest(`{"model":"gpt-5","stream":true,"previous_response_id":"resp-1"}`, "session-a")
	makeRequest(`{"model":"gpt-5","stream":true}`, "session-b")
	mu.Lock()
	require.Equal(t, 2, connections, "stable sessions must reuse their own websocket without sharing")
	mu.Unlock()
}

func TestResponsesWebsocketPoolDoesNotShareUnknownSessions(t *testing.T) {
	resetCPAResponsesWebsocketPools()
	defer resetCPAResponsesWebsocketPools()
	var connections int
	var mu sync.Mutex
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			http.NotFound(w, r)
			return
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		mu.Lock()
		connections++
		mu.Unlock()
		defer conn.Close()
		_, _, err = conn.ReadMessage()
		if err == nil {
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed"}`))
		}
	}))
	defer srv.Close()
	makeRequest := func() {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
		info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
		resp, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
		require.NoError(t, err)
		defer resp.Body.Close()
		_, err = io.ReadAll(resp.Body)
		require.NoError(t, err)
	}
	makeRequest()
	makeRequest()
	mu.Lock()
	require.Equal(t, 2, connections, "requests without a stable session must not borrow an idle websocket")
	mu.Unlock()
}

func TestResponsesWebsocketPoolDoesNotClaimAnonymousResponseForHintedSession(t *testing.T) {
	resetCPAResponsesWebsocketPools()
	defer resetCPAResponsesWebsocketPools()
	var connections int
	var mu sync.Mutex
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			http.NotFound(w, r)
			return
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		mu.Lock()
		connections++
		mu.Unlock()
		defer conn.Close()
		for {
			if _, _, err = conn.ReadMessage(); err != nil {
				return
			}
			if err = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed","response":{"id":"resp-anonymous"}}`)); err != nil {
				return
			}
		}
	}))
	defer srv.Close()

	makeRequest := func(payload string, session string) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
		if session != "" {
			c.Request.Header.Set("X-Codex-Session-Id", session)
		}
		info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
		resp, err := doResponsesWebsocketRequest(c, info, []byte(payload))
		require.NoError(t, err)
		defer resp.Body.Close()
		_, err = io.ReadAll(resp.Body)
		require.NoError(t, err)
	}

	makeRequest(`{"model":"gpt-5","stream":true}`, "")
	makeRequest(`{"model":"gpt-5","stream":true,"previous_response_id":"resp-anonymous"}`, "session-a")
	mu.Lock()
	require.Equal(t, 2, connections, "a hinted session must not claim an anonymous response-id connection")
	mu.Unlock()
}

func TestResponsesWebsocketPoolUsesHintedSessionWhenPreviousResponseConflicts(t *testing.T) {
	resetCPAResponsesWebsocketPools()
	defer resetCPAResponsesWebsocketPools()
	p := cpaResponsesWebsocketPoolFor(cpaResponsesWebsocketPoolKey{Endpoint: "conflict", AuthHash: "hash", Model: "model"})
	now := time.Now()
	sessionA := &cpaResponsesWebsocketConn{pool: p, sessionHint: "session-a", responseIDs: map[string]struct{}{"resp-a": {}}, createdAt: now, lastUsedAt: now}
	sessionB := &cpaResponsesWebsocketConn{pool: p, sessionHint: "session-b", responseIDs: make(map[string]struct{}), createdAt: now, lastUsedAt: now}
	p.connections[sessionA] = struct{}{}
	p.connections[sessionB] = struct{}{}
	p.sessions["session-a"] = sessionA
	p.sessions["session-b"] = sessionB
	p.responseIndex["resp-a"] = sessionA

	dialCount := 0
	lease, err := p.acquire(context.Background(), "session-b", "resp-a", func() (*cpaResponsesWebsocketConn, error) {
		dialCount++
		return &cpaResponsesWebsocketConn{responseIDs: make(map[string]struct{}), createdAt: now, lastUsedAt: now}, nil
	})
	require.NoError(t, err)
	require.Same(t, sessionB, lease.entry, "the current session socket must win over a conflicting previous response id")
	require.Zero(t, dialCount, "a conflicting response id must not trigger a duplicate dial loop")
	lease.releaseHealthy("")
}

func TestResponsesWebsocketPoolKeepsStoreFalseSessionAffinityWithoutResponseIndex(t *testing.T) {
	resetCPAResponsesWebsocketPools()
	defer resetCPAResponsesWebsocketPools()
	var connections int
	var mu sync.Mutex
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			http.NotFound(w, r)
			return
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		mu.Lock()
		connections++
		mu.Unlock()
		defer conn.Close()
		for {
			if _, _, err = conn.ReadMessage(); err != nil {
				return
			}
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed","response":{"id":"resp-not-stored"}}`))
		}
	}))
	defer srv.Close()
	makeRequest := func(payload string) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
		c.Request.Header.Set("X-Codex-Session-Id", "session-store-false")
		info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
		resp, err := doResponsesWebsocketRequest(c, info, []byte(payload))
		require.NoError(t, err)
		defer resp.Body.Close()
		_, err = io.ReadAll(resp.Body)
		require.NoError(t, err)
	}
	makeRequest(`{"model":"gpt-5","stream":true,"store":false}`)
	makeRequest(`{"model":"gpt-5","stream":true}`)
	mu.Lock()
	require.Equal(t, 1, connections, "store=false should keep explicit session affinity without indexing the response id")
	mu.Unlock()
}

func TestResponsesWebsocketPoolSerialLease(t *testing.T) {
	resetCPAResponsesWebsocketPools()
	defer resetCPAResponsesWebsocketPools()
	p := cpaResponsesWebsocketPoolFor(cpaResponsesWebsocketPoolKey{Endpoint: "serial", AuthHash: "hash", Model: "model"})
	newEntry := func() *cpaResponsesWebsocketConn {
		return &cpaResponsesWebsocketConn{responseIDs: make(map[string]struct{}), createdAt: time.Now(), lastUsedAt: time.Now()}
	}
	dialCount := 0
	dial := func() (*cpaResponsesWebsocketConn, error) {
		dialCount++
		return newEntry(), nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	first, err := p.acquire(ctx, "session-a", "", dial)
	require.NoError(t, err)
	secondReady := make(chan *cpaResponsesWebsocketLease, 1)
	go func() {
		lease, acquireErr := p.acquire(ctx, "session-a", "", dial)
		if acquireErr == nil {
			secondReady <- lease
		}
	}()
	select {
	case <-secondReady:
		t.Fatal("same-session lease was acquired concurrently")
	case <-time.After(50 * time.Millisecond):
	}
	first.releaseHealthy("")
	select {
	case second := <-secondReady:
		require.Same(t, first.entry, second.entry)
		second.releaseHealthy("")
	case <-time.After(time.Second):
		t.Fatal("waiting same-session lease was not released")
	}
	require.Equal(t, 1, dialCount)
}

func TestResponsesWebsocketPoolReusesIdleSessionWithoutBlocking(t *testing.T) {
	resetCPAResponsesWebsocketPools()
	defer resetCPAResponsesWebsocketPools()
	releaseServer := make(chan struct{})
	serverReady := make(chan struct{})
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		defer conn.Close()
		close(serverReady)
		<-releaseServer
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	conn, _, err := coderwebsocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	require.NoError(t, err)
	<-serverReady

	p := cpaResponsesWebsocketPoolFor(cpaResponsesWebsocketPoolKey{Endpoint: "idle", AuthHash: "hash", Model: "model"})
	now := time.Now()
	entry := &cpaResponsesWebsocketConn{pool: p, conn: conn, sessionHint: "session-a", responseIDs: make(map[string]struct{}), createdAt: now, lastUsedAt: now.Add(-cpaResponsesWebsocketIdleTimeout / 2)}
	p.connections[entry] = struct{}{}
	p.sessions[entry.sessionHint] = entry

	type acquireResult struct {
		lease *cpaResponsesWebsocketLease
		err   error
	}
	result := make(chan acquireResult, 1)
	go func() {
		lease, acquireErr := p.acquire(ctx, "session-a", "", func() (*cpaResponsesWebsocketConn, error) {
			return &cpaResponsesWebsocketConn{responseIDs: make(map[string]struct{})}, nil
		})
		result <- acquireResult{lease: lease, err: acquireErr}
	}()

	var got acquireResult
	timely := false
	select {
	case got = <-result:
		timely = true
	case <-time.After(100 * time.Millisecond):
		_ = conn.CloseNow()
		close(releaseServer)
		got = <-result
	}
	if timely {
		close(releaseServer)
	}
	require.NoError(t, got.err)
	require.True(t, timely, "idle session acquisition must not wait for a pong without a reader")
	require.Same(t, entry, got.lease.entry, "an unexpired idle session should preserve websocket affinity")
	got.lease.markBroken()
}

func TestResponsesWebsocketPoolCancellationDoesNotWaitForCloseHandshake(t *testing.T) {
	resetCPAResponsesWebsocketPools()
	defer resetCPAResponsesWebsocketPools()
	releaseServer := make(chan struct{})
	serverReady := make(chan struct{})
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		defer conn.Close()
		close(serverReady)
		<-releaseServer
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	conn, _, err := coderwebsocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	require.NoError(t, err)
	<-serverReady

	p := cpaResponsesWebsocketPoolFor(cpaResponsesWebsocketPoolKey{Endpoint: "cancel", AuthHash: "hash", Model: "model"})
	now := time.Now()
	entry := &cpaResponsesWebsocketConn{pool: p, conn: conn, sessionHint: "session-a", responseIDs: make(map[string]struct{}), createdAt: now, lastUsedAt: now, inUse: true}
	p.connections[entry] = struct{}{}
	p.sessions[entry.sessionHint] = entry
	lease := &cpaResponsesWebsocketLease{entry: entry, pool: p}
	done := make(chan struct{})
	go func() {
		lease.markBroken()
		close(done)
	}()

	timely := false
	select {
	case <-done:
		timely = true
	case <-time.After(100 * time.Millisecond):
	}
	close(releaseServer)
	if !timely {
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Fatal("pool cancellation remained blocked after the peer disconnected")
		}
	}
	require.True(t, timely, "pool cancellation must not wait for the websocket close handshake")
}

func TestResponsesWebsocketDoesNotReplayAfterEnvelopeWrite(t *testing.T) {
	resetCPAResponsesWebsocketPools()
	defer resetCPAResponsesWebsocketPools()
	var connections int
	var envelopes int
	var httpRequests int
	var mu sync.Mutex
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			http.NotFound(w, r)
			return
		}
		if !websocket.IsWebSocketUpgrade(r) {
			mu.Lock()
			httpRequests++
			mu.Unlock()
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		mu.Lock()
		connections++
		mu.Unlock()
		defer conn.Close()
		_, _, err = conn.ReadMessage()
		if err != nil {
			return
		}
		mu.Lock()
		envelopes++
		mu.Unlock()
		// Deliberately close before sending a first frame. The request was
		// accepted by the peer, so the client must not replay it over HTTP or
		// another websocket.
	}))
	defer srv.Close()
	makeRequest := func() {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
		c.Request.Header.Set("X-Codex-Session-Id", "session-a")
		info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
		info.ChannelSetting.UpstreamTransport = dto.UpstreamTransportWebsocket
		adaptor := &Adaptor{ChannelType: constant.ChannelTypeOpenAI}
		_, err := adaptor.DoRequest(c, info, strings.NewReader(`{"model":"gpt-5","stream":true}`))
		require.Error(t, err)
	}
	makeRequest()
	mu.Lock()
	require.Equal(t, 1, connections)
	require.Equal(t, 1, envelopes)
	require.Zero(t, httpRequests, "a sent websocket envelope must not be replayed over HTTP")
	mu.Unlock()
}
