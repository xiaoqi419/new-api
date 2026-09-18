package service

import (
	"net/http/httptest"
	"strings"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTextQuotaSettlementKeepsBaseRatesAfterUpstreamReasoningSuffix(t *testing.T) {
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.6-sol", RelayMode: relayconstant.RelayModeChatCompletions, RelayFormat: types.RelayFormatOpenAI,
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gpt-5.6-sol", ChannelSetting: dto.ChannelSettings{ReasoningEffortToModelSuffix: true}},
		PriceData:   hosttypes.PriceData{ModelRatio: 2, CompletionRatio: 3, CacheRatio: 0.1, GroupRatioInfo: hosttypes.GroupRatioInfo{GroupRatio: 1}},
	}
	usage := &dto.Usage{PromptTokens: 1000, CompletionTokens: 10, TotalTokens: 1010, PromptTokensDetails: dto.InputTokenDetails{CachedTokens: 500}}
	before := calculateTextQuotaSummary(ctx, info, usage)
	_, err := relaycommon.ReasoningEffortModelSuffixBody(info, strings.NewReader(`{"model":"gpt-5.6-sol","reasoning_effort":"low"}`))
	require.NoError(t, err)
	after := calculateTextQuotaSummary(ctx, info, usage)
	assert.Equal(t, "gpt-5.6-sol-low", info.UpstreamModelName)
	assert.Equal(t, "gpt-5.6-sol", after.ModelName)
	assert.Equal(t, before.Quota, after.Quota)
	// (500 uncached + 500 * 0.1 cached + 10 * 3 output) * 2 input ratio.
	assert.Equal(t, 1160, after.Quota)
}

func TestCalculateAudioQuotaUsesCanonicalBillingModelRatios(t *testing.T) {
	savedCompletion := ratio_setting.CompletionRatio2JSONString()
	savedAudio := ratio_setting.AudioRatio2JSONString()
	savedAudioCompletion := ratio_setting.AudioCompletionRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(savedCompletion))
		require.NoError(t, ratio_setting.UpdateAudioRatioByJSONString(savedAudio))
		require.NoError(t, ratio_setting.UpdateAudioCompletionRatioByJSONString(savedAudioCompletion))
	})

	const billingModel = "canonical-audio-model@thinking:on"
	require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{"`+billingModel+`":2}`))
	require.NoError(t, ratio_setting.UpdateAudioRatioByJSONString(`{"`+billingModel+`":3}`))
	require.NoError(t, ratio_setting.UpdateAudioCompletionRatioByJSONString(`{"`+billingModel+`":4}`))

	quota, clamp := calculateAudioQuota(QuotaInfo{
		ModelName: billingModel,
		InputDetails: TokenDetails{
			TextTokens:  100,
			AudioTokens: 5,
		},
		OutputDetails: TokenDetails{
			TextTokens:  10,
			AudioTokens: 2,
		},
		ModelRatio: 1,
		GroupRatio: 1,
	})
	require.Nil(t, clamp)
	// 100 + (10*2) + (5*3) + (2*3*4) = 159.
	require.Equal(t, 159, quota)
}
