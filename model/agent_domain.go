package model

import (
	"errors"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// AgentDomain 代理绑定的白标域名。仅当 verified=1 且所属代理为 active 时参与租户解析。
type AgentDomain struct {
	Id          int    `json:"id"`
	AgentId     int    `json:"agent_id" gorm:"index"`
	Domain      string `json:"domain" gorm:"uniqueIndex;type:varchar(255)"`
	Verified    bool   `json:"verified" gorm:"default:false"`
	VerifyToken string `json:"verify_token" gorm:"type:varchar(64)"`
	CreatedTime int64  `json:"created_time" gorm:"bigint"`
}

// DomainVerifyTXTName 是代理需在其域名下添加的 TXT 记录主机名(值为 VerifyToken)。
const DomainVerifyTXTName = "_newapi-verify"

// NormalizeHost 去掉端口并小写，用于域名匹配（大小写不敏感）。
func NormalizeHost(host string) string {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "" {
		return ""
	}
	if idx := strings.IndexByte(host, ':'); idx >= 0 {
		host = host[:idx]
	}
	return host
}

type domainCacheState struct {
	domains map[string]int // host -> agentId
	expire  int64
}

var (
	agentDomainCacheMu    sync.RWMutex
	agentDomainCacheState *domainCacheState
)

const agentDomainCacheTTLSeconds = 60

func loadAgentDomainCache() *domainCacheState {
	now := common.GetTimestamp()

	agentDomainCacheMu.RLock()
	state := agentDomainCacheState
	agentDomainCacheMu.RUnlock()
	if state != nil && state.expire > now {
		return state
	}

	agentDomainCacheMu.Lock()
	defer agentDomainCacheMu.Unlock()
	if agentDomainCacheState != nil && agentDomainCacheState.expire > now {
		return agentDomainCacheState
	}

	domains := make(map[string]int)
	type row struct {
		Domain  string
		AgentId int
	}
	var rows []row
	// 仅解析已验证域名且所属代理为 active
	err := DB.Table("agent_domains").
		Select("agent_domains.domain as domain, agent_domains.agent_id as agent_id").
		Joins("JOIN agents ON agents.id = agent_domains.agent_id").
		Where("agent_domains.verified = ? AND agents.status = ?", true, AgentStatusActive).
		Scan(&rows).Error
	if err != nil {
		common.SysError("failed to load agent domains: " + err.Error())
		// 加载失败时返回旧缓存（若有），避免全站解析异常
		if agentDomainCacheState != nil {
			return agentDomainCacheState
		}
		return &domainCacheState{domains: domains, expire: now + agentDomainCacheTTLSeconds}
	}
	for _, r := range rows {
		host := NormalizeHost(r.Domain)
		if host != "" {
			domains[host] = r.AgentId
		}
	}
	agentDomainCacheState = &domainCacheState{domains: domains, expire: now + agentDomainCacheTTLSeconds}
	return agentDomainCacheState
}

// ResolveAgentIdByHost 按请求域名解析代理(租户)ID，未命中返回 0(平台主站)。
func ResolveAgentIdByHost(host string) int {
	host = NormalizeHost(host)
	if host == "" {
		return 0
	}
	state := loadAgentDomainCache()
	return state.domains[host]
}

func InvalidateAgentDomainCache() {
	agentDomainCacheMu.Lock()
	agentDomainCacheState = nil
	agentDomainCacheMu.Unlock()
}

func GetAgentDomains(agentId int) ([]*AgentDomain, error) {
	var domains []*AgentDomain
	err := DB.Where("agent_id = ?", agentId).Order("id asc").Find(&domains).Error
	return domains, err
}

func GetAgentDomainByHost(host string) (*AgentDomain, error) {
	host = NormalizeHost(host)
	if host == "" {
		return nil, errors.New("域名为空")
	}
	domain := &AgentDomain{}
	if err := DB.Where("domain = ?", host).First(domain).Error; err != nil {
		return nil, err
	}
	return domain, nil
}

// AddAgentDomain 为代理新增白标域名(默认未验证)，域名全局唯一。
func AddAgentDomain(agentId int, domain string) (*AgentDomain, error) {
	host := NormalizeHost(domain)
	if host == "" {
		return nil, errors.New("域名不能为空")
	}
	if agentId <= 0 {
		return nil, errors.New("代理 ID 无效")
	}
	record := &AgentDomain{
		AgentId:     agentId,
		Domain:      host,
		Verified:    false,
		VerifyToken: "newapi-verify-" + common.GetRandomString(24),
		CreatedTime: common.GetTimestamp(),
	}
	if err := DB.Create(record).Error; err != nil {
		return nil, errors.New("域名已被占用或创建失败")
	}
	InvalidateAgentDomainCache()
	return record, nil
}

// GetAgentDomainByIdForAgent 按 id + agent_id 获取域名，确保代理只能操作自己的域名。
func GetAgentDomainByIdForAgent(id int, agentId int) (*AgentDomain, error) {
	domain := &AgentDomain{}
	if err := DB.Where("id = ? AND agent_id = ?", id, agentId).First(domain).Error; err != nil {
		return nil, err
	}
	return domain, nil
}

func SetAgentDomainVerified(id int, verified bool) error {
	if err := DB.Model(&AgentDomain{}).Where("id = ?", id).Update("verified", verified).Error; err != nil {
		return err
	}
	InvalidateAgentDomainCache()
	return nil
}

func DeleteAgentDomain(id int, agentId int) error {
	q := DB.Where("id = ?", id)
	if agentId > 0 {
		q = q.Where("agent_id = ?", agentId)
	}
	if err := q.Delete(&AgentDomain{}).Error; err != nil {
		return err
	}
	InvalidateAgentDomainCache()
	return nil
}
