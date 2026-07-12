package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting/health_probe_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

var healthProbeOnce sync.Once

// 探测并发上限，避免瞬时打爆上游。
const healthProbeConcurrency = 3

// 单次探测超时。
const healthProbeTimeout = 30 * time.Second

// StartHealthProbe 启动模型健康探测后台任务（进程内单例）。
func StartHealthProbe() {
	healthProbeOnce.Do(func() {
		go healthProbeLoop()
	})
}

func healthProbeLoop() {
	// 启动后稍等，等渠道/缓存就绪再开始首轮探测。
	time.Sleep(30 * time.Second)
	for {
		if health_probe_setting.IsEnabled() {
			runHealthProbeOnce()
		}
		time.Sleep(time.Duration(health_probe_setting.GetIntervalMinutes()) * time.Minute)
	}
}

func runHealthProbeOnce() {
	defer func() {
		if r := recover(); r != nil {
			logger.LogError(context.Background(), "health probe panic recovered")
		}
	}()

	userID, err := resolveChannelTestUserID(nil)
	if err != nil {
		return
	}

	groups := ratio_setting.GetGroupRatioCopy()
	sem := make(chan struct{}, healthProbeConcurrency)
	seen := make(map[string]bool)
	var wg sync.WaitGroup

	for group := range groups {
		models := model.GetGroupEnabledModels(group)
		for _, modelName := range models {
			if !isChatProbeModel(modelName) {
				continue
			}
			key := group + "\x00" + modelName
			if seen[key] {
				continue
			}
			seen[key] = true

			wg.Add(1)
			sem <- struct{}{}
			go func(grp, mdl string) {
				defer wg.Done()
				defer func() { <-sem }()
				defer func() { _ = recover() }()
				probeModelHealth(userID, grp, mdl)
			}(group, modelName)
		}
	}
	wg.Wait()
}

func probeModelHealth(userID int, group, modelName string) {
	channel, err := model.GetRandomSatisfiedChannel(group, modelName, 0, "/v1/chat/completions")
	if err != nil || channel == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), healthProbeTimeout)
	defer cancel()

	start := time.Now()
	res := testChannel(ctx, channel, userID, modelName, string(constant.EndpointTypeOpenAI), false, true)
	elapsedMs := time.Since(start).Milliseconds()
	success := res.localErr == nil && res.newAPIError == nil

	// 模型广场健康条数据来源。
	perfmetrics.Record(perfmetrics.Sample{
		Model:     modelName,
		Group:     group,
		Success:   success,
		LatencyMs: elapsedMs,
	})

	// 渠道监控可用率数据来源（consume=成功 / error=失败）。
	recordHealthProbeLog(userID, group, modelName, channel.Id, success, int(elapsedMs/1000))
}

func recordHealthProbeLog(userID int, group, modelName string, channelId int, success bool, useTimeSeconds int) {
	c := newHealthProbeContext()
	if success {
		model.RecordConsumeLog(c, userID, model.RecordConsumeLogParams{
			ChannelId:      channelId,
			ModelName:      modelName,
			TokenName:      "health_probe",
			Quota:          0,
			Content:        "模型健康探测",
			UseTimeSeconds: useTimeSeconds,
			Group:          group,
		})
		return
	}
	model.RecordErrorLog(c, userID, channelId, modelName, "health_probe", "模型健康探测失败", 0, useTimeSeconds, false, group, nil)
}

func newHealthProbeContext() *gin.Context {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/health-probe", nil)
	c.Set("username", "health_probe")
	return c
}

// isChatProbeModel 仅探测便宜的 chat/文本类模型，排除图像/视频/音频/向量等高成本或非对话端点。
func isChatProbeModel(modelName string) bool {
	lm := strings.ToLower(modelName)
	nonChatKeywords := []string{
		"embedding", "embed", "rerank", "moderation",
		"whisper", "tts", "audio", "speech", "voice",
		"dall-e", "dalle", "stable-diffusion", "sd-", "flux",
		"midjourney", "mj_", "image", "-image", "vision-image",
		"sora", "veo", "seedream", "seedance", "wan", "kling",
		"suno", "jimeng", "vidu", "cogvideo", "pika", "runway", "video",
	}
	for _, kw := range nonChatKeywords {
		if strings.Contains(lm, kw) {
			return false
		}
	}
	return true
}
