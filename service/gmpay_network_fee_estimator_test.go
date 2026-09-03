package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSolanaBase58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

func TestConfiguredNetworkFeeEstimatorSanitizesJSONRPCErrorMessage(t *testing.T) {
	const secret = "sensitive calldata and credentials that must never reach logs"
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"` + secret + `"}}`))
	}))
	defer server.Close()

	endpoint, err := url.Parse(server.URL)
	require.NoError(t, err)
	estimator := &ConfiguredNetworkFeeEstimator{
		config:     parsedNetworkFeeConfig{responseLimit: 4 * 1024},
		httpClient: server.Client(),
	}

	_, err = estimator.callJSONRPC(context.Background(), endpoint, "eth_estimateGas", nil)
	require.Error(t, err)
	assert.Equal(t, "rpc method eth_estimateGas failed: method_not_found", err.Error())
	assert.NotContains(t, err.Error(), secret)
}

func testEVMTransferCalldata(recipient string, amountHex string) string {
	recipient = strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(recipient), "0x"), "0X")
	amountHex = strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(amountHex), "0x"), "0X")
	return "0xa9059cbb" + strings.Repeat("0", 24) + recipient + strings.Repeat("0", 64-len(amountHex)) + amountHex
}

// testSolanaAddress creates deterministic 32-byte public keys without relying
// on a network or an external key-generation package.
func testSolanaAddress(fill byte) string {
	value := new(big.Int).SetBytes(bytes.Repeat([]byte{fill}, 32))
	encoded := make([]byte, 0, 44)
	base := big.NewInt(58)
	quotient := new(big.Int)
	remainder := new(big.Int)
	for value.Sign() > 0 {
		quotient.QuoRem(value, base, remainder)
		encoded = append(encoded, testSolanaBase58Alphabet[remainder.Int64()])
		value.Set(quotient)
	}
	for left, right := 0, len(encoded)-1; left < right; left, right = left+1, right-1 {
		encoded[left], encoded[right] = encoded[right], encoded[left]
	}
	return string(encoded)
}

func TestConfiguredNetworkFeeEstimatorEVMGasAndPrice(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	var rpcCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"price":"2000","currency":"USD","timestamp":1700000000}`))
			return
		}
		rpcCalls.Add(1)
		var payload struct {
			JSONRPC string `json:"jsonrpc"`
			Method  string `json:"method"`
		}
		if err := common.DecodeJson(request.Body, &payload); err != nil {
			http.Error(writer, "invalid JSON-RPC request", http.StatusBadRequest)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		switch payload.Method {
		case "eth_estimateGas":
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x5208"}`))
		case "eth_gasPrice":
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x3b9aca00"}`))
		case "eth_feeHistory":
			// Fee history is optional when eth_gasPrice succeeds. Returning an
			// RPC error keeps this test focused on the deterministic gas-price
			// conversion path while exercising fail-closed RPC validation.
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"method not found"}}`))
		default:
			t.Fatalf("unexpected RPC method %q", payload.Method)
		}
	}))
	defer server.Close()

	config := NetworkFeeEstimatorConfig{
		Version:        NetworkFeeEstimatorConfigVersion,
		DynamicEnabled: true,
		Chains: map[string]NetworkFeeChainConfig{
			"ethereum": {
				RPCURL:             server.URL,
				PriceURL:           server.URL,
				NativeAsset:        "ETH",
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"127.0.0.1"},
				PriceAllowedHosts:  []string{"127.0.0.1"},
				Transaction: NetworkFeeTransactionContext{
					From:          "0x1111111111111111111111111111111111111111",
					Recipient:     "0x2222222222222222222222222222222222222222",
					TokenContract: "0x3333333333333333333333333333333333333333",
					Data:          testEVMTransferCalldata("0x2222222222222222222222222222222222222222", "1"),
				},
			},
		},
		TimeoutMilliseconds: 2_000,
		MaxResponseBytes:    16 * 1024,
		MaxFee:              "100",
		MaxTotal:            "1000",
		PriceMaxAgeSeconds:  60,
	}
	estimator, err := NewNetworkFeeEstimatorWithClock(config, server.Client(), func() time.Time { return now })
	require.NoError(t, err)

	quote, err := estimator.Estimate(context.Background(), NetworkFeeEstimateInput{
		Token:              "USDT",
		Network:            "ETH",
		SettlementCurrency: "usd",
		BaseAmount:         decimal.RequireFromString("10"),
	})
	require.NoError(t, err)
	assert.Equal(t, ChainNetworkEstimateSource, quote.Source)
	assert.Equal(t, "ETH", quote.NativeAsset)
	assert.True(t, quote.NativeAmount.Equal(decimal.RequireFromString("0.000021")))
	assert.True(t, quote.FeeAmount.Equal(decimal.RequireFromString("0.042")))
	assert.True(t, quote.TotalAmount.Equal(decimal.RequireFromString("10.042")))
	assert.Equal(t, int64(1_700_000_000), quote.Evidence.PriceTimestamp)
	assert.Equal(t, "eth_estimateGas", quote.Evidence.RPCMethod)
	assert.Equal(t, int32(3), rpcCalls.Load()) // estimateGas, gasPrice, optional feeHistory
}

func TestConfiguredNetworkFeeEstimatorRejectsNonCanonicalEVMERC20Calldata(t *testing.T) {
	const (
		from      = "0x1111111111111111111111111111111111111111"
		recipient = "0x2222222222222222222222222222222222222222"
		contract  = "0x3333333333333333333333333333333333333333"
	)
	canonical := testEVMTransferCalldata(recipient, "1")
	cases := []struct {
		name string
		data string
	}{
		{name: "zero byte", data: "0x00"},
		{name: "wrong selector", data: "0xdeadbeef" + canonical[10:]},
		{name: "short calldata", data: "0xa9059cbb" + strings.Repeat("0", 64)},
		{name: "wrong recipient", data: testEVMTransferCalldata("0x4444444444444444444444444444444444444444", "1")},
		{name: "zero amount", data: testEVMTransferCalldata(recipient, strings.Repeat("0", 64))},
	}

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		writer.Header().Set("Content-Type", "application/json")
		if request.Method == http.MethodGet {
			_, _ = writer.Write([]byte(`{"price":"2000","currency":"USD","timestamp":1700000000}`))
			return
		}
		_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x1"}`))
	}))
	defer server.Close()

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			estimator, err := NewNetworkFeeEstimator(NetworkFeeEstimatorConfig{
				Version:        NetworkFeeEstimatorConfigVersion,
				DynamicEnabled: true,
				Chains: map[string]NetworkFeeChainConfig{
					"ethereum": {
						RPCURL:             server.URL,
						PriceURL:           server.URL,
						NativeAsset:        "ETH",
						SettlementCurrency: "USD",
						RPCAllowedHosts:    []string{"127.0.0.1"},
						PriceAllowedHosts:  []string{"127.0.0.1"},
						Transaction: NetworkFeeTransactionContext{
							From:          from,
							Recipient:     recipient,
							TokenContract: contract,
							Data:          testCase.data,
						},
					},
				},
				MaxFee:   "100",
				MaxTotal: "1000",
			})
			require.NoError(t, err)

			_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{
				Token:              "USDT",
				Network:            "ethereum",
				SettlementCurrency: "USD",
				BaseAmount:         decimal.NewFromInt(1),
			})
			require.Error(t, err)
			assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
			assert.ErrorIs(t, err, ErrInsufficientContext)
		})
	}
	assert.Zero(t, requests.Load(), "invalid calldata must be rejected before any RPC request")
}

func TestValidateEVMERC20TransferCalldataAcceptsOptionalPrefix(t *testing.T) {
	const recipient = "0x2222222222222222222222222222222222222222"
	dataWithoutPrefix := strings.TrimPrefix(testEVMTransferCalldata(recipient, "1"), "0x")
	require.NoError(t, validateEVMERC20TransferCalldata(dataWithoutPrefix, recipient))
	require.NoError(t, validateEVMERC20TransferCalldata("0x"+dataWithoutPrefix, recipient))
}

func TestConfiguredNetworkFeeEstimatorFailsClosedWithoutTransactionContext(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
	}))
	defer server.Close()

	config := NetworkFeeEstimatorConfig{
		Version:        NetworkFeeEstimatorConfigVersion,
		DynamicEnabled: true,
		Chains: map[string]NetworkFeeChainConfig{
			"ethereum": {
				RPCURL:             server.URL,
				PriceURL:           server.URL,
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"127.0.0.1"},
				PriceAllowedHosts:  []string{"127.0.0.1"},
			},
		},
		MaxFee:   "100",
		MaxTotal: "1000",
	}
	estimator, err := NewNetworkFeeEstimatorWithHTTPClient(config, server.Client())
	require.NoError(t, err)

	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{
		Token:              "USDT",
		Network:            "ethereum",
		SettlementCurrency: "USD",
		BaseAmount:         decimal.NewFromInt(1),
	})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
	assert.ErrorIs(t, err, ErrInsufficientContext)
	assert.Equal(t, int32(0), requests.Load(), "missing context must not trigger an RPC request")
}

func TestParseNetworkFeeEstimatorConfigRejectsUnsafeLimitsAndUnknownFields(t *testing.T) {
	_, err := ParseNetworkFeeEstimatorConfig(`{"version":1,"chains":{},"gateway_fee":"5"}`)
	require.Error(t, err)
	assert.True(t, strings.Contains(err.Error(), "unknown field") || strings.Contains(err.Error(), "chains"))

	_, err = ParseNetworkFeeEstimatorConfig(`{"version":1,"chains":{"ethereum":{"rpc_url":"https://rpc.example","price_url":"https://price.example","rpc_allowed_hosts":["rpc.example"],"price_allowed_hosts":["price.example"],"settlement_currency":"USD","transaction":{"gateway_fee":"5"}}}}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown transaction field")

	_, err = ParseNetworkFeeEstimatorConfig(`{"version":1,"chains":{"ethereum":{"rpc_url":"https://rpc.example","price_url":"https://price.example","rpc_allowed_hosts":["rpc.example"],"price_allowed_hosts":["price.example"],"settlement_currency":"USD"}},"max_fee":"-1"}`)
	require.Error(t, err)
	assert.False(t, errors.Is(err, ErrNetworkFeeContextMissing))
}

func TestConfiguredNetworkFeeEstimatorCachesQuotesByRequestFingerprint(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	var rpcCalls atomic.Int32
	var priceCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		if request.Method == http.MethodGet {
			priceCalls.Add(1)
			_, _ = writer.Write([]byte(`{"price":"2000","currency":"USD","timestamp":1700000000}`))
			return
		}
		rpcCalls.Add(1)
		var payload struct {
			Method string `json:"method"`
		}
		require.NoError(t, common.DecodeJson(request.Body, &payload))
		switch payload.Method {
		case "eth_estimateGas":
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x5208"}`))
		case "eth_gasPrice":
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x3b9aca00"}`))
		case "eth_feeHistory":
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"method not found"}}`))
		default:
			t.Fatalf("unexpected RPC method %q", payload.Method)
		}
	}))
	defer server.Close()

	config := NetworkFeeEstimatorConfig{
		Version:                  NetworkFeeEstimatorConfigVersion,
		DynamicEnabled:           true,
		CacheTTLSeconds:          10,
		QuoteTTLSeconds:          60,
		MaxPriceDeviationPercent: "25",
		Chains: map[string]NetworkFeeChainConfig{
			"ethereum": {
				RPCURL:             server.URL,
				PriceURL:           server.URL,
				NativeAsset:        "ETH",
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"127.0.0.1"},
				PriceAllowedHosts:  []string{"127.0.0.1"},
				Transaction: NetworkFeeTransactionContext{
					From:          "0x1111111111111111111111111111111111111111",
					Recipient:     "0x2222222222222222222222222222222222222222",
					TokenContract: "0x3333333333333333333333333333333333333333",
					Data:          testEVMTransferCalldata("0x2222222222222222222222222222222222222222", "1"),
				},
			},
		},
		MaxFee:   "100",
		MaxTotal: "1000",
	}
	estimator, err := NewNetworkFeeEstimatorWithClock(config, server.Client(), func() time.Time { return now })
	require.NoError(t, err)
	input := NetworkFeeEstimateInput{
		Token:              "USDT",
		Network:            "ethereum",
		SettlementCurrency: "USD",
		BaseAmount:         decimal.NewFromInt(10),
	}
	first, err := estimator.Estimate(context.Background(), input)
	require.NoError(t, err)
	second, err := estimator.Estimate(context.Background(), input)
	require.NoError(t, err)
	assert.Equal(t, first.TotalAmount, second.TotalAmount)
	assert.Equal(t, int32(3), rpcCalls.Load(), "the second identical request should use the quote cache")
	assert.Equal(t, int32(1), priceCalls.Load(), "the second identical request should use the quote cache")

	// The base amount is part of the cache key; a different amount must not
	// reuse the first quote.
	input.BaseAmount = decimal.NewFromInt(11)
	_, err = estimator.Estimate(context.Background(), input)
	require.NoError(t, err)
	assert.Equal(t, int32(6), rpcCalls.Load())
	assert.Equal(t, int32(2), priceCalls.Load())

	// Advancing beyond the configured cache TTL forces a fresh observation.
	now = now.Add(11 * time.Second)
	input.BaseAmount = decimal.NewFromInt(10)
	_, err = estimator.Estimate(context.Background(), input)
	require.NoError(t, err)
	assert.Equal(t, int32(9), rpcCalls.Load())
	assert.Equal(t, int32(3), priceCalls.Load())
}

func TestNetworkFeeCacheKeyDoesNotExposeTransactionSecrets(t *testing.T) {
	input := NetworkFeeEstimateInput{
		Token:              "USDT",
		Network:            "ethereum",
		SettlementCurrency: "USD",
		BaseAmount:         decimal.RequireFromString("12.34"),
		Transaction: NetworkFeeTransactionContext{
			From:          "0x1111111111111111111111111111111111111111",
			Recipient:     "0x2222222222222222222222222222222222222222",
			TokenContract: "0x3333333333333333333333333333333333333333",
			Data:          "0xdeadbeef-secret-like-payload",
		},
	}
	key := networkFeeQuoteCacheKey("ethereum", input, input.Transaction)
	assert.Contains(t, key, "network=ethereum")
	assert.Contains(t, key, "method=eth_estimateGas")
	assert.Contains(t, key, "token=USDT")
	assert.Contains(t, key, "currency=USD")
	assert.Contains(t, key, "base=12.34")
	assert.NotContains(t, key, input.Transaction.From)
	assert.NotContains(t, key, input.Transaction.Data)
}

func TestParseNetworkFeeEstimatorConfigRejectsCacheAndDeviationOverflow(t *testing.T) {
	_, err := ParseNetworkFeeEstimatorConfig(`{"version":1,"chains":{"ethereum":{"rpc_url":"https://rpc.example","price_url":"https://price.example","rpc_allowed_hosts":["rpc.example"],"price_allowed_hosts":["price.example"],"settlement_currency":"USD"}},"cache_ttl_seconds":86401}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "cache")

	_, err = ParseNetworkFeeEstimatorConfig(`{"version":1,"chains":{"ethereum":{"rpc_url":"https://rpc.example","price_url":"https://price.example","rpc_allowed_hosts":["rpc.example"],"price_allowed_hosts":["price.example"],"settlement_currency":"USD"}},"max_price_deviation_percent":"100.01"}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "deviation")
}

func TestConfiguredNetworkFeeEstimatorRejectsLargePriceDeviation(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	var priceCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		if request.Method == http.MethodGet {
			price := `{"price":"100","currency":"USD","timestamp":1700000000}`
			if priceCalls.Add(1) > 1 {
				price = `{"price":"130","currency":"USD","timestamp":1700000011}`
			}
			_, _ = writer.Write([]byte(price))
			return
		}
		var payload struct {
			Method string `json:"method"`
		}
		require.NoError(t, common.DecodeJson(request.Body, &payload))
		switch payload.Method {
		case "eth_estimateGas":
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x5208"}`))
		case "eth_gasPrice":
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x3b9aca00"}`))
		case "eth_feeHistory":
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"method not found"}}`))
		default:
			t.Fatalf("unexpected RPC method %q", payload.Method)
		}
	}))
	defer server.Close()
	config := NetworkFeeEstimatorConfig{
		Version:                  NetworkFeeEstimatorConfigVersion,
		DynamicEnabled:           true,
		CacheTTLSeconds:          1,
		QuoteTTLSeconds:          60,
		MaxPriceDeviationPercent: "10",
		Chains: map[string]NetworkFeeChainConfig{
			"ethereum": {
				RPCURL:             server.URL,
				PriceURL:           server.URL,
				NativeAsset:        "ETH",
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"127.0.0.1"},
				PriceAllowedHosts:  []string{"127.0.0.1"},
				Transaction: NetworkFeeTransactionContext{
					From:          "0x1111111111111111111111111111111111111111",
					Recipient:     "0x2222222222222222222222222222222222222222",
					TokenContract: "0x3333333333333333333333333333333333333333",
					Data:          testEVMTransferCalldata("0x2222222222222222222222222222222222222222", "1"),
				},
			},
		},
		MaxFee:   "100",
		MaxTotal: "1000",
	}
	estimator, err := NewNetworkFeeEstimatorWithClock(config, server.Client(), func() time.Time { return now })
	require.NoError(t, err)
	input := NetworkFeeEstimateInput{
		Token:              "USDT",
		Network:            "ethereum",
		SettlementCurrency: "USD",
		BaseAmount:         decimal.NewFromInt(10),
	}
	_, err = estimator.Estimate(context.Background(), input)
	require.NoError(t, err)
	now = now.Add(2 * time.Second)
	_, err = estimator.Estimate(context.Background(), input)
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
	assert.Contains(t, err.Error(), "deviation")
}

func TestConfiguredNetworkFeeEstimatorHonorsDynamicEnabled(t *testing.T) {
	config := NetworkFeeEstimatorConfig{
		Version: NetworkFeeEstimatorConfigVersion,
		Chains: map[string]NetworkFeeChainConfig{
			"ethereum": {
				RPCURL:             "http://127.0.0.1:1",
				PriceURL:           "http://127.0.0.1:1",
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"127.0.0.1"},
				PriceAllowedHosts:  []string{"127.0.0.1"},
			},
		},
	}
	estimator, err := NewNetworkFeeEstimator(config)
	require.NoError(t, err)
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "ethereum", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(1)})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
	assert.Contains(t, err.Error(), "disabled")
}

func TestParseNetworkFeeEstimatorRejectsRemotePlainHTTP(t *testing.T) {
	config := NetworkFeeEstimatorConfig{
		Version:        NetworkFeeEstimatorConfigVersion,
		DynamicEnabled: true,
		Chains: map[string]NetworkFeeChainConfig{
			"ethereum": {
				RPCURL:             "http://rpc.example.test",
				PriceURL:           "https://price.example.test",
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"rpc.example.test"},
				PriceAllowedHosts:  []string{"price.example.test"},
			},
		},
	}
	_, err := NewNetworkFeeEstimator(config)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "HTTPS")
}

func TestConfiguredNetworkFeeEstimatorDoesNotFollowRedirects(t *testing.T) {
	var targetCalls atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		targetCalls.Add(1)
		_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x1"}`))
	}))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Location", target.URL)
		writer.WriteHeader(http.StatusFound)
	}))
	defer redirect.Close()

	config := NetworkFeeEstimatorConfig{
		Version:        NetworkFeeEstimatorConfigVersion,
		DynamicEnabled: true,
		Chains: map[string]NetworkFeeChainConfig{
			"ethereum": {
				RPCURL:             redirect.URL,
				PriceURL:           redirect.URL,
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"127.0.0.1"},
				PriceAllowedHosts:  []string{"127.0.0.1"},
				Transaction: NetworkFeeTransactionContext{
					From:          "0x1111111111111111111111111111111111111111",
					Recipient:     "0x2222222222222222222222222222222222222222",
					TokenContract: "0x3333333333333333333333333333333333333333",
					Data:          testEVMTransferCalldata("0x2222222222222222222222222222222222222222", "1"),
				},
			},
		},
		MaxFee:   "100",
		MaxTotal: "1000",
	}
	estimator, err := NewNetworkFeeEstimatorWithHTTPClient(config, redirect.Client())
	require.NoError(t, err)
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{
		Token:              "USDT",
		Network:            "ethereum",
		SettlementCurrency: "USD",
		BaseAmount:         decimal.NewFromInt(1),
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "redirect")
	assert.Zero(t, targetCalls.Load(), "redirect target must never receive the estimator request")
}

func TestConfiguredNetworkFeeEstimatorRejectsRequestTransactionOverride(t *testing.T) {
	transaction := NetworkFeeTransactionContext{
		From:          "0x1111111111111111111111111111111111111111",
		Recipient:     "0x2222222222222222222222222222222222222222",
		TokenContract: "0x3333333333333333333333333333333333333333",
		Data:          testEVMTransferCalldata("0x2222222222222222222222222222222222222222", "1"),
	}
	config := NetworkFeeEstimatorConfig{
		Version:        NetworkFeeEstimatorConfigVersion,
		DynamicEnabled: true,
		Chains: map[string]NetworkFeeChainConfig{
			"ethereum": {
				RPCURL:             "https://rpc.example.test",
				PriceURL:           "https://price.example.test",
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"rpc.example.test"},
				PriceAllowedHosts:  []string{"price.example.test"},
				Transaction:        transaction,
			},
		},
		MaxFee:   "100",
		MaxTotal: "1000",
	}
	estimator, err := NewNetworkFeeEstimator(config)
	require.NoError(t, err)
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{
		Token:              "USDT",
		Network:            "ethereum",
		SettlementCurrency: "USD",
		BaseAmount:         decimal.NewFromInt(1),
		Transaction:        transaction,
	})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
	assert.ErrorIs(t, err, ErrInsufficientContext)
}

func TestConfiguredNetworkFeeEstimatorRejectsBaseOnlyFeeHistory(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			_, _ = writer.Write([]byte(`{"price":"2000","currency":"USD","timestamp":1700000000}`))
			return
		}
		var payload struct {
			Method string `json:"method"`
		}
		require.NoError(t, common.DecodeJson(request.Body, &payload))
		switch payload.Method {
		case "eth_estimateGas":
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x5208"}`))
		case "eth_gasPrice":
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"method unavailable"}}`))
		case "eth_feeHistory":
			_, _ = writer.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"oldestBlock":"0x1","baseFeePerGas":["0x3b9aca00"],"reward":[]}}`))
		default:
			t.Fatalf("unexpected RPC method %q", payload.Method)
		}
	}))
	defer server.Close()
	transaction := NetworkFeeTransactionContext{
		From:          "0x1111111111111111111111111111111111111111",
		Recipient:     "0x2222222222222222222222222222222222222222",
		TokenContract: "0x3333333333333333333333333333333333333333",
		Data:          testEVMTransferCalldata("0x2222222222222222222222222222222222222222", "1"),
	}
	estimator, err := NewNetworkFeeEstimatorWithClock(NetworkFeeEstimatorConfig{
		Version:        NetworkFeeEstimatorConfigVersion,
		DynamicEnabled: true,
		Chains: map[string]NetworkFeeChainConfig{
			"ethereum": {
				RPCURL:             server.URL,
				PriceURL:           server.URL,
				SettlementCurrency: "USD",
				RPCAllowedHosts:    []string{"127.0.0.1"},
				PriceAllowedHosts:  []string{"127.0.0.1"},
				Transaction:        transaction,
			},
		},
		MaxFee:   "100",
		MaxTotal: "1000",
	}, server.Client(), func() time.Time { return now })
	require.NoError(t, err)
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{
		Token:              "USDT",
		Network:            "ethereum",
		SettlementCurrency: "USD",
		BaseAmount:         decimal.NewFromInt(1),
	})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
	assert.Contains(t, err.Error(), "priority")
}

func TestParseNetworkFeePriceRejectsMismatchedAssetMetadata(t *testing.T) {
	_, _, _, err := parseNetworkFeePriceForAsset(
		[]byte(`{"price":"2000","asset":"BTC","currency":"USD","timestamp":1700000000}`),
		"ETH",
		"USD",
	)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "asset")

	price, timestamp, currency, err := parseNetworkFeePriceForAsset(
		[]byte(`{"price":"2000","symbol":"ETH/USD","timestamp":1700000000}`),
		"ETH",
		"USD",
	)
	require.NoError(t, err)
	assert.True(t, price.Equal(decimal.NewFromInt(2000)))
	assert.Equal(t, int64(1700000000), timestamp.Unix())
	assert.Empty(t, currency)
}

func TestPrepareTRONTRC20CallDerivesAndValidatesSelector(t *testing.T) {
	const address = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
	decoded, ok := decodeGMPayBase58(address)
	require.True(t, ok)
	require.Len(t, decoded, 25)
	parameter := strings.Repeat("0", 24) + hex.EncodeToString(decoded[1:21]) + strings.Repeat("0", 64)

	selector, payload, err := prepareTRONTRC20Call(address, address, "0xa9059cbb"+parameter, "")
	require.NoError(t, err)
	assert.Equal(t, tronTRC20TransferSignature, selector)
	assert.Equal(t, parameter, payload)

	selector, payload, err = prepareTRONTRC20Call(address, address, parameter, "0xa9059cbb")
	require.NoError(t, err)
	assert.Equal(t, tronTRC20TransferSignature, selector)
	assert.Equal(t, parameter, payload)

	_, _, err = prepareTRONTRC20Call(address, address, "00"+parameter[2:], "")
	assert.ErrorIs(t, err, ErrInsufficientContext)

	otherRecipient := "TA9pkx4DFxrEw8JZzUtyDrh2uAat1LDuJL"
	_, _, err = prepareTRONTRC20Call(address, otherRecipient, "a9059cbb"+parameter, "")
	assert.ErrorIs(t, err, ErrInsufficientContext)

	nonCanonicalParameter := "01" + parameter[2:]
	_, _, err = prepareTRONTRC20Call(address, address, nonCanonicalParameter, "a9059cbb")
	assert.ErrorIs(t, err, ErrInsufficientContext)
}

func TestSolanaMessageContextIsConstructedAndBound(t *testing.T) {
	payer := testSolanaAddress(1)
	source := testSolanaAddress(2)
	destination := testSolanaAddress(3)
	mint := testSolanaAddress(4)
	blockhash := testSolanaAddress(5)
	transaction := NetworkFeeTransactionContext{
		Payer:                   payer,
		Recipient:               destination,
		SourceTokenAccount:      source,
		RecipientTokenAccount:   destination,
		TransferInstruction:     "transferChecked",
		TokenMint:               mint,
		TransferAmountBaseUnits: "42",
		TokenDecimals:           6,
		RecentBlockhash:         blockhash,
	}
	messageBytes, err := buildSolanaTransferMessage(transaction)
	require.NoError(t, err)
	parsed, err := parseSolanaMessage(messageBytes)
	require.NoError(t, err)
	require.NoError(t, validateSolanaMessageContext(parsed, transaction))

	// The structured editor collects the destination token account but not the
	// owning wallet. That account alone is sufficient for the controlled SPL
	// instruction; an optional owner is only cross-checked when supplied.
	ownerless := transaction
	ownerless.Recipient = ""
	ownerless.To = ""
	ownerless.Message = ""
	_, _, err = prepareSolanaMessage(ownerless)
	require.NoError(t, err)

	encoded := base64.StdEncoding.EncodeToString(messageBytes)
	transaction.Message = encoded
	transaction.SourceTokenAccount = ""
	transaction.RecipientTokenAccount = ""
	transaction.TransferAmountBaseUnits = ""
	transaction.RecentBlockhash = ""
	transaction.TokenProgramID = ""
	transaction.InstructionData = ""
	decoded, err := decodeSolanaMessage(transaction.Message)
	require.NoError(t, err)
	parsed, err = parseSolanaMessage(decoded)
	require.NoError(t, err)
	require.NoError(t, validateSolanaMessageContext(parsed, transaction))

	transaction.Payer = testSolanaAddress(6)
	assert.ErrorIs(t, validateSolanaMessageContext(parsed, transaction), ErrInsufficientContext)
}

func TestSolanaTransferInstructionSelectionIsBound(t *testing.T) {
	transaction := NetworkFeeTransactionContext{
		Payer:                   testSolanaAddress(11),
		Recipient:               testSolanaAddress(12),
		SourceTokenAccount:      testSolanaAddress(13),
		RecipientTokenAccount:   testSolanaAddress(14),
		TokenMint:               testSolanaAddress(15),
		TransferInstruction:     "transfer",
		TransferAmountBaseUnits: "7",
		TokenDecimals:           6,
		RecentBlockhash:         testSolanaAddress(16),
	}
	messageBytes, err := buildSolanaTransferMessage(transaction)
	require.NoError(t, err)
	parsed, err := parseSolanaMessage(messageBytes)
	require.NoError(t, err)
	require.Len(t, parsed.instructions, 1)
	assert.Equal(t, byte(3), parsed.instructions[0].data[0])
	assert.Len(t, parsed.instructions[0].accountIndices, 3)
	require.NoError(t, validateSolanaMessageContext(parsed, transaction))

	transaction.TransferInstruction = "transferChecked"
	assert.ErrorIs(t, validateSolanaMessageContext(parsed, transaction), ErrInsufficientContext)
	transaction.TransferInstruction = "not-an-spl-instruction"
	assert.ErrorIs(t, validateSolanaMessageContext(parsed, transaction), ErrInsufficientContext)
}

func TestParseNetworkFeeTransactionContextNormalizesSolanaTransferInstruction(t *testing.T) {
	parsed, err := parseNetworkFeeTransactionContext(json.RawMessage(`{"transfer_instruction":"transfer_checked"}`))
	require.NoError(t, err)
	assert.Equal(t, "transferChecked", parsed.TransferInstruction)

	_, err = parseNetworkFeeTransactionContext(json.RawMessage(`{"transfer_instruction":"approve"}`))
	assert.ErrorIs(t, err, ErrInsufficientContext)

	_, err = parseNetworkFeeTransactionContext(json.RawMessage(`{"token_decimals":19}`))
	assert.Error(t, err)
}

func TestReadSolanaShortVecRejectsNonCanonicalEncoding(t *testing.T) {
	offset := 0
	_, err := readSolanaShortVec([]byte{0x80, 0x00}, &offset, 256)
	assert.Error(t, err)

	offset = 0
	value, err := readSolanaShortVec([]byte{0x80, 0x01}, &offset, 256)
	require.NoError(t, err)
	assert.Equal(t, 128, value)
	assert.Equal(t, 2, offset)
}

func TestNetworkFeePriceConsensusRejectsDisagreementAndGenericAmount(t *testing.T) {
	good := []networkFeePriceObservation{
		{price: decimal.RequireFromString("100"), timestamp: time.Unix(1_700_000_000, 0), source: "one"},
		{price: decimal.RequireFromString("102"), timestamp: time.Unix(1_700_000_000, 0), source: "two"},
	}
	require.NoError(t, validateNetworkFeePriceConsensus(good, decimal.NewFromInt(5)))
	bad := []networkFeePriceObservation{
		{price: decimal.RequireFromString("100"), timestamp: time.Unix(1_700_000_000, 0), source: "one"},
		{price: decimal.RequireFromString("130"), timestamp: time.Unix(1_700_000_000, 0), source: "two"},
	}
	assert.Error(t, validateNetworkFeePriceConsensus(bad, decimal.NewFromInt(10)))

	_, _, _, err := parseNetworkFeePriceForAsset(
		[]byte(`{"amount":"2000","currency":"USD","timestamp":1700000000}`),
		"ETH",
		"USD",
	)
	assert.Error(t, err)
}

func TestParseNetworkFeeChainConfigSupportsMultiplePriceURLs(t *testing.T) {
	chain, err := parseNetworkFeeChainConfig(json.RawMessage(`{"rpc_url":"https://rpc.example.test","price_urls":["https://one.example.test/price","https://two.example.test/price"],"price_allowed_hosts":["one.example.test","two.example.test"],"settlement_currency":"USD"}`), "ethereum")
	require.NoError(t, err)
	assert.Len(t, chain.PriceURLs, 2)
	assert.Equal(t, "https://one.example.test/price", chain.PriceURLs[0])
}
