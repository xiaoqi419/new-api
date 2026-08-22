package model

import (
	"errors"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// AgentOption 代理(租户)级品牌/开关覆盖项，按 (agent_id, option_key) 唯一。
// 值为空或键不存在时，调用方回退到平台全局配置。
type AgentOption struct {
	Id      int    `json:"id"`
	AgentId int    `json:"agent_id" gorm:"uniqueIndex:idx_agent_options_agent_key,priority:1"`
	Key     string `json:"key" gorm:"column:option_key;uniqueIndex:idx_agent_options_agent_key,priority:2;type:varchar(64)"`
	Value   string `json:"value" gorm:"type:text"`
}

// AgentBrandableKeys 允许代理自定义的品牌键白名单，键名对齐平台 OptionMap。
var AgentBrandableKeys = map[string]bool{
	"SystemName":      true,
	"Logo":            true,
	"Footer":          true,
	"HomePageContent": true,
	"About":           true,
	"Notice":          true,
}

type agentOptionsCacheEntry struct {
	options map[string]string
	expire  int64
}

var agentOptionsCache sync.Map // agentId(int) -> *agentOptionsCacheEntry

const agentOptionsCacheTTLSeconds = 60

func loadAgentOptions(agentId int) map[string]string {
	if agentId <= 0 {
		return nil
	}
	now := common.GetTimestamp()
	if v, ok := agentOptionsCache.Load(agentId); ok {
		if entry, ok := v.(*agentOptionsCacheEntry); ok && entry.expire > now {
			return entry.options
		}
	}
	var records []AgentOption
	if err := DB.Where("agent_id = ?", agentId).Find(&records).Error; err != nil {
		common.SysError("failed to load agent options: " + err.Error())
		return nil
	}
	options := make(map[string]string, len(records))
	for _, r := range records {
		options[r.Key] = r.Value
	}
	agentOptionsCache.Store(agentId, &agentOptionsCacheEntry{options: options, expire: now + agentOptionsCacheTTLSeconds})
	return options
}

// GetTenantOption 返回指定代理(租户)对某品牌键的覆盖值；未设置或平台主站(agentId<=0)返回空串。
func GetTenantOption(agentId int, key string) string {
	if agentId <= 0 {
		return ""
	}
	options := loadAgentOptions(agentId)
	if options == nil {
		return ""
	}
	return options[key]
}

// GetAgentOptions 返回代理已设置的全部品牌键值(供代理控制台展示)。
func GetAgentOptions(agentId int) (map[string]string, error) {
	if agentId <= 0 {
		return map[string]string{}, nil
	}
	var records []AgentOption
	if err := DB.Where("agent_id = ?", agentId).Find(&records).Error; err != nil {
		return nil, err
	}
	options := make(map[string]string, len(records))
	for _, r := range records {
		options[r.Key] = r.Value
	}
	return options, nil
}

// SetAgentOption 为代理写入(upsert)一个品牌键值并失效缓存；仅允许白名单键。
func SetAgentOption(agentId int, key string, value string) error {
	if agentId <= 0 {
		return errors.New("代理 ID 无效")
	}
	if !AgentBrandableKeys[key] {
		return errors.New("不支持的品牌键: " + key)
	}
	var existing AgentOption
	err := DB.Where("agent_id = ? AND option_key = ?", agentId, key).First(&existing).Error
	if err == nil {
		existing.Value = value
		if e := DB.Model(&AgentOption{}).Where("id = ?", existing.Id).Update("value", value).Error; e != nil {
			return e
		}
	} else {
		record := &AgentOption{AgentId: agentId, Key: key, Value: value}
		if e := DB.Create(record).Error; e != nil {
			return e
		}
	}
	InvalidateAgentOptionsCache(agentId)
	return nil
}

func InvalidateAgentOptionsCache(agentId int) {
	agentOptionsCache.Delete(agentId)
}
