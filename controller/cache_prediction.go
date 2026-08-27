package controller

import "math"

const (
	cachePredictionDays            = 7
	cachePredictionHalfLifeHours   = 24
	cachePredictionForecastSeconds = 24 * 60 * 60
	cachePredictionMinSamples      = 20
	cachePredictionMinInputTokens  = 10000
	cachePredictionMinActiveHours  = 3
)

type cachePredictionWindow struct {
	Start   int64 `json:"start"`
	End     int64 `json:"end"`
	Seconds int64 `json:"seconds"`
}

// channelCachePrediction is the stable cache-rate API contract shared by
// channel and model monitor rows. SampleCount and InputTokens describe the
// fixed seven-day prediction source window, even when ObservedRate uses a
// longer monitor window selected by the caller.
type channelCachePrediction struct {
	ObservedRate               *float64              `json:"observed_rate"`
	PredictedRate              *float64              `json:"predicted_rate"`
	SampleCount                int64                 `json:"sample_count"`
	InputTokens                int64                 `json:"input_tokens"`
	Support                    string                `json:"support"`
	ObservedWindow             cachePredictionWindow `json:"observed_window"`
	PredictionWindow           cachePredictionWindow `json:"prediction_window"`
	ForecastHorizonSeconds     int64                 `json:"forecast_horizon_seconds"`
	InsufficientData           bool                  `json:"insufficient_data"`
	Reason                     string                `json:"reason"`
	hasObservedCacheEvidence   bool
	hasPredictionCacheEvidence bool
}

type cachePredictionBucket struct {
	Bucket     int64
	Samples    int64
	Input      int64
	CacheRead  int64
	CacheWrite int64
}

type cachePredictionTotals struct {
	samples     int64
	input       int64
	cacheRead   int64
	cacheWrite  int64
	activeHours int64
}

func calculateCachePrediction(buckets []cachePredictionBucket, observedWindow, predictionWindow cachePredictionWindow) channelCachePrediction {
	return calculateCachePredictionFromWindowBuckets(buckets, buckets, observedWindow, predictionWindow)
}

func calculateCachePredictionFromWindowBuckets(observedBuckets, predictionBuckets []cachePredictionBucket, observedWindow, predictionWindow cachePredictionWindow) channelCachePrediction {
	observedTotals := cachePredictionTotals{}
	predictionTotals := cachePredictionTotals{}
	weightedInput := 0.0
	weightedRead := 0.0

	for _, bucket := range observedBuckets {
		if !isValidCachePredictionBucket(bucket) || bucket.Bucket < observedWindow.Start || bucket.Bucket >= observedWindow.End {
			continue
		}
		observedTotals.samples += bucket.Samples
		observedTotals.input += bucket.Input
		observedTotals.cacheRead += bucket.CacheRead
		observedTotals.cacheWrite += bucket.CacheWrite
	}

	for _, bucket := range predictionBuckets {
		if !isValidCachePredictionBucket(bucket) || bucket.Bucket < predictionWindow.Start || bucket.Bucket >= predictionWindow.End {
			continue
		}

		predictionTotals.samples += bucket.Samples
		predictionTotals.input += bucket.Input
		predictionTotals.cacheRead += bucket.CacheRead
		predictionTotals.cacheWrite += bucket.CacheWrite
		predictionTotals.activeHours++

		ageHours := float64(predictionWindow.End-bucket.Bucket) / 3600.0
		if ageHours < 0 {
			ageHours = 0
		}
		weight := math.Exp2(-ageHours / cachePredictionHalfLifeHours)
		weightedInput += weight * float64(bucket.Input)
		weightedRead += weight * float64(bucket.CacheRead)
	}

	prediction := channelCachePrediction{
		SampleCount:            predictionTotals.samples,
		InputTokens:            predictionTotals.input,
		Support:                "none",
		ObservedWindow:         observedWindow,
		PredictionWindow:       predictionWindow,
		ForecastHorizonSeconds: cachePredictionForecastSeconds,
	}
	prediction.hasObservedCacheEvidence = observedTotals.cacheRead > 0 || observedTotals.cacheWrite > 0
	prediction.hasPredictionCacheEvidence = predictionTotals.cacheRead > 0 || predictionTotals.cacheWrite > 0
	if observedTotals.input > 0 && prediction.hasObservedCacheEvidence {
		observedRate := cacheRatePercent(float64(observedTotals.cacheRead), float64(observedTotals.input))
		prediction.ObservedRate = &observedRate
	}

	switch {
	case predictionTotals.samples == 0 || predictionTotals.input == 0:
		prediction.Reason = "no_eligible_requests"
	case !prediction.hasPredictionCacheEvidence:
		prediction.Reason = "no_cache_evidence"
	case predictionTotals.samples < cachePredictionMinSamples || predictionTotals.input < cachePredictionMinInputTokens:
		prediction.Reason = "too_few_samples"
	case predictionTotals.activeHours < cachePredictionMinActiveHours:
		prediction.Reason = "insufficient_history"
	default:
		predictedRate := cacheRatePercent(weightedRead, weightedInput)
		prediction.PredictedRate = &predictedRate
		prediction.Support = cachePredictionSupport(predictionTotals)
	}
	prediction.InsufficientData = prediction.Reason != ""
	return prediction
}

func isValidCachePredictionBucket(bucket cachePredictionBucket) bool {
	return bucket.Samples > 0 && bucket.Input > 0 && bucket.CacheRead >= 0 && bucket.CacheWrite >= 0 &&
		bucket.CacheRead <= bucket.Input && bucket.CacheWrite <= bucket.Input-bucket.CacheRead
}

func cachePredictionSupport(totals cachePredictionTotals) string {
	if totals.samples >= 100 && totals.input >= 100000 && totals.activeHours >= 24 {
		return "high"
	}
	if totals.samples >= 40 && totals.input >= 50000 && totals.activeHours >= 12 {
		return "medium"
	}
	return "low"
}

func cacheRatePercent(read, input float64) float64 {
	if input <= 0 {
		return 0
	}
	rate := read / input * 100
	if rate < 0 {
		rate = 0
	} else if rate > 100 {
		rate = 100
	}
	return math.Round(rate*10) / 10
}

func combineCachePredictionBuckets(buckets []cachePredictionBucket) []cachePredictionBucket {
	byHour := make(map[int64]cachePredictionBucket, len(buckets))
	for _, bucket := range buckets {
		combined := byHour[bucket.Bucket]
		combined.Bucket = bucket.Bucket
		combined.Samples += bucket.Samples
		combined.Input += bucket.Input
		combined.CacheRead += bucket.CacheRead
		combined.CacheWrite += bucket.CacheWrite
		byHour[bucket.Bucket] = combined
	}
	combined := make([]cachePredictionBucket, 0, len(byHour))
	for _, bucket := range byHour {
		combined = append(combined, bucket)
	}
	return combined
}
