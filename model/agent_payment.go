package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// 代理自有支付网关标识（对齐 PaymentProvider*）
const (
	AgentPaymentProviderEpay   = "epay"
	AgentPaymentProviderStripe = "stripe"
)

// AgentPaymentConfig 代理(租户)自有支付网关配置，按 (agent_id, provider) 唯一。
// creds_encrypted 为该网关整段凭据 JSON 的 AES 密文；unit_price/min_topup 为代理自定义
// 套餐定价(元/单位、最小充值)，为空(0)时回退平台全局配置。
type AgentPaymentConfig struct {
	Id             int     `json:"id"`
	AgentId        int     `json:"agent_id" gorm:"uniqueIndex:idx_agent_payment_agent_provider,priority:1"`
	Provider       string  `json:"provider" gorm:"column:provider;uniqueIndex:idx_agent_payment_agent_provider,priority:2;type:varchar(32)"`
	CredsEncrypted string  `json:"-" gorm:"type:text"`
	Enabled        bool    `json:"enabled"`
	UnitPrice      float64 `json:"unit_price" gorm:"type:decimal(10,6);default:0"`
	MinTopup       int     `json:"min_topup" gorm:"type:int;default:0"`
	CreatedTime    int64   `json:"created_time" gorm:"bigint"`
	UpdatedTime    int64   `json:"updated_time" gorm:"bigint"`
}

func isSupportedAgentPaymentProvider(provider string) bool {
	return provider == AgentPaymentProviderEpay || provider == AgentPaymentProviderStripe
}

// AgentPaymentCredKeys 返回某网关允许的凭据字段白名单；未知网关返回 nil。
// 控制台仅接受白名单内的凭据键，避免存入无关字段。
func AgentPaymentCredKeys(provider string) []string {
	switch provider {
	case AgentPaymentProviderEpay:
		return []string{"pay_address", "epay_id", "epay_key"}
	case AgentPaymentProviderStripe:
		return []string{"api_secret", "webhook_secret", "price_id", "promotion_codes"}
	default:
		return nil
	}
}

// GetAgentPaymentConfig 读取指定代理某网关配置；未配置返回 (nil, nil)。
// 支付非热路径，直读 DB 保证凭据变更即时生效。
func GetAgentPaymentConfig(agentId int, provider string) (*AgentPaymentConfig, error) {
	if agentId <= 0 {
		return nil, nil
	}
	if !isSupportedAgentPaymentProvider(provider) {
		return nil, errors.New("不支持的支付网关: " + provider)
	}
	cfg := &AgentPaymentConfig{}
	err := DB.Where("agent_id = ? AND provider = ?", agentId, provider).First(cfg).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return cfg, nil
}

// DecryptCreds 解密并解析凭据 JSON 为 map；空密文返回空 map。
func (cfg *AgentPaymentConfig) DecryptCreds() (map[string]string, error) {
	creds := map[string]string{}
	if cfg == nil || cfg.CredsEncrypted == "" {
		return creds, nil
	}
	plaintext, err := common.AesDecryptString(cfg.CredsEncrypted)
	if err != nil {
		return nil, err
	}
	if plaintext == "" {
		return creds, nil
	}
	if err := common.UnmarshalJsonStr(plaintext, &creds); err != nil {
		return nil, err
	}
	return creds, nil
}

// GetAgentPaymentConfigs 返回代理已配置的全部网关(供控制台展示)，凭据以掩码形式呈现，不返回明文。
func GetAgentPaymentConfigs(agentId int) ([]*AgentPaymentConfig, error) {
	if agentId <= 0 {
		return nil, errors.New("代理 ID 无效")
	}
	var configs []*AgentPaymentConfig
	if err := DB.Where("agent_id = ?", agentId).Find(&configs).Error; err != nil {
		return nil, err
	}
	return configs, nil
}

// SetAgentPaymentConfig 为代理 upsert 一个网关配置。credsJSON 非空时加密覆盖；为空则仅更新开关/定价，
// 保留原凭据。返回后调用方可读取掩码信息。
func SetAgentPaymentConfig(agentId int, provider string, credsJSON string, enabled bool, unitPrice float64, minTopup int) error {
	if agentId <= 0 {
		return errors.New("代理 ID 无效")
	}
	if !isSupportedAgentPaymentProvider(provider) {
		return errors.New("不支持的支付网关: " + provider)
	}
	if unitPrice < 0 {
		return errors.New("套餐单价不能为负数")
	}
	if minTopup < 0 {
		return errors.New("最小充值不能为负数")
	}
	encrypted := ""
	if credsJSON != "" {
		enc, err := common.AesEncryptString(credsJSON)
		if err != nil {
			return err
		}
		encrypted = enc
	}
	now := common.GetTimestamp()
	existing := &AgentPaymentConfig{}
	err := DB.Where("agent_id = ? AND provider = ?", agentId, provider).First(existing).Error
	if err == nil {
		updates := map[string]interface{}{
			"enabled":      enabled,
			"unit_price":   unitPrice,
			"min_topup":    minTopup,
			"updated_time": now,
		}
		if encrypted != "" {
			updates["creds_encrypted"] = encrypted
		}
		return DB.Model(&AgentPaymentConfig{}).Where("id = ?", existing.Id).Updates(updates).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	record := &AgentPaymentConfig{
		AgentId:        agentId,
		Provider:       provider,
		CredsEncrypted: encrypted,
		Enabled:        enabled,
		UnitPrice:      unitPrice,
		MinTopup:       minTopup,
		CreatedTime:    now,
		UpdatedTime:    now,
	}
	return DB.Create(record).Error
}
