package controller

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type gmpayEstimatorPriorityStub struct{ name string }

func (stub gmpayEstimatorPriorityStub) Estimate(context.Context, service.NetworkFeeEstimateInput) (service.NetworkFeeQuote, error) {
	return service.NetworkFeeQuote{}, errors.New(stub.name)
}

type gmpayEstimatorQuoteStub struct{ quote service.NetworkFeeQuote }

func (stub gmpayEstimatorQuoteStub) Estimate(context.Context, service.NetworkFeeEstimateInput) (service.NetworkFeeQuote, error) {
	return stub.quote, nil
}

type gmpayEstimatorCountingStub struct {
	calls *atomic.Int32
	quote service.NetworkFeeQuote
	err   error
}

func (stub gmpayEstimatorCountingStub) Estimate(context.Context, service.NetworkFeeEstimateInput) (service.NetworkFeeQuote, error) {
	if stub.calls != nil {
		stub.calls.Add(1)
	}
	return stub.quote, stub.err
}

func gmpayTestNetworkFeeQuote(fee string) service.NetworkFeeQuote {
	now := time.Now().UTC()
	return service.NetworkFeeQuote{
		Token:              "USDT",
		Network:            "tron",
		SettlementCurrency: "USD",
		BaseAmount:         decimal.NewFromInt(10),
		FeeAmount:          decimal.RequireFromString(fee),
		TotalAmount:        decimal.NewFromInt(10).Add(decimal.RequireFromString(fee)),
		NativeAsset:        "TRX",
		NativeAmount:       decimal.NewFromFloat(0.1),
		Source:             service.GMPayFeeSourceChainNetworkEstimate,
		EstimatorVersion:   "test",
		QuotedAt:           now.Add(-time.Second),
		ExpiresAt:          now.Add(time.Minute),
		Evidence: service.NetworkFeeEvidence{
			RPCMethod:      "wallet/estimateenergy",
			RPCSource:      "api.trongrid.io",
			PriceSource:    "api.coingecko.com",
			PriceTimestamp: now.Unix(),
		},
	}
}

func TestGMPayWalletAutomaticEstimatorFallback(t *testing.T) {
	previousOptions := common.OptionMap
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	previousClientFactory := newGMPayNativeClient
	previousDiscovery := discoverGMPayNetworkFeeEstimatorFromClient
	previousAutomatic := newAutomaticGMPayNetworkFeeEstimator
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		newGMPayNativeClient = previousClientFactory
		discoverGMPayNetworkFeeEstimatorFromClient = previousDiscovery
		newAutomaticGMPayNetworkFeeEstimator = previousAutomatic
		resetCachedAutomaticGMPayNetworkFeeEstimator()
	})
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{service.GMPayFeeConfigOptionKey: `{"version":1}`}
	common.OptionMapRWMutex.Unlock()
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	newGMPayNativeClient = func(string, string, string) (*service.GMPayClient, error) {
		return &service.GMPayClient{}, nil
	}
	epCfg := tenantEpayConfig{Enabled: true, Client: buildEpayClient("https://pay.example.test", "pid", "secret")}
	require.NotNil(t, epCfg.Client)

	t.Run("private success does not construct builtin", func(t *testing.T) {
		resetCachedAutomaticGMPayNetworkFeeEstimator()
		var privateCalls, builtinConstructs atomic.Int32
		private := gmpayEstimatorCountingStub{calls: &privateCalls, quote: gmpayTestNetworkFeeQuote("1")}
		discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
			return private, nil
		}
		newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) {
			builtinConstructs.Add(1)
			return gmpayEstimatorCountingStub{quote: gmpayTestNetworkFeeQuote("2")}, nil
		}

		quote, err := quoteGMPayWalletFee(context.Background(), epCfg, decimal.NewFromInt(10), "USDT", "tron")
		require.NoError(t, err)
		assert.Equal(t, service.GMPayFeeSourceChainNetworkEstimate, quote.Source)
		assert.Equal(t, int32(1), privateCalls.Load())
		assert.Equal(t, int32(0), builtinConstructs.Load())
	})

	t.Run("private estimate failure retries builtin", func(t *testing.T) {
		resetCachedAutomaticGMPayNetworkFeeEstimator()
		var privateCalls, builtinCalls atomic.Int32
		private := gmpayEstimatorCountingStub{calls: &privateCalls, err: errors.New("private estimate failed")}
		builtin := gmpayEstimatorCountingStub{calls: &builtinCalls, quote: gmpayTestNetworkFeeQuote("2")}
		discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
			return private, nil
		}
		newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) {
			return builtin, nil
		}

		quote, err := quoteGMPayWalletFee(context.Background(), epCfg, decimal.NewFromInt(10), "USDT", "tron")
		require.NoError(t, err)
		assert.Equal(t, service.GMPayFeeSourceChainNetworkEstimate, quote.Source)
		assert.Equal(t, int32(1), privateCalls.Load())
		assert.Equal(t, int32(1), builtinCalls.Load())
	})

	t.Run("private discovery failure uses builtin directly", func(t *testing.T) {
		resetCachedAutomaticGMPayNetworkFeeEstimator()
		var discoveryCalls, builtinCalls atomic.Int32
		builtin := gmpayEstimatorCountingStub{calls: &builtinCalls, quote: gmpayTestNetworkFeeQuote("3")}
		discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
			discoveryCalls.Add(1)
			return nil, errors.New("private discovery failed")
		}
		newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) {
			return builtin, nil
		}

		quote, err := quoteGMPayWalletFee(context.Background(), epCfg, decimal.NewFromInt(10), "USDT", "tron")
		require.NoError(t, err)
		assert.Equal(t, service.GMPayFeeSourceChainNetworkEstimate, quote.Source)
		assert.Equal(t, int32(1), discoveryCalls.Load())
		assert.Equal(t, int32(1), builtinCalls.Load())
	})
}

func TestGMPayWalletDynamicFailureUsesAdministratorFallback(t *testing.T) {
	previousOptions := common.OptionMap
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	previousClientFactory := newGMPayNativeClient
	previousDiscovery := discoverGMPayNetworkFeeEstimatorFromClient
	previousAutomatic := newAutomaticGMPayNetworkFeeEstimator
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		newGMPayNativeClient = previousClientFactory
		discoverGMPayNetworkFeeEstimatorFromClient = previousDiscovery
		newAutomaticGMPayNetworkFeeEstimator = previousAutomatic
		resetCachedAutomaticGMPayNetworkFeeEstimator()
	})

	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	epCfg := tenantEpayConfig{Enabled: true, Client: buildEpayClient("https://pay.example.test", "pid", "secret")}
	require.NotNil(t, epCfg.Client)
	privateClient, err := service.NewGMPayClient("https://pay.example.test", "pid", "secret", http.DefaultClient)
	require.NoError(t, err)
	newGMPayNativeClient = func(string, string, string) (*service.GMPayClient, error) {
		return privateClient, nil
	}
	failingEstimator := gmpayEstimatorCountingStub{err: errors.New("simulated dynamic outage")}
	discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
		return failingEstimator, nil
	}
	newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) {
		return failingEstimator, nil
	}

	tests := []struct {
		name      string
		config    string
		wantFee   string
		wantTotal string
	}{
		{
			name:      "fixed",
			config:    `{"version":1,"fallback_enabled":true,"fallback_mode":"fixed","fallback_value":"5","max_fee":"20","max_total":"100000"}`,
			wantFee:   "5.00",
			wantTotal: "35.00",
		},
		{
			name:      "percent",
			config:    `{"version":1,"fallback_enabled":true,"fallback_mode":"percent","fallback_value":"10","max_fee":"20","max_total":"100000"}`,
			wantFee:   "3.00",
			wantTotal: "33.00",
		},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			common.OptionMapRWMutex.Lock()
			common.OptionMap = map[string]string{service.GMPayFeeConfigOptionKey: testCase.config}
			common.OptionMapRWMutex.Unlock()
			resetCachedAutomaticGMPayNetworkFeeEstimator()

			quote, err := quoteGMPayWalletFee(context.Background(), epCfg, decimal.NewFromInt(30), "USDT", "tron")
			require.NoError(t, err)
			assert.Equal(t, service.GMPayFeeSourceAdminFallback, quote.Source)
			assert.Equal(t, testCase.wantFee, quote.FeeAmount.StringFixed(2))
			assert.Equal(t, testCase.wantTotal, quote.TotalAmount.StringFixed(2))
			assert.Equal(t, "USD", quote.SettlementCurrency)
		})
	}
}

func TestGMPayWalletQuoteModeSimulateIgnoresAdministratorFallback(t *testing.T) {
	previousOptions := common.OptionMap
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	previousClientFactory := newGMPayNativeClient
	previousDiscovery := discoverGMPayNetworkFeeEstimatorFromClient
	previousAutomatic := newAutomaticGMPayNetworkFeeEstimator
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		newGMPayNativeClient = previousClientFactory
		discoverGMPayNetworkFeeEstimatorFromClient = previousDiscovery
		newAutomaticGMPayNetworkFeeEstimator = previousAutomatic
		resetCachedAutomaticGMPayNetworkFeeEstimator()
	})
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	epCfg := tenantEpayConfig{Enabled: true, Client: buildEpayClient("https://pay.example.test", "pid", "secret")}
	failingEstimator := gmpayEstimatorCountingStub{err: errors.New("simulated dynamic outage")}
	discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
		return failingEstimator, nil
	}
	newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) {
		return failingEstimator, nil
	}
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{
		service.GMPayFeeConfigOptionKey: `{"version":1,"quote_mode":"simulate","fallback_enabled":true,"fallback_mode":"fixed","fallback_value":"5","max_fee":"20","max_total":"100000"}`,
	}
	common.OptionMapRWMutex.Unlock()
	_, err := quoteGMPayWalletFee(context.Background(), epCfg, decimal.NewFromInt(30), "USDT", "tron")
	require.Error(t, err)
	assert.ErrorIs(t, err, service.ErrGMPayFeeUnavailable)
}

func TestGMPayWalletQuoteModeAdminSkipsChainEstimate(t *testing.T) {
	previousOptions := common.OptionMap
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	previousDiscovery := discoverGMPayNetworkFeeEstimatorFromClient
	previousAutomatic := newAutomaticGMPayNetworkFeeEstimator
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		discoverGMPayNetworkFeeEstimatorFromClient = previousDiscovery
		newAutomaticGMPayNetworkFeeEstimator = previousAutomatic
		resetCachedAutomaticGMPayNetworkFeeEstimator()
	})
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	var estimateCalls atomic.Int32
	discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
		estimateCalls.Add(1)
		return gmpayEstimatorCountingStub{quote: gmpayTestNetworkFeeQuote("9")}, nil
	}
	newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) {
		estimateCalls.Add(1)
		return gmpayEstimatorCountingStub{quote: gmpayTestNetworkFeeQuote("9")}, nil
	}
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{
		service.GMPayFeeConfigOptionKey: `{"version":1,"quote_mode":"admin","fallback_enabled":true,"fallback_mode":"percent","fallback_value":"10","max_fee":"20","max_total":"100000"}`,
	}
	common.OptionMapRWMutex.Unlock()
	epCfg := tenantEpayConfig{Enabled: true, Client: buildEpayClient("https://pay.example.test", "pid", "secret")}
	quote, err := quoteGMPayWalletFee(context.Background(), epCfg, decimal.NewFromInt(30), "USDT", "tron")
	require.NoError(t, err)
	assert.Equal(t, service.GMPayFeeSourceAdminFallback, quote.Source)
	assert.Equal(t, "3.00", quote.FeeAmount.StringFixed(2))
	assert.Equal(t, int32(0), estimateCalls.Load())
}

func TestTestGMPayFeeEstimateUsesAdministratorFallback(t *testing.T) {
	previousOptions := common.OptionMap
	previousPayAddress := operation_setting.PayAddress
	previousEpayID := operation_setting.EpayId
	previousEpayKey := operation_setting.EpayKey
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	previousClientFactory := newGMPayNativeClient
	previousDiscovery := discoverGMPayNetworkFeeEstimatorFromClient
	previousAutomatic := newAutomaticGMPayNetworkFeeEstimator
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		// The optional gateway asset-discovery endpoint is unavailable. The test
		// estimate must still use the safe USDT/TRON default and can then use the
		// explicitly configured administrator fallback.
		writer.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(server.Close)
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		operation_setting.PayAddress = previousPayAddress
		operation_setting.EpayId = previousEpayID
		operation_setting.EpayKey = previousEpayKey
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		newGMPayNativeClient = previousClientFactory
		discoverGMPayNetworkFeeEstimatorFromClient = previousDiscovery
		newAutomaticGMPayNetworkFeeEstimator = previousAutomatic
		resetCachedAutomaticGMPayNetworkFeeEstimator()
	})

	operation_setting.PayAddress = server.URL
	operation_setting.EpayId = "gmpay-test-pid"
	operation_setting.EpayKey = "gmpay-test-secret"
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{service.GMPayFeeConfigOptionKey: `{"version":1,"fallback_enabled":true,"fallback_mode":"fixed","fallback_value":"5","max_fee":"20","max_total":"100000"}`}
	common.OptionMapRWMutex.Unlock()

	privateClient, err := service.NewGMPayClient(server.URL, operation_setting.EpayId, operation_setting.EpayKey, server.Client())
	require.NoError(t, err)
	newGMPayNativeClient = func(string, string, string) (*service.GMPayClient, error) {
		return privateClient, nil
	}
	failingEstimator := gmpayEstimatorCountingStub{err: errors.New("simulated dynamic outage")}
	discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
		return failingEstimator, nil
	}
	newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) {
		return failingEstimator, nil
	}
	resetCachedAutomaticGMPayNetworkFeeEstimator()

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/option/gmpay_fee/test", strings.NewReader(`{}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	TestGMPayFeeEstimate(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Token              string  `json:"token"`
			Network            string  `json:"network"`
			Source             string  `json:"source"`
			NativeAmount       *string `json:"native_amount"`
			FeeAmount          string  `json:"fee_amount"`
			BaseAmount         string  `json:"base_amount"`
			TotalAmount        string  `json:"total_amount"`
			SettlementCurrency string  `json:"settlement_currency"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Equal(t, "USDT", response.Data.Token)
	assert.Equal(t, "TRON", response.Data.Network)
	assert.Equal(t, service.GMPayFeeSourceAdminFallback, response.Data.Source)
	assert.Nil(t, response.Data.NativeAmount)
	assert.Equal(t, "1.00", response.Data.BaseAmount)
	assert.Equal(t, "5.00", response.Data.FeeAmount)
	assert.Equal(t, "6.00", response.Data.TotalAmount)
	assert.Equal(t, "USD", response.Data.SettlementCurrency)
}

func TestTestGMPayFeeEstimateReturnsDynamicNetworkFee(t *testing.T) {
	previousOptions := common.OptionMap
	previousPayAddress := operation_setting.PayAddress
	previousEpayID := operation_setting.EpayId
	previousEpayKey := operation_setting.EpayKey
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	previousClientFactory := newGMPayNativeClient
	previousDiscovery := discoverGMPayNetworkFeeEstimatorFromClient
	previousAutomatic := newAutomaticGMPayNetworkFeeEstimator
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet || request.URL.Path != "/payments/gmpay/v1/config" {
			writer.WriteHeader(http.StatusNotFound)
			return
		}
		_, _ = writer.Write([]byte(`{"status_code":200,"message":"success","data":{"supported_assets":[{"network":"tron","display_name":"TRON","tokens":["USDT"]}]}}`))
	}))
	t.Cleanup(server.Close)
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		operation_setting.PayAddress = previousPayAddress
		operation_setting.EpayId = previousEpayID
		operation_setting.EpayKey = previousEpayKey
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		newGMPayNativeClient = previousClientFactory
		discoverGMPayNetworkFeeEstimatorFromClient = previousDiscovery
		newAutomaticGMPayNetworkFeeEstimator = previousAutomatic
		resetCachedAutomaticGMPayNetworkFeeEstimator()
	})

	operation_setting.PayAddress = server.URL
	operation_setting.EpayId = "gmpay-test-pid"
	operation_setting.EpayKey = "gmpay-test-secret"
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	common.OptionMapRWMutex.Lock()
	// Omitted dynamic_enabled selects the automatic estimator path. This is
	// intentionally not an administrator fallback configuration.
	common.OptionMap = map[string]string{service.GMPayFeeConfigOptionKey: `{"version":1}`}
	common.OptionMapRWMutex.Unlock()

	privateClient, err := service.NewGMPayClient(server.URL, operation_setting.EpayId, operation_setting.EpayKey, server.Client())
	require.NoError(t, err)
	newGMPayNativeClient = func(string, string, string) (*service.GMPayClient, error) {
		return privateClient, nil
	}
	now := time.Now().UTC()
	dynamicQuote := service.NetworkFeeQuote{
		Token:              "USDT",
		Network:            "tron",
		SettlementCurrency: "USD",
		BaseAmount:         decimal.NewFromInt(1),
		FeeAmount:          decimal.RequireFromString("2.21"),
		TotalAmount:        decimal.RequireFromString("3.21"),
		NativeAsset:        "TRX",
		NativeAmount:       decimal.RequireFromString("6.845"),
		Source:             service.GMPayFeeSourceChainNetworkEstimate,
		EstimatorVersion:   "test-dynamic",
		Confidence:         "medium",
		QuotedAt:           now.Add(-time.Second),
		ExpiresAt:          now.Add(time.Minute),
		Evidence: service.NetworkFeeEvidence{
			RPCMethod:      "wallet/estimateenergy",
			RPCSource:      "api.trongrid.io",
			PriceSource:    "api.coingecko.com",
			PriceTimestamp: now.Unix(),
		},
	}
	discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
		return gmpayEstimatorQuoteStub{quote: dynamicQuote}, nil
	}
	newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) {
		return gmpayEstimatorQuoteStub{quote: dynamicQuote}, nil
	}
	resetCachedAutomaticGMPayNetworkFeeEstimator()

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/option/gmpay_fee/test", strings.NewReader(`{}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	TestGMPayFeeEstimate(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Source       string `json:"source"`
			NativeAmount string `json:"native_amount"`
			FeeAmount    string `json:"fee_amount"`
			BaseAmount   string `json:"base_amount"`
			TotalAmount  string `json:"total_amount"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.Equal(t, service.GMPayFeeSourceChainNetworkEstimate, response.Data.Source)
	assert.Equal(t, "6.845", response.Data.NativeAmount)
	assert.Equal(t, "2.21", response.Data.FeeAmount)
	assert.Equal(t, "1.00", response.Data.BaseAmount)
	assert.Equal(t, "3.21", response.Data.TotalAmount)
}

func TestDiscoverGMPayFeeStatusReportsAdministratorFallbackWhenDynamicUnavailable(t *testing.T) {
	previousOptions := common.OptionMap
	previousPayAddress := operation_setting.PayAddress
	previousEpayID := operation_setting.EpayId
	previousEpayKey := operation_setting.EpayKey
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	previousClientFactory := newGMPayNativeClient
	previousDiscovery := discoverGMPayNetworkFeeEstimatorFromClient
	previousAutomatic := newAutomaticGMPayNetworkFeeEstimator
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet || request.URL.Path != "/payments/gmpay/v1/config" {
			writer.WriteHeader(http.StatusNotFound)
			return
		}
		_, _ = writer.Write([]byte(`{"status_code":200,"message":"success","data":{"supported_assets":[{"network":"tron","display_name":"TRON","tokens":["USDT"]}]}}`))
	}))
	t.Cleanup(server.Close)
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		operation_setting.PayAddress = previousPayAddress
		operation_setting.EpayId = previousEpayID
		operation_setting.EpayKey = previousEpayKey
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		newGMPayNativeClient = previousClientFactory
		discoverGMPayNetworkFeeEstimatorFromClient = previousDiscovery
		newAutomaticGMPayNetworkFeeEstimator = previousAutomatic
		resetCachedAutomaticGMPayNetworkFeeEstimator()
	})

	operation_setting.PayAddress = server.URL
	operation_setting.EpayId = "gmpay-test-pid"
	operation_setting.EpayKey = "gmpay-test-secret"
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{service.GMPayFeeConfigOptionKey: `{"version":1,"fallback_enabled":true,"fallback_mode":"fixed","fallback_value":"5","max_fee":"20","max_total":"100000"}`}
	common.OptionMapRWMutex.Unlock()

	privateClient, err := service.NewGMPayClient(server.URL, operation_setting.EpayId, operation_setting.EpayKey, server.Client())
	require.NoError(t, err)
	newGMPayNativeClient = func(string, string, string) (*service.GMPayClient, error) {
		return privateClient, nil
	}
	failingEstimator := gmpayEstimatorCountingStub{err: errors.New("simulated dynamic outage")}
	discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
		return failingEstimator, nil
	}
	newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) {
		return failingEstimator, nil
	}
	resetCachedAutomaticGMPayNetworkFeeEstimator()

	status := discoverGMPayFeeStatus(context.Background())
	require.True(t, status.Configured)
	require.True(t, status.FallbackEnabled)
	require.True(t, status.FallbackReady)
	require.True(t, status.Healthy)
	require.True(t, status.QuoteAvailable)
	assert.False(t, status.Capability)
	assert.Equal(t, service.GMPayFeeSourceAdminFallback, status.FeeSource)
	assert.Equal(t, "Dynamic network fee unavailable; administrator fallback is active", status.Reason)
	require.Len(t, status.SupportedAssets, 1)
	assert.Equal(t, "TRON", status.SupportedAssets[0].Network)
	assert.Equal(t, "USDT", status.SupportedAssets[0].Token)
}

func TestGetGMPayFeeStatusUsesBuiltinAssetWhenDiscoveryUnavailable(t *testing.T) {
	previousOptions := common.OptionMap
	previousPayAddress := operation_setting.PayAddress
	previousEpayID := operation_setting.EpayId
	previousEpayKey := operation_setting.EpayKey
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	previousClientFactory := newGMPayNativeClient
	previousDiscovery := discoverGMPayNetworkFeeEstimatorFromClient
	previousAutomatic := newAutomaticGMPayNetworkFeeEstimator
	gmpayFeeStatusCache.Lock()
	previousCacheValue := gmpayFeeStatusCache.value
	previousCacheExpiry := gmpayFeeStatusCache.expiresAt
	previousCacheKey := gmpayFeeStatusCache.key
	gmpayFeeStatusCache.value = gmpayFeeStatusResponse{}
	gmpayFeeStatusCache.expiresAt = time.Time{}
	gmpayFeeStatusCache.key = ""
	gmpayFeeStatusCache.Unlock()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(server.Close)
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		operation_setting.PayAddress = previousPayAddress
		operation_setting.EpayId = previousEpayID
		operation_setting.EpayKey = previousEpayKey
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		newGMPayNativeClient = previousClientFactory
		discoverGMPayNetworkFeeEstimatorFromClient = previousDiscovery
		newAutomaticGMPayNetworkFeeEstimator = previousAutomatic
		resetCachedAutomaticGMPayNetworkFeeEstimator()
		gmpayFeeStatusCache.Lock()
		gmpayFeeStatusCache.value = previousCacheValue
		gmpayFeeStatusCache.expiresAt = previousCacheExpiry
		gmpayFeeStatusCache.key = previousCacheKey
		gmpayFeeStatusCache.Unlock()
	})

	operation_setting.PayAddress = server.URL
	operation_setting.EpayId = "gmpay-test-pid"
	operation_setting.EpayKey = "gmpay-test-secret"
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	privateClient, err := service.NewGMPayClient(server.URL, operation_setting.EpayId, operation_setting.EpayKey, server.Client())
	require.NoError(t, err)
	newGMPayNativeClient = func(string, string, string) (*service.GMPayClient, error) {
		return privateClient, nil
	}

	now := time.Now().UTC()
	dynamicQuote := service.NetworkFeeQuote{
		Token:              "USDT",
		Network:            "tron",
		SettlementCurrency: "USD",
		BaseAmount:         decimal.NewFromInt(1),
		FeeAmount:          decimal.RequireFromString("2.21"),
		TotalAmount:        decimal.RequireFromString("3.21"),
		NativeAsset:        "TRX",
		NativeAmount:       decimal.RequireFromString("6.845"),
		Source:             service.GMPayFeeSourceChainNetworkEstimate,
		EstimatorVersion:   "test-builtin",
		Confidence:         "medium",
		QuotedAt:           now.Add(-time.Second),
		ExpiresAt:          now.Add(time.Minute),
		Evidence: service.NetworkFeeEvidence{
			RPCMethod:      "wallet/estimateenergy",
			RPCSource:      "api.trongrid.io",
			PriceSource:    "api.coingecko.com",
			PriceTimestamp: now.Unix(),
		},
	}

	testCases := []struct {
		name                string
		config              string
		builtin             service.NetworkFeeEstimator
		wantCapability      bool
		wantFallbackEnabled bool
		wantFallbackReady   bool
		wantSource          string
		wantReason          string
	}{
		{
			name:                "builtin dynamic quote",
			config:              `{"version":1}`,
			builtin:             gmpayEstimatorQuoteStub{quote: dynamicQuote},
			wantCapability:      true,
			wantFallbackEnabled: false,
			wantFallbackReady:   false,
			wantSource:          service.GMPayFeeSourceChainNetworkEstimate,
		},
		{
			name:                "administrator fallback after dynamic failure",
			config:              `{"version":1,"fallback_enabled":true,"fallback_mode":"fixed","fallback_value":"5","max_fee":"20","max_total":"100000"}`,
			builtin:             gmpayEstimatorCountingStub{err: errors.New("simulated dynamic outage")},
			wantCapability:      false,
			wantFallbackEnabled: true,
			wantFallbackReady:   true,
			wantSource:          service.GMPayFeeSourceAdminFallback,
			wantReason:          "Dynamic network fee unavailable; administrator fallback is active",
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			common.OptionMapRWMutex.Lock()
			common.OptionMap = map[string]string{service.GMPayFeeConfigOptionKey: testCase.config}
			common.OptionMapRWMutex.Unlock()
			discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
				return nil, errors.New("simulated private discovery outage")
			}
			newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) {
				return testCase.builtin, nil
			}
			resetCachedAutomaticGMPayNetworkFeeEstimator()
			gmpayFeeStatusCache.Lock()
			gmpayFeeStatusCache.value = gmpayFeeStatusResponse{}
			gmpayFeeStatusCache.expiresAt = time.Time{}
			gmpayFeeStatusCache.key = ""
			gmpayFeeStatusCache.Unlock()

			gin.SetMode(gin.TestMode)
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/option/gmpay_fee/status", nil)
			GetGMPayFeeStatus(ctx)

			require.Equal(t, http.StatusOK, recorder.Code)
			var response struct {
				Success bool `json:"success"`
				Data    struct {
					Configured      bool                        `json:"configured"`
					Capability      bool                        `json:"capability"`
					Healthy         bool                        `json:"healthy"`
					QuoteAvailable  bool                        `json:"quote_available"`
					FallbackEnabled bool                        `json:"fallback_enabled"`
					FallbackReady   bool                        `json:"fallback_ready"`
					FeeSource       string                      `json:"fee_source"`
					Reason          string                      `json:"reason"`
					SupportedAssets []service.GMPayPaymentAsset `json:"supported_assets"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			require.True(t, response.Success)
			assert.True(t, response.Data.Configured)
			assert.Equal(t, testCase.wantCapability, response.Data.Capability)
			assert.True(t, response.Data.Healthy)
			assert.True(t, response.Data.QuoteAvailable)
			assert.Equal(t, testCase.wantFallbackEnabled, response.Data.FallbackEnabled)
			assert.Equal(t, testCase.wantFallbackReady, response.Data.FallbackReady)
			assert.Equal(t, testCase.wantSource, response.Data.FeeSource)
			assert.Equal(t, testCase.wantReason, response.Data.Reason)
			require.Equal(t, []service.GMPayPaymentAsset{{Network: "TRON", Token: "USDT", DisplayName: "TRON"}}, response.Data.SupportedAssets)
		})
	}
}

func TestGMPayFeeStatusCacheKeyTracksCompleteConfigurationAndMerchantIdentity(t *testing.T) {
	previousOptions := common.OptionMap
	previousPayAddress := operation_setting.PayAddress
	previousEpayID := operation_setting.EpayId
	previousEpayKey := operation_setting.EpayKey
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		operation_setting.PayAddress = previousPayAddress
		operation_setting.EpayId = previousEpayID
		operation_setting.EpayKey = previousEpayKey
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
	})

	operation_setting.PayAddress = "https://pay.example.test"
	operation_setting.EpayId = "merchant-id"
	operation_setting.EpayKey = "merchant-secret"
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	setConfig := func(raw string) {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = map[string]string{service.GMPayFeeConfigOptionKey: raw}
		common.OptionMapRWMutex.Unlock()
	}

	setConfig(`{"version":1,"dynamic_enabled":true,"chains":{"tron":{"rpc_url":"https://rpc-one.example","price_url":"https://price-one.example","native_asset":"TRX","settlement_currency":"USD"}}}`)
	first := currentGMPayFeeStatusCacheKey()
	assert.NotContains(t, first, "merchant-secret")

	setConfig(`{"version":1,"dynamic_enabled":true,"chains":{"tron":{"rpc_url":"https://rpc-two.example","price_url":"https://price-one.example","native_asset":"TRX","settlement_currency":"USD"}}}`)
	second := currentGMPayFeeStatusCacheKey()
	assert.NotEqual(t, first, second)

	operation_setting.EpayKey = "rotated-secret"
	third := currentGMPayFeeStatusCacheKey()
	assert.NotEqual(t, second, third)

	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeCNY
	fourth := currentGMPayFeeStatusCacheKey()
	assert.NotEqual(t, third, fourth)
}

func TestResolveGMPayEstimatorPriority(t *testing.T) {
	originalConfigured := newGMPayNetworkFeeEstimator
	originalDiscovery := discoverGMPayNetworkFeeEstimatorFromClient
	originalAutomatic := newAutomaticGMPayNetworkFeeEstimator
	t.Cleanup(func() {
		newGMPayNetworkFeeEstimator = originalConfigured
		discoverGMPayNetworkFeeEstimatorFromClient = originalDiscovery
		newAutomaticGMPayNetworkFeeEstimator = originalAutomatic
		resetCachedAutomaticGMPayNetworkFeeEstimator()
	})
	resetCachedAutomaticGMPayNetworkFeeEstimator()

	configured := gmpayEstimatorPriorityStub{"configured"}
	private := gmpayEstimatorPriorityStub{"private"}
	builtin := gmpayEstimatorPriorityStub{"builtin"}
	newGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) { return configured, nil }
	discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) { return private, nil }
	newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) { return builtin, nil }

	// Explicit enable uses the configured estimator and does not probe private
	// discovery or the built-in fallback.
	enabled := service.GMPayFeeConfig{DynamicEnabled: true}
	estimator, err := resolveGMPayEstimatorWithClient(context.Background(), enabled, &service.GMPayClient{})
	require.NoError(t, err)
	assert.Equal(t, configured, estimator)

	// Omitted dynamic_enabled prefers private discovery.
	omitted, err := service.ParseGMPayFeeConfig("")
	require.NoError(t, err)
	estimator, err = resolveGMPayEstimatorWithClient(context.Background(), omitted, &service.GMPayClient{})
	require.NoError(t, err)
	assert.Equal(t, private, estimator)

	// Omitted dynamic_enabled falls back to the built-in preset when discovery
	// is unavailable; the result is cached for checkout/status/test reuse.
	discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
		return nil, errors.New("discovery unavailable")
	}
	resetCachedAutomaticGMPayNetworkFeeEstimator()
	estimator, err = resolveGMPayEstimatorWithClient(context.Background(), omitted, &service.GMPayClient{})
	require.NoError(t, err)
	assert.Equal(t, builtin, estimator)

	// Explicit disable never performs dynamic estimation.
	disabled, err := service.ParseGMPayFeeConfig(`{"version":1,"dynamic_enabled":false}`)
	require.NoError(t, err)
	_, err = resolveGMPayEstimatorWithClient(context.Background(), disabled, &service.GMPayClient{})
	require.Error(t, err)
}

func TestGMPayEstimatorProbeRequiresSuccessfulBuiltinQuote(t *testing.T) {
	cfg, err := service.ParseGMPayFeeConfig("")
	require.NoError(t, err)
	assets := []service.GMPayAsset{{Network: "ethereum", Tokens: []string{"USDC"}}}
	assert.False(t, gmpayEstimatorHasQuote(context.Background(), gmpayEstimatorPriorityStub{"unavailable"}, assets, cfg))

	now := time.Now().UTC()
	quote := service.NetworkFeeQuote{
		Token: "USDC", Network: "ethereum", SettlementCurrency: "USD", BaseAmount: decimal.NewFromInt(1),
		FeeAmount: decimal.NewFromFloat(0.01), TotalAmount: decimal.NewFromFloat(1.01), NativeAsset: "ETH",
		NativeAmount: decimal.NewFromFloat(0.00001), Source: service.GMPayFeeSourceChainNetworkEstimate,
		EstimatorVersion: "test", QuotedAt: now, ExpiresAt: now.Add(time.Minute),
		Evidence: service.NetworkFeeEvidence{RPCMethod: "eth_estimateGas", RPCSource: "cloudflare-eth.com", PriceSource: "api.coingecko.com", PriceTimestamp: now.Unix()},
	}
	assert.True(t, gmpayEstimatorHasQuote(context.Background(), gmpayEstimatorQuoteStub{quote: quote}, assets, cfg))
}

func setupGMPayTopUpTest(t *testing.T) {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedisEnabled := common.RedisEnabled
	previousMainDatabaseType := common.MainDatabaseType()
	previousLogDatabaseType := common.LogDatabaseType()
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:gmpay-%d?mode=memory&cache=shared", time.Now().UnixNano())), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.TopUp{},
		&model.User{},
		&model.Log{},
		&model.SubscriptionPlan{},
		&model.SubscriptionOrder{},
		&model.UserSubscription{},
		&model.Agent{},
		&model.AgentLedger{},
		&model.GroupBuy{},
		&model.GroupBuyParticipant{},
	))
	model.DB, model.LOG_DB = db, db
	common.RedisEnabled = false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, model.InitLogDB())

	previousPayAddress := operation_setting.PayAddress
	previousEpayID := operation_setting.EpayId
	previousEpayKey := operation_setting.EpayKey
	previousPayMethods := operation_setting.PayMethods
	previousPrice := operation_setting.Price
	previousMinTopUp := operation_setting.MinTopUp
	previousCallbackAddress := operation_setting.CustomCallbackAddress
	previousServerAddress := system_setting.ServerAddress
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	previousOptions := common.OptionMap
	operation_setting.PayAddress = "https://pay.example.test/payments/epay/v1/order/create-transaction"
	operation_setting.EpayId = "gmpay-test-pid"
	operation_setting.EpayKey = "gmpay-test-secret"
	operation_setting.PayMethods = []map[string]string{{"type": "usdt.tron"}}
	operation_setting.Price = 1
	operation_setting.MinTopUp = 1
	operation_setting.CustomCallbackAddress = "https://new-api.example"
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	system_setting.ServerAddress = "https://new-api.example"
	// Ordinary wallet fee discovery is opt-out by default in production. The
	// legacy checkout fixtures explicitly disable dynamic discovery so these
	// tests continue to exercise the historical gateway-included path.
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{service.GMPayFeeConfigOptionKey: `{"version":1,"dynamic_enabled":false}`}
	common.OptionMapRWMutex.Unlock()
	restoreGatewayMode := operation_setting.SetEffectivePaymentGatewayModeForTest(operation_setting.PaymentGatewayModeGMPayNative)
	t.Cleanup(func() {
		restoreGatewayMode()
		operation_setting.PayAddress = previousPayAddress
		operation_setting.EpayId = previousEpayID
		operation_setting.EpayKey = previousEpayKey
		operation_setting.PayMethods = previousPayMethods
		operation_setting.Price = previousPrice
		operation_setting.MinTopUp = previousMinTopUp
		operation_setting.CustomCallbackAddress = previousCallbackAddress
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		system_setting.ServerAddress = previousServerAddress
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedisEnabled
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			require.NoError(t, sqlDB.Close())
		}
	})
}

func TestChooseGMPayFeeStatusAssetOnlyReturnsSupportedStablecoin(t *testing.T) {
	assets := []service.GMPayAsset{{Network: "ethereum", Tokens: []string{"USDC"}}}
	token, network, err := chooseGMPayFeeStatusAsset(assets, "usdc", "erc20")
	require.NoError(t, err)
	assert.Equal(t, "USDC", token)
	assert.Equal(t, "ethereum", network)

	_, _, err = chooseGMPayFeeStatusAsset(assets, "USDT", "ethereum")
	assert.Error(t, err)
}

func TestResolveGMPayWalletAssetFallsBackToBuiltinWhenGatewayUnavailable(t *testing.T) {
	previousOptions := common.OptionMap
	previousPayMethods := operation_setting.PayMethods
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	previousClientFactory := newGMPayNativeClient
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{service.GMPayFeeConfigOptionKey: `{"version":1}`}
	common.OptionMapRWMutex.Unlock()
	operation_setting.PayMethods = []map[string]string{{"type": "usdt.tron"}}
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	restoreMode := operation_setting.SetEffectivePaymentGatewayModeForTest(operation_setting.PaymentGatewayModeGMPayNative)

	var requestCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestCount.Add(1)
		writer.WriteHeader(http.StatusServiceUnavailable)
	}))
	t.Cleanup(server.Close)
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		return service.NewGMPayClient(server.URL, pid, secret, server.Client())
	}
	t.Cleanup(func() {
		restoreMode()
		operation_setting.PayMethods = previousPayMethods
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		newGMPayNativeClient = previousClientFactory
	})

	epCfg := tenantEpayConfig{Enabled: true, Client: buildEpayClient(server.URL, "pid", "secret")}
	require.NotNil(t, epCfg.Client)
	token, network, err := resolveGMPayWalletAsset(context.Background(), epCfg, gmpayNativePaymentMethod, "USDC", "erc20")
	require.NoError(t, err)
	assert.Equal(t, "usdc", token)
	assert.Equal(t, "ethereum", network)
	assert.GreaterOrEqual(t, requestCount.Load(), int32(1))

	// The second checkout-boundary resolver receives the selected pair again;
	// its outage fallback must preserve the same canonical spelling as the
	// wallet resolver even when called with an unnormalized pair.
	token, network, err = resolveGMPayAssetWithBuiltinFallback(context.Background(), epCfg, gmpayNativePaymentMethod, "USDC", "erc20", true)
	require.NoError(t, err)
	assert.Equal(t, "usdc", token)
	assert.Equal(t, "ethereum", network)
}

func TestResolveGMPayWalletAssetRejectsUnsupportedAssetWhenGatewayUnavailable(t *testing.T) {
	previousOptions := common.OptionMap
	previousPayMethods := operation_setting.PayMethods
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	previousClientFactory := newGMPayNativeClient
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{service.GMPayFeeConfigOptionKey: `{"version":1}`}
	common.OptionMapRWMutex.Unlock()
	operation_setting.PayMethods = []map[string]string{{"type": "usdt.tron"}}
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	restoreMode := operation_setting.SetEffectivePaymentGatewayModeForTest(operation_setting.PaymentGatewayModeGMPayNative)

	var requestCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestCount.Add(1)
		writer.WriteHeader(http.StatusServiceUnavailable)
	}))
	t.Cleanup(server.Close)
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		return service.NewGMPayClient(server.URL, pid, secret, server.Client())
	}
	t.Cleanup(func() {
		restoreMode()
		operation_setting.PayMethods = previousPayMethods
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		newGMPayNativeClient = previousClientFactory
	})

	epCfg := tenantEpayConfig{Enabled: true, Client: buildEpayClient(server.URL, "pid", "secret")}
	require.NotNil(t, epCfg.Client)
	_, _, err := resolveGMPayWalletAsset(context.Background(), epCfg, gmpayNativePaymentMethod, "DAI", "ethereum")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "USDT or USDC")
	assert.Zero(t, requestCount.Load())
}

func TestRequestEpayCheckoutBuiltinAssetFallbackReachesCreateOrder(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	user := &model.User{Id: 713, Username: "gmpay-builtin-fallback-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)

	previousOptions := common.OptionMap
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{service.GMPayFeeConfigOptionKey: `{"version":1}`}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
	})

	previousClientFactory := newGMPayNativeClient
	previousDiscovery := discoverGMPayNetworkFeeEstimatorFromClient
	previousAutomatic := newAutomaticGMPayNetworkFeeEstimator
	resetCachedAutomaticGMPayNetworkFeeEstimator()
	now := time.Now().UTC()
	builtinQuote := service.NetworkFeeQuote{
		Token:              "USDC",
		Network:            "ethereum",
		SettlementCurrency: "USD",
		BaseAmount:         decimal.NewFromInt(10),
		FeeAmount:          decimal.NewFromFloat(0.25),
		TotalAmount:        decimal.NewFromFloat(10.25),
		NativeAsset:        "ETH",
		NativeAmount:       decimal.NewFromFloat(0.0001),
		Source:             service.GMPayFeeSourceChainNetworkEstimate,
		EstimatorVersion:   "test-builtin",
		QuotedAt:           now.Add(-time.Second),
		ExpiresAt:          now.Add(time.Minute),
		Evidence: service.NetworkFeeEvidence{
			RPCMethod:      "eth_estimateGas",
			RPCSource:      "cloudflare-eth.com",
			PriceSource:    "api.coingecko.com",
			PriceTimestamp: now.Unix(),
		},
	}
	builtin := gmpayEstimatorQuoteStub{quote: builtinQuote}
	discoverGMPayNetworkFeeEstimatorFromClient = func(context.Context, *service.GMPayClient) (service.NetworkFeeEstimator, error) {
		return nil, errors.New("gateway unavailable")
	}
	newAutomaticGMPayNetworkFeeEstimator = func() (service.NetworkFeeEstimator, error) {
		return builtin, nil
	}
	t.Cleanup(func() {
		newGMPayNativeClient = previousClientFactory
		discoverGMPayNetworkFeeEstimatorFromClient = previousDiscovery
		newAutomaticGMPayNetworkFeeEstimator = previousAutomatic
		resetCachedAutomaticGMPayNetworkFeeEstimator()
	})

	var getCount, createCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch {
		case request.Method == http.MethodGet:
			getCount.Add(1)
			writer.WriteHeader(http.StatusServiceUnavailable)
		case request.Method == http.MethodPost:
			createCount.Add(1)
			var payload map[string]any
			require.NoError(t, common.DecodeJson(request.Body, &payload))
			assert.Equal(t, "usdc", payload["token"])
			assert.Equal(t, "ethereum", payload["network"])
			_, _ = writer.Write([]byte(fmt.Sprintf(`{"status_code":200,"message":"success","data":{"trade_id":"builtin-fallback-order","order_id":%q,"amount":10.25,"currency":"USD","actual_amount":"10.25","receive_address":"0x1111111111111111111111111111111111111111","token":"USDC","network":"ethereum","status":1,"expiration_time":2000000000}}`, payload["order_id"])))
		default:
			t.Errorf("unexpected GMPay request: %s %s", request.Method, request.URL.Path)
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		return service.NewGMPayClient(server.URL, pid, secret, server.Client())
	}

	newCheckoutRequest := func(token, network string) (*gin.Context, *httptest.ResponseRecorder) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Set("id", user.Id)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/epay/checkout", strings.NewReader(fmt.Sprintf(`{"amount":10,"payment_method":"usdt.tron","token":%q,"network":%q}`, token, network)))
		ctx.Request.Header.Set("Content-Type", "application/json")
		return ctx, recorder
	}
	// RequestEpayCheckout resolves the selected asset before quoting, then the
	// shared checkout path resolves it again before CreateOrder. Both fresh
	// gateway reads fail, but the automatic builtin allowlist keeps the order
	// creation path alive.
	ctx, recorder := newCheckoutRequest("USDC", "erc20")
	RequestEpayCheckout(ctx)
	assert.Contains(t, recorder.Body.String(), `"message":"success"`)
	assert.Equal(t, int32(1), createCount.Load())
	assert.GreaterOrEqual(t, getCount.Load(), int32(2))

	getsBeforeReject := getCount.Load()
	ctx, recorder = newCheckoutRequest("DAI", "erc20")
	RequestEpayCheckout(ctx)
	assert.Contains(t, recorder.Body.String(), "拉起支付失败")
	assert.Equal(t, getsBeforeReject, getCount.Load())
	assert.Equal(t, int32(1), createCount.Load())
}

func TestGMPayNotifyRejectsLegacyModeBeforeReadingConfigurationOrDatabase(t *testing.T) {
	restore := operation_setting.SetEffectivePaymentGatewayModeForTest(operation_setting.PaymentGatewayModeEpayLegacy)
	t.Cleanup(restore)
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/gmpay/notify", strings.NewReader(`{"not":"parsed"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	GMPayNotify(ctx)

	assert.Equal(t, "fail", recorder.Body.String())
}

func insertGMPayTopUpForTest(t *testing.T, tradeNo string, money float64, paymentMethod string, paymentProvider string) *model.TopUp {
	t.Helper()
	user := &model.User{Id: 701, Username: "gmpay-callback-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.FirstOrCreate(user, model.User{Id: user.Id}).Error)
	topUp := &model.TopUp{
		UserId:          user.Id,
		Amount:          1,
		Money:           money,
		TradeNo:         tradeNo,
		PaymentMethod:   paymentMethod,
		PaymentProvider: paymentProvider,
		Status:          common.TopUpStatusPending,
		CreateTime:      common.GetTimestamp(),
	}
	require.NoError(t, topUp.Insert())
	return topUp
}

func signedGMPayNotifyRequest(t *testing.T, params map[string]any) *http.Request {
	t.Helper()
	params["signature"] = service.GMPaySignature(params, operation_setting.EpayKey)
	payload, err := common.Marshal(params)
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/user/gmpay/notify", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	return request
}

func validGMPayNotifyParams(orderID string) map[string]any {
	return map[string]any{
		"pid":                  operation_setting.EpayId,
		"order_id":             orderID,
		"amount":               float64(10),
		"status":               float64(2),
		"actual_amount":        10.0123,
		"receive_address":      "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
		"token":                "USDT",
		"block_transaction_id": "tron-transaction-id",
		"trade_id":             "gmpay-gateway-order",
	}
}

func TestGMPayNotifySettlesMatchingOrderExactlyOnce(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	order := insertGMPayTopUpForTest(t, "gmpay-success-order", 10, "usdt.tron", model.PaymentProviderEpay)
	params := validGMPayNotifyParams(order.TradeNo)

	for attempt := 0; attempt < 2; attempt++ {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = signedGMPayNotifyRequest(t, params)
		GMPayNotify(ctx)
		assert.Equal(t, "ok", recorder.Body.String())
		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Contains(t, recorder.Header().Get("Content-Type"), "text/plain")
	}

	stored := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusSuccess, stored.Status)
	var user model.User
	require.NoError(t, model.DB.First(&user, order.UserId).Error)
	assert.Equal(t, int(common.QuotaPerUnit), user.Quota)
}

func TestGMPayNotifySettlesAgentPrepayWithoutCreditingOwnerWallet(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	owner := &model.User{Id: 705, Username: "gmpay-agent-owner", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(owner).Error)
	agent := &model.Agent{Id: 51, OwnerUserId: owner.Id, Name: "native-agent", Status: model.AgentStatusActive, CostRatio: 1}
	require.NoError(t, model.DB.Create(agent).Error)
	order := &model.TopUp{
		UserId: owner.Id, Amount: 1, Money: 10, TradeNo: "gmpay-agent-prepay", PaymentMethod: gmpayNativePaymentMethod,
		PaymentProvider: model.PaymentProviderEpay, AgentPrepayId: agent.Id, Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, order.Insert())

	for attempt := 0; attempt < 2; attempt++ {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = signedGMPayNotifyRequest(t, validGMPayNotifyParams(order.TradeNo))
		GMPayNotify(ctx)
		assert.Equal(t, "ok", recorder.Body.String())
	}

	var storedAgent model.Agent
	require.NoError(t, model.DB.First(&storedAgent, agent.Id).Error)
	assert.Equal(t, int(common.QuotaPerUnit), storedAgent.WalletQuota)
	var storedOwner model.User
	require.NoError(t, model.DB.First(&storedOwner, owner.Id).Error)
	assert.Zero(t, storedOwner.Quota)
	var ledgers int64
	require.NoError(t, model.DB.Model(&model.AgentLedger{}).Where("agent_id = ?", agent.Id).Count(&ledgers).Error)
	assert.Equal(t, int64(1), ledgers)
}

func TestGMPayNotifyRoutesGroupBuyToDedicatedSettlement(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	user := &model.User{Id: 708, Username: "gmpay-group-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)
	group := &model.GroupBuy{
		GroupNo: "GB-GMPAY-CALLBACK", InitiatorId: user.Id, Status: model.GroupBuyStatusDraft,
		RequiredCount: 2, TargetCount: 2, PerShareAmount: 1, PerSharePrice: 10,
		ExpireTime: common.GetTimestamp() + 3600, CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, model.DB.Create(group).Error)
	participant := &model.GroupBuyParticipant{
		GroupBuyId: group.Id, UserId: user.Id, Username: user.Username, TradeNo: "gmpay-group-buy",
		PayStatus: model.GroupBuyParticipantPending, PayMoney: 10, JoinTime: common.GetTimestamp(),
	}
	require.NoError(t, model.DB.Create(participant).Error)
	order := &model.TopUp{
		UserId: user.Id, Amount: 1, Money: 10, TradeNo: participant.TradeNo, PaymentMethod: gmpayNativePaymentMethod,
		PaymentProvider: model.PaymentProviderEpay, GroupBuyId: group.Id, Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, order.Insert())

	for attempt := 0; attempt < 2; attempt++ {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = signedGMPayNotifyRequest(t, validGMPayNotifyParams(order.TradeNo))
		GMPayNotify(ctx)
		assert.Equal(t, "ok", recorder.Body.String())
	}

	storedTopUp := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, storedTopUp)
	assert.Equal(t, common.TopUpStatusSuccess, storedTopUp.Status)
	var storedParticipant model.GroupBuyParticipant
	require.NoError(t, model.DB.Where("trade_no = ?", order.TradeNo).First(&storedParticipant).Error)
	assert.Equal(t, model.GroupBuyParticipantPaid, storedParticipant.PayStatus)
	var storedGroup model.GroupBuy
	require.NoError(t, model.DB.First(&storedGroup, group.Id).Error)
	assert.Equal(t, model.GroupBuyStatusPending, storedGroup.Status)
	var storedUser model.User
	require.NoError(t, model.DB.First(&storedUser, user.Id).Error)
	assert.Zero(t, storedUser.Quota)
}

func TestGMPayNotifySettlesSubscriptionWithoutWalletFallback(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	user := &model.User{Id: 706, Username: "gmpay-subscription-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)
	plan := &model.SubscriptionPlan{
		Title: "Native subscription", PriceAmount: 10, Currency: "USD", DurationUnit: model.SubscriptionDurationMonth,
		DurationValue: 1, Enabled: true, TotalAmount: 1000, QuotaResetPeriod: model.SubscriptionResetNever,
	}
	plan.NormalizeDefaults()
	require.NoError(t, model.DB.Create(plan).Error)
	order := &model.SubscriptionOrder{
		UserId: user.Id, PlanId: plan.Id, Money: 10, TradeNo: "gmpay-subscription", PaymentMethod: gmpayNativePaymentMethod,
		PaymentProvider: model.PaymentProviderEpay, Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, order.Insert())

	for attempt := 0; attempt < 2; attempt++ {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = signedGMPayNotifyRequest(t, validGMPayNotifyParams(order.TradeNo))
		GMPayNotify(ctx)
		assert.Equal(t, "ok", recorder.Body.String())
	}

	storedOrder := model.GetSubscriptionOrderByTradeNo(order.TradeNo)
	require.NotNil(t, storedOrder)
	assert.Equal(t, common.TopUpStatusSuccess, storedOrder.Status)
	var subscriptions int64
	require.NoError(t, model.DB.Model(&model.UserSubscription{}).Where("user_id = ?", user.Id).Count(&subscriptions).Error)
	assert.Equal(t, int64(1), subscriptions)
	var storedUser model.User
	require.NoError(t, model.DB.First(&storedUser, user.Id).Error)
	assert.Zero(t, storedUser.Quota)
}

func TestGMPayNotifyRejectsAmbiguousOrderType(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	user := &model.User{Id: 707, Username: "gmpay-ambiguous-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)
	topUp := &model.TopUp{
		UserId: user.Id, Amount: 1, Money: 10, TradeNo: "gmpay-ambiguous", PaymentMethod: gmpayNativePaymentMethod,
		PaymentProvider: model.PaymentProviderEpay, Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, topUp.Insert())
	order := &model.SubscriptionOrder{
		UserId: user.Id, PlanId: 999, Money: 10, TradeNo: topUp.TradeNo, PaymentMethod: gmpayNativePaymentMethod,
		PaymentProvider: model.PaymentProviderEpay, Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, order.Insert())

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = signedGMPayNotifyRequest(t, validGMPayNotifyParams(topUp.TradeNo))
	GMPayNotify(ctx)

	assert.Equal(t, "fail", recorder.Body.String())
	assert.Equal(t, common.TopUpStatusPending, model.GetTopUpByTradeNo(topUp.TradeNo).Status)
	assert.Equal(t, common.TopUpStatusPending, model.GetSubscriptionOrderByTradeNo(order.TradeNo).Status)
}

func TestGMPayNotifyRejectsUntrustedCallbackBeforeSettlement(t *testing.T) {
	testCases := []struct {
		name            string
		pid             string
		amount          string
		status          string
		paymentMethod   string
		paymentProvider string
		validSignature  bool
	}{
		{name: "mismatched merchant", pid: "another-pid", amount: "10.00", status: "2", paymentMethod: "usdt.tron", paymentProvider: model.PaymentProviderEpay, validSignature: true},
		{name: "mismatched amount", pid: "gmpay-test-pid", amount: "9.99", status: "2", paymentMethod: "usdt.tron", paymentProvider: model.PaymentProviderEpay, validSignature: true},
		{name: "non-success status", pid: "gmpay-test-pid", amount: "10.00", status: "1", paymentMethod: "usdt.tron", paymentProvider: model.PaymentProviderEpay, validSignature: true},
		{name: "legacy payment method", pid: "gmpay-test-pid", amount: "10.00", status: "2", paymentMethod: "alipay", paymentProvider: model.PaymentProviderEpay, validSignature: true},
		{name: "foreign payment provider", pid: "gmpay-test-pid", amount: "10.00", status: "2", paymentMethod: "usdt.tron", paymentProvider: model.PaymentProviderStripe, validSignature: true},
		{name: "invalid signature", pid: "gmpay-test-pid", amount: "10.00", status: "2", paymentMethod: "usdt.tron", paymentProvider: model.PaymentProviderEpay, validSignature: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			setupGMPayTopUpTest(t)
			gin.SetMode(gin.TestMode)
			order := insertGMPayTopUpForTest(t, "gmpay-reject-"+strings.ReplaceAll(tc.name, " ", "-"), 10, tc.paymentMethod, tc.paymentProvider)
			amount := float64(10)
			if tc.amount == "9.99" {
				amount = 9.99
			}
			status := float64(2)
			if tc.status == "1" {
				status = 1
			}
			params := validGMPayNotifyParams(order.TradeNo)
			params["pid"] = tc.pid
			params["amount"] = amount
			params["status"] = status
			request := signedGMPayNotifyRequest(t, params)
			if !tc.validSignature {
				params["signature"] = strings.Repeat("0", 64)
				payload, err := common.Marshal(params)
				require.NoError(t, err)
				request = httptest.NewRequest(http.MethodPost, "/api/user/gmpay/notify", bytes.NewReader(payload))
				request.Header.Set("Content-Type", "application/json")
			}
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = request
			GMPayNotify(ctx)

			assert.Equal(t, "fail", recorder.Body.String())
			stored := model.GetTopUpByTradeNo(order.TradeNo)
			require.NotNil(t, stored)
			assert.Equal(t, common.TopUpStatusPending, stored.Status)
		})
	}
}

func TestGMPayNotifyRejectsOversizedBody(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/gmpay/notify", strings.NewReader(fmt.Sprintf(`{"padding":"%s"}`, strings.Repeat("x", gmpayCallbackBodyLimit))))

	GMPayNotify(ctx)

	assert.Equal(t, "fail", recorder.Body.String())
}

func TestGMPayNotifyRejectsMissingOrInvalidAuditFields(t *testing.T) {
	testCases := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{name: "missing gateway trade ID", mutate: func(params map[string]any) { delete(params, "trade_id") }},
		{name: "zero actual amount", mutate: func(params map[string]any) { params["actual_amount"] = float64(0) }},
		{name: "invalid receive address", mutate: func(params map[string]any) { params["receive_address"] = "not-a-tron-address" }},
		{name: "checksum-mutated receive address", mutate: func(params map[string]any) { params["receive_address"] = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwc" }},
		{name: "invalid token", mutate: func(params map[string]any) { params["token"] = "USDC" }},
		{name: "missing block transaction ID", mutate: func(params map[string]any) { delete(params, "block_transaction_id") }},
		{name: "numeric gateway trade ID", mutate: func(params map[string]any) { params["trade_id"] = float64(12345) }},
		{name: "numeric block transaction ID", mutate: func(params map[string]any) { params["block_transaction_id"] = float64(12345) }},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			setupGMPayTopUpTest(t)
			gin.SetMode(gin.TestMode)
			order := insertGMPayTopUpForTest(t, "gmpay-audit-"+strings.ReplaceAll(tc.name, " ", "-"), 10, gmpayNativePaymentMethod, model.PaymentProviderEpay)
			params := validGMPayNotifyParams(order.TradeNo)
			tc.mutate(params)

			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = signedGMPayNotifyRequest(t, params)
			GMPayNotify(ctx)

			assert.Equal(t, "fail", recorder.Body.String())
			stored := model.GetTopUpByTradeNo(order.TradeNo)
			require.NotNil(t, stored)
			assert.Equal(t, common.TopUpStatusPending, stored.Status)
			var user model.User
			require.NoError(t, model.DB.First(&user, order.UserId).Error)
			assert.Zero(t, user.Quota)
		})
	}
}

func TestGMPayNotifyRejectsCallbackForForeignAgent(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	order := insertGMPayTopUpForTest(t, "gmpay-foreign-agent", 10, gmpayNativePaymentMethod, model.PaymentProviderEpay)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", order.UserId).Update("agent_id", 9).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = signedGMPayNotifyRequest(t, validGMPayNotifyParams(order.TradeNo))
	settleGMPayNotify(ctx, operation_setting.EpayId, operation_setting.EpayKey, 8)

	assert.Equal(t, "fail", recorder.Body.String())
	stored := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusPending, stored.Status)
	var user model.User
	require.NoError(t, model.DB.First(&user, order.UserId).Error)
	assert.Zero(t, user.Quota)
}

func TestGMPayNotifyRejectsEmptyMerchantConfiguration(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	order := insertGMPayTopUpForTest(t, "gmpay-empty-merchant-config", 10, gmpayNativePaymentMethod, model.PaymentProviderEpay)

	for _, credentials := range []struct {
		name string
		pid  string
		key  string
	}{
		{name: "empty PID", key: operation_setting.EpayKey},
		{name: "empty secret", pid: operation_setting.EpayId},
	} {
		t.Run(credentials.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = signedGMPayNotifyRequest(t, validGMPayNotifyParams(order.TradeNo))
			settleGMPayNotify(ctx, credentials.pid, credentials.key, 0)

			assert.Equal(t, "fail", recorder.Body.String())
			assert.Equal(t, http.StatusOK, recorder.Code)
		})
	}

	stored := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusPending, stored.Status)
}

func TestRequestEpayCheckoutRejectsNativeMinimumBeforeOrderCreation(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	operation_setting.Price = 0.01
	user := &model.User{Id: 703, Username: "gmpay-minimum-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)

	previousClientFactory := newGMPayNativeClient
	clientFactoryCalled := false
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		clientFactoryCalled = true
		return nil, fmt.Errorf("native client must not be created for the minimum amount")
	}
	t.Cleanup(func() { newGMPayNativeClient = previousClientFactory })

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", user.Id)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/epay/checkout", strings.NewReader(`{"amount":1,"payment_method":"usdt.tron"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	RequestEpayCheckout(ctx)

	assert.False(t, clientFactoryCalled)
	assert.Contains(t, recorder.Body.String(), "充值金额过低")
	var topUpCount int64
	require.NoError(t, model.DB.Model(&model.TopUp{}).Count(&topUpCount).Error)
	assert.Zero(t, topUpCount)
}

func TestRequestEpayCheckoutUsesNativeGMPayForUSDTTron(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	user := &model.User{Id: 702, Username: "gmpay-checkout-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)

	requestBodies := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			require.Equal(t, "/payments/gmpay/v1/config", request.URL.Path)
			_, _ = writer.Write([]byte(`{"status_code":200,"message":"success","data":{"supported_assets":[{"network":"tron","display_name":"TRON","tokens":["USDT"]}]}}`))
			return
		}
		require.Equal(t, http.MethodPost, request.Method)
		require.Equal(t, "/payments/gmpay/v1/order/create-transaction", request.URL.Path)
		var payload map[string]any
		require.NoError(t, common.DecodeJson(request.Body, &payload))
		requestBodies <- payload
		_, _ = writer.Write([]byte(fmt.Sprintf(`{"status_code":200,"message":"success","data":{"trade_id":"gateway-native-order","order_id":%q,"amount":10,"currency":"USD","actual_amount":10.0123,"receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token":"USDT","status":1,"expiration_time":2000000000,"payment_url":"https://gmpay.example/private-checkout"}}`, payload["order_id"])))
	}))
	t.Cleanup(server.Close)

	previousClientFactory := newGMPayNativeClient
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		return service.NewGMPayClient(server.URL, pid, secret, server.Client())
	}
	t.Cleanup(func() { newGMPayNativeClient = previousClientFactory })

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", user.Id)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/epay/checkout", strings.NewReader(`{"amount":10,"payment_method":"usdt.tron","token":"USDT","network":"tron"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	RequestEpayCheckout(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Message string         `json:"message"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "success", response.Message)
	assert.Equal(t, "crypto", response.Data["checkout_type"])
	assert.Equal(t, "gateway-native-order", response.Data["gateway_trade_no"])
	assert.Equal(t, "10.0123", response.Data["actual_amount"])
	assert.Equal(t, "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", response.Data["receive_address"])
	assert.Equal(t, "USDT", response.Data["token"])
	assert.Equal(t, "TRON", response.Data["network"])
	assert.NotContains(t, response.Data, "payment_url")
	assert.NotContains(t, response.Data, "server_time")
	assert.NotContains(t, recorder.Body.String(), operation_setting.EpayKey)

	payload := <-requestBodies
	assert.Equal(t, float64(10), payload["amount"])
	assert.Equal(t, "usd", payload["currency"])
	assert.Equal(t, "usdt", payload["token"])
	assert.Equal(t, "tron", payload["network"])
	assert.Equal(t, "https://new-api.example/api/user/gmpay/notify", payload["notify_url"])
	assert.Equal(t, "https://new-api.example/wallet", payload["redirect_url"])
}

func TestRequestEpayCheckoutUsesNativeGMPayForUSDCOnEthereum(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	user := &model.User{Id: 711, Username: "gmpay-usdc-checkout-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)

	requestBodies := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			require.Equal(t, "/payments/gmpay/v1/config", request.URL.Path)
			_, _ = writer.Write([]byte(`{"status_code":200,"message":"success","data":{"supported_assets":[{"network":"erc20","display_name":"Ethereum","tokens":["USDC"]}]}}`))
			return
		}
		require.Equal(t, http.MethodPost, request.Method)
		require.Equal(t, "/payments/gmpay/v1/order/create-transaction", request.URL.Path)
		var payload map[string]any
		require.NoError(t, common.DecodeJson(request.Body, &payload))
		requestBodies <- payload
		_, _ = writer.Write([]byte(fmt.Sprintf(`{"status_code":200,"message":"success","data":{"trade_id":"gateway-usdc-order","order_id":%q,"amount":10,"currency":"USD","actual_amount":"10.25","receive_address":"0x1111111111111111111111111111111111111111","token":"USDC","network":"ethereum","status":1,"expiration_time":2000000000}}`, payload["order_id"])))
	}))
	t.Cleanup(server.Close)
	previousClientFactory := newGMPayNativeClient
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		return service.NewGMPayClient(server.URL, pid, secret, server.Client())
	}
	t.Cleanup(func() { newGMPayNativeClient = previousClientFactory })

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", user.Id)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/epay/checkout", strings.NewReader(`{"amount":10,"payment_method":"usdt.tron","token":"USDC","network":"erc20"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	RequestEpayCheckout(ctx)

	var response struct {
		Message string         `json:"message"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "success", response.Message)
	assert.Equal(t, "USDC", response.Data["token"])
	assert.Equal(t, "ETHEREUM", response.Data["network"])
	assert.Equal(t, "usdt.ethereum.usdc", response.Data["asset_payment_method"])
	assert.Equal(t, "10.00", response.Data["base_amount"])
	assert.Equal(t, "0.00", response.Data["fee_amount"])
	assert.Equal(t, "10.00", response.Data["total_amount"])
	tradeNo, ok := response.Data["trade_no"].(string)
	require.True(t, ok)
	stored := model.GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, "usdt.ethereum.usdc", stored.PaymentMethod)
	assert.Equal(t, 10.0, stored.Money)

	payload := <-requestBodies
	assert.Equal(t, "usdc", payload["token"])
	assert.Equal(t, "ethereum", payload["network"])
	assert.Equal(t, float64(10), payload["amount"])
}

func TestRequestEpayCheckoutAddsConfiguredGMPayFeeWithoutIncreasingCredit(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	previousOptions := common.OptionMap
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{
		service.GMPayFeeConfigOptionKey: `{"version":1,"dynamic_enabled":false,"enabled":true,"default":{"mode":"fixed","value":"5"},"max_fee":"20","max_total":"100000"}`,
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
	})
	user := &model.User{Id: 712, Username: "gmpay-fee-checkout-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)

	requestBodies := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			_, _ = writer.Write([]byte(`{"status_code":200,"message":"success","data":{"supported_assets":[{"network":"tron","display_name":"TRON","tokens":["USDT"]}]}}`))
			return
		}
		var payload map[string]any
		require.NoError(t, common.DecodeJson(request.Body, &payload))
		requestBodies <- payload
		_, _ = writer.Write([]byte(fmt.Sprintf(`{"status_code":200,"message":"success","data":{"trade_id":"gateway-fee-order","order_id":%q,"amount":%v,"currency":"USD","actual_amount":"15.5","receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token":"USDT","network":"tron","status":1,"expiration_time":2000000000}}`, payload["order_id"], payload["amount"])))
	}))
	t.Cleanup(server.Close)
	previousClientFactory := newGMPayNativeClient
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		return service.NewGMPayClient(server.URL, pid, secret, server.Client())
	}
	t.Cleanup(func() { newGMPayNativeClient = previousClientFactory })

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", user.Id)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/epay/checkout", strings.NewReader(`{"amount":10,"payment_method":"usdt.tron","token":"USDT","network":"tron"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	RequestEpayCheckout(ctx)

	var response struct {
		Message string         `json:"message"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "success", response.Message)
	assert.Equal(t, "10.00", response.Data["base_amount"])
	assert.Equal(t, "5.00", response.Data["fee_amount"])
	assert.Equal(t, "15.00", response.Data["total_amount"])
	assert.Equal(t, service.GMPayFeeSourceAdminFixed, response.Data["fee_source"])
	tradeNo, ok := response.Data["trade_no"].(string)
	require.True(t, ok)
	stored := model.GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, int64(10), stored.Amount)
	assert.Equal(t, 15.0, stored.Money)
	assert.Equal(t, "gmpay.tron.usdt", stored.PaymentMethod)
	_, bindingPresent := service.GetGMPayQuoteBinding(tradeNo)
	assert.True(t, bindingPresent)

	payload := <-requestBodies
	assert.Equal(t, float64(15), payload["amount"])
}

func TestRequestEpayCheckoutRejectsMissingNativeAssetBeforeOrderCreation(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	user := &model.User{Id: 704, Username: "gmpay-missing-asset-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestCount++
		t.Errorf("gateway should not be called for a missing wallet asset: %s %s", request.Method, request.URL.Path)
	}))
	t.Cleanup(server.Close)
	previousClientFactory := newGMPayNativeClient
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		return service.NewGMPayClient(server.URL, pid, secret, server.Client())
	}
	t.Cleanup(func() { newGMPayNativeClient = previousClientFactory })

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", user.Id)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/epay/checkout", strings.NewReader(`{"amount":10,"payment_method":"usdt.tron"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	RequestEpayCheckout(ctx)

	assert.Equal(t, 0, requestCount)
	assert.Contains(t, recorder.Body.String(), "拉起支付失败")
	var topUpCount int64
	require.NoError(t, model.DB.Model(&model.TopUp{}).Count(&topUpCount).Error)
	assert.Zero(t, topUpCount)
}

func TestRequestEpayCheckoutRejectsStaleNativeAssetBeforeOrderCreation(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	user := &model.User{Id: 705, Username: "gmpay-stale-asset-user", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(user).Error)

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestCount++
		require.Equal(t, http.MethodGet, request.Method)
		require.Equal(t, "/payments/gmpay/v1/config", request.URL.Path)
		_, _ = writer.Write([]byte(`{"status_code":200,"message":"success","data":{"supported_assets":[{"network":"tron","display_name":"TRON","tokens":["USDT"]}]}}`))
	}))
	t.Cleanup(server.Close)
	previousClientFactory := newGMPayNativeClient
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		return service.NewGMPayClient(server.URL, pid, secret, server.Client())
	}
	t.Cleanup(func() { newGMPayNativeClient = previousClientFactory })

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", user.Id)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/epay/checkout", strings.NewReader(`{"amount":10,"payment_method":"usdt.tron","token":"USDT","network":"ethereum"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	RequestEpayCheckout(ctx)

	assert.Equal(t, 1, requestCount)
	assert.Contains(t, recorder.Body.String(), "拉起支付失败")
	var topUpCount int64
	require.NoError(t, model.DB.Model(&model.TopUp{}).Count(&topUpCount).Error)
	assert.Zero(t, topUpCount)
}

func TestAgentConsolePrepayUsesPlatformGMPayAndOwnerScopedStatus(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	owner := &model.User{Id: 709, Username: "gmpay-prepay-owner", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, model.DB.Create(owner).Error)
	agent := &model.Agent{Id: 52, OwnerUserId: owner.Id, Name: "prepay-agent", Status: model.AgentStatusActive, CostRatio: 1}
	require.NoError(t, model.DB.Create(agent).Error)

	requestBodies := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var payload map[string]any
		require.NoError(t, common.DecodeJson(request.Body, &payload))
		requestBodies <- payload
		_, _ = writer.Write([]byte(fmt.Sprintf(
			`{"status_code":200,"message":"success","data":{"trade_id":"gateway-agent-prepay","order_id":%q,"amount":%v,"currency":"USD","actual_amount":10.0123,"receive_address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","token":"USDT","status":1,"expiration_time":2000000000}}`,
			payload["order_id"], payload["amount"],
		)))
	}))
	t.Cleanup(server.Close)
	previousClientFactory := newGMPayNativeClient
	newGMPayNativeClient = func(gatewayAddress, pid, secret string) (*service.GMPayClient, error) {
		assert.Equal(t, operation_setting.EpayId, pid)
		assert.Equal(t, operation_setting.EpayKey, secret)
		return service.NewGMPayClient(server.URL, pid, secret, server.Client())
	}
	t.Cleanup(func() { newGMPayNativeClient = previousClientFactory })

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", owner.Id)
	common.SetContextKey(ctx, constant.ContextKeySelfAgentId, agent.Id)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/agent-console/prepay", strings.NewReader(`{"amount":10,"payment_method":"usdt.tron"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	AgentConsolePrepayEpay(ctx)

	var response struct {
		Message string         `json:"message"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "success", response.Message)
	assert.Equal(t, "crypto", response.Data["checkout_type"])
	assert.Equal(t, "gateway-agent-prepay", response.Data["gateway_trade_no"])
	tradeNo, ok := response.Data["trade_no"].(string)
	require.True(t, ok)
	assert.NotEmpty(t, tradeNo)
	payload := <-requestBodies
	assert.Equal(t, "https://new-api.example/api/user/gmpay/notify", payload["notify_url"])

	statusRecorder := httptest.NewRecorder()
	statusContext, _ := gin.CreateTestContext(statusRecorder)
	statusContext.Set("id", owner.Id)
	common.SetContextKey(statusContext, constant.ContextKeySelfAgentId, agent.Id)
	statusContext.Request = httptest.NewRequest(http.MethodGet, "/api/agent-console/prepay/status?trade_no="+tradeNo, nil)
	AgentConsolePrepayStatus(statusContext)
	assert.Contains(t, statusRecorder.Body.String(), common.TopUpStatusPending)

	foreignRecorder := httptest.NewRecorder()
	foreignContext, _ := gin.CreateTestContext(foreignRecorder)
	foreignContext.Set("id", owner.Id)
	common.SetContextKey(foreignContext, constant.ContextKeySelfAgentId, agent.Id+1)
	foreignContext.Request = httptest.NewRequest(http.MethodGet, "/api/agent-console/prepay/status?trade_no="+tradeNo, nil)
	AgentConsolePrepayStatus(foreignContext)
	assert.Contains(t, foreignRecorder.Body.String(), "订单不存在")
}

func TestGMPayCallbackMatchesNetworklessNonTronOrderByPersistedAsset(t *testing.T) {
	params := map[string]any{
		"token":           "USDC",
		"receive_address": "0x1111111111111111111111111111111111111111",
	}
	assert.True(t, gmpayCallbackMatchesOrderAsset(params, "usdt.ethereum.usdc"))
	assert.False(t, gmpayCallbackMatchesOrderAsset(params, "usdt.ethereum.usdt"))
}

func TestGMPayCallbackMatchesNetworkFieldToPersistedAsset(t *testing.T) {
	params := map[string]any{
		"token":           "USDC",
		"network":         "polygon",
		"receive_address": "0x1111111111111111111111111111111111111111",
	}
	assert.True(t, gmpayCallbackMatchesOrderAsset(params, "usdt.polygon.usdc"))
	assert.False(t, gmpayCallbackMatchesOrderAsset(params, "usdt.ethereum.usdc"))
}

func TestGMPayCallbackMatchesNetworkAliasToPersistedAsset(t *testing.T) {
	params := map[string]any{
		"token":           "USDT",
		"network":         "ERC20",
		"receive_address": "0x1111111111111111111111111111111111111111",
	}
	assert.True(t, gmpayCallbackMatchesOrderAsset(params, "usdt.ethereum.usdt"))
}

func TestGMPayCallbackSettlesUSDCAssetsAndChargesOnlyBaseAmount(t *testing.T) {
	testCases := []struct {
		name          string
		network       string
		address       string
		paymentMethod string
	}{
		{
			name:          "ethereum",
			network:       "ethereum",
			address:       "0x1111111111111111111111111111111111111111",
			paymentMethod: "usdt.ethereum.usdc",
		},
		{
			name:          "solana",
			network:       "solana",
			address:       "11111111111111111111111111111111",
			paymentMethod: "usdt.solana.usdc",
		},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			setupGMPayTopUpTest(t)
			gin.SetMode(gin.TestMode)
			order := insertGMPayTopUpForTest(t, "gmpay-usdc-callback-"+tc.name, 35, tc.paymentMethod, model.PaymentProviderEpay)
			order.Amount = 30
			require.NoError(t, order.Update())
			params := validGMPayNotifyParams(order.TradeNo)
			params["amount"] = "35.00"
			params["actual_amount"] = "35.123456"
			params["token"] = "USDC"
			params["network"] = tc.network
			params["receive_address"] = tc.address

			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = signedGMPayNotifyRequest(t, params)
			GMPayNotify(ctx)
			assert.Equal(t, "ok", recorder.Body.String())

			stored := model.GetTopUpByTradeNo(order.TradeNo)
			require.NotNil(t, stored)
			assert.Equal(t, common.TopUpStatusSuccess, stored.Status)
			var user model.User
			require.NoError(t, model.DB.First(&user, order.UserId).Error)
			quota, err := topupQuotaFromAmount(30)
			require.NoError(t, err)
			assert.Equal(t, quota, user.Quota)
		})
	}
}

func TestGMPayCallbackRejectsSignedAmountMismatches(t *testing.T) {
	testCases := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{
			name: "signed amount below order total",
			mutate: func(params map[string]any) {
				params["amount"] = "30.00"
				params["actual_amount"] = "30.00"
			},
		},
		{
			name: "signed amount above order total",
			mutate: func(params map[string]any) {
				params["amount"] = "40.00"
				params["actual_amount"] = "40.00"
			},
		},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			setupGMPayTopUpTest(t)
			gin.SetMode(gin.TestMode)
			order := insertGMPayTopUpForTest(t, "gmpay-fee-reject-"+strings.ReplaceAll(tc.name, " ", "-"), 35, "usdt.ethereum.usdc", model.PaymentProviderEpay)
			params := validGMPayNotifyParams(order.TradeNo)
			params["token"] = "USDC"
			params["network"] = "ethereum"
			params["receive_address"] = "0x1111111111111111111111111111111111111111"
			tc.mutate(params)

			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = signedGMPayNotifyRequest(t, params)
			GMPayNotify(ctx)
			assert.Equal(t, "fail", recorder.Body.String())
			stored := model.GetTopUpByTradeNo(order.TradeNo)
			require.NotNil(t, stored)
			assert.Equal(t, common.TopUpStatusPending, stored.Status)
			var user model.User
			require.NoError(t, model.DB.First(&user, order.UserId).Error)
			assert.Zero(t, user.Quota)
		})
	}
}

func TestGMPayCallbackKeepsHistoricalNonStablecoinBindingCompatible(t *testing.T) {
	params := map[string]any{
		"token":           "DAI",
		"network":         "ethereum",
		"receive_address": "0x1111111111111111111111111111111111111111",
	}
	assert.True(t, gmpayCallbackMatchesOrderAsset(params, "usdt.ethereum.dai"))
}

func TestGMPayNotifyFailsClosedWhenQuotedOrderBindingIsMissing(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	order := insertGMPayTopUpForTest(t, "gmpay-quoted-binding-missing", 15, "gmpay.tron.usdt", model.PaymentProviderEpay)
	params := validGMPayNotifyParams(order.TradeNo)
	params["amount"] = "15.00"
	params["actual_amount"] = "15.00"

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = signedGMPayNotifyRequest(t, params)
	GMPayNotify(ctx)

	assert.Equal(t, "fail", recorder.Body.String())
	stored := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusPending, stored.Status)
	var user model.User
	require.NoError(t, model.DB.First(&user, order.UserId).Error)
	assert.Zero(t, user.Quota)
}

func TestGMPayNotifyAcceptsValidQuotedBindingAndSettlesOnce(t *testing.T) {
	setupGMPayTopUpTest(t)
	gin.SetMode(gin.TestMode)
	order := insertGMPayTopUpForTest(t, "gmpay-quoted-binding-valid", 15, "gmpay.tron.usdt", model.PaymentProviderEpay)
	now := time.Now().UTC()
	quote := service.GMPayFeeQuote{
		BaseAmount:         decimal.NewFromInt(10),
		FeeAmount:          decimal.NewFromInt(5),
		TotalAmount:        decimal.NewFromInt(15),
		Source:             service.GMPayFeeSourceAdminFallback,
		SettlementCurrency: "USD",
		QuotedAt:           now.Add(-time.Second),
		ExpiresAt:          now.Add(5 * time.Minute),
	}
	require.NoError(t, service.StoreGMPayQuoteBinding(order.TradeNo, order.PaymentMethod, "USDT", "tron", quote))
	params := validGMPayNotifyParams(order.TradeNo)
	params["amount"] = "15.00"
	params["actual_amount"] = "15.00"

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = signedGMPayNotifyRequest(t, params)
	GMPayNotify(ctx)

	assert.Equal(t, "ok", recorder.Body.String())
	_, bindingPresent := service.GetGMPayQuoteBinding(order.TradeNo)
	assert.False(t, bindingPresent)
	stored := model.GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, stored)
	assert.Equal(t, common.TopUpStatusSuccess, stored.Status)
}

func TestGMPayTopupLogContentLabelsQuoteProvenance(t *testing.T) {
	quotedAt := time.Date(2026, time.September, 1, 0, 0, 0, 0, time.UTC)
	expiresAt := quotedAt.Add(5 * time.Minute)
	tests := []struct {
		name   string
		source string
		label  string
	}{
		{
			name:   "dynamic network estimate",
			source: service.GMPayFeeSourceChainNetworkEstimate,
			label:  "动态网络费用估算",
		},
		{
			name:   "administrator fallback",
			source: service.GMPayFeeSourceAdminFallback,
			label:  "人工兜底",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			quote := service.GMPayFeeQuote{
				FeeAmount:          decimal.NewFromFloat(0.42),
				Source:             tc.source,
				SettlementCurrency: "usd",
				QuotedAt:           quotedAt,
				ExpiresAt:          expiresAt,
			}

			suffix := gmpayTopupLogQuoteSuffix(quote)
			require.Contains(t, suffix, "费用来源："+tc.label)
			require.Contains(t, suffix, "fee_source="+tc.source)
			require.Contains(t, suffix, "fee_amount=0.42")
			require.Contains(t, suffix, "settlement_currency=USD")
			content := gmpayTopupLogContent(1, 10.42, quote)
			assert.Contains(t, content, suffix)
			assert.NotContains(t, content, "网关服务费")
		})
	}
}

func TestGMPayTopupLogContentPreservesLegacyWording(t *testing.T) {
	content := gmpayTopupLogContent(1, 10, service.GMPayFeeQuote{
		Source: service.GMPayFeeSourceGatewayIncluded,
	})
	assert.Equal(t, "使用在线充值成功，充值金额: "+logger.LogQuota(1)+"，支付金额：10.000000", content)
	assert.NotContains(t, content, "费用来源")
}
