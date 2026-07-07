package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	GroupBuyStatusPending = "pending"
	GroupBuyStatusSuccess = "success"
	GroupBuyStatusFailed  = "failed"

	GroupBuyParticipantPending       = "pending"
	GroupBuyParticipantPaid          = "paid"
	GroupBuyParticipantRefunded      = "refunded"
	GroupBuyParticipantRefundPending = "refund_pending"
)

// groupBuyReserveTTLSeconds 参团下单后未支付的名额预占时长，超时释放名额。
const groupBuyReserveTTLSeconds int64 = 15 * 60

// GroupBuyPackage 管理员预设的拼团套餐模板。
type GroupBuyPackage struct {
	Id            int     `json:"id"`
	Name          string  `json:"name" gorm:"type:varchar(191)"`
	Description   string  `json:"description" gorm:"type:varchar(500)"`
	RequiredCount int     `json:"required_count"`                        // 成团人数
	TotalAmount   int64   `json:"total_amount"`                          // 总到账额度（成员均分，展示单位与普通充值一致）
	TotalPrice    float64 `json:"total_price"`                           // 总价（CNY，成员均分）
	DurationUnit  string  `json:"duration_unit" gorm:"type:varchar(16)"` // 成团时限单位：year/month/day/hour
	DurationValue int     `json:"duration_value"`                        // 成团时限数值
	Enabled       bool    `json:"enabled"`
	CreateTime    int64   `json:"create_time"`
}

// GroupBuy 拼团实例。套餐字段做快照，避免后续改套餐影响进行中的拼团。
type GroupBuy struct {
	Id             int     `json:"id"`
	GroupNo        string  `json:"group_no" gorm:"unique;type:varchar(64);index"`
	PackageId      int     `json:"package_id" gorm:"index"`
	PackageName    string  `json:"package_name" gorm:"type:varchar(191)"`
	InitiatorId    int     `json:"initiator_id" gorm:"index"`
	Status         string  `json:"status" gorm:"type:varchar(20);index"`
	RequiredCount  int     `json:"required_count"`
	PaidCount      int     `json:"paid_count"`
	TotalAmount    int64   `json:"total_amount"`
	TotalPrice     float64 `json:"total_price"`
	PerShareAmount int64   `json:"per_share_amount"`
	PerSharePrice  float64 `json:"per_share_price"`
	ExpireTime     int64   `json:"expire_time"`
	CreateTime     int64   `json:"create_time"`
	CompleteTime   int64   `json:"complete_time"`
}

// GroupBuyParticipant 参团记录。
type GroupBuyParticipant struct {
	Id                int     `json:"id"`
	GroupBuyId        int     `json:"group_buy_id" gorm:"index"`
	UserId            int     `json:"user_id" gorm:"index"`
	Username          string  `json:"username" gorm:"type:varchar(191)"`
	TradeNo           string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PayStatus         string  `json:"pay_status" gorm:"type:varchar(20);index"`
	PayMoney          float64 `json:"pay_money"`
	ReserveExpireTime int64   `json:"reserve_expire_time"`
	JoinTime          int64   `json:"join_time"`
	PayTime           int64   `json:"pay_time"`
}

// ===== 套餐 CRUD（管理员） =====

func GetGroupBuyPackages(onlyEnabled bool) ([]*GroupBuyPackage, error) {
	var packages []*GroupBuyPackage
	query := DB.Model(&GroupBuyPackage{})
	if onlyEnabled {
		query = query.Where("enabled = ?", true)
	}
	err := query.Order("id desc").Find(&packages).Error
	return packages, err
}

func GetGroupBuyPackageById(id int) (*GroupBuyPackage, error) {
	pkg := &GroupBuyPackage{}
	if err := DB.Where("id = ?", id).First(pkg).Error; err != nil {
		return nil, errors.New("拼团套餐不存在")
	}
	return pkg, nil
}

func (pkg *GroupBuyPackage) Insert() error {
	pkg.CreateTime = common.GetTimestamp()
	return DB.Create(pkg).Error
}

func (pkg *GroupBuyPackage) Update() error {
	return DB.Model(&GroupBuyPackage{}).Where("id = ?", pkg.Id).Updates(map[string]interface{}{
		"name":           pkg.Name,
		"description":    pkg.Description,
		"required_count": pkg.RequiredCount,
		"total_amount":   pkg.TotalAmount,
		"total_price":    pkg.TotalPrice,
		"duration_unit":  pkg.DurationUnit,
		"duration_value": pkg.DurationValue,
		"enabled":        pkg.Enabled,
	}).Error
}

func DeleteGroupBuyPackage(id int) error {
	return DB.Where("id = ?", id).Delete(&GroupBuyPackage{}).Error
}

// ValidateForSave 校验套餐字段。
func (pkg *GroupBuyPackage) ValidateForSave() error {
	if pkg.Name == "" {
		return errors.New("套餐名称不能为空")
	}
	if pkg.RequiredCount < 2 {
		return errors.New("成团人数至少为 2")
	}
	if pkg.TotalAmount <= 0 {
		return errors.New("总额度需大于 0")
	}
	if pkg.TotalAmount%int64(pkg.RequiredCount) != 0 {
		return errors.New("总额度需能被成团人数整除，以便成员均分")
	}
	if pkg.TotalPrice <= 0 {
		return errors.New("总价需大于 0")
	}
	if pkg.DurationValue <= 0 {
		return errors.New("成团时限需大于 0")
	}
	switch pkg.DurationUnit {
	case SubscriptionDurationYear, SubscriptionDurationMonth, SubscriptionDurationDay, SubscriptionDurationHour:
	default:
		return errors.New("成团时限单位无效")
	}
	return nil
}

// groupBuyExpireTime 按"单位+数值"计算成团截止时间（与订阅套餐口径一致）。
func groupBuyExpireTime(now int64, unit string, value int) int64 {
	start := time.Unix(now, 0)
	switch unit {
	case SubscriptionDurationYear:
		return start.AddDate(value, 0, 0).Unix()
	case SubscriptionDurationMonth:
		return start.AddDate(0, value, 0).Unix()
	case SubscriptionDurationDay:
		return start.Add(time.Duration(value) * 24 * time.Hour).Unix()
	default:
		return start.Add(time.Duration(value) * time.Hour).Unix()
	}
}

// ===== 拼团实例创建 / 参团 =====

// countActiveParticipantsTx 统计某拼团有效占位人数（已支付 + 未过期的待支付预占）。
func countActiveParticipantsTx(tx *gorm.DB, groupBuyId int, now int64) (int64, error) {
	var count int64
	err := tx.Model(&GroupBuyParticipant{}).
		Where("group_buy_id = ? AND (pay_status = ? OR (pay_status = ? AND reserve_expire_time > ?))",
			groupBuyId, GroupBuyParticipantPaid, GroupBuyParticipantPending, now).
		Count(&count).Error
	return count, err
}

// CreateGroupBuyOrder 发起拼团：原子创建拼团实例 + 发起人参团记录 + 充值订单（待支付）。
func CreateGroupBuyOrder(initiatorId int, username string, pkg *GroupBuyPackage, tradeNo, provider, paymentMethod string) (*GroupBuy, error) {
	now := common.GetTimestamp()
	perShareAmount := pkg.TotalAmount / int64(pkg.RequiredCount)
	perSharePrice := decimal.NewFromFloat(pkg.TotalPrice).
		Div(decimal.NewFromInt(int64(pkg.RequiredCount))).
		Round(2).InexactFloat64()
	groupBuy := &GroupBuy{
		GroupNo:        "GB" + common.GetRandomString(16),
		PackageId:      pkg.Id,
		PackageName:    pkg.Name,
		InitiatorId:    initiatorId,
		Status:         GroupBuyStatusPending,
		RequiredCount:  pkg.RequiredCount,
		PaidCount:      0,
		TotalAmount:    pkg.TotalAmount,
		TotalPrice:     pkg.TotalPrice,
		PerShareAmount: perShareAmount,
		PerSharePrice:  perSharePrice,
		ExpireTime:     groupBuyExpireTime(now, pkg.DurationUnit, pkg.DurationValue),
		CreateTime:     now,
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(groupBuy).Error; err != nil {
			return err
		}
		participant := &GroupBuyParticipant{
			GroupBuyId:        groupBuy.Id,
			UserId:            initiatorId,
			Username:          username,
			TradeNo:           tradeNo,
			PayStatus:         GroupBuyParticipantPending,
			PayMoney:          perSharePrice,
			ReserveExpireTime: now + groupBuyReserveTTLSeconds,
			JoinTime:          now,
		}
		if err := tx.Create(participant).Error; err != nil {
			return err
		}
		topUp := &TopUp{
			UserId:          initiatorId,
			Amount:          perShareAmount,
			Money:           perSharePrice,
			TradeNo:         tradeNo,
			PaymentMethod:   paymentMethod,
			PaymentProvider: provider,
			GroupBuyId:      groupBuy.Id,
			CreateTime:      now,
			Status:          common.TopUpStatusPending,
		}
		return tx.Create(topUp).Error
	})
	if err != nil {
		return nil, err
	}
	return groupBuy, nil
}

// JoinGroupBuyOrder 参团：校验名额后原子创建参团记录 + 充值订单（待支付）。
func JoinGroupBuyOrder(userId int, username, groupNo, tradeNo, provider, paymentMethod string) (*GroupBuy, error) {
	now := common.GetTimestamp()
	groupBuy := &GroupBuy{}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("group_no = ?", groupNo).First(groupBuy).Error; err != nil {
			return errors.New("拼团不存在")
		}
		if groupBuy.Status != GroupBuyStatusPending {
			return errors.New("该拼团已结束")
		}
		if now > groupBuy.ExpireTime {
			return errors.New("该拼团已过期")
		}
		// 同一用户不可重复占位（已支付或未过期的待支付）
		var existing int64
		if err := tx.Model(&GroupBuyParticipant{}).
			Where("group_buy_id = ? AND user_id = ? AND (pay_status = ? OR (pay_status = ? AND reserve_expire_time > ?))",
				groupBuy.Id, userId, GroupBuyParticipantPaid, GroupBuyParticipantPending, now).
			Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return errors.New("你已在该拼团中")
		}
		active, err := countActiveParticipantsTx(tx, groupBuy.Id, now)
		if err != nil {
			return err
		}
		if active >= int64(groupBuy.RequiredCount) {
			return errors.New("拼团人数已满")
		}
		participant := &GroupBuyParticipant{
			GroupBuyId:        groupBuy.Id,
			UserId:            userId,
			Username:          username,
			TradeNo:           tradeNo,
			PayStatus:         GroupBuyParticipantPending,
			PayMoney:          groupBuy.PerSharePrice,
			ReserveExpireTime: now + groupBuyReserveTTLSeconds,
			JoinTime:          now,
		}
		if err := tx.Create(participant).Error; err != nil {
			return err
		}
		topUp := &TopUp{
			UserId:          userId,
			Amount:          groupBuy.PerShareAmount,
			Money:           groupBuy.PerSharePrice,
			TradeNo:         tradeNo,
			PaymentMethod:   paymentMethod,
			PaymentProvider: provider,
			GroupBuyId:      groupBuy.Id,
			CreateTime:      now,
			Status:          common.TopUpStatusPending,
		}
		return tx.Create(topUp).Error
	})
	if err != nil {
		return nil, err
	}
	return groupBuy, nil
}

// ===== 结算（支付成功回调路由到此处） =====

// completedMember 成团后需要在事务外补充日志/返现的成员。
type completedMember struct {
	UserId  int
	TradeNo string
	TopUpId int
	Quota   int
}

// TrySettleGroupBuyOrder 若该订单属于拼团订单，则在此完成"标记参团已支付 + 满员则均分入账"，
// 并返回 handled=true 表示调用方无需再走普通加额度逻辑。非拼团订单返回 handled=false。
func TrySettleGroupBuyOrder(tradeNo, expectedProvider, callerIp string) (handled bool, err error) {
	topUp := GetTopUpByTradeNo(tradeNo)
	if topUp == nil || topUp.GroupBuyId == 0 {
		return false, nil
	}

	var completed []completedMember
	var groupCompleted bool

	err = DB.Transaction(func(tx *gorm.DB) error {
		locked := &TopUp{}
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("trade_no = ?", tradeNo).First(locked).Error; err != nil {
			return errors.New("充值订单不存在")
		}
		if expectedProvider != "" && locked.PaymentProvider != expectedProvider {
			return ErrPaymentMethodMismatch
		}
		if locked.Status == common.TopUpStatusSuccess {
			return nil // 幂等：已处理
		}
		if locked.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		locked.Status = common.TopUpStatusSuccess
		locked.CompleteTime = common.GetTimestamp()
		if err := tx.Save(locked).Error; err != nil {
			return err
		}

		participant := &GroupBuyParticipant{}
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("trade_no = ?", tradeNo).First(participant).Error; err != nil {
			return errors.New("参团记录不存在")
		}
		if participant.PayStatus != GroupBuyParticipantPaid {
			participant.PayStatus = GroupBuyParticipantPaid
			participant.PayTime = common.GetTimestamp()
			if err := tx.Save(participant).Error; err != nil {
				return err
			}
		}

		groupBuy := &GroupBuy{}
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", participant.GroupBuyId).First(groupBuy).Error; err != nil {
			return errors.New("拼团不存在")
		}
		if groupBuy.Status != GroupBuyStatusPending {
			return nil // 拼团已结束（成功/失败），仅保留该成员已支付状态
		}

		var paidCount int64
		if err := tx.Model(&GroupBuyParticipant{}).
			Where("group_buy_id = ? AND pay_status = ?", groupBuy.Id, GroupBuyParticipantPaid).
			Count(&paidCount).Error; err != nil {
			return err
		}
		groupBuy.PaidCount = int(paidCount)

		if paidCount < int64(groupBuy.RequiredCount) {
			return tx.Save(groupBuy).Error
		}

		// 满员：成团并均分入账
		groupBuy.Status = GroupBuyStatusSuccess
		groupBuy.CompleteTime = common.GetTimestamp()
		if err := tx.Save(groupBuy).Error; err != nil {
			return err
		}

		var members []GroupBuyParticipant
		if err := tx.Where("group_buy_id = ? AND pay_status = ?", groupBuy.Id, GroupBuyParticipantPaid).Find(&members).Error; err != nil {
			return err
		}
		quotaPerShare := int(decimal.NewFromInt(groupBuy.PerShareAmount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart())
		if quotaPerShare <= 0 {
			return errors.New("无效的拼团额度")
		}
		for _, m := range members {
			if err := tx.Model(&User{}).Where("id = ?", m.UserId).Update("quota", gorm.Expr("quota + ?", quotaPerShare)).Error; err != nil {
				return err
			}
			completed = append(completed, completedMember{UserId: m.UserId, TradeNo: m.TradeNo, Quota: quotaPerShare})
		}
		groupCompleted = true
		return nil
	})
	if err != nil {
		return true, err
	}

	// 事务外：同步缓存额度、记录日志、生成邀请返现
	if groupCompleted {
		for _, m := range completed {
			if cacheErr := cacheIncrUserQuota(m.UserId, int64(m.Quota)); cacheErr != nil {
				common.SysLog("failed to sync group-buy quota cache: " + cacheErr.Error())
			}
			RecordTopupLog(m.UserId, fmt.Sprintf("拼团成功，到账额度: %v", logger.LogQuota(m.Quota)), callerIp, "groupbuy", "groupbuy")
			if topUpRec := GetTopUpByTradeNo(m.TradeNo); topUpRec != nil {
				CreateInviterRebate(m.UserId, topUpRec.Id, m.TradeNo, m.Quota)
			}
		}
	}
	return true, nil
}

// ===== 失败 / 过期 =====

// GetExpiredPendingGroupBuyIds 返回已过期但仍处于 pending 的拼团 id。
func GetExpiredPendingGroupBuyIds(now int64, limit int) ([]int, error) {
	var ids []int
	err := DB.Model(&GroupBuy{}).
		Where("status = ? AND expire_time < ?", GroupBuyStatusPending, now).
		Order("id asc").Limit(limit).Pluck("id", &ids).Error
	return ids, err
}

// MarkGroupBuyFailed 将拼团置为失败（幂等），返回需退款的已支付参团记录。
func MarkGroupBuyFailed(groupBuyId int) ([]GroupBuyParticipant, error) {
	var paidParticipants []GroupBuyParticipant
	err := DB.Transaction(func(tx *gorm.DB) error {
		groupBuy := &GroupBuy{}
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", groupBuyId).First(groupBuy).Error; err != nil {
			return err
		}
		if groupBuy.Status != GroupBuyStatusPending {
			return nil // 幂等
		}
		groupBuy.Status = GroupBuyStatusFailed
		groupBuy.CompleteTime = common.GetTimestamp()
		if err := tx.Save(groupBuy).Error; err != nil {
			return err
		}
		return tx.Where("group_buy_id = ? AND pay_status = ?", groupBuyId, GroupBuyParticipantPaid).Find(&paidParticipants).Error
	})
	return paidParticipants, err
}

// MarkParticipantRefundResult 标记参团记录的退款结果（refunded / refund_pending），幂等。
func MarkParticipantRefundResult(participantId int, status string) error {
	return DB.Model(&GroupBuyParticipant{}).
		Where("id = ? AND pay_status = ?", participantId, GroupBuyParticipantPaid).
		Update("pay_status", status).Error
}

// ===== 查询 =====

// GetGroupBuyByNo 返回拼团实例及其参团记录。
func GetGroupBuyByNo(groupNo string) (*GroupBuy, []GroupBuyParticipant, error) {
	groupBuy := &GroupBuy{}
	if err := DB.Where("group_no = ?", groupNo).First(groupBuy).Error; err != nil {
		return nil, nil, errors.New("拼团不存在")
	}
	var participants []GroupBuyParticipant
	if err := DB.Where("group_buy_id = ?", groupBuy.Id).Order("id asc").Find(&participants).Error; err != nil {
		return nil, nil, err
	}
	return groupBuy, participants, nil
}

// GetUserGroupBuys 返回某用户参与过的拼团（按参团记录倒序）。
func GetUserGroupBuys(userId int, pageInfo *common.PageInfo) ([]*GroupBuy, int64, error) {
	var groupBuyIds []int
	if err := DB.Model(&GroupBuyParticipant{}).
		Where("user_id = ?", userId).
		Order("id desc").
		Pluck("group_buy_id", &groupBuyIds).Error; err != nil {
		return nil, 0, err
	}
	// 去重并保持顺序
	seen := make(map[int]bool)
	uniqueIds := make([]int, 0, len(groupBuyIds))
	for _, id := range groupBuyIds {
		if !seen[id] {
			seen[id] = true
			uniqueIds = append(uniqueIds, id)
		}
	}
	total := int64(len(uniqueIds))
	start := pageInfo.GetStartIdx()
	end := start + pageInfo.GetPageSize()
	if start > len(uniqueIds) {
		start = len(uniqueIds)
	}
	if end > len(uniqueIds) {
		end = len(uniqueIds)
	}
	pageIds := uniqueIds[start:end]
	if len(pageIds) == 0 {
		return []*GroupBuy{}, total, nil
	}
	var groupBuys []*GroupBuy
	if err := DB.Where("id IN ?", pageIds).Order("id desc").Find(&groupBuys).Error; err != nil {
		return nil, 0, err
	}
	return groupBuys, total, nil
}

// GetAllGroupBuys 管理员分页查询全部拼团，可按状态过滤。
func GetAllGroupBuys(status string, pageInfo *common.PageInfo) ([]*GroupBuy, int64, error) {
	query := DB.Model(&GroupBuy{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var groupBuys []*GroupBuy
	err := query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&groupBuys).Error
	return groupBuys, total, err
}

// GetGroupBuyById 返回拼团及参团记录（管理员）。
func GetGroupBuyById(id int) (*GroupBuy, []GroupBuyParticipant, error) {
	groupBuy := &GroupBuy{}
	if err := DB.Where("id = ?", id).First(groupBuy).Error; err != nil {
		return nil, nil, errors.New("拼团不存在")
	}
	var participants []GroupBuyParticipant
	if err := DB.Where("group_buy_id = ?", groupBuy.Id).Order("id asc").Find(&participants).Error; err != nil {
		return nil, nil, err
	}
	return groupBuy, participants, nil
}

// GetRefundPendingParticipants 返回待管理员手动退款的参团记录（管理员）。
func GetRefundPendingParticipants(pageInfo *common.PageInfo) ([]*GroupBuyParticipant, int64, error) {
	query := DB.Model(&GroupBuyParticipant{}).Where("pay_status = ?", GroupBuyParticipantRefundPending)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var participants []*GroupBuyParticipant
	err := query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&participants).Error
	return participants, total, err
}

// MarkParticipantRefunded 管理员手动标记某参团记录已退款。
func MarkParticipantRefunded(participantId int) error {
	return DB.Model(&GroupBuyParticipant{}).
		Where("id = ?", participantId).
		Update("pay_status", GroupBuyParticipantRefunded).Error
}
