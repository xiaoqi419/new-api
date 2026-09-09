package controller

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPopResponsesSSEFrameSupportsLargeEvents(t *testing.T) {
	payload := `{"type":"response.output_text.delta","delta":"` + strings.Repeat("x", 70<<10) + `"}`
	buffer := bytes.NewBufferString("event: response.output_text.delta\ndata: " + payload + "\n\n")

	got, ok := popResponsesSSEFrame(buffer)
	require.True(t, ok)
	assert.Equal(t, payload, got)
}

func TestNormalizeResponsesWSCreatePreservesLargeIntegersAndRejectsInvalidModel(t *testing.T) {
	payload, model, err := normalizeResponsesWSCreate([]byte(`{"type":"response.create","model":"gpt-test","input":[],"metadata":{"large":9007199254740993}}`), "")
	require.NoError(t, err)
	assert.Equal(t, "gpt-test", model)
	assert.Contains(t, string(payload), `9007199254740993`)

	_, _, err = normalizeResponsesWSCreate([]byte(`{"type":"response.create","model":42,"input":[]}`), "gpt-test")
	require.ErrorContains(t, err, "model must be a non-empty string")
}

func TestResponsesWebSocketRejectsNonCreateFirstFrame(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	relay := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("relay must not run for an invalid first frame")
	})
	engine.GET("/v1/responses", func(c *gin.Context) { ResponsesWebSocket(c, relay) })
	server := httptest.NewServer(engine)
	t.Cleanup(server.Close)

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+"/v1/responses", nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.CloseNow() })
	require.NoError(t, conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.update"}`)))

	_, _, err = conn.Read(context.Background())
	require.Error(t, err)
	assert.Equal(t, websocket.StatusPolicyViolation, websocket.CloseStatus(err))
}

func TestResponsesWebSocketBridgesCompletedTurns(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var (
		mu     sync.Mutex
		bodies []map[string]any
	)
	relay := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/v1/responses", r.URL.Path)
		var body map[string]any
		require.NoError(t, common.DecodeJson(r.Body, &body))
		mu.Lock()
		bodies = append(bodies, body)
		turn := len(bodies)
		mu.Unlock()

		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(`event: response.created` + "\n" + `data: {"type":"response.created","response":{"id":"resp_` + string(rune('0'+turn)) + `"}}` + "\n\n"))
		w.(http.Flusher).Flush()
		_, _ = w.Write([]byte(`event: response.completed` + "\n" + `data: {"type":"response.completed","response":{"id":"resp_` + string(rune('0'+turn)) + `","status":"completed"}}` + "\n\n"))
		w.(http.Flusher).Flush()
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	})

	engine := gin.New()
	engine.GET("/v1/responses", func(c *gin.Context) { ResponsesWebSocket(c, relay) })
	server := httptest.NewServer(engine)
	t.Cleanup(server.Close)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+"/v1/responses", nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.CloseNow() })

	require.NoError(t, conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"response.create","model":"gpt-test","input":"hello"}`)))
	require.Equal(t, "response.created", readResponsesWebSocketEventType(t, conn))
	require.Equal(t, "response.completed", readResponsesWebSocketEventType(t, conn))

	require.NoError(t, conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"response.create","input":"again","previous_response_id":"resp_1"}`)))
	require.Equal(t, "response.created", readResponsesWebSocketEventType(t, conn))
	require.Equal(t, "response.completed", readResponsesWebSocketEventType(t, conn))

	mu.Lock()
	defer mu.Unlock()
	require.Len(t, bodies, 2)
	assert.NotContains(t, bodies[0], "type")
	assert.Equal(t, true, bodies[0]["stream"])
	assert.Equal(t, "gpt-test", bodies[1]["model"])
	assert.Equal(t, "resp_1", bodies[1]["previous_response_id"])
}

func TestResponsesWebSocketPreservesGenerateFalse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	relay := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		require.NoError(t, common.DecodeJson(r.Body, &body))
		assert.Equal(t, false, body["generate"])
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"type\":\"response.completed\"}\n\ndata: [DONE]\n\n"))
	})
	engine.GET("/v1/responses", func(c *gin.Context) { ResponsesWebSocket(c, relay) })
	server := httptest.NewServer(engine)
	t.Cleanup(server.Close)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+"/v1/responses", nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.CloseNow() })

	require.NoError(t, conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"response.create","model":"gpt-test","input":"hello","generate":false}`)))
	require.Equal(t, "response.completed", readResponsesWebSocketEventType(t, conn))
}

func TestResponsesWebSocketWrapsHTTPErrorAsProtocolEvent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	relay := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"bad turn","type":"invalid_request_error"}}`))
	})
	engine.GET("/v1/responses", func(c *gin.Context) { ResponsesWebSocket(c, relay) })
	server := httptest.NewServer(engine)
	t.Cleanup(server.Close)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+"/v1/responses", nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.CloseNow() })

	require.NoError(t, conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"response.create","model":"gpt-test","input":"hello"}`)))
	require.Equal(t, "error", readResponsesWebSocketEventType(t, conn))
}

func TestResponsesWebSocketReportsRelayStreamWithoutTerminalEvent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var relayCalls atomic.Int32
	relay := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		relayCalls.Add(1)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"type\":\"response.created\"}\n\n"))
	})
	engine := gin.New()
	engine.GET("/v1/responses", func(c *gin.Context) { ResponsesWebSocket(c, relay) })
	server := httptest.NewServer(engine)
	t.Cleanup(server.Close)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+"/v1/responses", nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.CloseNow() })

	require.NoError(t, conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"response.create","model":"gpt-test","input":"hello"}`)))
	require.Equal(t, "response.created", readResponsesWebSocketEventType(t, conn))
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	messageType, payload, err := conn.Read(ctx)
	require.NoError(t, err)
	require.Equal(t, websocket.MessageText, messageType)
	var event struct {
		Type  string `json:"type"`
		Error struct {
			Type    string `json:"type"`
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, common.Unmarshal(payload, &event))
	require.Equal(t, "error", event.Type)
	require.Equal(t, "stream_incomplete", event.Error.Type)
	require.Equal(t, "stream_incomplete", event.Error.Code)
	require.Equal(t, "Upstream response stream ended before a terminal event.", event.Error.Message)

	_, _, err = conn.Read(ctx)
	require.Error(t, err)
	require.EqualValues(t, 1, relayCalls.Load(), "an incomplete turn must not be replayed")
}

func TestResponsesWebSocketCancelsActiveTurn(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cancelled := make(chan struct{})
	relay := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
		close(cancelled)
	})
	engine := gin.New()
	engine.GET("/v1/responses", func(c *gin.Context) { ResponsesWebSocket(c, relay) })
	server := httptest.NewServer(engine)
	t.Cleanup(server.Close)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+"/v1/responses", nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.CloseNow() })

	require.NoError(t, conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"response.create","model":"gpt-test","input":"hello"}`)))
	require.NoError(t, conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"response.cancel"}`)))
	require.Equal(t, "response.cancelled", readResponsesWebSocketEventType(t, conn))

	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("relay request context was not cancelled")
	}
}

func readResponsesWebSocketEventType(t *testing.T, conn *websocket.Conn) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	messageType, payload, err := conn.Read(ctx)
	require.NoError(t, err)
	require.Equal(t, websocket.MessageText, messageType)
	var event struct {
		Type string `json:"type"`
	}
	require.NoError(t, common.Unmarshal(payload, &event))
	return event.Type
}
