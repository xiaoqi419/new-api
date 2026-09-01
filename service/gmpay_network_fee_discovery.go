package service

// This file contains the server-to-server discovery bridge used by the
// turnkey GMPay Native checkout.  The public GMPay /config endpoint only
// reports supported assets; it intentionally does not (and must not) become a
// source of fee values, wallet addresses, or transaction data. A deployment
// that wants automatic network-cost estimates may expose the optional,
// authenticated EPUSDT extension capability endpoint:
//
//   POST /payments/gmpay/v1/network-fee-context
//
// The endpoint is called with the existing merchant identity and HMAC
// signature.  Its response is copied into the existing, heavily validated
// NetworkFeeEstimatorConfig.  No value from the browser or from
// actual_amount is accepted here.

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	gmpayNetworkFeeContextPath      = "/payments/gmpay/v1/network-fee-context"
	gmpayNetworkFeeDiscoveryTimeout = 5 * time.Second
	gmpayNetworkFeeDiscoveryLimit   = int64(1 << 20)
)

// ErrGMPayNetworkFeeCapabilityUnavailable means the optional authenticated
// EPUSDT capability endpoint is not advertised by this gateway. It is kept
// distinct from malformed/failed context so callers can report an actionable
// capability status while still failing closed when no reliable context exists.
var ErrGMPayNetworkFeeCapabilityUnavailable = errors.New("gmpay network fee capability unavailable")

type gmpayNetworkFeeDiscoveryCacheEntry struct {
	config    NetworkFeeEstimatorConfig
	estimator NetworkFeeEstimator
	errKind   string
	expiresAt time.Time
}

var gmpayNetworkFeeDiscoveryCache struct {
	sync.Mutex
	entries map[[sha256.Size]byte]gmpayNetworkFeeDiscoveryCacheEntry
}

var gmpayNetworkFeeDiscoveryMu sync.Mutex

func init() {
	gmpayNetworkFeeDiscoveryCache.entries = make(map[[sha256.Size]byte]gmpayNetworkFeeDiscoveryCacheEntry)
}

// DiscoverGMPayNetworkFeeEstimator obtains the server-owned EPUSDT context
// and returns an immutable estimator.  The gateway address, partner id, and
// key are the only inputs required by callers; endpoint URLs and transaction
// context are never supplied by a request or administrator form.
func DiscoverGMPayNetworkFeeEstimator(ctx context.Context, gatewayAddress, partnerID, secret string) (NetworkFeeEstimator, error) {
	client, err := NewGMPayClient(gatewayAddress, partnerID, secret, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrNetworkFeeUnavailable, err)
	}
	return DiscoverGMPayNetworkFeeEstimatorFromClient(ctx, client)
}

// DiscoverGMPayNetworkFeeEstimatorFromClient is the injectable counterpart
// used by the checkout controller. Reusing the already configured client keeps
// tests and custom transports on the same server-to-server path as order
// creation without exposing credentials.
func DiscoverGMPayNetworkFeeEstimatorFromClient(ctx context.Context, client *GMPayClient) (NetworkFeeEstimator, error) {
	config, err := client.discoverNetworkFeeEstimatorConfig(ctx)
	if err != nil {
		return nil, err
	}
	key := gmpayNetworkFeeDiscoveryCacheKey(client)
	gmpayNetworkFeeDiscoveryMu.Lock()
	defer gmpayNetworkFeeDiscoveryMu.Unlock()
	if estimator, ok := getGMPayNetworkFeeEstimatorCache(key, time.Now()); ok {
		return estimator, nil
	}
	estimator, err := NewNetworkFeeEstimator(config)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid discovered config", ErrNetworkFeeUnavailable)
	}
	putGMPayNetworkFeeEstimatorCache(key, estimator)
	return estimator, nil
}

// DiscoverGMPayNetworkFeeEstimatorConfig is exposed for admin status/tests and
// lets callers inspect only the validated, non-secret estimator settings.
func DiscoverGMPayNetworkFeeEstimatorConfig(ctx context.Context, gatewayAddress, partnerID, secret string) (NetworkFeeEstimatorConfig, error) {
	client, err := NewGMPayClient(gatewayAddress, partnerID, secret, nil)
	if err != nil {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: %v", ErrNetworkFeeUnavailable, err)
	}
	return client.discoverNetworkFeeEstimatorConfig(ctx)
}

// discoverNetworkFeeEstimatorConfig performs one authenticated request.  The
// response parser accepts only the extension-contract object shape and delegates all
// endpoint, transaction, decimal, and bound validation to
// ParseNetworkFeeEstimatorConfig.
func (client *GMPayClient) discoverNetworkFeeEstimatorConfig(ctx context.Context) (NetworkFeeEstimatorConfig, error) {
	if client == nil {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: gmpay client is not configured", ErrNetworkFeeUnavailable)
	}
	key := gmpayNetworkFeeDiscoveryCacheKey(client)
	now := time.Now()
	if cached, err, ok := getGMPayNetworkFeeDiscoveryCache(key, now); ok {
		return cached, err
	}
	// Serialize discovery per process so concurrent wallet checkouts do not
	// stampede the gateway. The second cache read handles requests that arrived
	// while the first one was in flight.
	gmpayNetworkFeeDiscoveryMu.Lock()
	defer gmpayNetworkFeeDiscoveryMu.Unlock()
	if cached, err, ok := getGMPayNetworkFeeDiscoveryCache(key, time.Now()); ok {
		return cached, err
	}
	config, err := client.discoverNetworkFeeEstimatorConfigUncached(ctx)
	entry := gmpayNetworkFeeDiscoveryCacheEntry{config: config, expiresAt: time.Now().Add(5 * time.Second)}
	if err == nil {
		entry.expiresAt = time.Now().Add(30 * time.Second)
	} else if errors.Is(err, ErrGMPayNetworkFeeCapabilityUnavailable) {
		entry.errKind = "capability"
	} else {
		entry.errKind = "unavailable"
	}
	putGMPayNetworkFeeDiscoveryCache(key, entry)
	return config, err
}

func (client *GMPayClient) discoverNetworkFeeEstimatorConfigUncached(ctx context.Context) (NetworkFeeEstimatorConfig, error) {
	if client == nil || client.httpClient == nil || strings.TrimSpace(client.endpoint) == "" || strings.TrimSpace(client.pid) == "" || strings.TrimSpace(client.secret) == "" {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: gmpay client is not configured", ErrNetworkFeeUnavailable)
	}
	if ctx == nil {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: context is nil", ErrNetworkFeeUnavailable)
	}
	capable, err := client.networkFeeCapability(ctx)
	if err != nil {
		return NetworkFeeEstimatorConfig{}, err
	}
	if !capable {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: gateway did not advertise network fee context", ErrGMPayNetworkFeeCapabilityUnavailable)
	}
	endpoint, err := gmpayNetworkFeeContextEndpoint(client.endpoint)
	if err != nil {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: %v", ErrNetworkFeeUnavailable, err)
	}
	stamp := time.Now().Unix()
	params := map[string]any{"pid": client.pid, "timestamp": stamp}
	params["signature"] = GMPaySignature(params, client.secret)
	body, err := common.Marshal(params)
	if err != nil {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: encode discovery request", ErrNetworkFeeUnavailable)
	}
	requestCtx, cancel := context.WithTimeout(ctx, gmpayNetworkFeeDiscoveryTimeout)
	defer cancel()
	response, err := doGMPayDiscoveryRequest(requestCtx, client.httpClient, http.MethodPost, endpoint, body)
	if err != nil {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: discovery request failed", ErrNetworkFeeUnavailable)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: discovery returned http status %d", ErrNetworkFeeUnavailable, response.StatusCode)
	}
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, gmpayNetworkFeeDiscoveryLimit+1))
	if err != nil || int64(len(responseBody)) > gmpayNetworkFeeDiscoveryLimit {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: discovery response exceeds size limit", ErrNetworkFeeUnavailable)
	}
	var rawEnvelope struct {
		StatusCode int             `json:"status_code"`
		Message    string          `json:"message"`
		Data       json.RawMessage `json:"data"`
	}
	if err := common.Unmarshal(responseBody, &rawEnvelope); err != nil || rawEnvelope.StatusCode != http.StatusOK || !strings.EqualFold(strings.TrimSpace(rawEnvelope.Message), "success") || len(rawEnvelope.Data) == 0 {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: invalid discovery response", ErrNetworkFeeUnavailable)
	}
	var discovered struct {
		Version                  int                              `json:"version"`
		DynamicEnabled           bool                             `json:"dynamic_enabled"`
		Chains                   map[string]NetworkFeeChainConfig `json:"chains"`
		TimeoutMilliseconds      int                              `json:"timeout_ms,omitempty"`
		MaxResponseBytes         int64                            `json:"max_response_bytes,omitempty"`
		MaxRetries               int                              `json:"max_retries,omitempty"`
		CacheTTLSeconds          int                              `json:"cache_ttl_seconds,omitempty"`
		QuoteTTLSeconds          int                              `json:"quote_ttl_seconds,omitempty"`
		PriceMaxAgeSeconds       int                              `json:"price_max_age_seconds,omitempty"`
		MaxPriceDeviationPercent string                           `json:"max_price_deviation_percent,omitempty"`
		MaxFee                   string                           `json:"max_fee,omitempty"`
		MaxTotal                 string                           `json:"max_total,omitempty"`
	}
	if err := common.Unmarshal(rawEnvelope.Data, &discovered); err != nil {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: invalid discovery data", ErrNetworkFeeUnavailable)
	}
	if discovered.Version == 0 {
		discovered.Version = NetworkFeeEstimatorConfigVersion
	}
	// A capability response is only useful when it explicitly contains a
	// dynamic estimate and at least one complete chain.  We do not synthesize
	// zero-fee chains or infer values from the gateway order response.
	if !discovered.DynamicEnabled || len(discovered.Chains) == 0 {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: discovery has no dynamic chain context", ErrNetworkFeeUnavailable)
	}
	config := NetworkFeeEstimatorConfig{
		Version: discovered.Version, DynamicEnabled: true, Chains: discovered.Chains,
		TimeoutMilliseconds: discovered.TimeoutMilliseconds, MaxResponseBytes: discovered.MaxResponseBytes,
		MaxRetries: discovered.MaxRetries, CacheTTLSeconds: discovered.CacheTTLSeconds,
		QuoteTTLSeconds: discovered.QuoteTTLSeconds, PriceMaxAgeSeconds: discovered.PriceMaxAgeSeconds,
		MaxPriceDeviationPercent: discovered.MaxPriceDeviationPercent, MaxFee: discovered.MaxFee, MaxTotal: discovered.MaxTotal,
	}
	if config.Version != NetworkFeeEstimatorConfigVersion {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: unsupported discovery version", ErrNetworkFeeUnavailable)
	}
	if _, err := NewNetworkFeeEstimator(config); err != nil {
		return NetworkFeeEstimatorConfig{}, fmt.Errorf("%w: discovered context is incomplete", ErrNetworkFeeUnavailable)
	}
	return config, nil
}

func getGMPayNetworkFeeDiscoveryCache(key [sha256.Size]byte, now time.Time) (NetworkFeeEstimatorConfig, error, bool) {
	gmpayNetworkFeeDiscoveryCache.Lock()
	defer gmpayNetworkFeeDiscoveryCache.Unlock()
	entry, ok := gmpayNetworkFeeDiscoveryCache.entries[key]
	if !ok || !now.Before(entry.expiresAt) {
		if ok {
			delete(gmpayNetworkFeeDiscoveryCache.entries, key)
		}
		return NetworkFeeEstimatorConfig{}, nil, false
	}
	if entry.errKind == "capability" {
		return entry.config, fmt.Errorf("%w: cached capability status", ErrGMPayNetworkFeeCapabilityUnavailable), true
	}
	if entry.errKind != "" {
		return entry.config, fmt.Errorf("%w: cached discovery status", ErrNetworkFeeUnavailable), true
	}
	return entry.config, nil, true
}

func putGMPayNetworkFeeDiscoveryCache(key [sha256.Size]byte, entry gmpayNetworkFeeDiscoveryCacheEntry) {
	gmpayNetworkFeeDiscoveryCache.Lock()
	defer gmpayNetworkFeeDiscoveryCache.Unlock()
	if len(gmpayNetworkFeeDiscoveryCache.entries) >= 128 {
		for cachedKey := range gmpayNetworkFeeDiscoveryCache.entries {
			delete(gmpayNetworkFeeDiscoveryCache.entries, cachedKey)
			break
		}
	}
	gmpayNetworkFeeDiscoveryCache.entries[key] = entry
}

func gmpayNetworkFeeDiscoveryCacheKey(client *GMPayClient) [sha256.Size]byte {
	if client == nil {
		return sha256.Sum256(nil)
	}
	// Include a digest of the merchant secret so credential rotation cannot
	// reuse a stale estimator, while the cache key itself never stores secret
	// material in plaintext.
	return sha256.Sum256([]byte(strings.TrimSpace(client.endpoint) + "\x00" + strings.TrimSpace(client.pid) + "\x00" + client.secret))
}

func getGMPayNetworkFeeEstimatorCache(key [sha256.Size]byte, now time.Time) (NetworkFeeEstimator, bool) {
	gmpayNetworkFeeDiscoveryCache.Lock()
	defer gmpayNetworkFeeDiscoveryCache.Unlock()
	entry, ok := gmpayNetworkFeeDiscoveryCache.entries[key]
	if !ok || entry.estimator == nil || !now.Before(entry.expiresAt) || entry.errKind != "" {
		return nil, false
	}
	return entry.estimator, true
}

func putGMPayNetworkFeeEstimatorCache(key [sha256.Size]byte, estimator NetworkFeeEstimator) {
	gmpayNetworkFeeDiscoveryCache.Lock()
	defer gmpayNetworkFeeDiscoveryCache.Unlock()
	entry, ok := gmpayNetworkFeeDiscoveryCache.entries[key]
	if !ok || entry.errKind != "" {
		return
	}
	entry.estimator = estimator
	gmpayNetworkFeeDiscoveryCache.entries[key] = entry
}

// networkFeeCapability reads only a boolean capability marker from the public
// GMPay configuration. Older EPUSDT deployments omit the marker; no fee or
// transaction data is inferred from their supported_assets response.
func (client *GMPayClient) networkFeeCapability(ctx context.Context) (bool, error) {
	configURL, err := gmpayConfigEndpoint(client.endpoint)
	if err != nil {
		return false, fmt.Errorf("%w: invalid capability endpoint", ErrNetworkFeeUnavailable)
	}
	requestCtx, cancel := context.WithTimeout(ctx, gmpayNetworkFeeDiscoveryTimeout)
	defer cancel()
	response, err := doGMPayDiscoveryRequest(requestCtx, client.httpClient, http.MethodGet, configURL, nil)
	if err != nil {
		return false, fmt.Errorf("%w: capability request failed", ErrNetworkFeeUnavailable)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return false, fmt.Errorf("%w: capability returned http status %d", ErrNetworkFeeUnavailable, response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, gmpayNetworkFeeDiscoveryLimit+1))
	if err != nil || int64(len(body)) > gmpayNetworkFeeDiscoveryLimit {
		return false, fmt.Errorf("%w: capability response exceeds size limit", ErrNetworkFeeUnavailable)
	}
	var envelope struct {
		StatusCode int             `json:"status_code"`
		Message    string          `json:"message"`
		Data       json.RawMessage `json:"data"`
	}
	if err := common.Unmarshal(body, &envelope); err != nil || envelope.StatusCode != http.StatusOK || !strings.EqualFold(strings.TrimSpace(envelope.Message), "success") {
		return false, fmt.Errorf("%w: invalid capability response", ErrNetworkFeeUnavailable)
	}
	var data struct {
		NetworkFeeContext bool     `json:"network_fee_context"`
		Capabilities      []string `json:"capabilities"`
	}
	if len(envelope.Data) == 0 || common.Unmarshal(envelope.Data, &data) != nil {
		return false, nil
	}
	if data.NetworkFeeContext {
		return true, nil
	}
	for _, capability := range data.Capabilities {
		if strings.EqualFold(strings.TrimSpace(capability), "network_fee_context") || strings.EqualFold(strings.TrimSpace(capability), "network-fee-context") {
			return true, nil
		}
	}
	return false, nil
}

// doGMPayDiscoveryRequest retries one transient transport/429/5xx failure with a
// short fixed backoff. Every attempt recreates the request body and closes a
// discarded response, keeping the retry bounded and safe for JSON payloads.
func doGMPayDiscoveryRequest(ctx context.Context, client *http.Client, method, endpoint string, body []byte) (*http.Response, error) {
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		var reader io.Reader
		if body != nil {
			reader = bytes.NewReader(body)
		}
		request, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
		if err != nil {
			return nil, err
		}
		request.Header.Set("Accept", "application/json")
		if body != nil {
			request.Header.Set("Content-Type", "application/json")
		}
		response, err := client.Do(request)
		if err == nil && response.StatusCode != http.StatusTooManyRequests && response.StatusCode < http.StatusInternalServerError {
			return response, nil
		}
		if response != nil {
			_ = response.Body.Close()
		}
		lastErr = err
		if lastErr == nil {
			lastErr = fmt.Errorf("http status %d", response.StatusCode)
		}
		if attempt == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			time.Sleep(50 * time.Millisecond)
		}
	}
	return nil, lastErr
}

func gmpayNetworkFeeContextEndpoint(createEndpoint string) (string, error) {
	parsed, err := url.Parse(createEndpoint)
	if err != nil || !isAbsoluteHTTPURL(parsed) {
		return "", errors.New("gmpay endpoint is invalid")
	}
	parsed.Path = gmpayNetworkFeeContextPath
	parsed.RawPath, parsed.RawQuery, parsed.Fragment = "", "", ""
	return parsed.String(), nil
}
