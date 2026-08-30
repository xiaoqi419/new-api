package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGMPaySignatureUsesSortedNonEmptyParameters(t *testing.T) {
	params := map[string]any{
		"token":        "usdt",
		"currency":     "usd",
		"pid":          "merchant-001",
		"network":      "tron",
		"amount":       float64(10),
		"order_id":     "ORDER-123",
		"redirect_url": "https://new-api.example/wallet",
		"name":         "",
		"signature":    "must-not-be-signed",
	}

	signature := GMPaySignature(params, "merchant-secret")

	assert.Equal(t, "f728ca1f85fdaa7038d3d191d5b9cff8b3d3d1c32c35442fa61fb31c3821adb0", signature)
	assert.True(t, VerifyGMPaySignature(params, signature, "merchant-secret"))
	assert.False(t, VerifyGMPaySignature(params, "9FD081631C245810CF72D136E60FDF40B051D9DFC13DC109F39846001666A22F", "merchant-secret"))
}

func TestGMPayClientCreatesValidatedNativeCheckout(t *testing.T) {
	requestBodies := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, http.MethodPost, request.Method)
		require.Equal(t, gmpayCreateOrderPath, request.URL.Path)
		require.Equal(t, "application/json", request.Header.Get("Content-Type"))

		var payload map[string]any
		require.NoError(t, common.DecodeJson(request.Body, &payload))
		requestBodies <- payload
		_, _ = writer.Write([]byte(`{"status_code":200,"message":"success","data":{"order_id":"WALLET-ORDER-1","trade_id":"GMPAY-ORDER-1","amount":10,"currency":"USD","status":1,"actual_amount":"10.0123","receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token":"USDT","expiration_time":2000000000,"payment_url":"https://gmpay.example/private-checkout"}}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewGMPayClient(server.URL+"/payments/epay/v1/order/create-transaction?configured=true#fragment", "merchant-001", "merchant-secret", server.Client())
	require.NoError(t, err)

	notifyURL, err := url.Parse("https://new-api.example/api/user/gmpay/notify")
	require.NoError(t, err)
	redirectURL, err := url.Parse("https://new-api.example/wallet")
	require.NoError(t, err)

	checkout, err := client.CreateOrder(context.Background(), GMPayCreateOrderRequest{
		OrderID:     "WALLET-ORDER-1",
		Amount:      "10.00",
		NotifyURL:   notifyURL,
		RedirectURL: redirectURL,
		Name:        "USD wallet recharge",
	})
	require.NoError(t, err)
	require.NotNil(t, checkout)
	assert.Equal(t, "WALLET-ORDER-1", checkout.OrderID)
	assert.Equal(t, "GMPAY-ORDER-1", checkout.GatewayTradeNo)
	assert.Equal(t, "10.0123", checkout.ActualAmount)
	assert.Equal(t, "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", checkout.ReceiveAddress)
	assert.Equal(t, "USDT", checkout.Token)
	assert.Equal(t, "TRON", checkout.Network)
	assert.EqualValues(t, 2000000000, checkout.ExpirationTime)
	assert.Zero(t, checkout.ServerTime)

	payload := <-requestBodies
	assert.Equal(t, "merchant-001", payload["pid"])
	assert.Equal(t, "WALLET-ORDER-1", payload["order_id"])
	assert.Equal(t, "usd", payload["currency"])
	assert.Equal(t, "usdt", payload["token"])
	assert.Equal(t, "tron", payload["network"])
	assert.Equal(t, float64(10), payload["amount"])
	assert.Equal(t, notifyURL.String(), payload["notify_url"])
	assert.Equal(t, redirectURL.String(), payload["redirect_url"])
	assert.Equal(t, "USD wallet recharge", payload["name"])
	signature, ok := payload["signature"].(string)
	require.True(t, ok)
	assert.True(t, VerifyGMPaySignature(payload, signature, "merchant-secret"))
	assert.NotContains(t, payload, "payment_url")
}

func TestGMPayClientRejectsUnsafeOrUnusableResponse(t *testing.T) {
	testCases := []struct {
		name    string
		baseURL string
		body    string
	}{
		{
			name:    "non HTTP gateway address",
			baseURL: "ftp://pay.example.test/payments/epay/v1/order/create-transaction",
		},
		{
			name: "mismatched order",
			body: `{"status_code":200,"message":"success","data":{"order_id":"another-order","trade_id":"GMPAY-ORDER-1","status":1,"actual_amount":"10.0123","receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token":"USDT","expiration_time":2000000000}}`,
		},
		{
			name: "non waiting order",
			body: `{"status_code":200,"message":"success","data":{"order_id":"WALLET-ORDER-1","trade_id":"GMPAY-ORDER-1","status":2,"actual_amount":"10.0123","receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token":"USDT","expiration_time":2000000000}}`,
		},
		{
			name: "invalid checkout token",
			body: `{"status_code":200,"message":"success","data":{"order_id":"WALLET-ORDER-1","trade_id":"GMPAY-ORDER-1","status":1,"actual_amount":"10.0123","receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token":"TRX","expiration_time":2000000000}}`,
		},
		{
			name: "invalid checkout address checksum",
			body: `{"status_code":200,"message":"success","data":{"order_id":"WALLET-ORDER-1","trade_id":"GMPAY-ORDER-1","amount":10,"currency":"USD","status":1,"actual_amount":"10.0123","receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwc","token":"USDT","expiration_time":2000000000}}`,
		},
		{
			name: "mismatched response fiat amount",
			body: `{"status_code":200,"message":"success","data":{"order_id":"WALLET-ORDER-1","trade_id":"GMPAY-ORDER-1","amount":9.99,"currency":"USD","status":1,"actual_amount":"10.0123","receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token":"USDT","expiration_time":2000000000}}`,
		},
		{
			name: "invalid response currency",
			body: `{"status_code":200,"message":"success","data":{"order_id":"WALLET-ORDER-1","trade_id":"GMPAY-ORDER-1","amount":10,"currency":"EUR","status":1,"actual_amount":"10.0123","receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token":"USDT","expiration_time":2000000000}}`,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			baseURL := tc.baseURL
			var httpClient *http.Client
			if baseURL == "" {
				server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
					_, _ = writer.Write([]byte(tc.body))
				}))
				t.Cleanup(server.Close)
				baseURL = server.URL
				httpClient = server.Client()
			}

			client, err := NewGMPayClient(baseURL, "merchant-001", "merchant-secret", httpClient)
			if tc.body == "" {
				require.Error(t, err)
				assert.Nil(t, client)
				return
			}
			require.NoError(t, err)

			notifyURL, parseErr := url.Parse("https://new-api.example/api/user/gmpay/notify")
			require.NoError(t, parseErr)
			redirectURL, parseErr := url.Parse("https://new-api.example/wallet")
			require.NoError(t, parseErr)
			checkout, err := client.CreateOrder(context.Background(), GMPayCreateOrderRequest{
				OrderID:     "WALLET-ORDER-1",
				Amount:      "10.00",
				NotifyURL:   notifyURL,
				RedirectURL: redirectURL,
			})
			require.Error(t, err)
			assert.Nil(t, checkout)
		})
	}
}

func TestGMPayClientRejectsPlaintextConfiguredEndpointAndTinyAmounts(t *testing.T) {
	client, err := NewGMPayClient("http://pay.example.test/payments/epay/v1/order/create-transaction", "merchant-001", "merchant-secret", nil)
	require.Error(t, err)
	assert.Nil(t, client)

	client, err = NewGMPayClient("https://pay.example.test/payments/epay/v1/order/create-transaction", "merchant-001", "merchant-secret", nil)
	require.NoError(t, err)
	notifyURL, parseErr := url.Parse("https://new-api.example/api/user/gmpay/notify")
	require.NoError(t, parseErr)
	redirectURL, parseErr := url.Parse("https://new-api.example/wallet")
	require.NoError(t, parseErr)
	checkout, err := client.CreateOrder(context.Background(), GMPayCreateOrderRequest{
		OrderID:     "WALLET-ORDER-1",
		Amount:      "0.01",
		NotifyURL:   notifyURL,
		RedirectURL: redirectURL,
	})
	require.Error(t, err)
	assert.Nil(t, checkout)
}

func TestGMPayClientRejectsOrderIDLongerThan32CharactersBeforeRequest(t *testing.T) {
	requestReceived := false
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestReceived = true
		var payload map[string]any
		require.NoError(t, common.DecodeJson(request.Body, &payload))
		response, err := common.Marshal(map[string]any{
			"status_code": http.StatusOK,
			"message":     "success",
			"data": map[string]any{
				"order_id":        payload["order_id"],
				"trade_id":        "GMPAY-ORDER-1",
				"amount":          float64(10),
				"currency":        "USD",
				"status":          1,
				"actual_amount":   "10.0123",
				"receive_address": "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
				"token":           "USDT",
				"expiration_time": int64(2000000000),
			},
		})
		require.NoError(t, err)
		_, _ = writer.Write(response)
	}))
	t.Cleanup(server.Close)

	client, err := NewGMPayClient(server.URL, "merchant-001", "merchant-secret", server.Client())
	require.NoError(t, err)
	notifyURL, err := url.Parse("https://new-api.example/api/user/gmpay/notify")
	require.NoError(t, err)
	redirectURL, err := url.Parse("https://new-api.example/wallet")
	require.NoError(t, err)

	checkout, err := client.CreateOrder(context.Background(), GMPayCreateOrderRequest{
		OrderID:     strings.Repeat("A", 33),
		Amount:      "10.00",
		NotifyURL:   notifyURL,
		RedirectURL: redirectURL,
	})

	require.Error(t, err)
	assert.Nil(t, checkout)
	assert.False(t, requestReceived)
}
