package controller

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

const (
	channelMonitorNormalThreshold   = 99.0 // >= 正常 (green)
	channelMonitorDegradedThreshold = 95.0 // >= 降级 (yellow), otherwise 异常 (red)
	channelMonitorCacheTTL          = 60 * time.Second
)

var channelMonitorHealthRank = map[string]int{
	"normal":   0,
	"degraded": 1,
	"abnormal": 2,
}

// channelMonitorHealthFromCounts classifies availability into a health level. It
// returns the health string and the availability percentage (-1 when no data).
func channelMonitorHealthFromCounts(success, errCount int64) (string, float64) {
	total := success + errCount
	if total == 0 {
		return "nodata", -1
	}
	availability := float64(success) / float64(total) * 100
	switch {
	case availability >= channelMonitorNormalThreshold:
		return "normal", availability
	case availability >= channelMonitorDegradedThreshold:
		return "degraded", availability
	default:
		return "abnormal", availability
	}
}

func parseChannelMonitorDays(c *gin.Context) int {
	days, _ := strconv.Atoi(c.Query("days"))
	switch days {
	case 7, 15, 30:
		return days
	default:
		return 7
	}
}

type channelMonitorStatsCacheEntry struct {
	stats []model.ChannelModelBucketStat
	at    time.Time
}

var (
	channelMonitorStatsCache = make(map[int]channelMonitorStatsCacheEntry)
	channelMonitorCacheMu    sync.Mutex
)

func getChannelMonitorStatsCached(days int, startTimestamp, endTimestamp int64) ([]model.ChannelModelBucketStat, error) {
	channelMonitorCacheMu.Lock()
	defer channelMonitorCacheMu.Unlock()
	if entry, ok := channelMonitorStatsCache[days]; ok && time.Since(entry.at) < channelMonitorCacheTTL {
		return entry.stats, nil
	}
	stats, err := model.GetChannelModelMonitorStats(startTimestamp, endTimestamp)
	if err != nil {
		return nil, err
	}
	channelMonitorStatsCache[days] = channelMonitorStatsCacheEntry{stats: stats, at: time.Now()}
	return stats, nil
}

type channelModelBucket struct {
	Ts           int64   `json:"ts"`
	Health       string  `json:"health"`
	Availability float64 `json:"availability"` // -1 when no data
}

type channelModelItem struct {
	Model        string               `json:"model"`
	Status       string               `json:"status"`
	Availability float64              `json:"availability"` // -1 when no data
	AvgTtft      float64              `json:"avg_ttft"`     // seconds, 0 when n/a
	AvgLatency   float64              `json:"avg_latency"`  // seconds
	Throughput   float64              `json:"throughput"`   // completion tokens / second
	RequestCount int64                `json:"request_count"`
	Buckets      []channelModelBucket `json:"buckets"`

	// 以下来自探针最近一次探测，空 verdict 表示这个渠道/模型还没被探过。
	Verdict       string          `json:"verdict"`
	ReportedModel string          `json:"reported_model"`
	ProbedAt      int64           `json:"probed_at"`
	Evidence      []probeEvidence `json:"evidence"`
}

type channelMonitorItem struct {
	ChannelId    int                `json:"channel_id"`
	Name         string             `json:"name"`
	Type         int                `json:"type"`
	Tag          string             `json:"tag"`
	Status       string             `json:"status"`
	Availability float64            `json:"availability"` // -1 when no data
	RequestCount int64              `json:"request_count"`
	Models       []channelModelItem `json:"models"`
	// SuspectCount 是这个渠道下被判为疑似与声称不一致的模型数，供列表直接打标。
	SuspectCount int `json:"suspect_count"`
}

type channelMonitorBucketCounts struct {
	success  int64
	errCount int64
}

type channelMonitorModelAgg struct {
	success         int64
	errCount        int64
	totalTime       int64
	totalCompletion int64
	totalTtft       int64
	ttftCount       int64
	buckets         map[int64]channelMonitorBucketCounts
}

// GetChannelMonitor returns per-channel availability broken down by model, with
// each model's hourly health heatmap, first-token latency, output speed and
// success rate over the selected window. Visible to any logged-in user.
func GetChannelMonitor(c *gin.Context) {
	days := parseChannelMonitorDays(c)

	now := time.Now().Unix()
	endHour := now - now%3600
	startHour := endHour - int64(days*24-1)*3600

	stats, err := getChannelMonitorStatsCached(days, startHour, now)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	perChannel := make(map[int]map[string]*channelMonitorModelAgg)
	for _, s := range stats {
		if s.Model == "" {
			continue
		}
		if perChannel[s.ChannelId] == nil {
			perChannel[s.ChannelId] = make(map[string]*channelMonitorModelAgg)
		}
		agg := perChannel[s.ChannelId][s.Model]
		if agg == nil {
			agg = &channelMonitorModelAgg{buckets: make(map[int64]channelMonitorBucketCounts)}
			perChannel[s.ChannelId][s.Model] = agg
		}
		agg.success += s.SuccessCount
		agg.errCount += s.ErrorCount
		agg.totalTime += s.TotalTime
		agg.totalCompletion += s.TotalCompletion
		agg.totalTtft += s.TotalTtft
		agg.ttftCount += s.TtftCount
		agg.buckets[s.Bucket] = channelMonitorBucketCounts{success: s.SuccessCount, errCount: s.ErrorCount}
	}

	channelIds := make([]int, 0, len(perChannel))
	for id := range perChannel {
		channelIds = append(channelIds, id)
	}
	channelMeta := make(map[int]*model.Channel, len(channelIds))
	if len(channelIds) > 0 {
		if channels, err := model.GetChannelsByIds(channelIds); err == nil {
			for _, ch := range channels {
				channelMeta[ch.Id] = ch
			}
		}
	}

	probesByTarget := make(map[string]*model.ChannelProbe)
	if probes, err := model.GetAllChannelProbes(); err == nil {
		for _, probe := range probes {
			probesByTarget[channelProbeKey(probe.ChannelId, probe.ModelName)] = probe
		}
	}

	items := make([]channelMonitorItem, 0, len(perChannel))
	overallRank := 0
	for channelId, models := range perChannel {
		// The list is built from usage logs, so a channel that has since been
		// disabled or deleted still has rows in the window. Only channels that
		// are currently serving traffic belong on a monitor, and this also
		// matches the probe, which already skips everything but enabled ones.
		meta := channelMeta[channelId]
		if meta == nil || meta.Status != common.ChannelStatusEnabled {
			continue
		}

		item := channelMonitorItem{
			ChannelId: channelId,
			Models:    make([]channelModelItem, 0, len(models)),
			Name:      meta.Name,
			Type:      meta.Type,
		}
		if meta.Tag != nil {
			item.Tag = *meta.Tag
		}
		if item.Name == "" {
			item.Name = fmt.Sprintf("#%d", channelId)
		}

		var chSuccess, chError int64
		for modelName, agg := range models {
			chSuccess += agg.success
			chError += agg.errCount
			mItem := channelModelItem{
				Model:   modelName,
				Buckets: make([]channelModelBucket, 0, days*24),
			}
			mItem.Status, mItem.Availability = channelMonitorHealthFromCounts(agg.success, agg.errCount)
			mItem.RequestCount = agg.success + agg.errCount
			if agg.success > 0 {
				mItem.AvgLatency = float64(agg.totalTime) / float64(agg.success)
			}
			if agg.totalTime > 0 {
				mItem.Throughput = float64(agg.totalCompletion) / float64(agg.totalTime)
			}
			if agg.ttftCount > 0 {
				mItem.AvgTtft = float64(agg.totalTtft) / float64(agg.ttftCount) / 1000.0
			}
			for h := startHour; h <= endHour; h += 3600 {
				bc := agg.buckets[h]
				health, availability := channelMonitorHealthFromCounts(bc.success, bc.errCount)
				mItem.Buckets = append(mItem.Buckets, channelModelBucket{
					Ts:           h,
					Health:       health,
					Availability: availability,
				})
			}
			if probe := probesByTarget[channelProbeKey(channelId, modelName)]; probe != nil {
				mItem.Verdict = probe.Verdict
				mItem.ReportedModel = probe.ReportedModel
				mItem.ProbedAt = probe.ProbedAt
				if probe.Evidence != "" {
					var evidence []probeEvidence
					if err := common.UnmarshalJsonStr(probe.Evidence, &evidence); err == nil {
						mItem.Evidence = evidence
					}
				}
				if probe.Verdict == model.ProbeVerdictSuspect {
					item.SuspectCount++
				}
			}
			item.Models = append(item.Models, mItem)
		}
		sort.Slice(item.Models, func(i, j int) bool {
			return item.Models[i].Model < item.Models[j].Model
		})

		item.Status, item.Availability = channelMonitorHealthFromCounts(chSuccess, chError)
		item.RequestCount = chSuccess + chError
		if rank, ok := channelMonitorHealthRank[item.Status]; ok && rank > overallRank {
			overallRank = rank
		}
		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		ri := channelMonitorHealthRank[items[i].Status]
		rj := channelMonitorHealthRank[items[j].Status]
		if ri != rj {
			return ri > rj
		}
		if items[i].RequestCount != items[j].RequestCount {
			return items[i].RequestCount > items[j].RequestCount
		}
		return items[i].Name < items[j].Name
	})

	overallStatus := "nodata"
	if len(items) > 0 {
		overallStatus = "normal"
		for status, rank := range channelMonitorHealthRank {
			if rank == overallRank {
				overallStatus = status
				break
			}
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
			"channels":       items,
		},
	})
}

// channelProbeKey 把渠道与模型拼成索引键，用 \x00 分隔避免模型名里的字符撞键。
func channelProbeKey(channelId int, modelName string) string {
	return strconv.Itoa(channelId) + "\x00" + modelName
}
