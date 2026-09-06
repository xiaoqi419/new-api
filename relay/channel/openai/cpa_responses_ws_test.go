package openai

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
)

func TestBuildResponsesWebsocketRequestEnvelope(t *testing.T) {
	payload := []byte(`{"model":"gpt-5","input":[{"role":"user","content":"hi"}],"stream":true}`)
	got, err := buildResponsesWebsocketRequestEnvelope(payload)
	require.NoError(t, err)
	require.JSONEq(t, `{"type":"response.create","model":"gpt-5","input":[{"role":"user","content":"hi"}],"stream":true}`, string(got))
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

func TestDoResponsesWebsocketRequestBridgesFramesToSSE(t *testing.T) {
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
		require.Contains(t, string(payload), `"type":"response.create"`)
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.output_text.delta","delta":"hi"}`)))
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}`)))
	}))
	defer srv.Close()
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
	resp, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
	require.NoError(t, err)
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.True(t, strings.Contains(string(body), "data: {\"type\":\"response.completed\""))
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

func TestDoResponsesWebsocketRequestRejectsErrorBeforeOutput(t *testing.T) {
	for _, eventType := range []string{"error", "response.error"} {
		t.Run(eventType, func(t *testing.T) {
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
				require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"`+eventType+`","error":{"message":"bad request"}}`)))
			}))
			defer srv.Close()
			gin.SetMode(gin.TestMode)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
			info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeResponses, IsStream: true, RequestURLPath: "/v1/responses", ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: srv.URL, ChannelType: constant.ChannelTypeOpenAI, ApiKey: "test"}}
			_, err := doResponsesWebsocketRequest(c, info, []byte(`{"model":"gpt-5","stream":true}`))
			require.Error(t, err)
		})
	}
}

func TestDoResponsesWebsocketRequestStopsOnProtocolErrorAfterOutput(t *testing.T) {
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
				require.Contains(t, string(body), `"type":"`+eventType+`"`)
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

func TestResponsesWebsocketPoolRebuildsClosedReusedConnection(t *testing.T) {
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
		connectionNumber := connections
		mu.Unlock()
		defer conn.Close()
		_, _, err = conn.ReadMessage()
		if err != nil {
			return
		}
		id := fmt.Sprintf("resp-%d", connectionNumber)
		_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.created","response":{"id":"`+id+`"}}`))
		_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed","response":{"id":"`+id+`"}}`))
		// The first socket is deliberately closed after a healthy turn. The
		// next request must evict it and create one replacement before output.
	}))
	defer srv.Close()
	makeRequest := func() {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
		c.Request.Header.Set("X-Codex-Session-Id", "session-a")
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
	require.Equal(t, 2, connections)
	mu.Unlock()
}
