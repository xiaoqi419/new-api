package model

import (
	"errors"
	"sort"
)

// UserRankingRow 用户消耗排行单行（管理员视角）。
// Value 含义随维度而定：消耗额度 / token 数 / 调用次数 / IP 数 / 1 分钟内最大 IP 数。
type UserRankingRow struct {
	UserId   int    `json:"user_id" gorm:"column:user_id"`
	Username string `json:"username" gorm:"column:username"`
	Value    int64  `json:"value" gorm:"column:value"`
	LastTime int64  `json:"last_time,omitempty" gorm:"-"`
	Ip       string `json:"ip,omitempty" gorm:"-"`
}

const (
	userRankingDefaultLimit = 20
	userRankingMaxScanRows  = 500000
)

// GetUserConsumeRanking 基于消费日志按维度聚合用户排行。
// dimension: quota / tokens / requests / ip_count。
func GetUserConsumeRanking(dimension string, start, end int64, limit int) ([]UserRankingRow, error) {
	if limit <= 0 {
		limit = userRankingDefaultLimit
	}
	tx := LOG_DB.Table("logs").Where("type = ?", LogTypeConsume)
	if start > 0 {
		tx = tx.Where("created_at >= ?", start)
	}
	if end > 0 {
		tx = tx.Where("created_at <= ?", end)
	}

	switch dimension {
	case "quota":
		tx = tx.Select("user_id, MAX(username) as username, COALESCE(SUM(quota), 0) as value")
	case "tokens":
		tx = tx.Select("user_id, MAX(username) as username, COALESCE(SUM(prompt_tokens), 0) + COALESCE(SUM(completion_tokens), 0) as value")
	case "requests":
		tx = tx.Select("user_id, MAX(username) as username, COUNT(*) as value")
	case "ip_count":
		tx = tx.Where("ip <> ''").Select("user_id, MAX(username) as username, COUNT(DISTINCT ip) as value")
	default:
		return nil, errors.New("invalid ranking dimension")
	}

	var rows []UserRankingRow
	err := tx.Group("user_id").Order("value desc").Limit(limit).Scan(&rows).Error
	return rows, err
}

// GetUserIpPerMinuteRanking 统计每个用户「任意 60 秒窗口内出现过的最大去重 IP 数」。
// 用于异常行为监控；在 Go 内按时间桶聚合，避免数据库方言差异。
func GetUserIpPerMinuteRanking(start, end int64, limit int) ([]UserRankingRow, error) {
	if limit <= 0 {
		limit = userRankingDefaultLimit
	}

	type rawRow struct {
		UserId    int    `gorm:"column:user_id"`
		Username  string `gorm:"column:username"`
		Ip        string `gorm:"column:ip"`
		CreatedAt int64  `gorm:"column:created_at"`
	}
	tx := LOG_DB.Table("logs").
		Select("user_id, username, ip, created_at").
		Where("type = ? AND ip <> ''", LogTypeConsume)
	if start > 0 {
		tx = tx.Where("created_at >= ?", start)
	}
	if end > 0 {
		tx = tx.Where("created_at <= ?", end)
	}
	var raws []rawRow
	if err := tx.Order("created_at desc").Limit(userRankingMaxScanRows).Scan(&raws).Error; err != nil {
		return nil, err
	}

	type userAgg struct {
		username string
		buckets  map[int64]map[string]struct{}
	}
	aggs := make(map[int]*userAgg)
	for _, r := range raws {
		a := aggs[r.UserId]
		if a == nil {
			a = &userAgg{username: r.Username, buckets: make(map[int64]map[string]struct{})}
			aggs[r.UserId] = a
		}
		if a.username == "" {
			a.username = r.Username
		}
		bucket := r.CreatedAt / 60
		set := a.buckets[bucket]
		if set == nil {
			set = make(map[string]struct{})
			a.buckets[bucket] = set
		}
		set[r.Ip] = struct{}{}
	}

	rows := make([]UserRankingRow, 0, len(aggs))
	for uid, a := range aggs {
		var maxCount int64
		var repBucket int64
		var sampleIp string
		for bucket, set := range a.buckets {
			if int64(len(set)) > maxCount {
				maxCount = int64(len(set))
				repBucket = bucket
				sampleIp = ""
				for ip := range set {
					sampleIp = ip
					break
				}
			}
		}
		rows = append(rows, UserRankingRow{
			UserId:   uid,
			Username: a.username,
			Value:    maxCount,
			LastTime: repBucket * 60,
			Ip:       sampleIp,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Value == rows[j].Value {
			return rows[i].UserId < rows[j].UserId
		}
		return rows[i].Value > rows[j].Value
	})
	if len(rows) > limit {
		rows = rows[:limit]
	}
	return rows, nil
}
