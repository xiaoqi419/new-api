package openai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayhelper "github.com/QuantumNous/new-api/relay/helper"
	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"golang.org/x/net/proxy"
)

var (
	cpaResponsesWebsocketFirstFrameTimeout = 15 * time.Second
	cpaResponsesWebsocketReadTimeout       = 2 * time.Minute
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
	var body map[string]json.RawMessage
	if err := common.Unmarshal(payload, &body); err != nil {
		return nil, err
	}
	if body == nil {
		return nil, fmt.Errorf("responses websocket payload must be a JSON object")
	}
	body["type"] = json.RawMessage(`"response.create"`)
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

func responsesWebsocketDialer(rawProxyURL string) (*websocket.DialOptions, error) {
	dialer := websocket.DialOptions{CompressionMode: websocket.CompressionContextTakeover}
	trimmed := strings.TrimSpace(rawProxyURL)
	if trimmed == "" {
		return &dialer, nil
	}
	proxyURL, _, err := common.ParseProxyURLRuntime(trimmed)
	if err != nil {
		return nil, err
	}
	switch proxyURL.Scheme {
	case "http", "https":
		dialer.HTTPClient = &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}
	case "socks5", "socks5h":
		forwardDialer := &net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}
		socksDialer, dialErr := proxy.FromURL(proxyURL, forwardDialer)
		if dialErr != nil {
			return nil, dialErr
		}
		contextDialer, ok := socksDialer.(proxy.ContextDialer)
		if !ok {
			return nil, fmt.Errorf("SOCKS proxy dialer does not support context cancellation")
		}
		dialer.HTTPClient = &http.Client{Transport: &http.Transport{DialContext: contextDialer.DialContext}}
	default:
		return nil, fmt.Errorf("unsupported proxy scheme")
	}
	return &dialer, nil
}

func responsesWebsocketReadDeadline(ctx context.Context, timeout time.Duration) time.Time {
	deadline := time.Now().Add(timeout)
	if ctx != nil {
		if contextDeadline, ok := ctx.Deadline(); ok && contextDeadline.Before(deadline) {
			return contextDeadline
		}
	}
	return deadline
}

// doResponsesWebsocketRequest dials CPA and exposes websocket text frames as
// an HTTP SSE response. Once writing the envelope is attempted, returned errors
// are marked non-replayable because the provider may have received the bytes.
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
	model, previousResponseID, err := responsesWebsocketRequestMetadata(payload)
	if err != nil {
		return nil, err
	}
	if model == "" {
		model = strings.TrimSpace(info.UpstreamModelName)
	}
	storeResponse := responsesWebsocketRequestStoresResponse(payload)
	sessionHint := responsesWebsocketSessionHint(c)
	pool := cpaResponsesWebsocketPoolFor(cpaResponsesWebsocketPoolKeyFor(headers, model, httpURL, cpaResponsesWebsocketPoolIdentityFor(info)))
	dialer, err := responsesWebsocketDialer(info.ChannelSetting.Proxy)
	if err != nil {
		return nil, newCPAResponsesWebsocketError("proxy setup failed", false, false, err)
	}
	dialer.HTTPHeader = headers
	dial := func() (*cpaResponsesWebsocketConn, error) {
		var lastErr error
		for _, wsURL := range candidates {
			conn, hs, dialErr := websocket.Dial(ctx, wsURL, dialer)
			if dialErr == nil {
				readLimit := int64(relayhelper.DefaultMaxScannerBufferSize)
				if constant.StreamScannerMaxBufferMB > 0 {
					readLimit = int64(constant.StreamScannerMaxBufferMB) << 20
				}
				conn.SetReadLimit(readLimit)
				return &cpaResponsesWebsocketConn{conn: conn, wsURL: wsURL, responseIDs: make(map[string]struct{})}, nil
			}
			lastErr = dialErr
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
		return nil, fmt.Errorf("responses websocket dial failed: %w", lastErr)
	}

	// Once a write is attempted, bytes may have reached the provider even when
	// Write returns an error. Only failures before this point may fall back.
	currentLease, acquireErr := pool.acquire(ctx, sessionHint, previousResponseID, dial)
	if acquireErr != nil {
		return nil, newCPAResponsesWebsocketError("acquire failed", false, false, acquireErr)
	}
	conn := currentLease.entry.conn
	stopBeforeFirstFrame := context.AfterFunc(ctx, func() {
		currentLease.markBroken()
	})
	if err := conn.Write(ctx, websocket.MessageText, envelope); err != nil {
		stopBeforeFirstFrame()
		wasReused := currentLease.reused
		currentLease.markBroken()
		return nil, newCPAResponsesWebsocketError("write failed", wasReused, false, err, true)
	}

	// Read one frame before exposing the stream so setup failures remain
	// synchronous. Provider errors are forwarded through the SSE bridge.
	firstCtx, cancelFirst := context.WithTimeout(ctx, cpaResponsesWebsocketFirstFrameTimeout)
	firstType, firstMsg, readErr := conn.Read(firstCtx)
	cancelFirst()
	stopBeforeFirstFrame()
	if readErr != nil {
		wasReused := currentLease.reused
		currentLease.markBroken()
		return nil, newCPAResponsesWebsocketError("read failed", wasReused, false, readErr, true)
	}
	if firstType != websocket.MessageText && firstType != websocket.MessageBinary {
		wasReused := currentLease.reused
		currentLease.markBroken()
		return nil, newCPAResponsesWebsocketError("returned non-text first frame", wasReused, false, nil, true)
	}
	firstMsg = bytes.TrimSpace(firstMsg)
	var firstEvent struct {
		Type string `json:"type"`
	}
	if err := common.Unmarshal(firstMsg, &firstEvent); err != nil || firstEvent.Type == "" {
		wasReused := currentLease.reused
		currentLease.markBroken()
		return nil, newCPAResponsesWebsocketError("returned invalid first event", wasReused, false, nil, true)
	}
	firstProtocolError := isResponsesWebsocketProtocolError(firstEvent.Type)

	pr, pw := io.Pipe()
	streamReused := currentLease.reused
	stopCancel := context.AfterFunc(ctx, func() {
		currentLease.markBroken()
		_ = pw.CloseWithError(ctx.Err())
	})
	finish := func(healthy bool, responseID string, cause error) {
		stopCancel()
		if healthy {
			currentLease.releaseHealthy(responseID)
		} else {
			currentLease.markBroken()
			channelID := 0
			if info != nil {
				channelID = info.GetChannelID()
			}
			logger.LogWarn(c, fmt.Sprintf("responses websocket stream failed: channel=%d reused=%t rebuilt=false fallback=false reason=%v", channelID, streamReused, cause))
		}
		if cause != nil {
			_ = pw.CloseWithError(cause)
		} else {
			_ = pw.Close()
		}
	}

	go func() {
		responseID := responsesWebsocketResponseID(firstMsg)
		writeFrame := func(msg []byte) error {
			msg = bytes.TrimSpace(msg)
			if len(msg) == 0 {
				return nil
			}
			_, err := fmt.Fprintf(pw, "data: %s\n\n", msg)
			return err
		}
		if err := writeFrame(firstMsg); err != nil {
			finish(false, "", newCPAResponsesWebsocketError("stream write failed", streamReused, false, nil, true))
			return
		}
		if firstProtocolError {
			finish(false, "", newCPAResponsesWebsocketError("upstream protocol error", streamReused, false, nil, true))
			return
		}
		if isResponsesWebsocketTerminalEvent(firstEvent.Type) {
			if !storeResponse {
				responseID = ""
			}
			finish(true, responseID, nil)
			return
		}
		for {
			readCtx := ctx
			cancelRead := func() {}
			if cpaResponsesWebsocketReadTimeout > 0 {
				readCtx, cancelRead = context.WithTimeout(ctx, cpaResponsesWebsocketReadTimeout)
			}
			mt, msg, readErr := conn.Read(readCtx)
			cancelRead()
			if readErr != nil {
				finish(false, "", newCPAResponsesWebsocketError("stream read failed", streamReused, false, readErr, true))
				return
			}
			if mt != websocket.MessageText && mt != websocket.MessageBinary {
				continue
			}
			if id := responsesWebsocketResponseID(msg); id != "" {
				responseID = id
			}
			if err := writeFrame(msg); err != nil {
				finish(false, "", newCPAResponsesWebsocketError("stream write failed", streamReused, false, nil, true))
				return
			}
			var event struct {
				Type string `json:"type"`
			}
			if common.Unmarshal(msg, &event) == nil {
				if isResponsesWebsocketProtocolError(event.Type) {
					finish(false, "", newCPAResponsesWebsocketError("upstream protocol error", streamReused, false, nil, true))
					return
				}
				if isResponsesWebsocketTerminalEvent(event.Type) {
					if !storeResponse {
						responseID = ""
					}
					finish(true, responseID, nil)
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
