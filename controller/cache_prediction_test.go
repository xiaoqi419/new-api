package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCalculateCachePredictionWeightsRecentHoursMoreHeavily(t *testing.T) {
	window := cachePredictionWindow{Start: 0, End: 7 * 24 * 3600, Seconds: 7 * 24 * 3600}
	prediction := calculateCachePrediction([]cachePredictionBucket{
		{Bucket: window.End - 72*3600, Samples: 20, Input: 10000, CacheRead: 1000},
		{Bucket: window.End - 48*3600, Samples: 20, Input: 10000, CacheRead: 1000},
		{Bucket: window.End - 3600, Samples: 20, Input: 10000, CacheRead: 5000},
	}, window, window)

	require.NotNil(t, prediction.ObservedRate)
	require.NotNil(t, prediction.PredictedRate)
	assert.InDelta(t, 23.3, *prediction.ObservedRate, 0.01)
	assert.Greater(t, *prediction.PredictedRate, *prediction.ObservedRate)
	assert.Equal(t, int64(60), prediction.SampleCount)
	assert.Equal(t, int64(30000), prediction.InputTokens)
	assert.Equal(t, "low", prediction.Support)
	assert.False(t, prediction.InsufficientData)
	assert.Empty(t, prediction.Reason)
}

func TestCalculateCachePredictionDistinguishesNoCacheEvidence(t *testing.T) {
	window := cachePredictionWindow{Start: 0, End: 7 * 24 * 3600, Seconds: 7 * 24 * 3600}
	prediction := calculateCachePrediction([]cachePredictionBucket{
		{Bucket: window.End - 3600, Samples: 25, Input: 15000},
	}, window, window)

	assert.Nil(t, prediction.ObservedRate)
	assert.Nil(t, prediction.PredictedRate)
	assert.Equal(t, "none", prediction.Support)
	assert.True(t, prediction.InsufficientData)
	assert.Equal(t, "no_cache_evidence", prediction.Reason)
}

func TestCalculateCachePredictionTreatsWriteOnlyTelemetryAsCacheEvidence(t *testing.T) {
	window := cachePredictionWindow{Start: 0, End: 7 * 24 * 3600, Seconds: 7 * 24 * 3600}
	prediction := calculateCachePrediction([]cachePredictionBucket{
		{Bucket: window.End - 3*3600, Samples: 20, Input: 10000, CacheWrite: 1000},
		{Bucket: window.End - 2*3600, Samples: 20, Input: 10000, CacheWrite: 1000},
		{Bucket: window.End - 3600, Samples: 20, Input: 10000, CacheWrite: 1000},
	}, window, window)

	require.NotNil(t, prediction.ObservedRate)
	require.NotNil(t, prediction.PredictedRate)
	assert.Equal(t, 0.0, *prediction.ObservedRate)
	assert.Equal(t, 0.0, *prediction.PredictedRate)
	assert.Equal(t, "low", prediction.Support)
	assert.False(t, prediction.InsufficientData)
	assert.Empty(t, prediction.Reason)
}

func TestCalculateCachePredictionKeepsObservedRateWhenOnlyOlderWindowHasCacheEvidence(t *testing.T) {
	observedWindow := cachePredictionWindow{Start: 0, End: 15 * 24 * 3600, Seconds: 15 * 24 * 3600}
	predictionWindow := cachePredictionWindow{Start: 8 * 24 * 3600, End: observedWindow.End, Seconds: 7 * 24 * 3600}
	prediction := calculateCachePrediction([]cachePredictionBucket{
		{Bucket: observedWindow.End - 10*24*3600, Samples: 20, Input: 10000, CacheRead: 1000},
		{Bucket: predictionWindow.Start + 3600, Samples: 20, Input: 10000},
		{Bucket: predictionWindow.Start + 2*3600, Samples: 20, Input: 10000},
		{Bucket: predictionWindow.Start + 3*3600, Samples: 20, Input: 10000},
	}, observedWindow, predictionWindow)

	require.NotNil(t, prediction.ObservedRate)
	assert.InDelta(t, 2.5, *prediction.ObservedRate, 0.01)
	assert.Nil(t, prediction.PredictedRate)
	assert.True(t, prediction.InsufficientData)
	assert.Equal(t, "no_cache_evidence", prediction.Reason)
}

func TestCombineCachePredictionBucketsCountsAnHourOnce(t *testing.T) {
	combined := combineCachePredictionBuckets([]cachePredictionBucket{
		{Bucket: 3600, Samples: 20, Input: 10000, CacheRead: 1000},
		{Bucket: 3600, Samples: 20, Input: 10000, CacheRead: 1000},
	})

	require.Len(t, combined, 1)
	assert.Equal(t, int64(40), combined[0].Samples)
	assert.Equal(t, int64(20000), combined[0].Input)
	assert.Equal(t, int64(2000), combined[0].CacheRead)
}
