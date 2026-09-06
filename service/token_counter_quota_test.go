package service

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestAccumulateAudioTokenRejectsInvalidDuration(t *testing.T) {
	for _, duration := range []float64{-1, math.NaN(), math.Inf(1), math.Inf(-1)} {
		t.Run(formatFloatForTest(duration), func(t *testing.T) {
			got, clamp, err := accumulateAudioToken(0, duration)
			require.Error(t, err)
			require.Zero(t, got)
			require.Nil(t, clamp)
		})
	}
}

func TestAccumulateAudioTokenRejectsSaturatedPerFileAndAggregate(t *testing.T) {
	perFileDuration := float64(common.MaxQuota+1) * 60 / 1000
	got, clamp, err := accumulateAudioToken(0, perFileDuration)
	require.Error(t, err)
	require.Zero(t, got)
	require.NotNil(t, clamp)
	require.Equal(t, common.QuotaClampOverflow, clamp.Kind)

	got, clamp, err = accumulateAudioToken(common.MaxQuota, 0.06)
	require.Error(t, err)
	require.Zero(t, got)
	require.NotNil(t, clamp)
	require.Equal(t, common.QuotaClampOverflow, clamp.Kind)
}

func TestAccumulateAudioTokenPreservesRoundedTotal(t *testing.T) {
	// Preserve the existing minute quantization: duration is ceiled before the
	// 1000-token-per-minute conversion (60.001s therefore costs 1017 tokens).
	got, clamp, err := accumulateAudioToken(0, 60.001)
	require.NoError(t, err)
	require.Nil(t, clamp)
	require.Equal(t, 1017, got)

	got, clamp, err = accumulateAudioToken(got, 0.06)
	require.NoError(t, err)
	require.Nil(t, clamp)
	require.Equal(t, 1034, got)
}

func formatFloatForTest(value float64) string {
	switch {
	case math.IsNaN(value):
		return "nan"
	case math.IsInf(value, 1):
		return "positive-inf"
	case math.IsInf(value, -1):
		return "negative-inf"
	default:
		return "negative"
	}
}
