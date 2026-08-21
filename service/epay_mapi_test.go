package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEpayMAPIClientCreateCheckout(t *testing.T) {
	testCases := []struct {
		name          string
		response      string
		paymentMethod string
		checkoutType  string
		checkoutVal   string
	}{
		{
			name:         "qrcode takes precedence over other checkout fields",
			response:     `{"code":1,"trade_no":"GATEWAY-1","qrcode":"weixin://qrcode","payurl":"https://pay.example.com/redirect","urlscheme":"alipays://launch"}`,
			checkoutType: "qrcode",
			checkoutVal:  "weixin://qrcode",
		},
		{
			name:         "qrcode preserves its non-empty content",
			response:     `{"code":1,"trade_no":"GATEWAY-1B","qrcode":"  qr-content  "}`,
			checkoutType: "qrcode",
			checkoutVal:  "  qr-content  ",
		},
		{
			name:         "blank qrcode falls back to payurl",
			response:     `{"code":1,"trade_no":"GATEWAY-1C","qrcode":"   ","payurl":"https://pay.example.com/redirect"}`,
			checkoutType: "payurl",
			checkoutVal:  "https://pay.example.com/redirect",
		},
		{
			name:         "payurl is used when qrcode is absent",
			response:     `{"code":1,"trade_no":"GATEWAY-2","payurl":"https://pay.example.com/redirect"}`,
			checkoutType: "payurl",
			checkoutVal:  "https://pay.example.com/redirect",
		},
		{
			name:         "urlscheme is used when other checkout fields are absent",
			response:     `{"code":1,"trade_no":"GATEWAY-3","urlscheme":"alipay://platformapi/startapp"}`,
			checkoutType: "urlscheme",
			checkoutVal:  "alipay://platformapi/startapp",
		},
		{
			name:          "wxpay urlscheme uses its allowlist",
			response:      `{"code":1,"trade_no":"GATEWAY-4","urlscheme":"wxp://launch"}`,
			paymentMethod: "wxpay",
			checkoutType:  "urlscheme",
			checkoutVal:   "wxp://launch",
		},
		{
			name:         "alipay accepts its alipays scheme",
			response:     `{"code":1,"trade_no":"GATEWAY-5","urlscheme":"alipays://launch"}`,
			checkoutType: "urlscheme",
			checkoutVal:  "alipays://launch",
		},
		{
			name:          "wxpay accepts its weixin scheme",
			response:      `{"code":1,"trade_no":"GATEWAY-6","urlscheme":"weixin://launch"}`,
			paymentMethod: "wxpay",
			checkoutType:  "urlscheme",
			checkoutVal:   "weixin://launch",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			requestForms := make(chan url.Values, 1)
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				require.Equal(t, http.MethodPost, request.Method)
				require.Equal(t, "/gateway/mapi.php", request.URL.Path)
				require.Equal(t, "application/x-www-form-urlencoded", request.Header.Get("Content-Type"))
				require.NoError(t, request.ParseForm())
				requestForms <- request.PostForm
				_, _ = writer.Write([]byte(tc.response))
			}))
			t.Cleanup(server.Close)

			client := newEpayMAPIClientForTest(t, server.URL+"/gateway", nil)
			requestArgs := epayMAPIRequestForTest()
			if tc.paymentMethod != "" {
				requestArgs.PaymentMethod = tc.paymentMethod
			}
			checkout, err := client.CreateCheckout(context.Background(), requestArgs)
			require.NoError(t, err)
			require.NotNil(t, checkout)
			assert.Equal(t, tc.checkoutType, checkout.CheckoutType)
			assert.Equal(t, tc.checkoutVal, checkout.CheckoutValue)

			form := <-requestForms
			expected := epay.GenerateParams(map[string]string{
				"pid":          "merchant-id",
				"type":         requestArgs.PaymentMethod,
				"out_trade_no": "WALLET-ORDER-1",
				"notify_url":   "https://wallet.example.com/api/user/epay/notify",
				"return_url":   "https://wallet.example.com/wallet",
				"name":         "TUC10",
				"money":        "10.00",
				"clientip":     "127.0.0.1",
				"device":       "pc",
				"param":        "wallet",
			}, "merchant-key")
			expectedForm := url.Values{}
			for key, value := range expected {
				expectedForm.Set(key, value)
			}
			assert.Equal(t, expectedForm, form)
		})
	}
}

func TestEpayMAPIClientRejectsInvalidResponses(t *testing.T) {
	testCases := []struct {
		name          string
		statusCode    int
		body          string
		paymentMethod string
		timeout       bool
	}{
		{
			name: "gateway rejects payment",
			body: `{"code":0}`,
		},
		{
			name: "checkout target is absent",
			body: `{"code":1,"trade_no":"GATEWAY-4"}`,
		},
		{
			name: "payurl has an unsafe scheme",
			body: `{"code":1,"payurl":"javascript:alert(1)"}`,
		},
		{
			name: "payurl is relative",
			body: `{"code":1,"payurl":"/checkout"}`,
		},
		{
			name: "urlscheme is not allowed for alipay",
			body: `{"code":1,"urlscheme":"weixin://pay"}`,
		},
		{
			name:          "urlscheme payment method has no allowlist",
			body:          `{"code":1,"urlscheme":"alipay://pay"}`,
			paymentMethod: "custom1",
		},
		{
			name: "malformed json",
			body: `{"code":`,
		},
		{
			name: "response exceeds the configured limit",
			body: strings.Repeat("x", epayMAPIResponseLimit+1),
		},
		{
			name:       "non-success http status",
			statusCode: http.StatusBadGateway,
			body:       `{"code":1,"qrcode":"weixin://qrcode"}`,
		},
		{
			name:    "request context deadline",
			timeout: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.timeout {
				ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
				t.Cleanup(cancel)
				client := newEpayMAPIClientForTest(t, "https://pay.example.com", &http.Client{
					Transport: waitForMAPIRequestContextRoundTripper{},
				})
				checkout, err := client.CreateCheckout(ctx, epayMAPIRequestForTest())
				require.Error(t, err)
				assert.Nil(t, checkout)
				return
			}

			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				statusCode := tc.statusCode
				if statusCode == 0 {
					statusCode = http.StatusOK
				}
				writer.WriteHeader(statusCode)
				_, _ = writer.Write([]byte(tc.body))
			}))
			t.Cleanup(server.Close)

			client := newEpayMAPIClientForTest(t, server.URL, nil)
			requestArgs := epayMAPIRequestForTest()
			if tc.paymentMethod != "" {
				requestArgs.PaymentMethod = tc.paymentMethod
			}
			checkout, err := client.CreateCheckout(context.Background(), requestArgs)
			require.Error(t, err)
			assert.Nil(t, checkout)
		})
	}
}

type waitForMAPIRequestContextRoundTripper struct{}

func (waitForMAPIRequestContextRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	<-request.Context().Done()
	return nil, request.Context().Err()
}

func TestEpayMAPIEndpointNormalizesConfiguredGatewayAddress(t *testing.T) {
	testCases := []struct {
		base string
		want string
	}{
		{
			base: "https://pay.example.com",
			want: "https://pay.example.com/mapi.php",
		},
		{
			base: "https://pay.example.com/submit.php",
			want: "https://pay.example.com/mapi.php",
		},
		{
			base: "https://pay.example.com/gateway/submit.php",
			want: "https://pay.example.com/gateway/mapi.php",
		},
		{
			base: "https://pay.example.com/gateway/mapi.php?legacy=true",
			want: "https://pay.example.com/gateway/mapi.php",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.base, func(t *testing.T) {
			baseURL, err := url.Parse(tc.base)
			require.NoError(t, err)
			endpoint, err := epayMAPIEndpoint(baseURL)
			require.NoError(t, err)
			assert.Equal(t, tc.want, endpoint)
		})
	}
}

func newEpayMAPIClientForTest(t *testing.T, baseURL string, httpClient *http.Client) *EpayMAPIClient {
	t.Helper()
	epayClient, err := epay.NewClient(&epay.Config{PartnerID: "merchant-id", Key: "merchant-key"}, baseURL)
	require.NoError(t, err)
	client, err := NewEpayMAPIClient(epayClient, httpClient)
	require.NoError(t, err)
	return client
}

func epayMAPIRequestForTest() EpayMAPIRequest {
	notifyURL, _ := url.Parse("https://wallet.example.com/api/user/epay/notify")
	returnURL, _ := url.Parse("https://wallet.example.com/wallet")
	return EpayMAPIRequest{
		PaymentMethod: "alipay",
		TradeNo:       "WALLET-ORDER-1",
		Name:          "TUC10",
		Money:         "10.00",
		ClientIP:      "127.0.0.1",
		NotifyURL:     notifyURL,
		ReturnURL:     returnURL,
		Param:         "wallet",
	}
}
