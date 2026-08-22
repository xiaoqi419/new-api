package system_setting

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

type LegalSettings struct {
	UserAgreement string `json:"user_agreement"`
	PrivacyPolicy string `json:"privacy_policy"`
}

var defaultLegalSettings = LegalSettings{
	UserAgreement: "",
	PrivacyPolicy: "",
}

func init() {
	config.GlobalConfig.Register("legal", &defaultLegalSettings)
}

func GetLegalSettings() *LegalSettings {
	return &defaultLegalSettings
}

// Version 返回协议内容的短哈希，作为“协议版本”。
// 当用户协议或隐私政策内容发生变化时，版本随之变化，用于触发用户重新同意。
// 当两者均为空时返回空字符串，表示未启用协议，无需同意。
func (s *LegalSettings) Version() string {
	agreement := strings.TrimSpace(s.UserAgreement)
	privacy := strings.TrimSpace(s.PrivacyPolicy)
	if agreement == "" && privacy == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(agreement + "\n--\n" + privacy))
	return hex.EncodeToString(sum[:])[:12]
}
