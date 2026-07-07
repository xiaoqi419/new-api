package health_probe_setting

import "github.com/QuantumNous/new-api/setting/config"

// HealthProbeSetting 控制模型健康探测：每隔一段时间对每个可用分组下的
// chat/文本类模型发起一次最小请求，用于点亮模型广场健康条与渠道监控可用率。
type HealthProbeSetting struct {
	Enabled         bool `json:"enabled"`
	IntervalMinutes int  `json:"interval_minutes"`
}

var healthProbeSetting = HealthProbeSetting{
	Enabled:         true,
	IntervalMinutes: 60,
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
