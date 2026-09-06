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
	"github.com/QuantumNous/new-api/logger"
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
	if body == nil {
		return nil, fmt.Errorf("responses websocket payload must be a JSON object")
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
	model, previousResponseID, err := responsesWebsocketRequestMetadata(payload)
	if err != nil {
		return nil, err
	}
	if model == "" {
		model = strings.TrimSpace(info.UpstreamModelName)
	}
	storeResponse := responsesWebsocketRequestStoresResponse(payload)
	sessionHint := responsesWebsocketSessionHint(c)
	pool := cpaResponsesWebsocketPoolFor(cpaResponsesWebsocketPoolKeyFor(headers, model, httpURL))
	dial := func() (*cpaResponsesWebsocketConn, error) {
		var lastErr error
		for _, wsURL := range candidates {
			conn, hs, dialErr := websocket.DefaultDialer.DialContext(ctx, wsURL, headers)
			if dialErr == nil {
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

	rebuilt := false
	// Reusing a socket is safe to retry once when it fails before its first
	// response event. A newly dialed socket is not replayed: the provider may
	// have accepted the request even though its first frame was lost.
	for attempt := 0; attempt < 2; attempt++ {
		currentLease, acquireErr := pool.acquire(ctx, sessionHint, previousResponseID, dial)
		if acquireErr != nil {
			return nil, newCPAResponsesWebsocketError("acquire failed", false, rebuilt, acquireErr)
		}
		conn := currentLease.entry.conn
		stopBeforeFirstFrame := context.AfterFunc(ctx, func() {
			currentLease.markBroken()
		})
		if err := conn.WriteMessage(websocket.TextMessage, envelope); err != nil {
			stopBeforeFirstFrame()
			wasReused := currentLease.reused
			currentLease.markBroken()
			if wasReused && attempt == 0 {
				rebuilt = true
				continue
			}
			return nil, newCPAResponsesWebsocketError("write failed", wasReused, rebuilt, err)
		}

		// Read one frame before exposing the stream. A CPA error/protocol frame can
		// then trigger HTTP fallback without having emitted a partial SSE response.
		firstType, firstMsg, readErr := conn.ReadMessage()
		stopBeforeFirstFrame()
		if readErr != nil {
			wasReused := currentLease.reused
			currentLease.markBroken()
			if wasReused && attempt == 0 {
				rebuilt = true
				continue
			}
			return nil, newCPAResponsesWebsocketError("read failed", wasReused, rebuilt, readErr)
		}
		if firstType != websocket.TextMessage && firstType != websocket.BinaryMessage {
			wasReused := currentLease.reused
			currentLease.markBroken()
			if wasReused && attempt == 0 {
				rebuilt = true
				continue
			}
			return nil, newCPAResponsesWebsocketError("returned non-text first frame", wasReused, rebuilt, nil)
		}
		firstMsg = bytes.TrimSpace(firstMsg)
		var firstEvent struct {
			Type string `json:"type"`
		}
		if err := common.Unmarshal(firstMsg, &firstEvent); err != nil || firstEvent.Type == "" {
			wasReused := currentLease.reused
			currentLease.markBroken()
			if wasReused && attempt == 0 {
				rebuilt = true
				continue
			}
			return nil, newCPAResponsesWebsocketError("returned invalid first event", wasReused, rebuilt, nil)
		}
		if isResponsesWebsocketProtocolError(firstEvent.Type) {
			currentLease.markBroken()
			return nil, newCPAResponsesWebsocketError("upstream protocol error", currentLease.reused, rebuilt, nil)
		}

		pr, pw := io.Pipe()
		streamReused := currentLease.reused
		streamRebuilt := rebuilt
		stopCancel := context.AfterFunc(ctx, func() {
			currentLease.markBroken()
			_ = pw.CloseWithError(ctx.Err())
		})
		finish := func(healthy bool, responseID string) {
			stopCancel()
			if healthy {
				currentLease.releaseHealthy(responseID)
			} else {
				currentLease.markBroken()
				channelID := 0
				if info != nil {
					channelID = info.GetChannelID()
				}
				logger.LogWarn(c, fmt.Sprintf("responses websocket stream failed: channel=%d reused=%t rebuilt=%t fallback=false reason=stream failure", channelID, streamReused, streamRebuilt))
			}
			_ = pw.Close()
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
				finish(false, "")
				return
			}
			if isResponsesWebsocketTerminalEvent(firstEvent.Type) {
				if !storeResponse {
					responseID = ""
				}
				finish(true, responseID)
				return
			}
			for {
				mt, msg, readErr := conn.ReadMessage()
				if readErr != nil {
					finish(false, "")
					return
				}
				if mt != websocket.TextMessage && mt != websocket.BinaryMessage {
					continue
				}
				if id := responsesWebsocketResponseID(msg); id != "" {
					responseID = id
				}
				if err := writeFrame(msg); err != nil {
					finish(false, "")
					return
				}
				var event struct {
					Type string `json:"type"`
				}
				if common.Unmarshal(msg, &event) == nil {
					if isResponsesWebsocketProtocolError(event.Type) {
						finish(false, "")
						return
					}
					if isResponsesWebsocketTerminalEvent(event.Type) {
						if !storeResponse {
							responseID = ""
						}
						finish(true, responseID)
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
	return nil, newCPAResponsesWebsocketError("request failed before first frame", false, rebuilt, nil)
}
