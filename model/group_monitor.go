package model

import "fmt"

// GroupBucketStat holds per-group, per-hour aggregated log statistics used by
// the channel monitor dashboard. Availability is derived from consume (success)
// vs error logs; latency and throughput use only successful consume logs.
type GroupBucketStat struct {
	Group           string `gorm:"column:grp"`
	Bucket          int64  `gorm:"column:bucket"`
	SuccessCount    int64  `gorm:"column:success_count"`
	ErrorCount      int64  `gorm:"column:error_count"`
	TotalTime       int64  `gorm:"column:total_time"`
	TotalCompletion int64  `gorm:"column:total_completion"`
}

// GetGroupMonitorStats aggregates logs by user group and hourly bucket over
// [startTimestamp, endTimestamp]. Pass group="" to aggregate all groups.
// The hourly bucket expression (created_at - created_at % 3600) and CASE/SUM
// aggregation are portable across SQLite, MySQL and PostgreSQL.
func GetGroupMonitorStats(group string, startTimestamp, endTimestamp int64) ([]GroupBucketStat, error) {
	bucketExpr := "(created_at - (created_at % 3600))"
	selectExpr := fmt.Sprintf(
		logGroupCol+" as grp, %s as bucket, "+
			"SUM(CASE WHEN type = %d THEN 1 ELSE 0 END) as success_count, "+
			"SUM(CASE WHEN type = %d THEN 1 ELSE 0 END) as error_count, "+
			"SUM(CASE WHEN type = %d THEN use_time ELSE 0 END) as total_time, "+
			"SUM(CASE WHEN type = %d THEN completion_tokens ELSE 0 END) as total_completion",
		bucketExpr, LogTypeConsume, LogTypeError, LogTypeConsume, LogTypeConsume)

	tx := LOG_DB.Table("logs").
		Select(selectExpr).
		Where("created_at >= ? AND created_at <= ?", startTimestamp, endTimestamp).
		Where("type IN ?", []int{LogTypeConsume, LogTypeError})
	if group != "" {
		tx = tx.Where(logGroupCol+" = ?", group)
	}
	tx = tx.Group(logGroupCol + ", " + bucketExpr)

	var stats []GroupBucketStat
	if err := tx.Scan(&stats).Error; err != nil {
		return nil, err
	}
	return stats, nil
}
