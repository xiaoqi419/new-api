package controller

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

const (
	pelicanListTTL       = 12 * time.Second
	pelicanPreviewTTL    = 64 * time.Second
	pelicanListLimit     = 1 << 20
	pelicanPreviewLimit  = 2 << 20
	pelicanClientTimeout = 20 * time.Second
	pelicanPreviewCSP    = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; media-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
)

var (
	pelicanOrigin   = "https://flow-node.com"
	pelicanOriginMu sync.RWMutex
	pelicanRunID    = regexp.MustCompile(`^[1-9][0-9]{0,17}$`)
	pelicanClient   = &http.Client{
		Timeout:       pelicanClientTimeout,
		CheckRedirect: pelicanRedirect,
	}
	pelicanCache           sync.Map
	pelicanInflight        sync.Map
	pelicanUnavailableHTML = []byte("<!doctype html><html><body>Preview unavailable</body></html>")
)

type pelicanCacheEntry struct {
	body    []byte
	expires time.Time
}

type pelicanFlight struct {
	done chan struct{}
	body []byte
	err  error
}

func pelicanRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= 3 {
		return errors.New("stopped after 3 redirects")
	}
	if req.URL == nil || len(via) == 0 || via[0].URL == nil || !strings.EqualFold(req.URL.Host, via[0].URL.Host) {
		return errors.New("pelican redirect left upstream host")
	}
	return nil
}

func currentPelicanOrigin() string {
	pelicanOriginMu.RLock()
	defer pelicanOriginMu.RUnlock()
	return strings.TrimRight(pelicanOrigin, "/")
}

func pelicanFresh(key string) ([]byte, bool) {
	value, ok := pelicanCache.Load(key)
	if !ok {
		return nil, false
	}
	entry, ok := value.(pelicanCacheEntry)
	if !ok || !time.Now().Before(entry.expires) {
		return nil, false
	}
	return entry.body, true
}

func pelicanCached(key string) ([]byte, bool) {
	value, ok := pelicanCache.Load(key)
	if !ok {
		return nil, false
	}
	entry, ok := value.(pelicanCacheEntry)
	if !ok || len(entry.body) == 0 {
		return nil, false
	}
	return entry.body, true
}

func pelicanClearCache() {
	pelicanCache.Range(func(key, _ any) bool {
		pelicanCache.Delete(key)
		return true
	})
	pelicanInflight.Range(func(key, _ any) bool {
		pelicanInflight.Delete(key)
		return true
	})
}

func pelicanExpireCache() {
	pelicanCache.Range(func(key, value any) bool {
		entry, ok := value.(pelicanCacheEntry)
		if !ok {
			return true
		}
		entry.expires = time.Unix(0, 0)
		pelicanCache.Store(key, entry)
		return true
	})
}

func pelicanRunsValid(body []byte) error {
	var payload struct {
		Runs common.RawMessage `json:"runs"`
	}
	if err := common.Unmarshal(body, &payload); err != nil {
		return errors.New("pelican upstream payload rejected")
	}
	if common.GetJsonType(payload.Runs) != "array" {
		return errors.New("pelican upstream payload rejected")
	}
	return nil
}

func pelicanHTML(body []byte) error {
	sample := body
	if len(sample) > 256 {
		sample = sample[:256]
	}
	lowered := strings.ToLower(string(sample))
	if strings.Contains(lowered, "<!doctype html") || strings.Contains(lowered, "<html") {
		return nil
	}
	return errors.New("pelican upstream payload rejected")
}

func pelicanReadUpstream(ctx context.Context, rawURL string, limit int64, accept func([]byte) error) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "new-api")
	req.Header.Set("Accept", "*/*")
	resp, err := pelicanClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("upstream status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > limit {
		return nil, errors.New("upstream body too large")
	}
	if err := accept(body); err != nil {
		return nil, err
	}
	return body, nil
}

func pelicanLoad(ctx context.Context, key, rawURL string, limit int64, accept func([]byte) error, ttl time.Duration) ([]byte, error) {
	if body, ok := pelicanFresh(key); ok {
		return body, nil
	}
	flight := &pelicanFlight{done: make(chan struct{})}
	actual, loaded := pelicanInflight.LoadOrStore(key, flight)
	if loaded {
		shared := actual.(*pelicanFlight)
		select {
		case <-shared.done:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		if shared.err == nil && len(shared.body) > 0 {
			return shared.body, nil
		}
		if body, ok := pelicanCached(key); ok {
			return body, nil
		}
		if shared.err != nil {
			return nil, shared.err
		}
		return nil, errors.New("pelican upstream payload rejected")
	}
	defer func() {
		close(flight.done)
		pelicanInflight.Delete(key)
	}()

	body, err := pelicanReadUpstream(ctx, rawURL, limit, accept)
	if err != nil {
		if stale, ok := pelicanCached(key); ok {
			flight.body = stale
			return stale, nil
		}
		flight.err = err
		common.SysError("pelican upstream fetch failed: " + err.Error())
		return nil, err
	}
	copied := append([]byte(nil), body...)
	pelicanCache.Store(key, pelicanCacheEntry{body: copied, expires: time.Now().Add(ttl)})
	flight.body = copied
	return copied, nil
}

func writePelicanPreview(c *gin.Context, body []byte) {
	header := c.Writer.Header()
	header.Set("Content-Security-Policy", pelicanPreviewCSP)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Referrer-Policy", "no-referrer")
	header.Set("Cache-Control", "no-store")
	header.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
	c.Data(http.StatusOK, "text/html; charset=utf-8", body)
}

func GetPelicanRuns(c *gin.Context) {
	body, err := pelicanLoad(
		c.Request.Context(),
		"runs",
		currentPelicanOrigin()+"/api/pelican/runs",
		pelicanListLimit,
		pelicanRunsValid,
		pelicanListTTL,
	)
	if err != nil {
		common.ApiErrorMsg(c, "pelican gallery unavailable")
		return
	}
	common.ApiSuccess(c, common.RawMessage(body))
}

func GetPelicanPreview(c *gin.Context) {
	id := c.Param("id")
	if !pelicanRunID.MatchString(id) {
		common.ApiErrorMsg(c, "invalid run id")
		return
	}
	body, err := pelicanLoad(
		c.Request.Context(),
		"preview:"+id,
		currentPelicanOrigin()+"/api/pelican/runs/"+id+"/preview",
		pelicanPreviewLimit,
		pelicanHTML,
		pelicanPreviewTTL,
	)
	if err != nil {
		writePelicanPreview(c, pelicanUnavailableHTML)
		return
	}
	writePelicanPreview(c, body)
}
