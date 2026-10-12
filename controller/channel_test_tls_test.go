package controller

import (
	"context"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChannelTestHonorsTLSVerificationPerChannel(t *testing.T) {
	savedDB, savedLogDB, savedRedis := model.DB, model.LOG_DB, common.RedisEnabled
	savedMainType, savedLogType := common.MainDatabaseType(), common.LogDatabaseType()
	savedRatios := ratio_setting.ModelRatio2JSONString()
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled = savedDB, savedLogDB, savedRedis
		common.SetDatabaseTypes(savedMainType, savedLogType)
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(savedRatios))
		service.ResetProxyClientCache()
	})
	db := setupModelListControllerTestDB(t)
	user := model.User{Id: 91092, Username: "tls-test", Group: "default", Status: common.UserStatusEnabled, Quota: 1000000}
	require.NoError(t, db.Create(&user).Error)
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"tls-test":1}`))
	service.ResetProxyClientCache()

	var requests atomic.Int32
	var protocol atomic.Int32
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		protocol.Store(int32(r.ProtoMajor))
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"tls-test","object":"chat.completion","model":"tls-test","choices":[{"index":0,"message":{"role":"assistant","content":"OK"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":1,"total_tokens":11}}`)
	}))
	server.EnableHTTP2 = true
	server.Config.ErrorLog = log.New(io.Discard, "", 0)
	server.StartTLS()
	defer server.Close()

	for _, test := range []struct {
		name     string
		insecure bool
		protocol string
	}{
		{name: "untrusted certificate rejected"},
		{name: "channel opts out of verification", insecure: true},
		{name: "forced HTTP1 retains TLS opt out", insecure: true, protocol: dto.HTTPProtocolHTTP1},
		{name: "verified channel remains isolated from insecure clients"},
	} {
		t.Run(test.name, func(t *testing.T) {
			settings, err := common.Marshal(dto.ChannelSettings{TLSInsecureSkipVerify: test.insecure, HTTPProtocol: test.protocol})
			require.NoError(t, err)
			channel := &model.Channel{
				Id: 912, Name: "tls-test", Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled,
				Key: "test-key", BaseURL: common.GetPointer(server.URL), Setting: common.GetPointer(string(settings)),
				Models: "tls-test", Group: "default",
			}
			before := requests.Load()
			result := testChannel(context.Background(), channel, user.Id, "tls-test", channelTestOptions{endpointType: string(constant.EndpointTypeOpenAI), silent: true})
			if !test.insecure {
				require.Error(t, result.localErr)
				assert.NotNil(t, result.newAPIError)
				assert.Equal(t, before, requests.Load())
				return
			}
			require.NoError(t, result.localErr)
			assert.Nil(t, result.newAPIError)
			assert.Equal(t, before+1, requests.Load())
			if test.protocol == dto.HTTPProtocolHTTP1 {
				assert.Equal(t, int32(1), protocol.Load())
			} else {
				assert.Equal(t, int32(2), protocol.Load())
			}
		})
	}
}
