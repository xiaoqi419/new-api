package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
)

const (
	gmpayCreateOrderPath     = "/payments/gmpay/v1/order/create-transaction"
	gmpayConfigPath          = "/payments/gmpay/v1/config"
	gmpayNativeResponseLimit = 1 << 20
	gmpayNativeTimeout       = 10 * time.Second
	gmpayConfigCacheTTL      = 30 * time.Second
	gmpayMaxAssets           = 32
	gmpayMaxTokensPerAsset   = 32
)

var defaultGMPayNativeHTTPClient = &http.Client{Timeout: gmpayNativeTimeout}

// GMPayCreateOrderRequest contains server-generated payment fields. The
// configured merchant identity stays encapsulated by GMPayClient.
type GMPayCreateOrderRequest struct {
	OrderID     string
	Amount      string
	NotifyURL   *url.URL
	RedirectURL *url.URL
	Name        string
	Token       string
	Network     string
}

// GMPayAsset describes one enabled network and its available tokens as
// returned by EPUSDT's public configuration endpoint.
type GMPayAsset struct {
	Network     string   `json:"network"`
	DisplayName string   `json:"display_name"`
	Tokens      []string `json:"tokens"`
}

// GMPayPaymentAsset is the flattened selector shape exposed by New API.
type GMPayPaymentAsset struct {
	Network     string `json:"network"`
	Token       string `json:"token"`
	DisplayName string `json:"display_name"`
}

// GMPayCheckout contains only checkout data that is safe to return to a
// browser. It deliberately omits the hosted cashier URL and all credentials.
type GMPayCheckout struct {
	OrderID        string
	GatewayTradeNo string
	ActualAmount   string
	ReceiveAddress string
	Token          string
	Network        string
	ExpirationTime int64
	ServerTime     int64
}

// GMPayClient creates native GMPay orders using the configured merchant PID
// and secret. httpClient is injectable so tests can use a controlled server.
type GMPayClient struct {
	endpoint   string
	pid        string
	secret     string
	httpClient *http.Client
}

type gmpayConfigCacheEntry struct {
	assets    []GMPayAsset
	expiresAt time.Time
}

var gmpayConfigCache = struct {
	sync.Mutex
	entries map[string]gmpayConfigCacheEntry
}{entries: make(map[string]gmpayConfigCacheEntry)}

func NewGMPayClient(gatewayAddress string, pid string, secret string, httpClient *http.Client) (*GMPayClient, error) {
	endpoint, err := gmpayNativeEndpoint(gatewayAddress, httpClient != nil)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(pid) == "" || strings.TrimSpace(secret) == "" {
		return nil, errors.New("gmpay merchant credentials are not configured")
	}
	if httpClient == nil {
		httpClient = defaultGMPayNativeHTTPClient
	}
	return &GMPayClient{
		endpoint:   endpoint,
		pid:        pid,
		secret:     secret,
		httpClient: httpClient,
	}, nil
}

// GMPaySignature returns the documented lower-case HMAC-SHA256 signature over
// lexicographically sorted, non-empty parameters excluding signature itself.
func GMPaySignature(params map[string]any, secret string) string {
	keys := make([]string, 0, len(params))
	values := make(map[string]string, len(params))
	for key, value := range params {
		canonicalValue, ok := GMPayCanonicalParameter(value)
		if key == "" || key == "signature" || !ok {
			continue
		}
		values[key] = canonicalValue
		keys = append(keys, key)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+values[key])
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(strings.Join(parts, "&")))
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyGMPaySignature performs a strict lower-case format check before a
// constant-time HMAC comparison.
func VerifyGMPaySignature(params map[string]any, signature string, secret string) bool {
	if len(signature) != sha256.Size*2 || signature != strings.ToLower(signature) {
		return false
	}
	if _, err := hex.DecodeString(signature); err != nil {
		return false
	}
	return hmac.Equal([]byte(GMPaySignature(params, secret)), []byte(signature))
}

// GMPayCanonicalParameter converts a JSON scalar to the documented canonical
// HMAC representation. It is shared by request signing and callback checks so
// numeric JSON values keep their protocol-defined representation.
func GMPayCanonicalParameter(value any) (string, bool) {
	switch value := value.(type) {
	case string:
		if value == "" {
			return "", false
		}
		return value, true
	case float64:
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return "", false
		}
		return strconv.FormatFloat(value, 'f', -1, 64), true
	case float32:
		if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) {
			return "", false
		}
		return strconv.FormatFloat(float64(value), 'f', -1, 32), true
	case int:
		return strconv.Itoa(value), true
	case int64:
		return strconv.FormatInt(value, 10), true
	case int32:
		return strconv.FormatInt(int64(value), 10), true
	case uint:
		return strconv.FormatUint(uint64(value), 10), true
	case uint64:
		return strconv.FormatUint(value, 10), true
	case uint32:
		return strconv.FormatUint(uint64(value), 10), true
	case json.Number:
		parsed, err := value.Float64()
		if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
			return "", false
		}
		return strconv.FormatFloat(parsed, 'f', -1, 64), true
	default:
		return "", false
	}
}

func (client *GMPayClient) CreateOrder(ctx context.Context, args GMPayCreateOrderRequest) (*GMPayCheckout, error) {
	if client == nil || client.httpClient == nil || strings.TrimSpace(client.endpoint) == "" ||
		strings.TrimSpace(client.pid) == "" || strings.TrimSpace(client.secret) == "" {
		return nil, errors.New("gmpay client is not configured")
	}
	if strings.TrimSpace(args.OrderID) == "" || len(args.OrderID) > 32 || args.NotifyURL == nil || args.RedirectURL == nil {
		return nil, errors.New("gmpay create-order request is incomplete")
	}
	if !isAbsoluteHTTPURL(args.NotifyURL) || !isAbsoluteHTTPURL(args.RedirectURL) {
		return nil, errors.New("gmpay callback URLs are invalid")
	}
	amount, err := positiveDecimal(args.Amount)
	if err != nil || amount.LessThanOrEqual(decimal.NewFromFloat(0.01)) {
		return nil, errors.New("gmpay create-order amount is invalid")
	}
	amountNumber, _ := amount.Float64()
	token, network, err := normalizeGMPayAsset(args.Token, args.Network)
	if err != nil {
		return nil, err
	}

	params := map[string]any{
		"pid":          client.pid,
		"order_id":     args.OrderID,
		"currency":     "usd",
		"token":        token,
		"network":      network,
		"amount":       amountNumber,
		"notify_url":   args.NotifyURL.String(),
		"redirect_url": args.RedirectURL.String(),
		"name":         args.Name,
	}
	params["signature"] = GMPaySignature(params, client.secret)
	payload, err := common.Marshal(params)
	if err != nil {
		return nil, errors.New("encode gmpay create-order request")
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, client.endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, errors.New("create gmpay request")
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")

	response, err := client.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request gmpay checkout: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("gmpay checkout returned http status %d", response.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, gmpayNativeResponseLimit+1))
	if err != nil {
		return nil, errors.New("read gmpay checkout response")
	}
	if len(body) > gmpayNativeResponseLimit {
		return nil, errors.New("gmpay checkout response exceeds size limit")
	}

	var envelope gmpayCreateOrderEnvelope
	if err := common.Unmarshal(body, &envelope); err != nil {
		return nil, errors.New("invalid gmpay checkout response")
	}
	if envelope.StatusCode != http.StatusOK || strings.TrimSpace(envelope.Message) != "success" || len(envelope.Data) == 0 {
		return nil, errors.New("gmpay checkout was rejected")
	}

	var result gmpayCreateOrderResponse
	if err := common.Unmarshal(envelope.Data, &result); err != nil {
		return nil, errors.New("invalid gmpay checkout data")
	}
	return result.checkout(args.OrderID, amount, token, network)
}

type gmpayCreateOrderEnvelope struct {
	StatusCode int             `json:"status_code"`
	Message    string          `json:"message"`
	Data       json.RawMessage `json:"data"`
}

type gmpayCreateOrderResponse struct {
	OrderID        string          `json:"order_id"`
	TradeID        string          `json:"trade_id"`
	Amount         json.RawMessage `json:"amount"`
	Currency       string          `json:"currency"`
	Status         int             `json:"status"`
	ActualAmount   json.RawMessage `json:"actual_amount"`
	ReceiveAddress string          `json:"receive_address"`
	Token          string          `json:"token"`
	Network        string          `json:"network"`
	ExpirationTime int64           `json:"expiration_time"`
	ServerTime     int64           `json:"server_time"`
}

func (response gmpayCreateOrderResponse) checkout(expectedOrderID string, expectedAmount decimal.Decimal, expectedToken string, expectedNetwork string) (*GMPayCheckout, error) {
	if strings.TrimSpace(response.OrderID) != expectedOrderID || strings.TrimSpace(response.TradeID) == "" || response.Status != 1 {
		return nil, errors.New("gmpay checkout response does not describe a waiting order")
	}
	fiatAmount, err := rawDecimalString(response.Amount)
	if err != nil {
		return nil, errors.New("gmpay checkout response has an invalid fiat amount")
	}
	parsedFiatAmount, err := positiveDecimal(fiatAmount)
	if err != nil || !parsedFiatAmount.Equal(expectedAmount) || strings.ToUpper(strings.TrimSpace(response.Currency)) != "USD" {
		return nil, errors.New("gmpay checkout response does not match the requested fiat amount")
	}
	actualAmount, err := rawDecimalString(response.ActualAmount)
	if err != nil {
		return nil, errors.New("gmpay checkout response has an invalid actual amount")
	}
	responseToken := strings.ToUpper(strings.TrimSpace(response.Token))
	responseNetwork := strings.ToLower(strings.TrimSpace(response.Network))
	if responseToken != strings.ToUpper(expectedToken) || (responseNetwork != "" && responseNetwork != expectedNetwork) ||
		!IsGMPayAddress(expectedNetwork, response.ReceiveAddress) ||
		response.ExpirationTime <= time.Now().Unix() {
		return nil, errors.New("gmpay checkout response is incomplete")
	}
	return &GMPayCheckout{
		OrderID:        expectedOrderID,
		GatewayTradeNo: strings.TrimSpace(response.TradeID),
		ActualAmount:   actualAmount,
		ReceiveAddress: strings.TrimSpace(response.ReceiveAddress),
		Token:          responseToken,
		Network:        strings.ToUpper(expectedNetwork),
		ExpirationTime: response.ExpirationTime,
		ServerTime:     response.ServerTime,
	}, nil
}

// SupportedAssets fetches EPUSDT's public, already-filtered wallet assets.
// Results are cached briefly because this endpoint is read on every top-up
// page load, while gateway configuration changes infrequently.
func (client *GMPayClient) SupportedAssets(ctx context.Context) ([]GMPayAsset, error) {
	if client == nil || client.httpClient == nil || strings.TrimSpace(client.endpoint) == "" {
		return nil, errors.New("gmpay client is not configured")
	}
	cacheKey := client.endpoint
	gmpayConfigCache.Lock()
	if cached, ok := gmpayConfigCache.entries[cacheKey]; ok && time.Now().Before(cached.expiresAt) {
		assets := cloneGMPayAssets(cached.assets)
		gmpayConfigCache.Unlock()
		return assets, nil
	}
	gmpayConfigCache.Unlock()

	configURL, err := gmpayConfigEndpoint(client.endpoint)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, configURL, nil)
	if err != nil {
		return nil, errors.New("create gmpay config request")
	}
	request.Header.Set("Accept", "application/json")
	response, err := client.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request gmpay config: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("gmpay config returned http status %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, gmpayNativeResponseLimit+1))
	if err != nil || len(body) > gmpayNativeResponseLimit {
		return nil, errors.New("gmpay config response exceeds size limit")
	}
	var envelope struct {
		StatusCode int             `json:"status_code"`
		Message    string          `json:"message"`
		Data       json.RawMessage `json:"data"`
	}
	if err := common.Unmarshal(body, &envelope); err != nil || envelope.StatusCode != http.StatusOK || strings.ToLower(strings.TrimSpace(envelope.Message)) != "success" {
		return nil, errors.New("invalid gmpay config response")
	}
	var data struct {
		SupportedAssets []GMPayAsset `json:"supported_assets"`
	}
	if err := common.Unmarshal(envelope.Data, &data); err != nil {
		return nil, errors.New("invalid gmpay config data")
	}
	assets, err := normalizeGMPayAssets(data.SupportedAssets)
	if err != nil {
		return nil, err
	}
	gmpayConfigCache.Lock()
	gmpayConfigCache.entries[cacheKey] = gmpayConfigCacheEntry{assets: cloneGMPayAssets(assets), expiresAt: time.Now().Add(gmpayConfigCacheTTL)}
	gmpayConfigCache.Unlock()
	return assets, nil
}

func gmpayConfigEndpoint(createEndpoint string) (string, error) {
	parsed, err := url.Parse(createEndpoint)
	if err != nil || !isAbsoluteHTTPURL(parsed) {
		return "", errors.New("gmpay endpoint is invalid")
	}
	parsed.Path = gmpayConfigPath
	parsed.RawPath, parsed.RawQuery, parsed.Fragment = "", "", ""
	return parsed.String(), nil
}

func cloneGMPayAssets(assets []GMPayAsset) []GMPayAsset {
	cloned := make([]GMPayAsset, len(assets))
	for i, asset := range assets {
		cloned[i] = asset
		cloned[i].Tokens = append([]string(nil), asset.Tokens...)
	}
	return cloned
}

func normalizeGMPayAssets(assets []GMPayAsset) ([]GMPayAsset, error) {
	if len(assets) > gmpayMaxAssets {
		return nil, errors.New("gmpay config contains too many assets")
	}
	seen := make(map[string]struct{})
	result := make([]GMPayAsset, 0, len(assets))
	for _, asset := range assets {
		network := strings.ToLower(strings.TrimSpace(asset.Network))
		if network == "" || len(network) > 32 || len(asset.Tokens) == 0 || len(asset.Tokens) > gmpayMaxTokensPerAsset {
			continue
		}
		tokens := make([]string, 0, len(asset.Tokens))
		for _, rawToken := range asset.Tokens {
			token := strings.ToUpper(strings.TrimSpace(rawToken))
			if token == "" || len(token) > 32 {
				continue
			}
			key := network + "\x00" + token
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			tokens = append(tokens, token)
		}
		if len(tokens) == 0 {
			continue
		}
		displayName := strings.TrimSpace(asset.DisplayName)
		if displayName == "" {
			displayName = network
		}
		if len(displayName) > 64 {
			displayName = displayName[:64]
		}
		result = append(result, GMPayAsset{Network: network, DisplayName: displayName, Tokens: tokens})
	}
	return result, nil
}

func normalizeGMPayAsset(token, network string) (string, string, error) {
	token = strings.ToUpper(strings.TrimSpace(token))
	network = strings.ToLower(strings.TrimSpace(network))
	if token == "" && network == "" {
		return "usdt", "tron", nil
	}
	// Dots are reserved by the persisted payment_method encoding
	// (usdt.<network>.<token>), so reject them here instead of creating an
	// asset that cannot be unambiguously matched during callbacks.
	if token == "" || network == "" || len(token) > 32 || len(network) > 32 || !regexp.MustCompile(`^[A-Z0-9_-]+$`).MatchString(token) || !regexp.MustCompile(`^[a-z0-9_-]+$`).MatchString(network) {
		return "", "", errors.New("gmpay payment asset is invalid")
	}
	return strings.ToLower(token), network, nil
}

// IsGMPayAddress validates addresses for the supported network families.
func IsGMPayAddress(network, address string) bool {
	network = strings.ToLower(strings.TrimSpace(network))
	address = strings.TrimSpace(address)
	switch network {
	case "tron":
		return IsGMPayTronAddress(address)
	case "ethereum", "bsc", "polygon", "arbitrum", "optimism", "base", "avalanche", "plasma":
		return regexp.MustCompile(`^0x[0-9a-fA-F]{40}$`).MatchString(address)
	case "solana":
		decoded, ok := decodeGMPayBase58(address)
		return ok && len(decoded) == 32
	case "aptos":
		return regexp.MustCompile(`^0x[0-9a-fA-F]{1,64}$`).MatchString(address)
	default:
		return regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$`).MatchString(address)
	}
}

func decodeGMPayBase58(value string) ([]byte, bool) {
	if value == "" || len(value) > 64 {
		return nil, false
	}
	decoded := make([]byte, 0, len(value))
	for i := 0; i < len(value); i++ {
		digit := strings.IndexByte(gmpayBase58Alphabet, value[i])
		if digit < 0 {
			return nil, false
		}
		carry := digit
		for j := len(decoded) - 1; j >= 0; j-- {
			carry += int(decoded[j]) * 58
			decoded[j] = byte(carry)
			carry >>= 8
		}
		for carry > 0 {
			decoded = append([]byte{byte(carry)}, decoded...)
			carry >>= 8
		}
	}
	leading := 0
	for leading < len(value) && value[leading] == '1' {
		leading++
	}
	if leading > 0 {
		decoded = append(make([]byte, leading), decoded...)
	}
	return decoded, true
}

func gmpayNativeEndpoint(gatewayAddress string, allowHTTPForInjectedClient bool) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(gatewayAddress))
	if err != nil || !isAbsoluteHTTPURL(parsed) || parsed.User != nil || (parsed.Scheme != "https" && !allowHTTPForInjectedClient) {
		return "", errors.New("gmpay endpoint is invalid")
	}
	parsed.Path = gmpayCreateOrderPath
	parsed.RawPath = ""
	parsed.RawQuery = ""
	parsed.ForceQuery = false
	parsed.Fragment = ""
	parsed.RawFragment = ""
	return parsed.String(), nil
}

func isAbsoluteHTTPURL(value *url.URL) bool {
	return value != nil && value.IsAbs() && value.Hostname() != "" && (value.Scheme == "http" || value.Scheme == "https")
}

func rawDecimalString(raw json.RawMessage) (string, error) {
	value := strings.TrimSpace(string(raw))
	if value == "" {
		return "", errors.New("missing decimal")
	}
	if strings.HasPrefix(value, "\"") {
		var decoded string
		if err := common.Unmarshal(raw, &decoded); err != nil {
			return "", err
		}
		value = strings.TrimSpace(decoded)
	}
	if _, err := positiveDecimal(value); err != nil {
		return "", err
	}
	return value, nil
}

func positiveDecimal(value string) (decimal.Decimal, error) {
	amount, err := decimal.NewFromString(strings.TrimSpace(value))
	if err != nil || amount.LessThanOrEqual(decimal.Zero) {
		return decimal.Zero, errors.New("decimal must be positive")
	}
	floatAmount, _ := amount.Float64()
	if math.IsNaN(floatAmount) || math.IsInf(floatAmount, 0) {
		return decimal.Zero, errors.New("decimal must be finite")
	}
	return amount, nil
}

const gmpayBase58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// IsGMPayTronAddress verifies the Base58Check form GMPay uses for a TRON
// receive address: a 0x41 version byte and a four-byte double-SHA256 checksum.
func IsGMPayTronAddress(value string) bool {
	address := strings.TrimSpace(value)
	if len(address) != 34 {
		return false
	}

	decoded := make([]byte, 0, 25)
	leadingZeroes := 0
	for leadingZeroes < len(address) && address[leadingZeroes] == '1' {
		leadingZeroes++
	}
	for index := 0; index < len(address); index++ {
		digit := strings.IndexByte(gmpayBase58Alphabet, address[index])
		if digit < 0 {
			return false
		}
		carry := digit
		for byteIndex := len(decoded) - 1; byteIndex >= 0; byteIndex-- {
			carry += int(decoded[byteIndex]) * 58
			decoded[byteIndex] = byte(carry)
			carry >>= 8
		}
		for carry > 0 {
			decoded = append([]byte{byte(carry)}, decoded...)
			carry >>= 8
		}
	}
	if leadingZeroes > 0 {
		decoded = append(make([]byte, leadingZeroes), decoded...)
	}
	if len(decoded) != 25 || decoded[0] != 0x41 {
		return false
	}
	firstHash := sha256.Sum256(decoded[:21])
	secondHash := sha256.Sum256(firstHash[:])
	return bytes.Equal(decoded[21:], secondHash[:4])
}
