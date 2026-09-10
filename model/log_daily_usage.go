package model

type DailyUsageSummary struct {
	InputTokens     int64    `json:"input_tokens" gorm:"column:input_tokens"`
	TotalTokens     int64    `json:"total_tokens" gorm:"column:total_tokens"`
	CacheReadTokens int64    `json:"cache_read_tokens" gorm:"column:cache_read_tokens"`
	CacheRate       *float64 `json:"cache_rate" gorm:"-"`
}

type dailyUsageSummaryRow struct {
	InputTokens      int64 `gorm:"column:input_tokens"`
	TotalTokens      int64 `gorm:"column:total_tokens"`
	CacheReadTokens  int64 `gorm:"column:cache_read_tokens"`
	CacheInputTokens int64 `gorm:"column:cache_input_tokens"`
}

func GetUserDailyUsageSummary(userID int, startTimestamp, endTimestamp int64) (DailyUsageSummary, error) {
	validCacheTelemetry := "input_tokens > 0 AND cache_read_tokens >= 0 AND cache_read_tokens <= input_tokens AND cache_write_tokens >= 0 AND cache_write_tokens <= input_tokens - cache_read_tokens"
	canonicalInput := "CASE WHEN " + validCacheTelemetry + " THEN input_tokens ELSE prompt_tokens END"
	selectExpr := "COALESCE(SUM(" + canonicalInput + "), 0) as input_tokens, " +
		"COALESCE(SUM(" + canonicalInput + " + completion_tokens), 0) as total_tokens, " +
		"COALESCE(SUM(CASE WHEN " + validCacheTelemetry + " THEN cache_read_tokens ELSE 0 END), 0) as cache_read_tokens, " +
		"COALESCE(SUM(CASE WHEN " + validCacheTelemetry + " THEN input_tokens ELSE 0 END), 0) as cache_input_tokens"

	var row dailyUsageSummaryRow
	err := LOG_DB.Table("logs").
		Select(selectExpr).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userID, LogTypeConsume, startTimestamp, endTimestamp).
		Scan(&row).Error
	if err != nil {
		return DailyUsageSummary{}, err
	}

	summary := DailyUsageSummary{
		InputTokens:     row.InputTokens,
		TotalTokens:     row.TotalTokens,
		CacheReadTokens: row.CacheReadTokens,
	}
	if row.CacheInputTokens > 0 {
		cacheRate := float64(summary.CacheReadTokens) / float64(row.CacheInputTokens)
		summary.CacheRate = &cacheRate
	}
	return summary, nil
}
