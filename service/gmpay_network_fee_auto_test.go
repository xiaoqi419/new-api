package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type builtinEstimatorRoundTripper func(*http.Request) (*http.Response, error)

func (fn builtinEstimatorRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func builtinResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header), Request: &http.Request{}}
}

func TestBuiltinNetworkFeeEstimatorEVM(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"ethereum":{"usd":3000,"cny":21000,"last_updated_at":%d}}`, now.Unix())), nil
		}
		body, _ := io.ReadAll(req.Body)
		var call networkFeeRPCRequest
		require.NoError(t, common.Unmarshal(body, &call))
		switch call.Method {
		case "eth_estimateGas":
			return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"result":"0x5208"}`), nil
		case "eth_gasPrice":
			return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"result":"0x3b9aca00"}`), nil
		case "eth_feeHistory":
			return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"error":{"code":-32601}}`), nil
		default:
			return builtinResponse(http.StatusNotFound, `{}`), nil
		}
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	quote, err := estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "ethereum", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)})
	require.NoError(t, err)
	assert.Equal(t, ChainNetworkEstimateSource, quote.Source)
	assert.Equal(t, "ETH", quote.NativeAsset)
	assert.Equal(t, "0.000021", quote.NativeAmount.String())
	assert.Equal(t, "0.063", quote.FeeAmount.String())
	assert.Equal(t, "10.063", quote.TotalAmount.String())
	assert.Equal(t, "eth_estimateGas", quote.Evidence.RPCMethod)
	assert.Equal(t, now.Unix(), quote.Evidence.PriceTimestamp)
}

func TestBuiltinNetworkFeeEstimatorTRON(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"tron":{"usd":0.1,"cny":0.7,"last_updated_at":%d}}`, now.Unix())), nil
		}
		switch req.URL.Path {
		case "/wallet/getaccountresource":
			return builtinResponse(http.StatusOK, `{"freeNetLimit":0,"freeNetUsed":0,"NetLimit":0,"NetUsed":0,"EnergyLimit":0,"EnergyUsed":0}`), nil
		case "/wallet/getchainparameters":
			return builtinResponse(http.StatusOK, `{"chainParameter":[{"key":"getEnergyFee","value":420},{"key":"getTransactionFee","value":1000}]}`), nil
		case "/wallet/estimateenergy":
			return builtinResponse(http.StatusOK, `{"energy_required":65000}`), nil
		default:
			return builtinResponse(http.StatusNotFound, `{}`), nil
		}
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	quote, err := estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)})
	require.NoError(t, err)
	assert.Equal(t, "TRX", quote.NativeAsset)
	assert.Equal(t, "27.645", quote.NativeAmount.String())
	assert.Equal(t, "2.7645", quote.FeeAmount.String())
	assert.Contains(t, quote.Evidence.RPCMethods, "wallet/estimateenergy")
}

func TestBuiltinNetworkFeeEstimatorFailsClosedOnStalePrice(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"ethereum":{"usd":3000,"last_updated_at":%d}}`, now.Add(-time.Hour).Unix())), nil
		}
		return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"result":"0x5208"}`), nil
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "ethereum", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(1)})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
}

func TestBuiltinNetworkFeeEstimatorSolanaTransfer(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"solana":{"usd":150,"cny":1050,"last_updated_at":%d}}`, now.Unix())), nil
		}
		body, _ := io.ReadAll(req.Body)
		var call networkFeeRPCRequest
		require.NoError(t, common.Unmarshal(body, &call))
		if call.Method != "getFeeForMessage" {
			return builtinResponse(http.StatusNotFound, `{}`), nil
		}
		return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":123},"value":5000}}`), nil
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	quote, err := estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDC", Network: "solana", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)})
	require.NoError(t, err)
	assert.Equal(t, "SOL", quote.NativeAsset)
	assert.Equal(t, "0.000005", quote.NativeAmount.String())
	assert.Equal(t, "0.00075", quote.FeeAmount.String())
	assert.Equal(t, uint64(123), quote.Evidence.Slot)
}
