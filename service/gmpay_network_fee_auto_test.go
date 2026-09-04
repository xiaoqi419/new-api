package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
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

func TestBuiltinNetworkFeeEstimatorEVMSyntheticSenderFallback(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"ethereum":{"usd":3000,"last_updated_at":%d}}`, now.Unix())), nil
		}
		body, _ := io.ReadAll(req.Body)
		var call networkFeeRPCRequest
		require.NoError(t, common.Unmarshal(body, &call))
		switch call.Method {
		case "eth_estimateGas":
			return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"error":{"code":-32000}}`), nil
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
	estimator.quoteMode = GMPayQuoteModeSimulateThenEmpirical
	quote, err := estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "ethereum", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)})
	require.NoError(t, err)
	assert.Equal(t, "0.000065", quote.NativeAmount.String())
	assert.Equal(t, "0.195", quote.FeeAmount.String())
	assert.Equal(t, "65000", quote.Evidence.Gas)
	assert.Equal(t, "medium", quote.Confidence)
}

func TestBuiltinNetworkFeeEstimatorTRON(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	var contractAddress string
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
			var payload struct {
				ContractAddress string `json:"contract_address"`
			}
			require.NoError(t, common.DecodeJson(req.Body, &payload))
			contractAddress = payload.ContractAddress
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
	assert.Equal(t, "api.tronstack.io", quote.Evidence.RPCSource)
	assert.True(t, quote.FeeAmount.IsPositive())
	assert.Equal(t, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", contractAddress)
}

func TestBuiltinNetworkFeeEstimatorTRONFailsOverRateLimitedRPC(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	var rpcHosts []string
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"tron":{"usd":0.1,"last_updated_at":%d}}`, now.Unix())), nil
		}
		rpcHosts = append(rpcHosts, req.URL.Hostname())
		if req.URL.Hostname() == "api.tronstack.io" {
			return builtinResponse(http.StatusTooManyRequests, `{}`), nil
		}
		switch req.URL.Path {
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
	quote, err := estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(1)})
	require.NoError(t, err)
	assert.Equal(t, "tron-rpc.publicnode.com", quote.Evidence.RPCSource)
	assert.Equal(t, "2.7645", quote.FeeAmount.String())
	assert.Equal(t, []string{"api.tronstack.io", "tron-rpc.publicnode.com", "tron-rpc.publicnode.com"}, rpcHosts)
}

func TestBuiltinNetworkFeeEstimatorTRONFailsOverSimulationRPC(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	var rpcRequests []string
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"tron":{"usd":0.1,"last_updated_at":%d}}`, now.Unix())), nil
		}
		host := req.URL.Hostname()
		rpcRequests = append(rpcRequests, host+req.URL.Path)
		if host == "api.tronstack.io" && (req.URL.Path == "/wallet/estimateenergy" || req.URL.Path == "/wallet/triggerconstantcontract") {
			return builtinResponse(http.StatusBadGateway, `{}`), nil
		}
		switch req.URL.Path {
		case "/wallet/getchainparameters":
			return builtinResponse(http.StatusOK, `{"chainParameter":[{"key":"getEnergyFee","value":420},{"key":"getTransactionFee","value":1000}]}`), nil
		case "/wallet/estimateenergy":
			return builtinResponse(http.StatusOK, `{"energy_required":70000}`), nil
		default:
			return builtinResponse(http.StatusNotFound, `{}`), nil
		}
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	quote, err := estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(1)})
	require.NoError(t, err)
	assert.Equal(t, "tron-rpc.publicnode.com", quote.Evidence.RPCSource)
	assert.Equal(t, "70000", quote.Evidence.Energy)
	assert.Contains(t, rpcRequests, "api.tronstack.io/wallet/estimateenergy")
	assert.Contains(t, rpcRequests, "api.tronstack.io/wallet/triggerconstantcontract")
}

func TestBuiltinNetworkFeeEstimatorTRONFailsClosedWhenAllRPCsAreRateLimited(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	var rpcCalls int
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"tron":{"usd":0.1,"last_updated_at":%d}}`, now.Unix())), nil
		}
		rpcCalls++
		return builtinResponse(http.StatusTooManyRequests, `{}`), nil
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(1)})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
	assert.Equal(t, 3, rpcCalls)
}

func TestParseTRONChainFeesMatchesTronGridResponse(t *testing.T) {
	// TronGrid includes a long list of chain parameters. Some deployments
	// return unrelated entries without a value (or with a negative value), but
	// the two burn-price parameters remain ordinary integer values.
	raw := json.RawMessage(`{
		"chainParameter": [
			{"key":"getMaintenanceTimeInterval","value":21600000},
			{"key":"getMaxCpuTimeOfOneTx"},
			{"key":"getAllowTvmTransfer_TRC10","value":-1},
			{"key":"getEnergyFee","value":420},
			{"key":"getTransactionFee","value":1000},
			{"key":"getMemoFee","value":"not-a-burn-price"}
		]
	}`)
	energyFee, bandwidthFee, err := parseTRONChainFees(raw)
	require.NoError(t, err)
	assert.Equal(t, "420", energyFee.String())
	assert.Equal(t, "1000", bandwidthFee.String())
}

func TestParseTRONChainFeesFailsClosedWhenTargetIsMissingOrInvalid(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "missing energy fee", body: `{"chainParameter":[{"key":"getTransactionFee","value":1000}]}`},
		{name: "missing transaction fee", body: `{"chainParameter":[{"key":"getEnergyFee","value":420}]}`},
		{name: "negative energy fee", body: `{"chainParameter":[{"key":"getEnergyFee","value":-1},{"key":"getTransactionFee","value":1000}]}`},
		{name: "invalid transaction fee", body: `{"chainParameter":[{"key":"getEnergyFee","value":420},{"key":"getTransactionFee","value":"invalid"}]}`},
		{name: "missing transaction value", body: `{"chainParameter":[{"key":"getEnergyFee","value":420},{"key":"getTransactionFee"}]}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, _, err := parseTRONChainFees(json.RawMessage(test.body))
			require.Error(t, err)
		})
	}
}

func TestBuiltinTransferContextTRONUSDCUsesCanonicalContract(t *testing.T) {
	transaction, err := builtinTransferContext("tron", "USDC")
	require.NoError(t, err)
	assert.Equal(t, "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", transaction.TokenContract)
	assert.True(t, IsGMPayAddress("tron", transaction.TokenContract))
}

func TestBuiltinNetworkFeeEstimatorTRONUsesEmpiricalEnergyWhenSimulationUnavailable(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"tron":{"usd":0.1,"last_updated_at":%d}}`, now.Unix())), nil
		}
		switch req.URL.Path {
		case "/wallet/getchainparameters":
			return builtinResponse(http.StatusOK, `{"chainParameter":[{"key":"getEnergyFee","value":420},{"key":"getTransactionFee","value":1000}]}`), nil
		case "/wallet/estimateenergy", "/wallet/triggerconstantcontract":
			return builtinResponse(http.StatusBadGateway, `{}`), nil
		default:
			return builtinResponse(http.StatusNotFound, `{}`), nil
		}
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	estimator.quoteMode = GMPayQuoteModeEmpirical
	quote, err := estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)})
	require.NoError(t, err)
	assert.Equal(t, "64285", quote.Evidence.Energy)
	assert.Equal(t, "345", quote.Evidence.Bandwidth)
	assert.Equal(t, "27.3447", quote.NativeAmount.String())
	assert.Contains(t, quote.Evidence.RPCMethods, builtinTRONEmpiricalEnergyMethod)
	assert.NotContains(t, quote.Evidence.RPCMethods, "wallet/estimateenergy")
	assert.NotContains(t, quote.Evidence.RPCMethods, "wallet/triggerconstantcontract")
}

func TestBuiltinNetworkFeeEstimatorTRONRejectsRevertedSimulationEnergy(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"tron":{"usd":0.326,"last_updated_at":%d}}`, now.Unix())), nil
		}
		switch req.URL.Path {
		case "/wallet/getchainparameters":
			return builtinResponse(http.StatusOK, `{"chainParameter":[{"key":"getEnergyFee","value":100},{"key":"getTransactionFee","value":1000}]}`), nil
		case "/wallet/estimateenergy":
			return builtinResponse(http.StatusOK, `{"result":{"code":"CONTRACT_VALIDATE_ERROR","message":"this node does not support estimate energy"}}`), nil
		case "/wallet/triggerconstantcontract":
			return builtinResponse(http.StatusOK, `{
				"result":{"result":true,"message":"REVERT opcode executed"},
				"energy_used":8624,
				"energy_penalty":6640,
				"transaction":{"ret":[{"ret":"FAILED"}]}
			}`), nil
		default:
			return builtinResponse(http.StatusNotFound, `{}`), nil
		}
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	estimator.quoteMode = GMPayQuoteModeSimulate
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(1)})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
}

func TestBuiltinNetworkFeeEstimatorTRONSimulateModeDoesNotUseEmpiricalEnergy(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"tron":{"usd":0.326,"last_updated_at":%d}}`, now.Unix())), nil
		}
		switch req.URL.Path {
		case "/wallet/getchainparameters":
			return builtinResponse(http.StatusOK, `{"chainParameter":[{"key":"getEnergyFee","value":100},{"key":"getTransactionFee","value":1000}]}`), nil
		case "/wallet/estimateenergy", "/wallet/triggerconstantcontract":
			return builtinResponse(http.StatusBadGateway, `{}`), nil
		default:
			return builtinResponse(http.StatusNotFound, `{}`), nil
		}
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	estimator.quoteMode = GMPayQuoteModeSimulate
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(1)})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
}

func TestBuiltinNetworkFeeEstimatorTRONEmpiricalModeSkipsSimulation(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	var paths []string
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"tron":{"usd":0.326,"last_updated_at":%d}}`, now.Unix())), nil
		}
		paths = append(paths, req.URL.Path)
		switch req.URL.Path {
		case "/wallet/getchainparameters":
			return builtinResponse(http.StatusOK, `{"chainParameter":[{"key":"getEnergyFee","value":100},{"key":"getTransactionFee","value":1000}]}`), nil
		default:
			return builtinResponse(http.StatusInternalServerError, `{}`), nil
		}
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	estimator.quoteMode = GMPayQuoteModeEmpirical
	quote, err := estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(1)})
	require.NoError(t, err)
	assert.Equal(t, "64285", quote.Evidence.Energy)
	assert.Equal(t, "6.7735", quote.NativeAmount.String())
	assert.Contains(t, quote.Evidence.RPCMethods, builtinTRONEmpiricalEnergyMethod)
	assert.NotContains(t, paths, "/wallet/estimateenergy")
	assert.NotContains(t, paths, "/wallet/triggerconstantcontract")
}

func TestBuiltinNetworkFeeEstimatorEVMSimulateModeDoesNotUseEmpiricalGas(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"ethereum":{"usd":3000,"last_updated_at":%d}}`, now.Unix())), nil
		}
		body, _ := io.ReadAll(req.Body)
		var call networkFeeRPCRequest
		require.NoError(t, common.Unmarshal(body, &call))
		if call.Method == "eth_estimateGas" {
			return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"error":{"code":-32000}}`), nil
		}
		return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"result":"0x3b9aca00"}`), nil
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	estimator.quoteMode = GMPayQuoteModeSimulate
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "ethereum", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
}

func TestBuiltinNetworkFeeEstimatorEVMEmpiricalModeSkipsEstimateGas(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	var methods []string
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"ethereum":{"usd":3000,"last_updated_at":%d}}`, now.Unix())), nil
		}
		body, _ := io.ReadAll(req.Body)
		var call networkFeeRPCRequest
		require.NoError(t, common.Unmarshal(body, &call))
		methods = append(methods, call.Method)
		if call.Method == "eth_estimateGas" {
			return builtinResponse(http.StatusInternalServerError, `{}`), nil
		}
		return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"result":"0x3b9aca00"}`), nil
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	estimator.quoteMode = GMPayQuoteModeEmpirical
	quote, err := estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "ethereum", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)})
	require.NoError(t, err)
	assert.Equal(t, "65000", quote.Evidence.Gas)
	assert.Contains(t, quote.Evidence.RPCMethods, builtinEVMEmpiricalGasMethod)
	assert.NotContains(t, methods, "eth_estimateGas")
}

func TestBuiltinNetworkFeeEstimatorSolanaEmpiricalModeSkipsFeeForMessage(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	var methods []string
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"solana":{"usd":150,"last_updated_at":%d}}`, now.Unix())), nil
		}
		body, _ := io.ReadAll(req.Body)
		var call networkFeeRPCRequest
		require.NoError(t, common.Unmarshal(body, &call))
		methods = append(methods, call.Method)
		return builtinResponse(http.StatusInternalServerError, `{}`), nil
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	estimator.quoteMode = GMPayQuoteModeEmpirical
	quote, err := estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "solana", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)})
	require.NoError(t, err)
	assert.Equal(t, "5000", quote.Evidence.Lamports)
	assert.Equal(t, builtinSolanaEmpiricalFeeMethod, quote.Evidence.RPCMethod)
	assert.NotContains(t, methods, "getFeeForMessage")
	assert.NotContains(t, methods, "getLatestBlockhash")
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
	var methods []string
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"solana":{"usd":150,"cny":1050,"last_updated_at":%d}}`, now.Unix())), nil
		}
		body, _ := io.ReadAll(req.Body)
		var call networkFeeRPCRequest
		require.NoError(t, common.Unmarshal(body, &call))
		methods = append(methods, call.Method)
		if call.Method == "getLatestBlockhash" {
			return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":456},"value":{"blockhash":"So11111111111111111111111111111111111111112","lastValidBlockHeight":10}}}`), nil
		}
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
	assert.Equal(t, uint64(456), quote.Evidence.Slot)
	assert.Equal(t, []string{"getLatestBlockhash", "getFeeForMessage"}, methods)
	assert.Equal(t, []string{"getLatestBlockhash", "getFeeForMessage"}, quote.Evidence.RPCMethods)
}

func TestBuiltinNetworkFeeEstimatorSolanaRefreshesNetworkFeeForEveryQuote(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	latestBlockhashCalls := 0
	feeForMessageCalls := 0
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"solana":{"usd":150,"last_updated_at":%d}}`, now.Unix())), nil
		}
		body, _ := io.ReadAll(req.Body)
		var call networkFeeRPCRequest
		require.NoError(t, common.Unmarshal(body, &call))
		switch call.Method {
		case "getLatestBlockhash":
			latestBlockhashCalls++
			return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":456},"value":{"blockhash":"So11111111111111111111111111111111111111112","lastValidBlockHeight":10}}}`), nil
		case "getFeeForMessage":
			feeForMessageCalls++
			return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":123},"value":5000}}`), nil
		default:
			return builtinResponse(http.StatusNotFound, `{}`), nil
		}
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	input := NetworkFeeEstimateInput{Token: "USDC", Network: "solana", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)}
	_, err = estimator.Estimate(context.Background(), input)
	require.NoError(t, err)
	_, err = estimator.Estimate(context.Background(), input)
	require.NoError(t, err)
	assert.Equal(t, 2, latestBlockhashCalls)
	assert.Equal(t, 2, feeForMessageCalls)
}

func TestBuiltinNetworkFeeEstimatorSolanaFailsOnInvalidBlockhash(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"solana":{"usd":150,"last_updated_at":%d}}`, now.Unix())), nil
		}
		return builtinResponse(http.StatusOK, `{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":1},"value":{"blockhash":"invalid"}}}`), nil
	})
	estimator, err := NewBuiltinNetworkFeeEstimatorWithClock(&http.Client{Transport: transport}, func() time.Time { return now })
	require.NoError(t, err)
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "solana", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(1)})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
}

func TestBuiltinNetworkFeeEstimatorCoinPaprikaFallbackAfterPrimaryRateLimit(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	primaryCalls, fallbackCalls := 0, 0
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			switch req.URL.Host {
			case "api.coingecko.com":
				primaryCalls++
				return builtinResponse(http.StatusTooManyRequests, `{}`), nil
			case "api.coinpaprika.com":
				fallbackCalls++
				return builtinResponse(http.StatusOK, fmt.Sprintf(`{"id":"trx-tron","symbol":"TRX","last_updated":%q,"quotes":{"USD":{"price":0.1},"CNY":{"price":0.7}}}`, now.Format(time.RFC3339))), nil
			}
		}
		switch req.URL.Path {
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
	assert.Equal(t, "api.coinpaprika.com", quote.Evidence.PriceSource)
	assert.Equal(t, "2.7645", quote.FeeAmount.String())
	assert.Equal(t, 1, primaryCalls)
	assert.Equal(t, 1, fallbackCalls)
}

func TestParseCoinPaprikaPriceSupportsUSDAndCNY(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	body := []byte(fmt.Sprintf(`{"id":"eth-ethereum","symbol":"ETH","last_updated":%q,"quotes":{"USD":{"price":3000},"CNY":{"price":21000}}}`, now.Format(time.RFC3339)))
	price, timestamp, currency, err := parseNetworkFeePriceForAsset(body, "ETH", "CNY")
	require.NoError(t, err)
	assert.Equal(t, "21000", price.String())
	assert.Equal(t, now, timestamp)
	assert.Empty(t, currency)
}

func TestParseCoinPaprikaPriceRequiresNetworkIdentity(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	cases := []struct {
		name string
		body []byte
	}{
		{name: "missing id", body: []byte(fmt.Sprintf(`{"symbol":"TRX","last_updated":%q,"quotes":{"USD":{"price":0.1}}}`, now.Format(time.RFC3339)))},
		{name: "missing symbol", body: []byte(fmt.Sprintf(`{"id":"trx-tron","last_updated":%q,"quotes":{"USD":{"price":0.1}}}`, now.Format(time.RFC3339)))},
		{name: "wrong asset id", body: []byte(fmt.Sprintf(`{"id":"eth-ethereum","symbol":"TRX","last_updated":%q,"quotes":{"USD":{"price":0.1}}}`, now.Format(time.RFC3339)))},
		{name: "wrong asset symbol", body: []byte(fmt.Sprintf(`{"id":"trx-tron","symbol":"ETH","last_updated":%q,"quotes":{"USD":{"price":0.1}}}`, now.Format(time.RFC3339)))},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			_, _, _, err := parseBuiltinCoinPaprikaPrice(testCase.body, "tron", "USD", now, 2*time.Minute, nil)
			require.Error(t, err)
		})
	}
}

func TestParseCoinPaprikaPriceRequiresSelectedQuotePrice(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	timestamp := now.Format(time.RFC3339)
	cases := []struct {
		name string
		body string
	}{
		{
			name: "missing quotes object",
			body: fmt.Sprintf(`{"id":"trx-tron","symbol":"TRX","last_updated":%q,"price":0.1}`, timestamp),
		},
		{
			name: "missing selected currency",
			body: fmt.Sprintf(`{"id":"trx-tron","symbol":"TRX","last_updated":%q,"quotes":{"CNY":{"price":0.7}}}`, timestamp),
		},
		{
			name: "missing selected quote price",
			body: fmt.Sprintf(`{"id":"trx-tron","symbol":"TRX","last_updated":%q,"quotes":{"USD":{}}}`, timestamp),
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			_, _, _, err := parseBuiltinCoinPaprikaPrice([]byte(testCase.body), "tron", "USD", now, 2*time.Minute, nil)
			require.Error(t, err)
		})
	}
}

func TestBuiltinNetworkFeeEstimatorPriceCacheAvoidsRepeatedMarketRequests(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	priceCalls := 0
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			priceCalls++
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"tron":{"usd":0.1,"last_updated_at":%d}}`, now.Unix())), nil
		}
		switch req.URL.Path {
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
	for _, amount := range []int64{10, 11} {
		_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(amount)})
		require.NoError(t, err)
	}
	assert.Equal(t, 1, priceCalls)
}

func TestBuiltinNetworkFeeEstimatorMergesConcurrentPriceRequests(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	var priceCalls atomic.Int32
	priceEntered := make(chan struct{})
	releasePrice := make(chan struct{})
	var firstPriceRequest sync.Once
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			priceCalls.Add(1)
			firstPriceRequest.Do(func() {
				close(priceEntered)
				<-releasePrice
			})
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"tron":{"usd":0.1,"last_updated_at":%d}}`, now.Unix())), nil
		}
		switch req.URL.Path {
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
	input := NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)}
	const callers = 8
	errs := make(chan error, callers)
	var group sync.WaitGroup
	group.Add(callers)
	for i := 0; i < callers; i++ {
		go func() {
			defer group.Done()
			_, estimateErr := estimator.Estimate(context.Background(), input)
			errs <- estimateErr
		}()
	}
	select {
	case <-priceEntered:
		close(releasePrice)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for the first price request")
	}
	group.Wait()
	close(errs)
	for estimateErr := range errs {
		require.NoError(t, estimateErr)
	}
	assert.Equal(t, int32(1), priceCalls.Load())
}

func TestBuiltinNetworkFeeEstimatorRejectsMismatchedCoinPaprikaFallback(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			if req.URL.Host == "api.coingecko.com" {
				return builtinResponse(http.StatusTooManyRequests, `{}`), nil
			}
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"id":"eth-ethereum","symbol":"ETH","last_updated":%q,"quotes":{"USD":{"price":3000}}}`, now.Format(time.RFC3339))), nil
		}
		switch req.URL.Path {
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
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
}

func TestBuiltinNetworkFeeEstimatorRejectsNonPositiveFallbackPrice(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	transport := builtinEstimatorRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.Method == http.MethodGet {
			if req.URL.Host == "api.coingecko.com" {
				return builtinResponse(http.StatusTooManyRequests, `{}`), nil
			}
			return builtinResponse(http.StatusOK, fmt.Sprintf(`{"id":"trx-tron","symbol":"TRX","last_updated":%q,"quotes":{"USD":{"price":0}}}`, now.Format(time.RFC3339))), nil
		}
		switch req.URL.Path {
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
	_, err = estimator.Estimate(context.Background(), NetworkFeeEstimateInput{Token: "USDT", Network: "tron", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(10)})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNetworkFeeUnavailable)
}
