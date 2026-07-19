package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// GroupBuySetting 拼团功能的展示与结算配置。
type GroupBuySetting struct {
	EarlySettleWhenFull bool     `json:"early_settle_when_full"` // 满最大档时立即成团（否则等到期按最高解锁档结算）
	ModelsHint          string   `json:"models_hint"`            // 详情页"模型接入"文案
	Notes               []string `json:"notes"`                  // 详情页"拼团须知"条目
}

var groupBuySetting = GroupBuySetting{
	EarlySettleWhenFull: true,
	ModelsHint:          "拼团成功后额度即时到账，全系模型均可调用。",
	Notes: []string{
		"支付成功即锁定名额，拼团成功后额度立即到账。",
		"拼团有效期内人数越多，每人到账额度越高。",
		"未达最低成团人数则拼团失败，已支付款项将自动原路退回。",
		"额度有效期以套餐说明为准。",
	},
}

func init() {
	config.GlobalConfig.Register("groupbuy_setting", &groupBuySetting)
}

// GetGroupBuySetting 获取拼团配置。
func GetGroupBuySetting() *GroupBuySetting {
	return &groupBuySetting
}
