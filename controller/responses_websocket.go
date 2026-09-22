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
		identity, identityErr := parseResponsesWSIdentity(frame.payload)
		payload, model, err := normalizeResponsesWSCreate(frame.payload, sessionModel)
		if identityErr != nil {
			err = identityErr
		}
		if err != nil {
			errorPayload, _ := common.Marshal(gin.H{"type": "error", "status": http.StatusBadRequest, "error": gin.H{"type": "invalid_request_error", "message": err.Error()}})
			if writeErr := writeResponsesWSMessage(ctx, conn, identity.correlate(errorPayload)); writeErr != nil {
				return
			}
			continue
		}
		sessionModel = model
		turnErr, next := runResponsesWSTurn(ctx, conn, relayHandler, baseHeaders, remoteAddr, host, payload, frames, identity)
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

// WebSocket correlation fields belong to the envelope, not the HTTP relay body.
type responsesWSIdentity struct {
	eventID  string
	streamID string
}

func parseResponsesWSIdentity(payload []byte) (responsesWSIdentity, error) {
	var envelope struct {
		EventID  string          `json:"event_id"`
		StreamID json.RawMessage `json:"stream_id"`
		Response json.RawMessage `json:"response"`
	}
	err := common.Unmarshal(payload, &envelope)
	identity := responsesWSIdentity{eventID: envelope.EventID}
	if err != nil {
		return identity, fmt.Errorf("invalid JSON payload")
	}
	if len(envelope.StreamID) == 0 && len(envelope.Response) > 0 {
		var wrapped struct {
			StreamID json.RawMessage `json:"stream_id"`
		}
		if common.Unmarshal(envelope.Response, &wrapped) == nil {
			envelope.StreamID = wrapped.StreamID
		}
	}
	if len(envelope.StreamID) == 0 {
		return identity, nil
	}
	var streamID string
	if common.Unmarshal(envelope.StreamID, &streamID) != nil || len(streamID) < 1 || len(streamID) > 256 {
		return identity, fmt.Errorf("stream_id must contain 1-256 ASCII letters, digits, underscores, hyphens, or periods")
	}
	for _, char := range streamID {
		if !(char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char >= '0' && char <= '9' || char == '_' || char == '-' || char == '.') {
			return identity, fmt.Errorf("stream_id must contain only ASCII letters, digits, underscores, hyphens, or periods")
		}
	}
	identity.streamID = streamID
	return identity, nil
}

func (identity responsesWSIdentity) correlate(payload []byte) []byte {
	if identity.streamID == "" && identity.eventID == "" {
		return payload
	}
	var event map[string]json.RawMessage
	if common.Unmarshal(payload, &event) != nil || event == nil {
		return payload
	}
	if identity.streamID != "" {
		event["stream_id"], _ = common.Marshal(identity.streamID)
	}
	var eventType string
	_ = common.Unmarshal(event["type"], &eventType)
	if identity.eventID != "" && (eventType == "error" || eventType == "response.error") {
		event["event_id"], _ = common.Marshal(identity.eventID)
	}
	encoded, err := common.Marshal(event)
	if err != nil {
		return payload
	}
	return encoded
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
	if wrapped, exists := body["response"]; exists {
		generate := body["generate"]
		if err := common.Unmarshal(wrapped, &body); err != nil || body == nil {
			return nil, "", fmt.Errorf("response must be an object")
		}
		if len(generate) > 0 {
			body["generate"] = generate
		}
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
	delete(body, "event_id")
	delete(body, "stream_id")
	body["stream"] = json.RawMessage(`true`)
	normalized, err := common.Marshal(body)
	return normalized, model, err
}

func runResponsesWSTurn(parent context.Context, conn *websocket.Conn, relayHandler http.Handler, baseHeaders http.Header, remoteAddr, host string, payload []byte, frames <-chan responsesWSFrame, identity responsesWSIdentity) (error, *responsesWSFrame) {
	turnCtx, cancel := context.WithCancel(parent)
	defer cancel()
	req := httptestRequestWithContext(turnCtx, payload, baseHeaders, remoteAddr, host)
	writer := newResponsesWSWriter(turnCtx, conn)
	writer.identity = identity
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
				if err := writeResponsesWSMessage(writer.ctx, writer.conn, identity.correlate(payload)); err != nil {
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
				controlIdentity, err := parseResponsesWSIdentity(frame.payload)
				if err != nil || (controlIdentity.streamID != "" && controlIdentity.streamID != identity.streamID) {
					errorPayload := []byte(`{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"response.cancel does not identify the active stream"}}`)
					writer.mu.Lock()
					writeErr := writeResponsesWSMessage(parent, conn, controlIdentity.correlate(errorPayload))
					writer.mu.Unlock()
					if writeErr != nil {
						return writeErr, nil
					}
					continue
				}
				cancel()
				<-done
				_ = writeResponsesWSMessage(parent, conn, identity.correlate([]byte(`{"type":"response.cancelled"}`)))
				return nil, nil
			}
			frameIdentity, frameErr := parseResponsesWSIdentity(frame.payload)
			if frameErr == nil {
				_, _, frameErr = normalizeResponsesWSCreate(frame.payload, "active-turn")
			}
			if frameErr == nil && pending != nil {
				frameErr = fmt.Errorf("only one response.create may be queued")
			}
			if frameErr == nil {
				pending = &frame
				continue
			}
			errorPayload, _ := common.Marshal(gin.H{"type": "error", "status": http.StatusBadRequest, "error": gin.H{"type": "invalid_request_error", "message": frameErr.Error()}})
			writer.mu.Lock()
			writeErr := writeResponsesWSMessage(parent, conn, frameIdentity.correlate(errorPayload))
			writer.mu.Unlock()
			if writeErr != nil {
				return writeErr, nil
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
	identity responsesWSIdentity
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
			if err := writeResponsesWSMessage(w.ctx, w.conn, w.identity.correlate([]byte(data))); err != nil {
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
		if err := writeResponsesWSMessage(w.ctx, w.conn, w.identity.correlate(p)); err != nil {
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
