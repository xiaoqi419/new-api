package controller

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChannelTestReasoningSuffixWireContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	savedDB, savedLogDB, savedPath, savedMaster, savedRedis := model.DB, model.LOG_DB, common.SQLitePath, common.IsMasterNode, common.RedisEnabled
	common.SQLitePath = filepath.Join(t.TempDir(), "suffix.db")
	common.IsMasterNode, common.RedisEnabled = false, false
	t.Setenv("SQL_DSN", "")
	t.Setenv("LOG_SQL_DSN", "")
	require.NoError(t, model.InitDB())
	db := model.DB
	model.LOG_DB = db
	t.Cleanup(func() {
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
		model.DB, model.LOG_DB, common.SQLitePath, common.IsMasterNode, common.RedisEnabled = savedDB, savedLogDB, savedPath, savedMaster, savedRedis
	})
	require.NoError(t, db.AutoMigrate(&model.User{}))
	user := model.User{Id: 91091, Username: "suffix-test", Group: "default", Status: common.UserStatusEnabled, Quota: 1000000}
	require.NoError(t, db.Create(&user).Error)
	savedRatios := ratio_setting.ModelRatio2JSONString()
	savedGlobal := model_setting.GetGlobalSettings().PassThroughRequestEnabled
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(savedRatios))
		model_setting.GetGlobalSettings().PassThroughRequestEnabled = savedGlobal
	})
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"gpt-5.6-sol":1,"gpt-5.6-sol-low":1}`))
	for _, tc := range []struct {
		name, requested, effort, expected string
		enabled, passthrough, global      bool
	}{
		{"passthrough keeps suffix", "gpt-5.6-sol-low", "", "gpt-5.6-sol-low", false, true, false},
		{"global passthrough keeps suffix", "gpt-5.6-sol-low", "", "gpt-5.6-sol-low", false, false, true},
		{"enabled", "gpt-5.6-sol", "low", "gpt-5.6-sol-low", true, false, false},
		{"enabled passthrough", "gpt-5.6-sol", "low", "gpt-5.6-sol-low", true, true, false},
		{"no effort keeps model", "gpt-5.6-sol-low", "", "gpt-5.6-sol-low", true, false, false},
		{"disabled keeps effort", "gpt-5.6-sol", "low", "gpt-5.6-sol", false, false, false},
		{"passthrough mapping without effort", "gpt-5.6-sol", "", "gpt-5.6-sol", true, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			model_setting.GetGlobalSettings().PassThroughRequestEnabled = tc.global
			captured := make(chan map[string]any, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var payload map[string]any
				if err := common.DecodeJson(r.Body, &payload); err != nil {
					t.Error(err)
				}
				captured <- payload
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, `{"id":"test","object":"chat.completion","model":"gpt-5.6-sol-low","choices":[{"index":0,"message":{"role":"assistant","content":"OK"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":1,"total_tokens":11}}`)
			}))
			defer server.Close()
			settings, err := common.Marshal(dto.ChannelSettings{PassThroughBodyEnabled: tc.passthrough, ReasoningEffortToModelSuffix: tc.enabled})
			require.NoError(t, err)
			ch := &model.Channel{Id: 911, Name: "suffix", Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Key: "test-key", BaseURL: common.GetPointer(server.URL), Setting: common.GetPointer(string(settings)), Models: tc.requested, Group: "default"}
			if tc.name == "passthrough mapping without effort" {
				ch.ModelMapping = common.GetPointer(`{"gpt-5.6-sol":"mapped-model"}`)
			}
			result := testChannel(context.Background(), ch, user.Id, tc.requested, channelTestOptions{endpointType: string(constant.EndpointTypeOpenAI), reasoningEffort: tc.effort, silent: true})
			require.NoError(t, result.localErr)
			require.Nil(t, result.newAPIError)
			payload := <-captured
			assert.Equal(t, tc.expected, payload["model"])
			if tc.enabled || tc.effort == "" {
				assert.NotContains(t, payload, "reasoning_effort")
			} else {
				assert.Equal(t, tc.effort, payload["reasoning_effort"])
			}
		})
	}
}

func TestReasoningSuffixKeepsBaseBillingAndTieredSettlement(t *testing.T) {
	gin.SetMode(gin.TestMode)
	saved := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(k, v string) error { saved[k] = v; return nil }))
	savedRatios, savedCompletion, savedCache := ratio_setting.ModelRatio2JSONString(), ratio_setting.CompletionRatio2JSONString(), ratio_setting.CacheRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, config.GlobalConfig.LoadFromDB(saved))
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(savedRatios))
		require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(savedCompletion))
		require.NoError(t, ratio_setting.UpdateCacheRatioByJSONString(savedCache))
	})
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"suffix-billing-base":2,"suffix-billing-base-low":99}`))
	require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{"suffix-billing-base":3,"suffix-billing-base-low":99}`))
	require.NoError(t, ratio_setting.UpdateCacheRatioByJSONString(`{"suffix-billing-base":0.1,"suffix-billing-base-low":99}`))
	for _, tiered := range []bool{false, true} {
		if tiered {
			require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
				"billing_setting.billing_mode": `{"suffix-billing-base":"tiered_expr","suffix-billing-base-low":"tiered_expr"}`,
				"billing_setting.billing_expr": `{"suffix-billing-base":"param(\"reasoning_effort\") == \"low\" ? (len <= 1000 ? tier(\"base\", p * 2 + c * 6 + cr * 0.2) : tier(\"long\", p * 4 + c * 12 + cr * 0.4)) : tier(\"wrong\", p * 999)","suffix-billing-base-low":"tier(\"wrong\", p * 999)"}`,
			}))
		}
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
		payload := `{"model":"suffix-billing-base","reasoning_effort":"low"}`
		info := &relaycommon.RelayInfo{OriginModelName: "suffix-billing-base", UserGroup: "default", UsingGroup: "default", RelayMode: relayconstant.RelayModeChatCompletions,
			BillingRequestInput: &billingexpr.RequestInput{Body: []byte(payload)}, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "suffix-billing-base", ChannelSetting: dto.ChannelSettings{ReasoningEffortToModelSuffix: true}}}
		price, err := helper.ModelPriceHelper(ctx, info, 1000, &types.TokenCountMeta{MaxTokens: 10})
		require.NoError(t, err)
		_, err = relaycommon.ReasoningEffortModelSuffixBody(info, strings.NewReader(payload))
		require.NoError(t, err)
		assert.Equal(t, "suffix-billing-base-low", info.UpstreamModelName)
		assert.Equal(t, "suffix-billing-base", info.GetBillingModelName())
		usage := &dto.Usage{PromptTokens: 1000, CompletionTokens: 10, TotalTokens: 1010}
		usage.PromptTokensDetails.CachedTokens = 500
		quota, result := settleTestQuota(info, price, usage)
		if tiered {
			assert.Equal(t, 1030, price.QuotaToPreConsume)
			assert.Equal(t, 580, quota)
			require.NotNil(t, result)
			assert.Equal(t, "base", result.MatchedTier)
		} else {
			assert.Equal(t, 2.0, price.ModelRatio)
			assert.Equal(t, 3.0, price.CompletionRatio)
			assert.Equal(t, 0.1, price.CacheRatio)
			// Channel test logs keep their existing undiscounted token estimate.
			assert.Equal(t, 2060, quota)
		}
	}
}
