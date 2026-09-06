package service

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/require"
)

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
