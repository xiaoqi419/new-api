package identity_verify_setting

import "github.com/QuantumNous/new-api/setting/config"

// IdentityType 一种可认证身份（教师/医疗/大学生等），由管理员在后台维护。
type IdentityType struct {
	Key     string `json:"key"`     // 唯一标识
	Name    string `json:"name"`    // 展示名称
	Quota   int    `json:"quota"`   // 审核通过后发放的额度（与充值同单位）
	Enabled bool   `json:"enabled"` // 是否开放申请
}

// IdentityVerifySetting 身份认证发放额度的站点级配置。
// 注册到 config.GlobalConfig 后，前端以 identity_verify_setting.* 读写并自动持久化+热更新。
type IdentityVerifySetting struct {
	Enabled bool           `json:"enabled"`
	Types   []IdentityType `json:"types"`
}

var identityVerifySetting = IdentityVerifySetting{
	Enabled: false,
	Types:   []IdentityType{},
}

func init() {
	config.GlobalConfig.Register("identity_verify_setting", &identityVerifySetting)
}

func GetSetting() IdentityVerifySetting {
	return identityVerifySetting
}

// GetEnabledTypes 返回当前开放申请的身份类型。
func GetEnabledTypes() []IdentityType {
	types := make([]IdentityType, 0, len(identityVerifySetting.Types))
	for _, t := range identityVerifySetting.Types {
		if t.Enabled {
			types = append(types, t)
		}
	}
	return types
}

// GetTypeByKey 按 key 查找身份类型，第二个返回值表示是否找到。
func GetTypeByKey(key string) (IdentityType, bool) {
	for _, t := range identityVerifySetting.Types {
		if t.Key == key {
			return t, true
		}
	}
	return IdentityType{}, false
}
