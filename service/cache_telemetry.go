package service

type cacheTokenTelemetry struct {
	InputTokens      int64
	CacheReadTokens  int64
	CacheWriteTokens int64
	Valid            bool
}

type cacheTelemetryInput struct {
	ReliableInputTokens int64
	PromptTokens        int64
	CacheReadTokens     int64
	CacheWriteTokens    int64
	IsAnthropic         bool
}

func normalizeCacheTelemetry(input cacheTelemetryInput) cacheTokenTelemetry {
	telemetry := cacheTokenTelemetry{
		CacheReadTokens:  input.CacheReadTokens,
		CacheWriteTokens: input.CacheWriteTokens,
	}

	if input.ReliableInputTokens > 0 {
		telemetry.InputTokens = input.ReliableInputTokens
	} else if input.IsAnthropic {
		promptTokens := input.PromptTokens
		if promptTokens > 0 && telemetry.CacheReadTokens >= 0 && telemetry.CacheWriteTokens >= 0 &&
			promptTokens <= int64(^uint64(0)>>1)-telemetry.CacheReadTokens-telemetry.CacheWriteTokens {
			telemetry.InputTokens = promptTokens + telemetry.CacheReadTokens + telemetry.CacheWriteTokens
		}
	} else {
		telemetry.InputTokens = input.PromptTokens
	}

	telemetry.Valid = telemetry.InputTokens > 0 &&
		telemetry.CacheReadTokens >= 0 && telemetry.CacheReadTokens <= telemetry.InputTokens &&
		telemetry.CacheWriteTokens >= 0 && telemetry.CacheWriteTokens <= telemetry.InputTokens-telemetry.CacheReadTokens
	return telemetry
}
