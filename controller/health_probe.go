package controller

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/health_probe_setting"

	"github.com/gin-gonic/gin"
)

var healthProbeOnce sync.Once

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

// probeTarget 是一次探测的目标：具体某个渠道上的具体某个模型。
type probeTarget struct {
	channel *model.Channel
	model   string
	groups  []string
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

	targets := collectProbeTargets()
	if len(targets) == 0 {
		return
	}

	sem := make(chan struct{}, health_probe_setting.GetConcurrency())
	var wg sync.WaitGroup
	for _, target := range targets {
		wg.Add(1)
		sem <- struct{}{}
		go func(t probeTarget) {
			defer wg.Done()
			defer func() { <-sem }()
			defer func() { _ = recover() }()
			probeChannelModel(userID, t)
		}(target)
	}
	wg.Wait()
}

// collectProbeTargets 列出这一轮要探的「渠道 × 模型」。逐个渠道展开而不是按分组抽样，
// 是为了让渠道监控里每个渠道都有自己的数据；按分组抽样时同一模型下挂多个渠道，一轮
// 只会探到随机一个，其余渠道永远显示无数据。
func collectProbeTargets() []probeTarget {
	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		logger.LogError(context.Background(), "health probe failed to load channels: "+err.Error())
		return nil
	}

	maxTargets := health_probe_setting.GetMaxTargetsPerRound()
	targets := make([]probeTarget, 0, len(channels))
	for _, channel := range channels {
		if channel == nil || channel.Status != common.ChannelStatusEnabled {
			continue
		}
		groups := channel.GetGroups()
		for _, modelName := range channel.GetModels() {
			modelName = strings.TrimSpace(modelName)
			if modelName == "" || !isChatProbeModel(modelName) {
				continue
			}
			if len(targets) >= maxTargets {
				logger.LogWarn(context.Background(), fmt.Sprintf(
					"health probe target limit %d reached, remaining channel/model pairs are skipped this round", maxTargets))
				return targets
			}
			targets = append(targets, probeTarget{channel: channel, model: modelName, groups: groups})
		}
	}
	return targets
}

func probeChannelModel(userID int, target probeTarget) {
	ctx, cancel := context.WithTimeout(context.Background(), healthProbeTimeout)
	defer cancel()

	opts := channelTestOptions{
		endpointType: string(constant.EndpointTypeOpenAI),
		silent:       true,
	}
	// 行为判据靠替换探测提问实现，不额外发请求：探测本来就要发一次最小 chat 请求，
	// 把「hi」换成自我识别问题即可。
	if health_probe_setting.IsAuthenticityEnabled() {
		opts.probePrompt = probeIdentityPrompt
	}

	start := time.Now()
	res := testChannel(ctx, target.channel, userID, target.model, opts)
	elapsedMs := time.Since(start).Milliseconds()
	success := res.localErr == nil && res.newAPIError == nil

	// 模型广场健康条数据来源。渠道服务多个分组时逐个记账，因为这个渠道确实是这些
	// 分组背后的实际承载。
	for _, group := range target.groups {
		perfmetrics.Record(perfmetrics.Sample{
			Model:     target.model,
			Group:     group,
			Success:   success,
			LatencyMs: elapsedMs,
		})
	}

	logGroup := ""
	if len(target.groups) > 0 {
		logGroup = target.groups[0]
	}
	// 渠道监控可用率数据来源（consume=成功 / error=失败）。
	recordHealthProbeLog(userID, logGroup, target.model, target.channel.Id, success, int(elapsedMs/1000))

	saveProbeResult(target, res, success, elapsedMs)
}

// saveProbeResult 落库这一轮的探测结论，并在真实性判定刚变成可疑时告警。
func saveProbeResult(target probeTarget, res testResult, success bool, elapsedMs int64) {
	probe := &model.ChannelProbe{
		ChannelId: target.channel.Id,
		ModelName: target.model,
		Success:   success,
		LatencyMs: int(elapsedMs),
		Verdict:   model.ProbeVerdictUnknown,
	}

	if !success {
		probe.ErrorMessage = common.LocalLogPreview(probeErrorMessage(res))
	} else if health_probe_setting.IsAuthenticityEnabled() {
		verdict, evidence := evaluateModelAuthenticity(target.model, res.facts)
		probe.Verdict = verdict
		if res.facts != nil {
			probe.ReportedModel = res.facts.ReportedModel
		}
		if encoded, err := common.Marshal(evidence); err == nil {
			probe.Evidence = string(encoded)
		}
	}

	previousVerdict, err := model.SaveChannelProbe(probe)
	if err != nil {
		logger.LogError(context.Background(), "health probe failed to save result: "+err.Error())
		return
	}

	if probe.Verdict == model.ProbeVerdictSuspect && previousVerdict != model.ProbeVerdictSuspect {
		notifySuspectModel(target, probe)
	}
}

func probeErrorMessage(res testResult) string {
	if res.newAPIError != nil {
		return res.newAPIError.Error()
	}
	if res.localErr != nil {
		return res.localErr.Error()
	}
	return ""
}

// notifySuspectModel 走渠道禁用同一套通知出口，只报告不禁用——判据存在误报可能，
// 自动禁用会把正常渠道也一起断掉。
func notifySuspectModel(target probeTarget, probe *model.ChannelProbe) {
	subject := fmt.Sprintf("通道「%s」（#%d）的模型 %s 疑似与声称不一致",
		target.channel.Name, target.channel.Id, target.model)

	var details strings.Builder
	details.WriteString(subject)
	details.WriteString("\n\n探测依据：\n")
	var evidence []probeEvidence
	if err := common.UnmarshalJsonStr(probe.Evidence, &evidence); err == nil {
		for _, item := range evidence {
			if item.Severity == evidenceSeveritySuspect {
				details.WriteString("- " + item.Detail + "\n")
			}
		}
	}
	details.WriteString("\n该渠道未被自动禁用，请在渠道监控页面核实后自行处理。")

	// 限流键带上渠道与模型，避免不同渠道/模型的告警互相挤掉。
	notifyType := fmt.Sprintf("%s_%d_%s", dto.NotifyTypeChannelSuspectModel, target.channel.Id, target.model)
	service.NotifyRootUser(notifyType, subject, details.String())
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
