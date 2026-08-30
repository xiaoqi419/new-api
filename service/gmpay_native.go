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
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
)

const (
	gmpayCreateOrderPath     = "/payments/gmpay/v1/order/create-transaction"
	gmpayNativeResponseLimit = 1 << 20
	gmpayNativeTimeout       = 10 * time.Second
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

	params := map[string]any{
		"pid":          client.pid,
		"order_id":     args.OrderID,
		"currency":     "usd",
		"token":        "usdt",
		"network":      "tron",
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
	return result.checkout(args.OrderID, amount)
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
	ExpirationTime int64           `json:"expiration_time"`
	ServerTime     int64           `json:"server_time"`
}

func (response gmpayCreateOrderResponse) checkout(expectedOrderID string, expectedAmount decimal.Decimal) (*GMPayCheckout, error) {
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
	if !IsGMPayTronAddress(response.ReceiveAddress) || strings.ToUpper(strings.TrimSpace(response.Token)) != "USDT" ||
		response.ExpirationTime <= time.Now().Unix() {
		return nil, errors.New("gmpay checkout response is incomplete")
	}
	return &GMPayCheckout{
		OrderID:        expectedOrderID,
		GatewayTradeNo: strings.TrimSpace(response.TradeID),
		ActualAmount:   actualAmount,
		ReceiveAddress: strings.TrimSpace(response.ReceiveAddress),
		Token:          "USDT",
		Network:        "TRON",
		ExpirationTime: response.ExpirationTime,
		ServerTime:     response.ServerTime,
	}, nil
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
