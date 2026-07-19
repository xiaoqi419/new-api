package error_alert_setting

import "github.com/QuantumNous/new-api/setting/config"

// ErrorAlertSetting 站点级「请求错误 -> 企业微信机器人」告警配置。
// 注册到 config.GlobalConfig 后，前端以 error_alert_setting.* 读写并自动持久化+热更新。
type ErrorAlertSetting struct {
	Enabled         bool   `json:"enabled"`
	WecomWebhookUrl string `json:"wecom_webhook_url"`
	IntervalSeconds int    `json:"interval_seconds"`
	MinCount        int    `json:"min_count"`
	TopN            int    `json:"top_n"`
	ModelFilter     string `json:"model_filter"`
	ChannelFilter   string `json:"channel_filter"`
}

var errorAlertSetting = ErrorAlertSetting{
	Enabled:         false,
	WecomWebhookUrl: "",
	IntervalSeconds: 120,
	MinCount:        1,
	TopN:            8,
	ModelFilter:     "",
	ChannelFilter:   "",
}

func init() {
	config.GlobalConfig.Register("error_alert_setting", &errorAlertSetting)
}

func GetSetting() ErrorAlertSetting {
	return errorAlertSetting
}

// GetIntervalSeconds 返回聚合/轮询间隔，最小 30 秒防止过于频繁触发企业微信限流。
func GetIntervalSeconds() int {
	if errorAlertSetting.IntervalSeconds < 30 {
		return 30
	}
	return errorAlertSetting.IntervalSeconds
}

func GetMinCount() int {
	if errorAlertSetting.MinCount < 1 {
		return 1
	}
	return errorAlertSetting.MinCount
}

func GetTopN() int {
	if errorAlertSetting.TopN < 1 {
		return 8
	}
	return errorAlertSetting.TopN
}
