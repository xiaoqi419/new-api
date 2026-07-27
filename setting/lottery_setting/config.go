package lottery_setting

import (
	"sort"

	"github.com/QuantumNous/new-api/setting/config"
)

// 奖项类型。
const (
	PrizeTypeQuota  = "quota"  // 发放额度
	PrizeTypeRedraw = "redraw" // 再抽一次（返还一张摇摇卡）
	PrizeTypeEmpty  = "empty"  // 空奖 / 谢谢参与
)

// LotteryPrize 一个转盘奖项，由管理员在后台维护。
type LotteryPrize struct {
	Key     string `json:"key"`     // 唯一标识
	Name    string `json:"name"`    // 展示名称
	Type    string `json:"type"`    // quota / redraw / empty
	Quota   int    `json:"quota"`   // 中奖发放额度（仅 type=quota 生效）
	Weight  int    `json:"weight"`  // 抽中权重（越大概率越高）
	Color   string `json:"color"`   // 扇区颜色（前端展示）
	Enabled bool   `json:"enabled"` // 是否参与抽奖
}

// ConsumeGrantRule 累计消费解锁摇摇卡的规则。用户累计消费每达到一个阈值即发对应张数。
type ConsumeGrantRule struct {
	Threshold int  `json:"threshold"` // 累计消费额度阈值（与充值同单位）
	CardsPer  int  `json:"cards_per"` // 达标发放的摇摇卡数量
	Enabled   bool `json:"enabled"`
}

// TopupGrantRule 累计充值发卡规则。用户累计充值额度达到阈值发对应张数，可设卡有效期。
type TopupGrantRule struct {
	Threshold      int  `json:"threshold"`        // 累计充值额度阈值（quota，与保底/奖项同单位）
	CardsPer       int  `json:"cards_per"`        // 达标发放的摇摇卡数量
	CardExpireDays int  `json:"card_expire_days"` // 发放的摇摇卡有效天数（0 表示永久）
	Enabled        bool `json:"enabled"`
}

// LotterySetting 幸运抽奖（大转盘）的站点级配置。
type LotterySetting struct {
	Enabled         bool               `json:"enabled"`    // 总开关
	BaseQuota       int                `json:"base_quota"` // 每次抽奖保底额度（0 表示无保底）
	Prizes          []LotteryPrize     `json:"prizes"`
	GrantRules      []ConsumeGrantRule `json:"grant_rules"`       // 累计消费发卡规则
	TopupGrantRules []TopupGrantRule   `json:"topup_grant_rules"` // 累计充值发卡规则
}

var lotterySetting = LotterySetting{
	Enabled:         false,
	BaseQuota:       0,
	Prizes:          []LotteryPrize{},
	GrantRules:      []ConsumeGrantRule{},
	TopupGrantRules: []TopupGrantRule{},
}

func init() {
	config.GlobalConfig.Register("lottery_setting", &lotterySetting)
}

func GetSetting() LotterySetting {
	return lotterySetting
}

// GetEnabledPrizes 返回参与抽奖且权重为正的奖项。
func GetEnabledPrizes() []LotteryPrize {
	prizes := make([]LotteryPrize, 0, len(lotterySetting.Prizes))
	for _, p := range lotterySetting.Prizes {
		if p.Enabled {
			prizes = append(prizes, p)
		}
	}
	return prizes
}

// GetEnabledGrantRules 返回启用且阈值/张数为正的发卡规则，按阈值升序。
func GetEnabledGrantRules() []ConsumeGrantRule {
	rules := make([]ConsumeGrantRule, 0, len(lotterySetting.GrantRules))
	for _, r := range lotterySetting.GrantRules {
		if r.Enabled && r.Threshold > 0 && r.CardsPer > 0 {
			rules = append(rules, r)
		}
	}
	sort.Slice(rules, func(i, j int) bool { return rules[i].Threshold < rules[j].Threshold })
	return rules
}

// GetEnabledTopupGrantRules 返回启用且阈值/张数为正的充值发卡规则，按阈值升序。
func GetEnabledTopupGrantRules() []TopupGrantRule {
	rules := make([]TopupGrantRule, 0, len(lotterySetting.TopupGrantRules))
	for _, r := range lotterySetting.TopupGrantRules {
		if r.Enabled && r.Threshold > 0 && r.CardsPer > 0 {
			rules = append(rules, r)
		}
	}
	sort.Slice(rules, func(i, j int) bool { return rules[i].Threshold < rules[j].Threshold })
	return rules
}
