package model

import (
	"errors"
	"math/rand"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/lottery_setting"

	"gorm.io/gorm"
)

// 摇摇卡状态。
const (
	LotteryCardStatusAvailable = 0 // 可用
	LotteryCardStatusUsed      = 1 // 已使用
	LotteryCardStatusExpired   = 2 // 已过期
)

// 摇摇卡来源。
const (
	LotteryCardSourceManual  = "manual"  // 管理员手动发放
	LotteryCardSourceConsume = "consume" // 累计消费解锁
	LotteryCardSourceTopup   = "topup"   // 充值赠送
	LotteryCardSourcePackage = "package" // 购套餐赠送
	LotteryCardSourceRedraw  = "redraw"  // 再抽一次返还
	LotteryCardSourceRedeem  = "redeem"  // 兑换码
)

// LotteryCard 摇摇卡（一次抽奖机会）。
type LotteryCard struct {
	Id          int    `json:"id"`
	UserId      int    `json:"user_id" gorm:"index"`
	Source      string `json:"source" gorm:"type:varchar(32)"`
	Status      int    `json:"status" gorm:"index"`
	ExpireTime  int64  `json:"expire_time"` // 0 表示永不过期
	CreatedTime int64  `json:"created_time"`
	UsedTime    int64  `json:"used_time"`
}

// LotteryDrawRecord 抽奖记录。
type LotteryDrawRecord struct {
	Id          int    `json:"id"`
	UserId      int    `json:"user_id" gorm:"index"`
	Username    string `json:"username" gorm:"type:varchar(64)"`
	PrizeKey    string `json:"prize_key" gorm:"type:varchar(64)"`
	PrizeName   string `json:"prize_name" gorm:"type:varchar(64)"`
	PrizeType   string `json:"prize_type" gorm:"type:varchar(32)"`
	PrizeQuota  int    `json:"prize_quota"` // 中奖奖项额度
	BaseQuota   int    `json:"base_quota"`  // 本次保底额度
	TotalQuota  int    `json:"total_quota"` // 实际发放额度（保底+奖项）
	CardId      int    `json:"card_id"`
	CreatedTime int64  `json:"created_time"`
}

// LotteryConsumeGrant 记录用户在某累计消费阈值已发过卡，防止重复发放。
type LotteryConsumeGrant struct {
	Id          int   `json:"id"`
	UserId      int   `json:"user_id" gorm:"uniqueIndex:idx_lottery_consume_user_threshold"`
	Threshold   int   `json:"threshold" gorm:"uniqueIndex:idx_lottery_consume_user_threshold"`
	CardsPer    int   `json:"cards_per"`
	GrantedTime int64 `json:"granted_time"`
}

// LotteryTopupGrant 记录用户在某累计充值阈值已发过卡，防止重复发放。
type LotteryTopupGrant struct {
	Id          int   `json:"id"`
	UserId      int   `json:"user_id" gorm:"uniqueIndex:idx_lottery_topup_user_threshold"`
	Threshold   int   `json:"threshold" gorm:"uniqueIndex:idx_lottery_topup_user_threshold"`
	CardsPer    int   `json:"cards_per"`
	GrantedTime int64 `json:"granted_time"`
}

// LotteryTopupTotal 累计充值额度计数，在每次充值成功时累加。
type LotteryTopupTotal struct {
	Id         int `json:"id"`
	UserId     int `json:"user_id" gorm:"uniqueIndex"`
	TotalQuota int `json:"total_quota"`
}

func (LotteryCard) TableName() string {
	return "lottery_cards"
}

func (LotteryDrawRecord) TableName() string {
	return "lottery_draw_records"
}

func (LotteryConsumeGrant) TableName() string {
	return "lottery_consume_grants"
}

func (LotteryTopupGrant) TableName() string {
	return "lottery_topup_grants"
}

func (LotteryTopupTotal) TableName() string {
	return "lottery_topup_totals"
}

// GrantTopupLotteryCards 在充值成功后累加充值额度并按规则补发摇摇卡（幂等）。
func GrantTopupLotteryCards(userId int, addedQuota int) {
	if len(lottery_setting.GetEnabledTopupGrantRules()) == 0 {
		return
	}
	if err := AddUserTopupQuota(userId, addedQuota); err != nil {
		common.SysError("lottery topup quota accumulate failed: " + err.Error())
		return
	}
	if _, err := SyncTopupGrantCards(userId); err != nil {
		common.SysError("lottery topup grant sync failed: " + err.Error())
	}
}

// CountAvailableLotteryCards 统计用户可用摇摇卡数量（排除已过期）。
func CountAvailableLotteryCards(userId int) (int64, error) {
	now := time.Now().Unix()
	var count int64
	err := DB.Model(&LotteryCard{}).
		Where("user_id = ? AND status = ? AND (expire_time = 0 OR expire_time > ?)",
			userId, LotteryCardStatusAvailable, now).
		Count(&count).Error
	return count, err
}

// GrantLotteryCards 给用户发放 n 张摇摇卡。
func GrantLotteryCards(userId int, n int, source string, expireTime int64) error {
	if n <= 0 {
		return nil
	}
	now := time.Now().Unix()
	cards := make([]LotteryCard, 0, n)
	for i := 0; i < n; i++ {
		cards = append(cards, LotteryCard{
			UserId:      userId,
			Source:      source,
			Status:      LotteryCardStatusAvailable,
			ExpireTime:  expireTime,
			CreatedTime: now,
		})
	}
	return DB.Create(&cards).Error
}

// GetUserLotteryCards 用户可用摇摇卡列表。
func GetUserLotteryCards(userId int) ([]*LotteryCard, error) {
	now := time.Now().Unix()
	var list []*LotteryCard
	err := DB.Where("user_id = ? AND status = ? AND (expire_time = 0 OR expire_time > ?)",
		userId, LotteryCardStatusAvailable, now).
		Order("id asc").Find(&list).Error
	return list, err
}

// GetUserLotteryRecords 用户抽奖记录（分页）。
func GetUserLotteryRecords(userId int, startIdx int, num int) ([]*LotteryDrawRecord, int64, error) {
	var total int64
	if err := DB.Model(&LotteryDrawRecord{}).Where("user_id = ?", userId).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []*LotteryDrawRecord
	err := DB.Where("user_id = ?", userId).Order("id desc").Limit(num).Offset(startIdx).Find(&list).Error
	return list, total, err
}

// GetAllLotteryRecords 管理员分页查询全部抽奖记录。
func GetAllLotteryRecords(startIdx int, num int) ([]*LotteryDrawRecord, int64, error) {
	var total int64
	if err := DB.Model(&LotteryDrawRecord{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []*LotteryDrawRecord
	err := DB.Order("id desc").Limit(num).Offset(startIdx).Find(&list).Error
	return list, total, err
}

// LotteryProgress 「距离下一张摇摇卡」进度。
type LotteryProgress struct {
	ConsumedQuota int  `json:"consumed_quota"` // 当前累计消费
	NextThreshold int  `json:"next_threshold"` // 下一档阈值（0 表示已无更高档）
	HasNext       bool `json:"has_next"`
}

// SyncConsumeGrantCards 按累计消费发卡规则为用户补发摇摇卡（懒触发，幂等）。
// 对已达标但未发过的阈值发卡，用唯一索引去重防止并发/重复发放。返回本次补发的卡数。
func SyncConsumeGrantCards(userId int, consumedQuota int) (int, error) {
	rules := lottery_setting.GetEnabledGrantRules()
	if len(rules) == 0 {
		return 0, nil
	}
	var granted []LotteryConsumeGrant
	if err := DB.Where("user_id = ?", userId).Find(&granted).Error; err != nil {
		return 0, err
	}
	grantedThresholds := make(map[int]bool, len(granted))
	for _, g := range granted {
		grantedThresholds[g.Threshold] = true
	}

	totalGranted := 0
	now := time.Now().Unix()
	for _, rule := range rules {
		if consumedQuota < rule.Threshold || grantedThresholds[rule.Threshold] {
			continue
		}
		// 先占位去重记录（唯一索引冲突表示已被其它请求发放），成功后再发卡。
		mark := LotteryConsumeGrant{
			UserId:      userId,
			Threshold:   rule.Threshold,
			CardsPer:    rule.CardsPer,
			GrantedTime: now,
		}
		if err := DB.Create(&mark).Error; err != nil {
			// 唯一冲突：已发放，跳过。
			continue
		}
		if err := GrantLotteryCards(userId, rule.CardsPer, LotteryCardSourceConsume, 0); err != nil {
			return totalGranted, err
		}
		totalGranted += rule.CardsPer
	}
	return totalGranted, nil
}

// GetLotteryProgress 计算用户距离下一张摇摇卡的进度（基于累计消费与发卡规则）。
func GetLotteryProgress(userId int, consumedQuota int) (LotteryProgress, error) {
	progress := LotteryProgress{ConsumedQuota: consumedQuota}
	rules := lottery_setting.GetEnabledGrantRules()
	for _, rule := range rules {
		if consumedQuota < rule.Threshold {
			progress.NextThreshold = rule.Threshold
			progress.HasNext = true
			break
		}
	}
	return progress, nil
}

// AddUserTopupQuota 累加用户已充值额度计数（在每次充值成功时调用，幂等由调用方按订单保证）。
func AddUserTopupQuota(userId int, addedQuota int) error {
	if addedQuota <= 0 {
		return nil
	}
	total := LotteryTopupTotal{UserId: userId, TotalQuota: addedQuota}
	// upsert：存在则累加，不存在则创建。
	err := DB.Where("user_id = ?", userId).First(&LotteryTopupTotal{}).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return DB.Create(&total).Error
	}
	if err != nil {
		return err
	}
	return DB.Model(&LotteryTopupTotal{}).
		Where("user_id = ?", userId).
		Update("total_quota", gorm.Expr("total_quota + ?", addedQuota)).Error
}

// GetUserTopupQuotaTotal 返回用户累计充值额度计数。
func GetUserTopupQuotaTotal(userId int) (int, error) {
	var rec LotteryTopupTotal
	err := DB.Where("user_id = ?", userId).First(&rec).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return rec.TotalQuota, nil
}

// SyncTopupGrantCards 按累计充值发卡规则为用户补发摇摇卡（懒触发，幂等，可带过期）。
func SyncTopupGrantCards(userId int) (int, error) {
	rules := lottery_setting.GetEnabledTopupGrantRules()
	if len(rules) == 0 {
		return 0, nil
	}
	topupQuota, err := GetUserTopupQuotaTotal(userId)
	if err != nil {
		return 0, err
	}
	var granted []LotteryTopupGrant
	if err := DB.Where("user_id = ?", userId).Find(&granted).Error; err != nil {
		return 0, err
	}
	grantedThresholds := make(map[int]bool, len(granted))
	for _, g := range granted {
		grantedThresholds[g.Threshold] = true
	}

	totalGranted := 0
	now := time.Now().Unix()
	for _, rule := range rules {
		if topupQuota < rule.Threshold || grantedThresholds[rule.Threshold] {
			continue
		}
		mark := LotteryTopupGrant{
			UserId:      userId,
			Threshold:   rule.Threshold,
			CardsPer:    rule.CardsPer,
			GrantedTime: now,
		}
		if err := DB.Create(&mark).Error; err != nil {
			// 唯一冲突：已发放，跳过。
			continue
		}
		expireTime := int64(0)
		if rule.CardExpireDays > 0 {
			expireTime = now + int64(rule.CardExpireDays)*86400
		}
		if err := GrantLotteryCards(userId, rule.CardsPer, LotteryCardSourceTopup, expireTime); err != nil {
			return totalGranted, err
		}
		totalGranted += rule.CardsPer
	}
	return totalGranted, nil
}

// pickPrizeByWeight 按权重随机抽取一个奖项。调用前须保证 prizes 非空且总权重为正。
func pickPrizeByWeight(prizes []lottery_setting.LotteryPrize) lottery_setting.LotteryPrize {
	totalWeight := 0
	for _, p := range prizes {
		if p.Weight > 0 {
			totalWeight += p.Weight
		}
	}
	if totalWeight <= 0 {
		return prizes[rand.Intn(len(prizes))]
	}
	r := rand.Intn(totalWeight)
	for _, p := range prizes {
		if p.Weight <= 0 {
			continue
		}
		if r < p.Weight {
			return p
		}
		r -= p.Weight
	}
	return prizes[len(prizes)-1]
}

// DrawLottery 执行一次抽奖：事务内核销一张可用卡 -> 按权重定奖 -> 发额度 -> 记录。
// 命中「再抽一次」时返还一张摇摇卡。返回抽奖记录（含中奖奖项）。
func DrawLottery(userId int, username string) (*LotteryDrawRecord, error) {
	setting := lottery_setting.GetSetting()
	if !setting.Enabled {
		return nil, errors.New("抽奖功能未开启")
	}
	prizes := lottery_setting.GetEnabledPrizes()
	if len(prizes) == 0 {
		return nil, errors.New("暂无可抽取的奖项")
	}

	baseQuota := setting.BaseQuota
	if baseQuota < 0 {
		baseQuota = 0
	}

	record := &LotteryDrawRecord{
		UserId:      userId,
		Username:    username,
		BaseQuota:   baseQuota,
		CreatedTime: time.Now().Unix(),
	}
	var quotaToGrant int

	err := DB.Transaction(func(tx *gorm.DB) error {
		// 锁定并核销一张可用卡，防止并发重复抽奖。
		now := time.Now().Unix()
		var card LotteryCard
		if err := lockForUpdate(tx).
			Where("user_id = ? AND status = ? AND (expire_time = 0 OR expire_time > ?)",
				userId, LotteryCardStatusAvailable, now).
			Order("id asc").First(&card).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("没有可用的摇摇卡")
			}
			return err
		}
		if err := tx.Model(&LotteryCard{}).Where("id = ?", card.Id).Updates(map[string]any{
			"status":    LotteryCardStatusUsed,
			"used_time": now,
		}).Error; err != nil {
			return err
		}

		prize := pickPrizeByWeight(prizes)
		record.CardId = card.Id
		record.PrizeKey = prize.Key
		record.PrizeName = prize.Name
		record.PrizeType = prize.Type

		prizeQuota := 0
		if prize.Type == lottery_setting.PrizeTypeQuota && prize.Quota > 0 {
			prizeQuota = prize.Quota
		}
		record.PrizeQuota = prizeQuota

		total := baseQuota + prizeQuota
		if total > maxLotteryGrantQuota {
			total = maxLotteryGrantQuota
		}
		record.TotalQuota = total
		quotaToGrant = total

		if total > 0 {
			if err := tx.Model(&User{}).Where("id = ?", userId).
				Update("quota", gorm.Expr("quota + ?", total)).Error; err != nil {
				return err
			}
		}

		// 「再抽一次」：返还一张摇摇卡，与核销原子提交。
		if prize.Type == lottery_setting.PrizeTypeRedraw {
			if err := tx.Create(&LotteryCard{
				UserId:      userId,
				Source:      LotteryCardSourceRedraw,
				Status:      LotteryCardStatusAvailable,
				ExpireTime:  0,
				CreatedTime: now,
			}).Error; err != nil {
				return err
			}
		}

		if err := tx.Create(record).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	if quotaToGrant > 0 && common.RedisEnabled {
		if cacheErr := cacheIncrUserQuota(userId, int64(quotaToGrant)); cacheErr != nil {
			common.SysError("failed to sync user quota cache after lottery draw: " + cacheErr.Error())
		}
	}
	return record, nil
}

// maxLotteryGrantQuota 单次抽奖发放额度上限，防止溢出 int32 额度列。
const maxLotteryGrantQuota = 2000000000
