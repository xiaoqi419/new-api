package model

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"

	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

// 代理状态
const (
	AgentStatusPending  = 0 // 待审批
	AgentStatusActive   = 1 // 已开通
	AgentStatusDisabled = 2 // 已停用
)

// 代理钱包流水类型
const (
	AgentLedgerTypePrepay = "prepay" // 预充值（代理向平台充值）
	AgentLedgerTypeSettle = "settle" // 结算扣款（终端用户充值时按 cost_ratio 从代理钱包扣）
	AgentLedgerTypeRefund = "refund" // 退款/回补
	AgentLedgerTypeAdjust = "adjust" // 管理员手动调账
)

var ErrAgentWalletQuotaLimitExceeded = errors.New("agent wallet quota limit exceeded")

// Agent 代理商（白标租户）。owner_user_id 指向平台内的 owner 账号（agent_id=0, is_agent=1）。
// wallet_quota 为代理在平台的预充值余额（额度制，与用户额度同单位，int32 饱和）。
// cost_ratio 为结算折扣：终端用户每充值 $M，平台从代理钱包扣 M×cost_ratio。
// sell_group_ratios 为代理自定义的分组消费倍率 JSON（下限=平台对应倍率的 9 折）。
type Agent struct {
	Id              int     `json:"id"`
	OwnerUserId     int     `json:"owner_user_id" gorm:"uniqueIndex"`
	Name            string  `json:"name" gorm:"type:varchar(128)"`
	Status          int     `json:"status" gorm:"type:int;default:0"`
	WalletQuota     int     `json:"wallet_quota" gorm:"type:int;default:0"`
	CostRatio       float64 `json:"cost_ratio" gorm:"type:decimal(10,6);default:1"`
	SellGroupRatios string  `json:"sell_group_ratios" gorm:"type:text"`
	Remark          string  `json:"remark,omitempty" gorm:"type:varchar(255)"`
	CreatedTime     int64   `json:"created_time" gorm:"bigint"`
	UpdatedTime     int64   `json:"updated_time" gorm:"bigint"`
}

// AgentLedger 代理钱包流水（预充/结算/退款/调账），balance_after 记录变更后余额，便于对账。
type AgentLedger struct {
	Id           int    `json:"id"`
	AgentId      int    `json:"agent_id" gorm:"index"`
	Type         string `json:"type" gorm:"type:varchar(16)"`
	QuotaDelta   int64  `json:"quota_delta"`
	BalanceAfter int    `json:"balance_after"`
	RefTradeNo   string `json:"ref_trade_no" gorm:"type:varchar(255);index"`
	UserId       int    `json:"user_id" gorm:"index;default:0"`
	Content      string `json:"content" gorm:"type:text"`
	CreatedTime  int64  `json:"created_time" gorm:"bigint"`
}

func (agent *Agent) Insert() error {
	now := common.GetTimestamp()
	agent.CreatedTime = now
	agent.UpdatedTime = now
	return DB.Create(agent).Error
}

// AgentNameMaxRunes 代理名称长度上限。名称会显示在白标站点的品牌位置，留够
// 一个店铺名的余量即可。
const AgentNameMaxRunes = 32

// agentRemarkMaxRunes 对齐 Remark 列的 varchar(255)。
const agentRemarkMaxRunes = 255

// BeforeSave 收敛名称与备注长度。三条写入路径（自助申请、管理员新建、管理员改名）
// 都会经过这里，否则任一入口漏掉校验就会由 PostgreSQL 直接抛出
// "value too long for type character varying(128)"，把库表细节暴露给用户。
func (agent *Agent) BeforeSave(tx *gorm.DB) error {
	agent.Name = strings.TrimSpace(agent.Name)
	if utf8.RuneCountInString(agent.Name) > AgentNameMaxRunes {
		return fmt.Errorf("代理名称最多 %d 个字", AgentNameMaxRunes)
	}
	if utf8.RuneCountInString(agent.Remark) > agentRemarkMaxRunes {
		return fmt.Errorf("备注最多 %d 个字", agentRemarkMaxRunes)
	}
	return nil
}

func (agent *Agent) Update() error {
	agent.UpdatedTime = common.GetTimestamp()
	if err := DB.Model(agent).Select("name", "status", "cost_ratio", "sell_group_ratios", "remark", "updated_time").Updates(agent).Error; err != nil {
		return err
	}
	InvalidateAgentRatioCache(agent.Id)
	return nil
}

// UpdateAgentSellGroupRatios 保存代理自定义分组倍率(JSON) 并失效缓存。9折下限在读取(计费)时兜底。
func UpdateAgentSellGroupRatios(id int, ratiosJSON string) error {
	if err := DB.Model(&Agent{}).Where("id = ?", id).Updates(map[string]interface{}{
		"sell_group_ratios": ratiosJSON,
		"updated_time":      common.GetTimestamp(),
	}).Error; err != nil {
		return err
	}
	InvalidateAgentRatioCache(id)
	return nil
}

type agentRatioCacheEntry struct {
	ratios map[string]float64
	expire int64
}

var agentRatioCache sync.Map // agentId(int) -> *agentRatioCacheEntry

const agentRatioCacheTTLSeconds = 60

// GetAgentSellGroupRatio 读取代理对某分组的自定义消费倍率(带 60s 内存缓存)。ok=false 表示未自定义，
// 调用方回退平台倍率。下限(平台倍率 9 折)由计费侧 HandleGroupRatio 兜底。
func GetAgentSellGroupRatio(agentId int, group string) (float64, bool) {
	if agentId <= 0 || group == "" {
		return 0, false
	}
	now := common.GetTimestamp()
	if v, ok := agentRatioCache.Load(agentId); ok {
		entry := v.(*agentRatioCacheEntry)
		if entry.expire > now {
			r, ok := entry.ratios[group]
			return r, ok
		}
	}
	ratios := map[string]float64{}
	if agent, err := GetAgentById(agentId); err == nil {
		ratios = agent.GetSellGroupRatios()
	}
	agentRatioCache.Store(agentId, &agentRatioCacheEntry{ratios: ratios, expire: now + agentRatioCacheTTLSeconds})
	r, ok := ratios[group]
	return r, ok
}

func InvalidateAgentRatioCache(agentId int) {
	agentRatioCache.Delete(agentId)
}

// GetSellGroupRatios 解析代理自定义分组倍率；解析失败返回空表，由调用方回退平台倍率。
func (agent *Agent) GetSellGroupRatios() map[string]float64 {
	ratios := make(map[string]float64)
	if agent.SellGroupRatios == "" {
		return ratios
	}
	if err := common.UnmarshalJsonStr(agent.SellGroupRatios, &ratios); err != nil {
		common.SysError("failed to unmarshal agent sell_group_ratios: " + err.Error())
		return make(map[string]float64)
	}
	return ratios
}

// CreateAgentForOwner 将平台账号(agent_id=0)升级为代理 owner：置 is_agent=1 并创建代理记录。
// 终端用户(agent_id!=0)不可升级；一个 owner 仅能对应一个代理(owner_user_id 唯一索引)。
func CreateAgentForOwner(ownerUserId int, name string, costRatio float64, status int, remark string) (*Agent, error) {
	if ownerUserId <= 0 {
		return nil, errors.New("owner 用户 ID 无效")
	}
	if costRatio < 0 {
		return nil, errors.New("结算折扣不能为负数")
	}
	agent := &Agent{
		OwnerUserId: ownerUserId,
		Name:        name,
		Status:      status,
		CostRatio:   costRatio,
		Remark:      remark,
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := tx.Where("id = ?", ownerUserId).First(&user).Error; err != nil {
			return errors.New("owner 用户不存在")
		}
		if user.AgentId != 0 {
			return errors.New("终端用户不能升级为代理 owner")
		}
		now := common.GetTimestamp()
		agent.CreatedTime = now
		agent.UpdatedTime = now
		if err := tx.Create(agent).Error; err != nil {
			return err
		}
		return tx.Model(&User{}).Where("id = ?", ownerUserId).Update("is_agent", true).Error
	})
	if err != nil {
		return nil, err
	}
	return agent, nil
}

// CreateAgentApplication 前台申请：为平台用户(agent_id=0)创建一条 pending 代理记录，
// 但暂不置 is_agent(等审批/自动审批通过后再升级)。终端用户不可申请。
func CreateAgentApplication(ownerUserId int, name string, remark string) (*Agent, error) {
	if ownerUserId <= 0 {
		return nil, errors.New("owner 用户 ID 无效")
	}
	agent := &Agent{
		OwnerUserId: ownerUserId,
		Name:        name,
		Status:      AgentStatusPending,
		CostRatio:   1,
		Remark:      remark,
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := tx.Where("id = ?", ownerUserId).First(&user).Error; err != nil {
			return errors.New("owner 用户不存在")
		}
		if user.AgentId != 0 {
			return errors.New("终端用户不能升级为代理 owner")
		}
		now := common.GetTimestamp()
		agent.CreatedTime = now
		agent.UpdatedTime = now
		return tx.Create(agent).Error
	})
	if err != nil {
		return nil, err
	}
	return agent, nil
}

// ActivateAgent 审批通过：置代理为 active，并把其 owner 升级为代理(is_agent=1)。幂等。
func ActivateAgent(id int) error {
	agent, err := GetAgentById(id)
	if err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&Agent{}).Where("id = ?", id).Updates(map[string]interface{}{
			"status":       AgentStatusActive,
			"updated_time": common.GetTimestamp(),
		}).Error; err != nil {
			return err
		}
		return tx.Model(&User{}).Where("id = ?", agent.OwnerUserId).Update("is_agent", true).Error
	})
}

func GetAgentById(id int) (*Agent, error) {
	if id <= 0 {
		return nil, errors.New("代理 ID 无效")
	}
	agent := &Agent{}
	if err := DB.Where("id = ?", id).First(agent).Error; err != nil {
		return nil, err
	}
	return agent, nil
}

func GetAgentByOwnerUserId(userId int) (*Agent, error) {
	if userId <= 0 {
		return nil, errors.New("用户 ID 无效")
	}
	agent := &Agent{}
	if err := DB.Where("owner_user_id = ?", userId).First(agent).Error; err != nil {
		return nil, err
	}
	return agent, nil
}

func GetAllAgents(pageInfo *common.PageInfo) (agents []*Agent, total int64, err error) {
	if err = DB.Model(&Agent{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = DB.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&agents).Error
	return agents, total, err
}

// GetAgentTerminalUsers 分页返回归属该代理的终端用户(owner 自身 agent_id=0，不在此列表)。
func GetAgentTerminalUsers(agentId int, pageInfo *common.PageInfo) (users []*User, total int64, err error) {
	if agentId <= 0 {
		return nil, 0, errors.New("代理 ID 无效")
	}
	if err = DB.Model(&User{}).Where("agent_id = ?", agentId).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = DB.Where("agent_id = ?", agentId).Order("id desc").
		Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).
		Omit("password", "access_token").Find(&users).Error
	return users, total, err
}

func UpdateAgentStatus(id int, status int) error {
	return DB.Model(&Agent{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":       status,
		"updated_time": common.GetTimestamp(),
	}).Error
}

func UpdateAgentCostRatio(id int, costRatio float64) error {
	if costRatio < 0 {
		return errors.New("结算折扣不能为负数")
	}
	return DB.Model(&Agent{}).Where("id = ?", id).Updates(map[string]interface{}{
		"cost_ratio":   costRatio,
		"updated_time": common.GetTimestamp(),
	}).Error
}

// IncreaseAgentWallet 原子增加代理钱包余额（不含流水，供内部/批量场景）。
func IncreaseAgentWallet(agentId int, quota int) error {
	if quota < 0 {
		return errors.New("quota 不能为负数！")
	}
	if quota > common.MaxQuota {
		return ErrAgentWalletQuotaLimitExceeded
	}
	if quota == 0 {
		return nil
	}
	result := DB.Model(&Agent{}).
		Where("id = ? AND wallet_quota <= ?", agentId, common.MaxQuota-quota).
		Update("wallet_quota", gorm.Expr("wallet_quota + ?", quota))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 1 {
		return nil
	}
	var count int64
	if err := DB.Model(&Agent{}).Where("id = ?", agentId).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return gorm.ErrRecordNotFound
	}
	return ErrAgentWalletQuotaLimitExceeded
}

// DecreaseAgentWalletIfEnough 仅在余额足够时原子扣减，余额不足返回 ok=false（无 error）。
// 单条条件 UPDATE 关闭 check-then-act 竞态，保证代理钱包绝不为负（S12 挂单不透支）。
func DecreaseAgentWalletIfEnough(agentId int, quota int) (ok bool, err error) {
	if quota < 0 {
		return false, errors.New("quota 不能为负数！")
	}
	if quota == 0 {
		return true, nil
	}
	result := DB.Model(&Agent{}).Where("id = ? AND wallet_quota >= ?", agentId, quota).
		Update("wallet_quota", gorm.Expr("wallet_quota - ?", quota))
	if result.Error != nil {
		return false, result.Error
	}
	if result.RowsAffected == 0 {
		return false, nil
	}
	return true, nil
}

// AdjustAgentWallet 在单事务内变更代理钱包并写入流水，用于预充值(delta>0)与管理员调账。
// 变更后余额为负时拒绝（钱包绝不为负）。结算扣款(SettleAgentUserTopup)有额外的用户加额度逻辑，单独实现。
func AdjustAgentWallet(agentId int, delta int, ledgerType string, refTradeNo string, userId int, content string) error {
	if delta == 0 {
		return nil
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		agent := &Agent{}
		if err := lockForUpdate(tx).Where("id = ?", agentId).First(agent).Error; err != nil {
			return errors.New("代理不存在")
		}
		newBalance, err := nextAgentWalletBalance(agent.WalletQuota, delta)
		if err != nil {
			return err
		}
		if err := tx.Model(&Agent{}).Where("id = ?", agentId).
			Update("wallet_quota", gorm.Expr("wallet_quota + ?", delta)).Error; err != nil {
			return err
		}
		ledger := &AgentLedger{
			AgentId:      agentId,
			Type:         ledgerType,
			QuotaDelta:   int64(delta),
			BalanceAfter: newBalance,
			RefTradeNo:   refTradeNo,
			UserId:       userId,
			Content:      content,
			CreatedTime:  common.GetTimestamp(),
		}
		return tx.Create(ledger).Error
	})
	if err != nil {
		return err
	}
	// 钱包入账后尝试补发挂单（S12：补足自动补发）
	if delta > 0 {
		gopool.Go(func() { ResettleHeldTopups(agentId) })
	}
	return nil
}

func nextAgentWalletBalance(balance, delta int) (int, error) {
	if balance < 0 {
		return 0, errors.New("代理钱包余额无效")
	}
	if delta > 0 {
		if delta > common.MaxQuota || balance > common.MaxQuota-delta {
			return 0, ErrAgentWalletQuotaLimitExceeded
		}
	} else if delta < 0 && delta < -balance {
		return 0, errors.New("代理钱包余额不足")
	}
	return balance + delta, nil
}

func GetAgentLedgers(agentId int, pageInfo *common.PageInfo) (ledgers []*AgentLedger, total int64, err error) {
	if err = DB.Model(&AgentLedger{}).Where("agent_id = ?", agentId).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = DB.Where("agent_id = ?", agentId).Order("id desc").
		Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&ledgers).Error
	return ledgers, total, err
}
