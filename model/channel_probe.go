package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// 模型真实性判定结果。
const (
	// ProbeVerdictTrusted 表示所有判据都没发现异常。
	ProbeVerdictTrusted = "trusted"
	// ProbeVerdictSuspect 表示至少一条判据指向上游给的不是它声称的模型。
	ProbeVerdictSuspect = "suspect"
	// ProbeVerdictUnknown 表示这次探测没拿到足以判断的信息（上游没回模型名、
	// 响应结构不认识等），既不能证实也不能证伪。
	ProbeVerdictUnknown = "unknown"
)

// ChannelProbe 保存某个渠道在某个模型上最近一次探测的结果。
//
// 与日志表的分工：日志是时间序列，渠道监控用它算可用率和延迟曲线；这张表只保留
// 「当前状态」——最近一次探测拿到了什么、模型真实性判成了什么、依据是什么，供监控
// 页面直接展示，不必再去翻日志。
type ChannelProbe struct {
	Id        int    `json:"id"`
	ChannelId int    `json:"channel_id" gorm:"index:idx_channel_probe_target,priority:1"`
	ModelName string `json:"model_name" gorm:"type:varchar(255);index:idx_channel_probe_target,priority:2"`

	ProbedAt     int64  `json:"probed_at"`
	Success      bool   `json:"success"`
	LatencyMs    int    `json:"latency_ms"`
	ErrorMessage string `json:"error_message" gorm:"type:text"`

	// ReportedModel 是上游在响应里自报的模型名，空表示这次没拿到。
	ReportedModel string `json:"reported_model" gorm:"type:varchar(255)"`
	Verdict       string `json:"verdict" gorm:"type:varchar(32)"`
	// Evidence 是判定依据的 JSON 数组，每条包含判据名、严重程度和人话说明。
	Evidence string `json:"evidence" gorm:"type:text"`
}

// SaveChannelProbe 按 (渠道, 模型) 覆盖写入最近一次探测结果，并返回被覆盖掉的那次
// 判定。调用方靠这个返回值判断真实性结论是否刚刚变化，从而只在状态翻转时告警，
// 而不是每轮探测都重复通知。
func SaveChannelProbe(probe *ChannelProbe) (string, error) {
	if probe == nil || probe.ChannelId <= 0 || probe.ModelName == "" {
		return "", errors.New("invalid channel probe")
	}
	probe.ProbedAt = time.Now().Unix()

	var existing ChannelProbe
	err := DB.Where("channel_id = ? AND model_name = ?", probe.ChannelId, probe.ModelName).
		First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", DB.Create(probe).Error
	}
	if err != nil {
		return "", err
	}

	probe.Id = existing.Id
	// Select 显式列出字段，否则 GORM 的 Updates 会跳过 false / 0 / "" 这些零值，
	// 让「上一轮失败、这一轮成功」之类的状态翻转写不进去。
	updateErr := DB.Model(&ChannelProbe{}).Where("id = ?", existing.Id).
		Select("probed_at", "success", "latency_ms", "error_message", "reported_model", "verdict", "evidence").
		Updates(probe).Error
	return existing.Verdict, updateErr
}

// GetAllChannelProbes 返回全部渠道的最近一次探测结果，供渠道监控页面合并展示。
func GetAllChannelProbes() ([]*ChannelProbe, error) {
	var probes []*ChannelProbe
	err := DB.Find(&probes).Error
	return probes, err
}

// DeleteChannelProbesByChannelId 清理某个渠道的探测结果，渠道删除后调用。
func DeleteChannelProbesByChannelId(channelId int) error {
	if channelId <= 0 {
		return nil
	}
	return DB.Where("channel_id = ?", channelId).Delete(&ChannelProbe{}).Error
}
