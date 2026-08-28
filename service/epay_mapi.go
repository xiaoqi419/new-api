package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/Calcium-Ion/go-epay/epay"
)

const (
	epayMAPIResponseLimit = 1 << 20
	epayMAPITimeout       = 10 * time.Second
)

var defaultEpayMAPIHTTPClient = &http.Client{Timeout: epayMAPITimeout}

// EpayMAPIRequest contains the server-generated order data sent to MAPI.
// Credentials are obtained exclusively from the configured Epay client.
type EpayMAPIRequest struct {
	PaymentMethod string
	TradeNo       string
	Name          string
	Money         string
	ClientIP      string
	Device        epay.DeviceType
	NotifyURL     *url.URL
	ReturnURL     *url.URL
	Param         string
}

// EpayCheckout is the normalized checkout instruction that can be returned to
// a browser without exposing the merchant key or request signature.
type EpayCheckout struct {
	GatewayTradeNo string `json:"gateway_trade_no"`
	CheckoutType   string `json:"checkout_type"`
	CheckoutValue  string `json:"checkout_value"`
}

// EpayMAPIClient creates Epay MAPI checkouts. httpClient is injectable so
// callers can use controlled transports in tests.
type EpayMAPIClient struct {
	epayClient *epay.Client
	httpClient *http.Client
}

func NewEpayMAPIClient(epayClient *epay.Client, httpClient *http.Client) (*EpayMAPIClient, error) {
	if epayClient == nil || epayClient.Config == nil || epayClient.BaseUrl == nil ||
		strings.TrimSpace(epayClient.Config.PartnerID) == "" || strings.TrimSpace(epayClient.Config.Key) == "" {
		return nil, errors.New("epay client is not configured")
	}
	if httpClient == nil {
		httpClient = defaultEpayMAPIHTTPClient
	}
	return &EpayMAPIClient{epayClient: epayClient, httpClient: httpClient}, nil
}

// CreateCheckout posts a signed form to MAPI and chooses one checkout target.
// QR code content takes precedence over payurl, then urlscheme, so all callers
// receive a deterministic response when a gateway returns several fields.
func (client *EpayMAPIClient) CreateCheckout(ctx context.Context, args EpayMAPIRequest) (*EpayCheckout, error) {
	if client == nil || client.epayClient == nil || client.epayClient.Config == nil || client.httpClient == nil {
		return nil, errors.New("epay mapi client is not configured")
	}
	if strings.TrimSpace(args.PaymentMethod) == "" || strings.TrimSpace(args.TradeNo) == "" ||
		strings.TrimSpace(args.Name) == "" || strings.TrimSpace(args.Money) == "" ||
		strings.TrimSpace(args.ClientIP) == "" || args.NotifyURL == nil || args.ReturnURL == nil {
		return nil, errors.New("epay mapi request is incomplete")
	}

	endpoint, err := epayMAPIEndpoint(client.epayClient.BaseUrl)
	if err != nil {
		return nil, err
	}
	device := args.Device
	if device == "" {
		device = epay.PC
	}
	params := epay.GenerateParams(map[string]string{
		"pid":          client.epayClient.Config.PartnerID,
		"type":         args.PaymentMethod,
		"out_trade_no": args.TradeNo,
		"notify_url":   args.NotifyURL.String(),
		"return_url":   args.ReturnURL.String(),
		"name":         args.Name,
		"money":        args.Money,
		"clientip":     args.ClientIP,
		"device":       string(device),
		"param":        args.Param,
	}, client.epayClient.Config.Key)
	form := url.Values{}
	for key, value := range params {
		form.Set(key, value)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create mapi request: %w", err)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	response, err := client.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request mapi checkout: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return client.createLegacyCheckout(args)
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("mapi checkout returned http status %d", response.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, epayMAPIResponseLimit+1))
	if err != nil {
		return nil, fmt.Errorf("read mapi response: %w", err)
	}
	if len(body) > epayMAPIResponseLimit {
		return nil, errors.New("mapi response exceeds size limit")
	}

	var result epayMAPIResponse
	if err := common.Unmarshal(body, &result); err != nil {
		return nil, errors.New("invalid mapi response")
	}
	if result.Code != 1 {
		return nil, errors.New("mapi checkout was rejected")
	}
	checkoutType, checkoutValue, err := result.checkout(args.PaymentMethod)
	if err != nil {
		return nil, err
	}
	if checkoutType == "" {
		return nil, errors.New("mapi response has no checkout target")
	}
	return &EpayCheckout{
		GatewayTradeNo: strings.TrimSpace(result.TradeNo),
		CheckoutType:   checkoutType,
		CheckoutValue:  checkoutValue,
	}, nil
}

// createLegacyCheckout builds the documented EPay /submit.php checkout URL.
// EPUSDT v2 exposes this compatibility endpoint instead of MAPI; the signed
// URL is safe to hand to the browser, which follows the gateway redirect to
// the hosted checkout counter.
func (client *EpayMAPIClient) createLegacyCheckout(args EpayMAPIRequest) (*EpayCheckout, error) {
	device := args.Device
	if device == "" {
		device = epay.PC
	}
	uri, params, err := client.epayClient.Purchase(&epay.PurchaseArgs{
		Type:           args.PaymentMethod,
		ServiceTradeNo: args.TradeNo,
		Name:           args.Name,
		Money:          args.Money,
		Device:         device,
		NotifyUrl:      args.NotifyURL,
		ReturnUrl:      args.ReturnURL,
	})
	if err != nil {
		return nil, fmt.Errorf("create legacy epay checkout: %w", err)
	}
	checkoutURL, err := url.Parse(uri)
	if err != nil || !checkoutURL.IsAbs() || (checkoutURL.Scheme != "http" && checkoutURL.Scheme != "https") || checkoutURL.Hostname() == "" {
		return nil, errors.New("legacy epay checkout URL is invalid")
	}
	query := checkoutURL.Query()
	for key, value := range params {
		query.Set(key, value)
	}
	checkoutURL.RawQuery = query.Encode()
	return &EpayCheckout{
		CheckoutType:  "payurl",
		CheckoutValue: checkoutURL.String(),
	}, nil
}

type epayMAPIResponse struct {
	Code      int    `json:"code"`
	TradeNo   string `json:"trade_no"`
	QRCode    string `json:"qrcode"`
	PayURL    string `json:"payurl"`
	URLScheme string `json:"urlscheme"`
}

func (response epayMAPIResponse) checkout(paymentMethod string) (string, string, error) {
	if strings.TrimSpace(response.QRCode) != "" {
		return "qrcode", response.QRCode, nil
	}
	if value := strings.TrimSpace(response.PayURL); value != "" {
		if err := validateEpayMAPIPayURL(value); err != nil {
			return "", "", err
		}
		return "payurl", value, nil
	}
	if value := strings.TrimSpace(response.URLScheme); value != "" {
		if err := validateEpayMAPIURLScheme(paymentMethod, value); err != nil {
			return "", "", err
		}
		return "urlscheme", value, nil
	}
	return "", "", nil
}

func validateEpayMAPIPayURL(value string) error {
	parsed, err := url.Parse(value)
	if err != nil || !parsed.IsAbs() || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return errors.New("mapi response has an invalid payurl")
	}
	return nil
}

var epayMAPIURLSchemeAllowlist = map[string]map[string]struct{}{
	"alipay": {
		"alipay":  {},
		"alipays": {},
	},
	"wxpay": {
		"weixin": {},
		"wxp":    {},
	},
}

func validateEpayMAPIURLScheme(paymentMethod, value string) error {
	parsed, err := url.Parse(value)
	if err != nil || !parsed.IsAbs() || parsed.Scheme == "" {
		return errors.New("mapi response has an invalid urlscheme")
	}
	allowedSchemes, ok := epayMAPIURLSchemeAllowlist[strings.ToLower(strings.TrimSpace(paymentMethod))]
	if !ok {
		return errors.New("mapi response has an unsupported urlscheme payment method")
	}
	if _, ok := allowedSchemes[strings.ToLower(parsed.Scheme)]; !ok {
		return errors.New("mapi response has an invalid urlscheme")
	}
	return nil
}

func epayMAPIEndpoint(baseURL *url.URL) (string, error) {
	if baseURL == nil || (baseURL.Scheme != "http" && baseURL.Scheme != "https") || baseURL.Host == "" {
		return "", errors.New("epay mapi endpoint is invalid")
	}
	endpoint := *baseURL
	endpoint.RawQuery = ""
	endpoint.ForceQuery = false
	endpoint.Fragment = ""
	endpoint.RawFragment = ""
	basePath := path.Clean(endpoint.Path)
	if path.Base(basePath) == "submit.php" || path.Base(basePath) == "mapi.php" {
		basePath = path.Dir(basePath)
	}
	endpoint.Path = "/" + strings.TrimLeft(path.Join(basePath, "mapi.php"), "/")
	endpoint.RawPath = ""
	return endpoint.String(), nil
}
