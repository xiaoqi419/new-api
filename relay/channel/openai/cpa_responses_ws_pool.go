package openai

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// These limits intentionally apply to idle pooled connections only. A leased
// connection is owned by one response turn and is closed by that turn when it
// fails; it is never evicted underneath an active request.
const (
	cpaResponsesWebsocketIdleTimeout = 2 * time.Minute
	cpaResponsesWebsocketMaxLifetime = 30 * time.Minute
	cpaResponsesWebsocketHealthAfter = 30 * time.Second
	// Session hints are client-provided routing keys. Keep them bounded so an
	// unusually large header cannot create an unbounded pool-map key.
	cpaResponsesWebsocketMaxSessionHintBytes = 256
)

type cpaResponsesWebsocketPoolKey struct {
	Endpoint string
	AuthHash string
	Model    string
}

func (k cpaResponsesWebsocketPoolKey) String() string {
	return k.Endpoint + "\x00" + k.AuthHash + "\x00" + k.Model
}

type cpaResponsesWebsocketPool struct {
	mu            sync.Mutex
	connections   map[*cpaResponsesWebsocketConn]struct{}
	sessions      map[string]*cpaResponsesWebsocketConn
	responseIndex map[string]*cpaResponsesWebsocketConn
	waitCh        chan struct{}
}

type cpaResponsesWebsocketConn struct {
	pool        *cpaResponsesWebsocketPool
	conn        *websocket.Conn
	wsURL       string
	createdAt   time.Time
	lastUsedAt  time.Time
	inUse       bool
	broken      bool
	sessionHint string
	responseIDs map[string]struct{}
}

type cpaResponsesWebsocketLease struct {
	entry  *cpaResponsesWebsocketConn
	pool   *cpaResponsesWebsocketPool
	reused bool
}

// cpaResponsesWebsocketError carries safe transport metadata to the adaptor.
// Error deliberately returns a fixed, redacted reason so dial errors cannot
// echo URLs, headers, or provider response bodies into request logs.
type cpaResponsesWebsocketError struct {
	reason  string
	reused  bool
	rebuilt bool
	err     error
}

func (e *cpaResponsesWebsocketError) Error() string {
	if e == nil || e.reason == "" {
		return "responses websocket failure"
	}
	return "responses websocket " + e.reason
}

func (e *cpaResponsesWebsocketError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.err
}

func newCPAResponsesWebsocketError(reason string, reused, rebuilt bool, err error) error {
	return &cpaResponsesWebsocketError{reason: reason, reused: reused, rebuilt: rebuilt, err: err}
}

var cpaResponsesWebsocketPools = struct {
	sync.Mutex
	items map[string]*cpaResponsesWebsocketPool
}{items: make(map[string]*cpaResponsesWebsocketPool)}

func cpaResponsesWebsocketPoolFor(key cpaResponsesWebsocketPoolKey) *cpaResponsesWebsocketPool {
	cpaResponsesWebsocketPools.Lock()
	defer cpaResponsesWebsocketPools.Unlock()
	poolKey := key.String()
	if pool := cpaResponsesWebsocketPools.items[poolKey]; pool != nil {
		return pool
	}
	pool := &cpaResponsesWebsocketPool{
		connections:   make(map[*cpaResponsesWebsocketConn]struct{}),
		sessions:      make(map[string]*cpaResponsesWebsocketConn),
		responseIndex: make(map[string]*cpaResponsesWebsocketConn),
		waitCh:        make(chan struct{}),
	}
	cpaResponsesWebsocketPools.items[poolKey] = pool
	return pool
}

// resetCPAResponsesWebsocketPools is used by deterministic package tests. It
// also gives shutdown code a single place to close all pooled sockets.
func resetCPAResponsesWebsocketPools() {
	cpaResponsesWebsocketPools.Lock()
	pools := make([]*cpaResponsesWebsocketPool, 0, len(cpaResponsesWebsocketPools.items))
	for key, pool := range cpaResponsesWebsocketPools.items {
		delete(cpaResponsesWebsocketPools.items, key)
		pools = append(pools, pool)
	}
	cpaResponsesWebsocketPools.Unlock()
	for _, pool := range pools {
		pool.mu.Lock()
		for entry := range pool.connections {
			entry.broken = true
			if entry.conn != nil {
				_ = entry.conn.Close()
			}
		}
		pool.connections = make(map[*cpaResponsesWebsocketConn]struct{})
		pool.sessions = make(map[string]*cpaResponsesWebsocketConn)
		pool.responseIndex = make(map[string]*cpaResponsesWebsocketConn)
		pool.signalLocked()
		pool.mu.Unlock()
	}
}

func (p *cpaResponsesWebsocketPool) signalLocked() {
	close(p.waitCh)
	p.waitCh = make(chan struct{})
}

func (p *cpaResponsesWebsocketPool) removeLocked(entry *cpaResponsesWebsocketConn) {
	if _, ok := p.connections[entry]; !ok {
		return
	}
	delete(p.connections, entry)
	if entry.sessionHint != "" && p.sessions[entry.sessionHint] == entry {
		delete(p.sessions, entry.sessionHint)
	}
	for responseID := range entry.responseIDs {
		if p.responseIndex[responseID] == entry {
			delete(p.responseIndex, responseID)
		}
	}
	entry.broken = true
	if entry.conn != nil {
		_ = entry.conn.Close()
	}
	p.signalLocked()
}

func (p *cpaResponsesWebsocketPool) reapLocked(now time.Time) {
	for entry := range p.connections {
		if entry.inUse {
			continue
		}
		if now.Sub(entry.lastUsedAt) >= cpaResponsesWebsocketIdleTimeout || now.Sub(entry.createdAt) >= cpaResponsesWebsocketMaxLifetime {
			p.removeLocked(entry)
			continue
		}
		if now.Sub(entry.lastUsedAt) >= cpaResponsesWebsocketHealthAfter {
			// A control ping catches sockets that disappeared while idle without
			// consuming a response frame. The peer's pong handler is optional.
			if entry.conn == nil {
				p.removeLocked(entry)
				continue
			}
			if err := entry.conn.WriteControl(websocket.PingMessage, nil, now.Add(time.Second)); err != nil {
				p.removeLocked(entry)
				continue
			}
			entry.lastUsedAt = now
		}
	}
}

func (p *cpaResponsesWebsocketPool) acquire(ctx context.Context, sessionHint, previousResponseID string, dial func() (*cpaResponsesWebsocketConn, error)) (*cpaResponsesWebsocketLease, error) {
	for {
		now := time.Now()
		p.mu.Lock()
		p.reapLocked(now)
		var candidate *cpaResponsesWebsocketConn
		if previousResponseID != "" {
			candidate = p.responseIndex[previousResponseID]
		}
		if candidate != nil && sessionHint != "" && candidate.sessionHint != sessionHint {
			// A client supplied session hint is an isolation boundary. Do not let
			// a conflicting response id, including one from an anonymous turn,
			// select another session's socket.
			candidate = nil
		}
		if candidate == nil && sessionHint != "" {
			candidate = p.sessions[sessionHint]
		}
		if candidate != nil {
			if candidate.broken {
				p.removeLocked(candidate)
				candidate = nil
			} else if !candidate.inUse {
				candidate.inUse = true
				candidate.lastUsedAt = now
				p.mu.Unlock()
				return &cpaResponsesWebsocketLease{entry: candidate, pool: p, reused: true}, nil
			} else {
				waitCh := p.waitCh
				p.mu.Unlock()
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-waitCh:
					continue
				}
			}
		}
		// A request without a stable session or previous response id must not
		// borrow an arbitrary idle socket belonging to another conversation.
		if sessionHint == "" && previousResponseID == "" {
			p.mu.Unlock()
			entry, err := dial()
			if err != nil {
				return nil, err
			}
			entry.pool = p
			entry.inUse = true
			entry.createdAt = now
			entry.lastUsedAt = now
			p.mu.Lock()
			p.connections[entry] = struct{}{}
			p.mu.Unlock()
			return &cpaResponsesWebsocketLease{entry: entry, pool: p}, nil
		}
		p.mu.Unlock()
		entry, err := dial()
		if err != nil {
			return nil, err
		}
		entry.pool = p
		entry.inUse = true
		entry.sessionHint = sessionHint
		entry.createdAt = now
		entry.lastUsedAt = now
		p.mu.Lock()
		if sessionHint != "" {
			if existing := p.sessions[sessionHint]; existing != nil {
				// Another caller established this session while this dial was in
				// flight. Keep one sticky socket and wait for its lease instead of
				// allowing concurrent turns on two sockets for the same session.
				p.mu.Unlock()
				if entry.conn != nil {
					_ = entry.conn.Close()
				}
				continue
			}
		}
		p.connections[entry] = struct{}{}
		if sessionHint != "" {
			p.sessions[sessionHint] = entry
		}
		p.mu.Unlock()
		return &cpaResponsesWebsocketLease{entry: entry, pool: p}, nil
	}
}

func (l *cpaResponsesWebsocketLease) releaseHealthy(responseID string) {
	if l == nil || l.entry == nil {
		return
	}
	l.pool.mu.Lock()
	defer l.pool.mu.Unlock()
	entry := l.entry
	if entry.broken {
		return
	}
	if responseID != "" {
		entry.responseIDs[responseID] = struct{}{}
		l.pool.responseIndex[responseID] = entry
	}
	entry.inUse = false
	entry.lastUsedAt = time.Now()
	// Unknown first-round requests cannot safely be reused by another caller.
	// Close them once their turn is complete instead of allowing unbounded idle
	// sockets that no future request can identify.
	if entry.sessionHint == "" && len(entry.responseIDs) == 0 {
		l.pool.removeLocked(entry)
		return
	}
	l.pool.signalLocked()
}

func (l *cpaResponsesWebsocketLease) markBroken() {
	if l == nil || l.entry == nil {
		return
	}
	l.pool.mu.Lock()
	if !l.entry.broken {
		l.pool.removeLocked(l.entry)
	}
	l.pool.mu.Unlock()
}

func cpaResponsesWebsocketPoolKeyFor(headers http.Header, model string, httpURL string) cpaResponsesWebsocketPoolKey {
	endpoint := httpURL
	if parsed, err := urlParseWithoutQuery(httpURL); err == nil {
		endpoint = parsed
	}
	auth := headers.Get("Authorization")
	sum := sha256.Sum256([]byte(auth))
	return cpaResponsesWebsocketPoolKey{Endpoint: endpoint, AuthHash: hex.EncodeToString(sum[:]), Model: model}
}

func urlParseWithoutQuery(raw string) (string, error) {
	idx := strings.IndexByte(raw, '?')
	if idx >= 0 {
		raw = raw[:idx]
	}
	if strings.TrimSpace(raw) == "" {
		return "", fmt.Errorf("empty websocket endpoint")
	}
	return raw, nil
}

func responsesWebsocketSessionHint(c *gin.Context) string {
	requestHeaders := http.Header{}
	if c != nil && c.Request != nil {
		requestHeaders = c.Request.Header
	}
	for _, name := range []string{
		"x-codex-session-id", "x-session-id", "session-id", "session_id",
		"x-codex-thread-id", "x-thread-id", "thread-id", "thread_id",
		"x-conversation-id", "conversation-id", "openai-conversation-id",
	} {
		if value := normalizeResponsesWebsocketSessionHint(requestHeaders.Get(name)); value != "" {
			return value
		}
	}
	return ""
}

func normalizeResponsesWebsocketSessionHint(value string) string {
	return normalizeResponsesWebsocketOpaqueKey(value)
}

func normalizeResponsesWebsocketOpaqueKey(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > cpaResponsesWebsocketMaxSessionHintBytes {
		return ""
	}
	for _, r := range value {
		if unicode.IsControl(r) {
			return ""
		}
	}
	return value
}

func responsesWebsocketRequestMetadata(payload []byte) (model, previousResponseID string, err error) {
	var body map[string]any
	if err = common.Unmarshal(payload, &body); err != nil {
		return "", "", err
	}
	if value, ok := body["model"].(string); ok {
		model = strings.TrimSpace(value)
	}
	if value, ok := body["previous_response_id"].(string); ok {
		previousResponseID = strings.TrimSpace(value)
	}
	return model, previousResponseID, nil
}

func responsesWebsocketRequestStoresResponse(payload []byte) bool {
	var body map[string]any
	if common.Unmarshal(payload, &body) != nil {
		return true
	}
	value, ok := body["store"].(bool)
	return !ok || value
}

func responsesWebsocketResponseID(msg []byte) string {
	var event struct {
		ID       string `json:"id"`
		Response *struct {
			ID string `json:"id"`
		} `json:"response"`
	}
	if common.Unmarshal(msg, &event) != nil {
		return ""
	}
	if event.Response != nil {
		if id := normalizeResponsesWebsocketOpaqueKey(event.Response.ID); id != "" {
			return id
		}
	}
	return normalizeResponsesWebsocketOpaqueKey(event.ID)
}
