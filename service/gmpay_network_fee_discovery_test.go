package service

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDiscoverGMPayNetworkFeeEstimatorConfigUsesAuthenticatedCapability(t *testing.T) {
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case gmpayConfigPath:
			_, _ = w.Write([]byte(`{"status_code":200,"message":"success","data":{"network_fee_context":true,"supported_assets":[{"network":"tron","tokens":["USDT"]}]}}`))
		case gmpayNetworkFeeContextPath:
			_, _ = w.Write([]byte(fmt.Sprintf(`{"status_code":200,"message":"success","data":{"version":1,"dynamic_enabled":true,"chains":{"tron":{"rpc_url":%q,"price_url":%q,"native_asset":"TRX","settlement_currency":"USD","transaction":{"from":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","to":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token_contract":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","calldata":"a9059cbb","function_selector":"transfer(address,uint256)"}}}}}`, server.URL, server.URL+"/price")))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, err := NewGMPayClient(server.URL, "pid", "secret", server.Client())
	require.NoError(t, err)
	config, err := client.discoverNetworkFeeEstimatorConfig(context.Background())
	require.NoError(t, err)
	require.True(t, config.DynamicEnabled)
	require.Contains(t, config.Chains, "tron")
	require.Equal(t, "TRX", config.Chains["tron"].NativeAsset)
}

func TestDiscoverGMPayNetworkFeeEstimatorConfigFailsWhenCapabilityMissing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"status_code":200,"message":"success","data":{"supported_assets":[]}}`))
	}))
	defer server.Close()

	client, err := NewGMPayClient(server.URL, "pid", "secret", server.Client())
	require.NoError(t, err)
	_, err = client.discoverNetworkFeeEstimatorConfig(context.Background())
	require.ErrorIs(t, err, ErrGMPayNetworkFeeCapabilityUnavailable)
}

func TestDiscoverGMPayNetworkFeeEstimatorConfigRetriesAndCaches(t *testing.T) {
	var server *httptest.Server
	var configCalls, contextCalls atomic.Int32
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case gmpayConfigPath:
			configCalls.Add(1)
			_, _ = w.Write([]byte(`{"status_code":200,"message":"success","data":{"network_fee_context":true}}`))
		case gmpayNetworkFeeContextPath:
			if contextCalls.Add(1) == 1 {
				http.Error(w, "temporary", http.StatusBadGateway)
				return
			}
			_, _ = w.Write([]byte(fmt.Sprintf(`{"status_code":200,"message":"success","data":{"version":1,"dynamic_enabled":true,"chains":{"tron":{"rpc_url":%q,"price_url":%q,"native_asset":"TRX","settlement_currency":"USD","transaction":{"from":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","to":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token_contract":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","calldata":"a9059cbb","function_selector":"transfer(address,uint256)"}}}}}`, server.URL, server.URL+"/price")))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, err := NewGMPayClient(server.URL, "retry-pid", "secret", server.Client())
	require.NoError(t, err)
	_, err = DiscoverGMPayNetworkFeeEstimatorFromClient(context.Background(), client)
	require.NoError(t, err)
	_, err = DiscoverGMPayNetworkFeeEstimatorFromClient(context.Background(), client)
	require.NoError(t, err)
	require.Equal(t, int32(1), configCalls.Load())
	require.Equal(t, int32(2), contextCalls.Load())
}
