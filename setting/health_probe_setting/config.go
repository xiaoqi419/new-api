package health_probe_setting

import "github.com/QuantumNous/new-api/setting/config"

// HealthProbeSetting 控制模型健康探测：每隔一段时间对每个启用渠道上的 chat/文本类
// 模型发起一次最小请求，用于点亮模型广场健康条与渠道监控可用率，并顺带核对上游给的
// 是不是它声称的模型。
type HealthProbeSetting struct {
	Enabled         bool `json:"enabled"`
	IntervalMinutes int  `json:"interval_minutes"`
	// Concurrency 是同时进行的探测数上限，避免瞬时打爆上游。
	Concurrency int `json:"concurrency"`
	// MaxTargetsPerRound 是单轮探测的「渠道 × 模型」上限。按渠道逐个展开后总量会随
	// 渠道数和模型数相乘增长，这个上限是防止一轮探测把上游额度打光的兜底。
	MaxTargetsPerRound int `json:"max_targets_per_round"`
	// AuthenticityEnabled 打开模型真实性核对：把探测的提问换成自我识别问题（不额外
	// 增加请求次数），比对上游自报的模型名、响应结构指纹与模型自述。
	AuthenticityEnabled bool `json:"authenticity_enabled"`
}

var healthProbeSetting = HealthProbeSetting{
	Enabled:             true,
	IntervalMinutes:     60,
	Concurrency:         3,
	MaxTargetsPerRound:  500,
	AuthenticityEnabled: true,
}

func init() {
	config.GlobalConfig.Register("health_probe_setting", &healthProbeSetting)
}

func GetSetting() HealthProbeSetting {
	return healthProbeSetting
}

func IsEnabled() bool {
	return healthProbeSetting.Enabled
}

func GetIntervalMinutes() int {
	if healthProbeSetting.IntervalMinutes < 5 {
		return 5
	}
	return healthProbeSetting.IntervalMinutes
}

func GetConcurrency() int {
	if healthProbeSetting.Concurrency < 1 {
		return 1
	}
	if healthProbeSetting.Concurrency > 32 {
		return 32
	}
	return healthProbeSetting.Concurrency
}

func GetMaxTargetsPerRound() int {
	if healthProbeSetting.MaxTargetsPerRound < 1 {
		return 1
	}
	return healthProbeSetting.MaxTargetsPerRound
}

func IsAuthenticityEnabled() bool {
	return healthProbeSetting.AuthenticityEnabled
}
