package openai

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// responsesWebsocketURLCandidates returns the canonical CPA Responses
// websocket route followed by compatibility aliases. Query parameters (for
// example Azure's API version) are retained for each candidate.
func responsesWebsocketURLCandidates(httpURL string) ([]string, error) {
	u, err := url.Parse(httpURL)
	if err != nil {
		return nil, err
	}
	switch strings.ToLower(u.Scheme) {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	default:
		return nil, fmt.Errorf("unsupported websocket URL scheme %q", u.Scheme)
	}
	path := strings.TrimSuffix(u.Path, "/")
	if !strings.HasSuffix(path, "/responses") {
		return nil, fmt.Errorf("responses websocket URL requires a /responses path, got %q", u.Path)
	}
	root := strings.TrimSuffix(path, "/responses")
	// CLIProxyAPI exposes the Codex Responses websocket by upgrading the
	// canonical /v1/responses route itself. Keep the /responses/ws and /ws
	// aliases after it for older CPA-compatible deployments; probing the
	// canonical route first avoids accidentally selecting CPA's unrelated
	// generic /v1/ws relay endpoint.
	paths := []string{path, path + "/ws", root + "/ws"}
	out := make([]string, 0, len(paths))
	seen := map[string]struct{}{}
	for _, p := range paths {
		v := *u
		v.Path = p
		s := v.String()
		if _, ok := seen[s]; !ok {
			seen[s] = struct{}{}
			out = append(out, s)
		}
	}
	return out, nil
}

func buildResponsesWebsocketRequestEnvelope(payload []byte) ([]byte, error) {
	var body map[string]any
	if err := common.Unmarshal(payload, &body); err != nil {
		return nil, err
	}
	body["type"] = "response.create"
	return common.Marshal(body)
}

func isResponsesWebsocketTerminalEvent(eventType string) bool {
	switch eventType {
	case "response.completed", "response.done", "response.failed", "response.incomplete", "response.cancelled", "response.canceled":
		return true
	default:
		return false
	}
}

func isResponsesWebsocketProtocolError(eventType string) bool {
	// CPA/Responses implementations use both the generic `error` event and
	// the Responses-specific `response.error` name. Treat either as terminal
	// so a peer that keeps the socket open after reporting an error cannot
	// leave the SSE pipe blocked indefinitely.
	return eventType == "error" || eventType == "response.error"
}

// doResponsesWebsocketRequest dials CPA and exposes websocket text frames as
// an HTTP SSE response. Returning an error before the first frame lets the
// caller retry the same payload over HTTP without producing duplicate billing.
func doResponsesWebsocketRequest(c *gin.Context, info *relaycommon.RelayInfo, payload []byte) (*http.Response, error) {
	ctx := c.Request.Context()
	adaptor := &Adaptor{}
	httpURL, err := adaptor.GetRequestURL(info)
	if err != nil {
		return nil, err
	}
	candidates, err := responsesWebsocketURLCandidates(httpURL)
	if err != nil {
		return nil, err
	}
	headers := http.Header{}
	if err := adaptor.SetupRequestHeader(c, &headers, info); err != nil {
		return nil, err
	}
	headers.Set("Accept", "application/json")
	headers.Set("Content-Type", "application/json")
	if requestID := c.GetString(common.RequestIdKey); requestID != "" {
		headers.Set("X-Client-Request-Id", requestID)
	}
	override, err := channel.ProcessHeaderOverrideForWebsocket(info, c)
	if err != nil {
		return nil, err
	}
	for k, v := range override {
		headers.Set(k, v)
	}
	envelope, err := buildResponsesWebsocketRequestEnvelope(payload)
	if err != nil {
		return nil, err
	}

	var conn *websocket.Conn
	var lastErr error
	for _, wsURL := range candidates {
		var hs *http.Response
		conn, hs, lastErr = websocket.DefaultDialer.DialContext(ctx, wsURL, headers)
		if lastErr == nil {
			break
		}
		if hs != nil {
			status := hs.StatusCode
			if hs.Body != nil {
				_ = hs.Body.Close()
			}
			// CPA path probing continues only for route-not-found responses.
			if status != http.StatusNotFound && status != http.StatusMethodNotAllowed {
				break
			}
		}
	}
	if lastErr != nil {
		return nil, fmt.Errorf("responses websocket dial failed: %w", lastErr)
	}
	pr, pw := io.Pipe()
	stopCancel := context.AfterFunc(ctx, func() {
		_ = conn.Close()
		_ = pw.CloseWithError(ctx.Err())
	})
	closeStream := func() {
		stopCancel()
		_ = conn.Close()
		_ = pw.Close()
	}
	if err := conn.WriteMessage(websocket.TextMessage, envelope); err != nil {
		closeStream()
		_ = pr.Close()
		return nil, fmt.Errorf("responses websocket write failed: %w", err)
	}

	// Read one frame before exposing the stream. A CPA error/protocol frame can
	// then trigger HTTP fallback without having emitted a partial SSE response.
	firstType, firstMsg, err := conn.ReadMessage()
	if err != nil {
		closeStream()
		_ = pr.Close()
		return nil, fmt.Errorf("responses websocket read failed: %w", err)
	}
	if firstType != websocket.TextMessage && firstType != websocket.BinaryMessage {
		closeStream()
		_ = pr.Close()
		return nil, fmt.Errorf("responses websocket returned non-text first frame")
	}
	firstMsg = bytes.TrimSpace(firstMsg)
	var firstEvent struct {
		Type string `json:"type"`
	}
	if err := common.Unmarshal(firstMsg, &firstEvent); err != nil || firstEvent.Type == "" {
		closeStream()
		_ = pr.Close()
		return nil, fmt.Errorf("responses websocket returned invalid first event")
	}
	if isResponsesWebsocketProtocolError(firstEvent.Type) {
		closeStream()
		_ = pr.Close()
		return nil, fmt.Errorf("responses websocket upstream error")
	}

	go func() {
		defer closeStream()
		writeFrame := func(msg []byte) error {
			msg = bytes.TrimSpace(msg)
			if len(msg) == 0 {
				return nil
			}
			_, err := fmt.Fprintf(pw, "data: %s\n\n", msg)
			return err
		}
		if err := writeFrame(firstMsg); err != nil {
			return
		}
		if isResponsesWebsocketTerminalEvent(firstEvent.Type) {
			return
		}
		for {
			mt, msg, readErr := conn.ReadMessage()
			if readErr != nil {
				return
			}
			if mt != websocket.TextMessage && mt != websocket.BinaryMessage {
				continue
			}
			if err := writeFrame(msg); err != nil {
				return
			}
			var event struct {
				Type string `json:"type"`
			}
			if common.Unmarshal(msg, &event) == nil {
				if isResponsesWebsocketProtocolError(event.Type) || isResponsesWebsocketTerminalEvent(event.Type) {
					return
				}
			}
		}
	}()
	return &http.Response{
		StatusCode: http.StatusOK,
		Status:     "200 OK",
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body:       pr,
		Request:    c.Request,
	}, nil
}
