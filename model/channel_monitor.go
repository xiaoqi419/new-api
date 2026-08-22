package model

import "fmt"

// ChannelModelBucketStat holds per-channel, per-model, per-hour aggregated log
// statistics used by the channel monitor dashboard. Availability is derived from
// consume (success) vs error logs; latency, throughput and first-token latency
// use only successful consume logs.
type ChannelModelBucketStat struct {
	ChannelId       int    `gorm:"column:channel_id"`
	Model           string `gorm:"column:model_name"`
	Bucket          int64  `gorm:"column:bucket"`
	SuccessCount    int64  `gorm:"column:success_count"`
	ErrorCount      int64  `gorm:"column:error_count"`
	TotalTime       int64  `gorm:"column:total_time"`
	TotalCompletion int64  `gorm:"column:total_completion"`
	TotalTtft       int64  `gorm:"column:total_ttft"`
	TtftCount       int64  `gorm:"column:ttft_count"`
}

// GetChannelModelMonitorStats aggregates logs by channel, model and hourly
// bucket over [startTimestamp, endTimestamp]. The hourly bucket expression
// (created_at - created_at % 3600), the CASE/SUM aggregation and the GROUP BY
// are portable across SQLite, MySQL and PostgreSQL.
func GetChannelModelMonitorStats(startTimestamp, endTimestamp int64) ([]ChannelModelBucketStat, error) {
	bucketExpr := "(created_at - (created_at % 3600))"
	selectExpr := fmt.Sprintf(
		"channel_id, model_name, %s as bucket, "+
			"SUM(CASE WHEN type = %d THEN 1 ELSE 0 END) as success_count, "+
			"SUM(CASE WHEN type = %d THEN 1 ELSE 0 END) as error_count, "+
			"SUM(CASE WHEN type = %d THEN use_time ELSE 0 END) as total_time, "+
			"SUM(CASE WHEN type = %d THEN completion_tokens ELSE 0 END) as total_completion, "+
			"SUM(CASE WHEN type = %d AND first_token_ms > 0 THEN first_token_ms ELSE 0 END) as total_ttft, "+
			"SUM(CASE WHEN type = %d AND first_token_ms > 0 THEN 1 ELSE 0 END) as ttft_count",
		bucketExpr, LogTypeConsume, LogTypeError, LogTypeConsume, LogTypeConsume, LogTypeConsume, LogTypeConsume)

	tx := LOG_DB.Table("logs").
		Select(selectExpr).
		Where("created_at >= ? AND created_at <= ?", startTimestamp, endTimestamp).
		Where("type IN ?", []int{LogTypeConsume, LogTypeError}).
		Where("channel_id > 0").
		Group("channel_id, model_name, " + bucketExpr)

	var stats []ChannelModelBucketStat
	if err := tx.Scan(&stats).Error; err != nil {
		return nil, err
	}
	return stats, nil
}
