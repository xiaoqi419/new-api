package controller

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	responsesWSMaxMessages  = 4096
	responsesWSMaxEvent     = 16 << 20
	responsesWSIdleTimeout  = 30 * time.Minute
	responsesWSMaxLifetime  = 24 * time.Hour
	responsesWSWriteTimeout = 30 * time.Second
)

// ResponsesWebSocket upgrades a client Responses connection and runs each
// response.create through the supplied HTTP relay handler. Keeping the relay
// handler injectable makes this protocol layer testable while production passes
// the main Gin engine, preserving all normal middleware and billing behavior.
func ResponsesWebSocket(c *gin.Context, relayHandler http.Handler) {
	if c == nil || c.Request == nil || relayHandler == nil {
		return
	}
	if !isWebSocketUpgrade(c.Request) {
		c.Header("Connection", "Upgrade")
		c.JSON(http.StatusUpgradeRequired, gin.H{"error": gin.H{"type": "invalid_request_error", "message": "WebSocket upgrade required"}})
		return
	}
	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{CompressionMode: websocket.CompressionContextTakeover})
	if err != nil {
		return
	}
	defer conn.CloseNow()
	conn.SetReadLimit(16 << 20)

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	ctx, cancel = context.WithTimeout(ctx, responsesWSMaxLifetime)
	defer cancel()
	frames := make(chan responsesWSFrame)
	baseHeaders := c.Request.Header.Clone()
	baseHeaders.Del("Upgrade")
	baseHeaders.Del("Connection")
	baseHeaders.Del("Sec-WebSocket-Protocol")
	baseHeaders.Del("Sec-WebSocket-Key")
	baseHeaders.Del("Sec-WebSocket-Version")
	baseHeaders.Del("Sec-WebSocket-Extensions")
	baseHeaders.Del("Content-Encoding")
	baseHeaders.Del("Content-Length")
	baseHeaders.Set("X-Codex-Session-Id", uuid.NewString())
	remoteAddr := c.Request.RemoteAddr
	host := c.Request.Host
	go readResponsesWSFrames(ctx, conn, frames)
	var pending *responsesWSFrame
	var sessionModel string

	for {
		var frame responsesWSFrame
		if pending != nil {
			frame = *pending
			pending = nil
		} else {
			select {
			case <-ctx.Done():
				return
			case next, ok := <-frames:
				if !ok {
					return
				}
				frame = next
			}
		}
		if frame.err != nil {
			return
		}
		payload, model, err := normalizeResponsesWSCreate(frame.payload, sessionModel)
		if err != nil {
			_ = conn.Close(websocket.StatusPolicyViolation, err.Error())
			return
		}
		sessionModel = model
		turnErr, next := runResponsesWSTurn(ctx, conn, relayHandler, baseHeaders, remoteAddr, host, payload, frames)
		pending = next
		if turnErr != nil {
			if ctx.Err() != nil {
				return
			}
			_ = conn.Close(websocket.StatusInternalError, turnErr.Error())
			return
		}
	}
}

type responsesWSFrame struct {
	payload []byte
	err     error
}

func readResponsesWSFrames(ctx context.Context, conn *websocket.Conn, frames chan<- responsesWSFrame) {
	defer close(frames)
	messageCount := 0
	for {
		readCtx, cancel := context.WithTimeout(ctx, responsesWSIdleTimeout)
		msgType, payload, err := conn.Read(readCtx)
		cancel()
		if err != nil {
			select {
			case frames <- responsesWSFrame{err: err}:
			case <-ctx.Done():
			}
			return
		}
		if msgType != websocket.MessageText && msgType != websocket.MessageBinary {
			select {
			case frames <- responsesWSFrame{err: fmt.Errorf("unsupported websocket message type")}:
			case <-ctx.Done():
			}
			return
		}
		messageCount++
		if messageCount > responsesWSMaxMessages {
			select {
			case frames <- responsesWSFrame{err: fmt.Errorf("websocket message limit exceeded")}:
			case <-ctx.Done():
			}
			return
		}
		select {
		case frames <- responsesWSFrame{payload: append([]byte(nil), payload...)}:
		case <-ctx.Done():
			return
		}
	}
}

func normalizeResponsesWSCreate(payload []byte, inheritedModel string) ([]byte, string, error) {
	var body map[string]json.RawMessage
	if err := common.Unmarshal(payload, &body); err != nil {
		return nil, "", fmt.Errorf("invalid JSON payload")
	}
	var messageType string
	if body == nil || common.Unmarshal(body["type"], &messageType) != nil || messageType != "response.create" {
		return nil, "", fmt.Errorf("first message must be response.create")
	}
	modelRaw, hasModel := body["model"]
	model := ""
	if hasModel {
		if err := common.Unmarshal(modelRaw, &model); err != nil || strings.TrimSpace(model) == "" {
			return nil, "", fmt.Errorf("model must be a non-empty string")
		}
	} else {
		model = inheritedModel
		encodedModel, _ := common.Marshal(model)
		body["model"] = encodedModel
	}
	if strings.TrimSpace(model) == "" {
		return nil, "", fmt.Errorf("model is required in first response.create payload")
	}
	if _, ok := body["input"]; !ok {
		body["input"] = json.RawMessage(`[]`)
	}
	delete(body, "type")
	body["stream"] = json.RawMessage(`true`)
	normalized, err := common.Marshal(body)
	return normalized, model, err
}

func runResponsesWSTurn(parent context.Context, conn *websocket.Conn, relayHandler http.Handler, baseHeaders http.Header, remoteAddr, host string, payload []byte, frames <-chan responsesWSFrame) (error, *responsesWSFrame) {
	turnCtx, cancel := context.WithCancel(parent)
	defer cancel()
	req := httptestRequestWithContext(turnCtx, payload, baseHeaders, remoteAddr, host)
	writer := newResponsesWSWriter(turnCtx, conn)
	done := make(chan struct{})
	go func() {
		defer close(done)
		relayHandler.ServeHTTP(writer, req)
	}()

	var pending *responsesWSFrame
	for {
		select {
		case <-done:
			writer.mu.Lock()
			turnErr := writer.writeErr
			if turnErr == nil && !writer.terminal {
				payload := []byte(`{"type":"error","error":{"type":"stream_incomplete","code":"stream_incomplete","message":"Upstream response stream ended before a terminal event."}}`)
				if err := writeResponsesWSMessage(writer.ctx, writer.conn, payload); err != nil {
					writer.writeErr = err
					turnErr = err
				} else {
					writer.terminal = true
					turnErr = fmt.Errorf("responses stream incomplete")
				}
			}
			writer.mu.Unlock()
			return turnErr, pending
		case <-turnCtx.Done():
			return turnCtx.Err(), nil
		case frame, ok := <-frames:
			if !ok {
				cancel()
				<-done
				return context.Canceled, nil
			}
			if frame.err != nil {
				cancel()
				<-done
				return frame.err, nil
			}
			if isResponsesWSCancel(frame.payload) {
				cancel()
				<-done
				_ = writeResponsesWSMessage(parent, conn, []byte(`{"type":"response.cancelled"}`))
				return nil, nil
			}
			if _, _, err := normalizeResponsesWSCreate(frame.payload, "active-turn"); err == nil {
				if pending != nil {
					cancel()
					<-done
					return fmt.Errorf("only one response.create may be queued"), nil
				}
				pending = &frame
			} else {
				cancel()
				<-done
				return fmt.Errorf("unsupported message while response is active"), nil
			}
		}
	}
}

func isResponsesWSCancel(payload []byte) bool {
	var body struct {
		Type string `json:"type"`
	}
	return common.Unmarshal(payload, &body) == nil && body.Type == "response.cancel"
}

func httptestRequestWithContext(ctx context.Context, payload []byte, baseHeaders http.Header, remoteAddr, host string) *http.Request {
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "/v1/responses", bytes.NewReader(payload))
	req.Header = baseHeaders.Clone()
	req.RemoteAddr = remoteAddr
	req.Host = host
	req.Header.Set("Content-Type", "application/json")
	return req
}

type responsesWSWriter struct {
	mu       sync.Mutex
	header   http.Header
	status   int
	stream   bool
	buffer   bytes.Buffer
	ctx      context.Context
	conn     *websocket.Conn
	writeErr error
	terminal bool
	notify   <-chan bool
}

func newResponsesWSWriter(ctx context.Context, conn *websocket.Conn) *responsesWSWriter {
	notify := make(chan bool)
	go func() {
		<-ctx.Done()
		close(notify)
	}()
	return &responsesWSWriter{header: make(http.Header), status: http.StatusOK, ctx: ctx, conn: conn, notify: notify}
}

func (w *responsesWSWriter) Header() http.Header { return w.header }

func (w *responsesWSWriter) WriteHeader(status int) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.status == http.StatusOK || w.status == 0 {
		w.status = status
	}
	w.stream = strings.Contains(strings.ToLower(w.header.Get("Content-Type")), "text/event-stream")
}

func (w *responsesWSWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.writeErr != nil {
		return 0, w.writeErr
	}
	if w.stream || strings.Contains(strings.ToLower(w.header.Get("Content-Type")), "text/event-stream") {
		w.stream = true
		_, _ = w.buffer.Write(p)
		if w.buffer.Len() > responsesWSMaxEvent {
			w.writeErr = fmt.Errorf("Responses SSE event exceeds %d bytes", responsesWSMaxEvent)
			return 0, w.writeErr
		}
		for {
			data, ok := popResponsesSSEFrame(&w.buffer)
			if !ok {
				break
			}
			if data == "" || data == "[DONE]" {
				continue
			}
			if err := writeResponsesWSMessage(w.ctx, w.conn, []byte(data)); err != nil {
				w.writeErr = err
				return 0, err
			}
			var event struct {
				Type string `json:"type"`
			}
			if common.UnmarshalJsonStr(data, &event) == nil {
				switch event.Type {
				case "response.completed", "response.done", "response.failed", "response.incomplete", "response.cancelled", "response.canceled", "error", "response.error":
					w.terminal = true
				}
			}
		}
		return len(p), nil
	}
	if len(p) > 0 {
		if w.status >= http.StatusBadRequest {
			var body map[string]any
			if common.Unmarshal(p, &body) == nil && body != nil {
				body["type"] = "error"
				if encoded, err := common.Marshal(body); err == nil {
					p = encoded
				}
			}
		}
		if err := writeResponsesWSMessage(w.ctx, w.conn, append([]byte(nil), p...)); err != nil {
			w.writeErr = err
			return 0, err
		}
		var event struct {
			Type string `json:"type"`
		}
		if common.Unmarshal(p, &event) == nil && (event.Type == "error" || event.Type == "response.error") {
			w.terminal = true
		}
	}
	return len(p), nil
}

func writeResponsesWSMessage(parent context.Context, conn *websocket.Conn, payload []byte) error {
	ctx, cancel := context.WithTimeout(parent, responsesWSWriteTimeout)
	defer cancel()
	return conn.Write(ctx, websocket.MessageText, payload)
}

func (w *responsesWSWriter) Flush() {}

func (w *responsesWSWriter) CloseNotify() <-chan bool { return w.notify }

func (w *responsesWSWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return nil, nil, fmt.Errorf("websocket relay writer does not support hijacking")
}

func (w *responsesWSWriter) err() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.writeErr
}

func popResponsesSSEFrame(buffer *bytes.Buffer) (string, bool) {
	data := buffer.Bytes()
	idx := bytes.Index(data, []byte("\n\n"))
	sepLen := 2
	if idx < 0 {
		idx = bytes.Index(data, []byte("\r\n\r\n"))
		sepLen = 4
	}
	if idx < 0 {
		return "", false
	}
	frame := append([]byte(nil), data[:idx]...)
	buffer.Next(idx + sepLen)
	for _, rawLine := range bytes.Split(frame, []byte("\n")) {
		line := strings.TrimSpace(strings.TrimSuffix(string(rawLine), "\r"))
		if strings.HasPrefix(line, "data:") {
			return strings.TrimSpace(strings.TrimPrefix(line, "data:")), true
		}
	}
	return "", true
}

func isWebSocketUpgrade(r *http.Request) bool {
	return r != nil && strings.EqualFold(strings.TrimSpace(r.Header.Get("Upgrade")), "websocket") && strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade")
}

var _ http.ResponseWriter = (*responsesWSWriter)(nil)
var _ http.Flusher = (*responsesWSWriter)(nil)
