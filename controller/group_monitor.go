package controller

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

const (
	groupMonitorNormalThreshold   = 99.0 // >= 正常 (green)
	groupMonitorDegradedThreshold = 95.0 // >= 降级 (yellow), otherwise 异常 (red)
	groupMonitorCacheTTL          = 60 * time.Second
)

var groupMonitorHealthRank = map[string]int{
	"normal":   0,
	"degraded": 1,
	"abnormal": 2,
}

type groupMonitorBucket struct {
	Ts           int64   `json:"ts"`
	Health       string  `json:"health"`
	Availability float64 `json:"availability"` // -1 when no data
	Success      int64   `json:"success"`
	Error        int64   `json:"error"`
}

type groupMonitorItem struct {
	Group        string               `json:"group"`
	DisplayName  string               `json:"display_name"`
	Status       string               `json:"status"`
	Availability float64              `json:"availability"` // -1 when no data
	AvgLatency   float64              `json:"avg_latency"`  // seconds
	Throughput   float64              `json:"throughput"`   // completion tokens / second
	RequestCount int64                `json:"request_count"`
	Buckets      []groupMonitorBucket `json:"buckets"`
}

type groupMonitorStatsCacheEntry struct {
	stats []model.GroupBucketStat
	at    time.Time
}

var (
	groupMonitorStatsCache = make(map[int]groupMonitorStatsCacheEntry)
	groupMonitorCacheMu    sync.Mutex
)

// groupHealthFromCounts classifies availability into a health level. It returns
// the health string and the availability percentage (-1 when there is no data).
func groupHealthFromCounts(success, errCount int64) (string, float64) {
	total := success + errCount
	if total == 0 {
		return "nodata", -1
	}
	availability := float64(success) / float64(total) * 100
	switch {
	case availability >= groupMonitorNormalThreshold:
		return "normal", availability
	case availability >= groupMonitorDegradedThreshold:
		return "degraded", availability
	default:
		return "abnormal", availability
	}
}

func parseMonitorDays(c *gin.Context) int {
	days, _ := strconv.Atoi(c.Query("days"))
	switch days {
	case 7, 15, 30:
		return days
	default:
		return 7
	}
}

func groupDisplayName(isAdmin bool, group string) string {
	if isAdmin {
		return group
	}
	return setting.GetUsableGroupDescription(group)
}

func getGroupMonitorStatsCached(days int, startTimestamp, endTimestamp int64) ([]model.GroupBucketStat, error) {
	groupMonitorCacheMu.Lock()
	defer groupMonitorCacheMu.Unlock()
	if entry, ok := groupMonitorStatsCache[days]; ok && time.Since(entry.at) < groupMonitorCacheTTL {
		return entry.stats, nil
	}
	stats, err := model.GetGroupMonitorStats("", startTimestamp, endTimestamp)
	if err != nil {
		return nil, err
	}
	groupMonitorStatsCache[days] = groupMonitorStatsCacheEntry{stats: stats, at: time.Now()}
	return stats, nil
}

// GetGroupMonitor returns per-group availability, latency, throughput and an
// hourly health heatmap over the selected time window. Visible to any logged-in
// user; administrators see raw group names while others see display names.
func GetGroupMonitor(c *gin.Context) {
	isAdmin := c.GetInt("role") >= common.RoleAdminUser
	days := parseMonitorDays(c)

	now := time.Now().Unix()
	endHour := now - now%3600
	startHour := endHour - int64(days*24-1)*3600

	stats, err := getGroupMonitorStatsCached(days, startHour, now)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	type bucketCounts struct {
		success  int64
		errCount int64
	}
	perGroupBuckets := make(map[string]map[int64]bucketCounts)
	type groupTotals struct {
		success, errCount, totalTime, totalCompletion int64
	}
	totals := make(map[string]*groupTotals)

	groupSet := make(map[string]struct{})
	for g := range ratio_setting.GetGroupRatioCopy() {
		if g != "" {
			groupSet[g] = struct{}{}
		}
	}
	for _, s := range stats {
		if s.Group == "" {
			continue
		}
		groupSet[s.Group] = struct{}{}
		if totals[s.Group] == nil {
			totals[s.Group] = &groupTotals{}
		}
		t := totals[s.Group]
		t.success += s.SuccessCount
		t.errCount += s.ErrorCount
		t.totalTime += s.TotalTime
		t.totalCompletion += s.TotalCompletion
		if perGroupBuckets[s.Group] == nil {
			perGroupBuckets[s.Group] = make(map[int64]bucketCounts)
		}
		perGroupBuckets[s.Group][s.Bucket] = bucketCounts{success: s.SuccessCount, errCount: s.ErrorCount}
	}

	items := make([]groupMonitorItem, 0, len(groupSet))
	overallRank := 0
	for group := range groupSet {
		item := groupMonitorItem{
			Group:       group,
			DisplayName: groupDisplayName(isAdmin, group),
			Buckets:     make([]groupMonitorBucket, 0, days*24),
		}
		if t := totals[group]; t != nil {
			item.Status, item.Availability = groupHealthFromCounts(t.success, t.errCount)
			item.RequestCount = t.success + t.errCount
			if t.success > 0 {
				item.AvgLatency = float64(t.totalTime) / float64(t.success)
			}
			if t.totalTime > 0 {
				item.Throughput = float64(t.totalCompletion) / float64(t.totalTime)
			}
		} else {
			item.Status = "nodata"
			item.Availability = -1
		}
		if rank, ok := groupMonitorHealthRank[item.Status]; ok && rank > overallRank {
			overallRank = rank
		}
		buckets := perGroupBuckets[group]
		for h := startHour; h <= endHour; h += 3600 {
			bc := buckets[h]
			health, availability := groupHealthFromCounts(bc.success, bc.errCount)
			item.Buckets = append(item.Buckets, groupMonitorBucket{
				Ts:           h,
				Health:       health,
				Availability: availability,
				Success:      bc.success,
				Error:        bc.errCount,
			})
		}
		items = append(items, item)
	}

	overallStatus := "normal"
	for status, rank := range groupMonitorHealthRank {
		if rank == overallRank {
			overallStatus = status
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"overall_status": overallStatus,
			"days":           days,
			"start":          startHour,
			"end":            endHour,
			"groups":         items,
		},
	})
}

type groupMonitorDetailPoint struct {
	Ts           int64   `json:"ts"`
	Availability float64 `json:"availability"` // -1 when no data
	AvgLatency   float64 `json:"avg_latency"`  // seconds
	Throughput   float64 `json:"throughput"`   // completion tokens / second
	Success      int64   `json:"success"`
	Error        int64   `json:"error"`
}

// GetGroupMonitorDetail returns the hourly time series for a single group,
// suitable for drawing availability / latency / throughput curves.
func GetGroupMonitorDetail(c *gin.Context) {
	group := c.Query("group")
	if group == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "group is required"})
		return
	}
	isAdmin := c.GetInt("role") >= common.RoleAdminUser
	days := parseMonitorDays(c)

	now := time.Now().Unix()
	endHour := now - now%3600
	startHour := endHour - int64(days*24-1)*3600

	stats, err := model.GetGroupMonitorStats(group, startHour, now)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	bucketMap := make(map[int64]model.GroupBucketStat, len(stats))
	var totalSuccess, totalError, totalTime, totalCompletion int64
	for _, s := range stats {
		bucketMap[s.Bucket] = s
		totalSuccess += s.SuccessCount
		totalError += s.ErrorCount
		totalTime += s.TotalTime
		totalCompletion += s.TotalCompletion
	}

	points := make([]groupMonitorDetailPoint, 0, days*24)
	for h := startHour; h <= endHour; h += 3600 {
		point := groupMonitorDetailPoint{Ts: h, Availability: -1}
		if s, ok := bucketMap[h]; ok {
			_, point.Availability = groupHealthFromCounts(s.SuccessCount, s.ErrorCount)
			point.Success = s.SuccessCount
			point.Error = s.ErrorCount
			if s.SuccessCount > 0 {
				point.AvgLatency = float64(s.TotalTime) / float64(s.SuccessCount)
			}
			if s.TotalTime > 0 {
				point.Throughput = float64(s.TotalCompletion) / float64(s.TotalTime)
			}
		}
		points = append(points, point)
	}

	status, availability := groupHealthFromCounts(totalSuccess, totalError)
	var avgLatency, throughput float64
	if totalSuccess > 0 {
		avgLatency = float64(totalTime) / float64(totalSuccess)
	}
	if totalTime > 0 {
		throughput = float64(totalCompletion) / float64(totalTime)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"group":         group,
			"display_name":  groupDisplayName(isAdmin, group),
			"days":          days,
			"start":         startHour,
			"end":           endHour,
			"status":        status,
			"availability":  availability,
			"avg_latency":   avgLatency,
			"throughput":    throughput,
			"request_count": totalSuccess + totalError,
			"points":        points,
		},
	})
}
