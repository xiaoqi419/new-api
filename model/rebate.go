package model

import (
	"errors"
	"fmt"
	"math"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	RebateStatusPending   = "pending"
	RebateStatusPaid      = "paid"
	RebateStatusCancelled = "cancelled"
)

// RebateRecord 记录一次好友充值产生的返现，默认待管理员手动发放。
type RebateRecord struct {
	Id          int     `json:"id"`
	InviterId   int     `json:"inviter_id" gorm:"index"` // 邀请人（返现受益人）
	InviteeId   int     `json:"invitee_id" gorm:"index"` // 好友（充值人）
	TopUpId     int     `json:"topup_id" gorm:"index"`   // 关联充值订单
	TradeNo     string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	TopUpQuota  int     `json:"topup_quota"`  // 好友本次充值额度
	RebateRatio float64 `json:"rebate_ratio"` // 生成时使用的返现比例
	RebateQuota int     `json:"rebate_quota"` // 应返额度
	Status      string  `json:"status" gorm:"type:varchar(20);index"`
	CreateTime  int64   `json:"create_time"`
	PayTime     int64   `json:"pay_time"`
	Remark      string  `json:"remark" gorm:"type:varchar(255)"`
}

// CreateInviterRebate 在好友充值成功后生成一条待返现记录。
// 通过 trade_no 唯一索引保证幂等，重复回调不会重复生成。
// 任何异常仅记录日志，不影响主充值流程。
func CreateInviterRebate(inviteeId int, topUpId int, tradeNo string, topUpQuota int) {
	if !common.RebateEnabled || tradeNo == "" || topUpQuota <= 0 {
		return
	}
	invitee, err := GetUserById(inviteeId, false)
	if err != nil || invitee == nil || invitee.InviterId == 0 {
		return
	}
	inviter, err := GetUserById(invitee.InviterId, false)
	if err != nil || inviter == nil {
		return
	}
	ratio := common.RebateRatio
	if inviter.RebateRatio != nil {
		ratio = *inviter.RebateRatio
	}
	if ratio <= 0 || ratio > 1 || math.IsNaN(ratio) || math.IsInf(ratio, 0) {
		return
	}
	// Truncate before the centralized conversion to preserve the historical
	// IntPart behavior while still saturating out-of-range values safely.
	rebateDecimal := decimal.NewFromInt(int64(topUpQuota)).
		Mul(decimal.NewFromFloat(ratio)).Truncate(0)
	rebateQuota, clamp := common.QuotaFromDecimalChecked(rebateDecimal)
	if clamp != nil || rebateQuota <= 0 {
		return
	}
	record := &RebateRecord{
		InviterId:   inviter.Id,
		InviteeId:   inviteeId,
		TopUpId:     topUpId,
		TradeNo:     tradeNo,
		TopUpQuota:  topUpQuota,
		RebateRatio: ratio,
		RebateQuota: rebateQuota,
		Status:      RebateStatusPending,
		CreateTime:  common.GetTimestamp(),
	}
	// trade_no 冲突即代表已生成，跳过即可（幂等）
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(record).Error; err != nil {
		common.SysError("failed to create rebate record: " + err.Error())
	}
}

// GetRebateRecords 管理员分页查询返现记录，可按状态过滤。
func GetRebateRecords(status string, pageInfo *common.PageInfo) (records []*RebateRecord, total int64, err error) {
	query := DB.Model(&RebateRecord{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if err = query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&records).Error
	if err != nil {
		return nil, 0, err
	}
	return records, total, nil
}

// GetRebateRecordsByInviter 查询某邀请人的返现记录（个人中心使用）。
func GetRebateRecordsByInviter(inviterId int, pageInfo *common.PageInfo) (records []*RebateRecord, total int64, err error) {
	query := DB.Model(&RebateRecord{}).Where("inviter_id = ?", inviterId)
	if err = query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&records).Error
	if err != nil {
		return nil, 0, err
	}
	return records, total, nil
}

// SumRebateQuotaByInviter 统计某邀请人某状态下的返现总额度。
func SumRebateQuotaByInviter(inviterId int, status string) (int64, error) {
	var sum struct {
		Total int64
	}
	err := DB.Model(&RebateRecord{}).
		Select("COALESCE(SUM(rebate_quota), 0) as total").
		Where("inviter_id = ? AND status = ?", inviterId, status).
		Scan(&sum).Error
	return sum.Total, err
}

// PayRebateRecord 管理员发放一条待返现记录，额度计入邀请人余额。
func PayRebateRecord(id int, operatorIp string) error {
	var inviterId, rebateQuota int
	err := DB.Transaction(func(tx *gorm.DB) error {
		record := &RebateRecord{}
		if err := lockForUpdate(tx).Where("id = ?", id).First(record).Error; err != nil {
			return errors.New("返现记录不存在")
		}
		if record.Status == RebateStatusPaid {
			return nil // 幂等：已发放
		}
		if record.Status != RebateStatusPending {
			return errors.New("返现记录状态不可发放")
		}
		record.Status = RebateStatusPaid
		record.PayTime = common.GetTimestamp()
		if err := tx.Save(record).Error; err != nil {
			return err
		}
		if err := tx.Model(&User{}).Where("id = ?", record.InviterId).Update("quota", gorm.Expr("quota + ?", record.RebateQuota)).Error; err != nil {
			return err
		}
		inviterId = record.InviterId
		rebateQuota = record.RebateQuota
		return nil
	})
	if err != nil {
		return err
	}
	if rebateQuota > 0 {
		// 同步缓存中的用户额度
		if cacheErr := cacheIncrUserQuota(inviterId, int64(rebateQuota)); cacheErr != nil {
			common.SysLog("failed to sync rebate quota cache: " + cacheErr.Error())
		}
		RecordLog(inviterId, LogTypeSystem, fmt.Sprintf("邀请返现发放 %s", logger.LogQuota(rebateQuota)))
	}
	return nil
}

// CancelRebateRecord 管理员作废一条待返现记录。
func CancelRebateRecord(id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		record := &RebateRecord{}
		if err := lockForUpdate(tx).Where("id = ?", id).First(record).Error; err != nil {
			return errors.New("返现记录不存在")
		}
		if record.Status == RebateStatusCancelled {
			return nil
		}
		if record.Status != RebateStatusPending {
			return errors.New("仅待发放的记录可作废")
		}
		record.Status = RebateStatusCancelled
		return tx.Save(record).Error
	})
}

// GetInviters 管理员分页查询有邀请记录的用户及其专属返现比例。
func GetInviters(pageInfo *common.PageInfo) (users []*User, total int64, err error) {
	query := DB.Model(&User{}).Where("aff_count > 0")
	if err = query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = query.Select("id", "username", "display_name", "aff_count", "rebate_ratio").
		Order("aff_count desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&users).Error
	if err != nil {
		return nil, 0, err
	}
	return users, total, nil
}

// InviteRankingRow 拉新排行榜单行（管理员视角）。
type InviteRankingRow struct {
	UserId        int    `json:"user_id"`
	Username      string `json:"username"`
	DisplayName   string `json:"display_name"`
	AffCount      int    `json:"aff_count"`
	AffQuota      int    `json:"aff_quota"`
	RebatePending int64  `json:"rebate_pending"`
	RebatePaid    int64  `json:"rebate_paid"`
	RebateTotal   int64  `json:"rebate_total"`
}

// GetInviteRanking 管理员分页查询拉新排行：按邀请人数倒序，并附带各邀请人的返现汇总。
func GetInviteRanking(pageInfo *common.PageInfo) ([]*InviteRankingRow, int64, error) {
	var total int64
	if err := DB.Model(&User{}).Where("aff_count > 0").Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var users []User
	if err := DB.Model(&User{}).Where("aff_count > 0").
		Select("id", "username", "display_name", "aff_count", "aff_quota").
		Order("aff_count desc").
		Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&users).Error; err != nil {
		return nil, 0, err
	}
	if len(users) == 0 {
		return []*InviteRankingRow{}, total, nil
	}

	ids := make([]int, 0, len(users))
	for _, u := range users {
		ids = append(ids, u.Id)
	}

	type rebateSumRow struct {
		InviterId int    `gorm:"column:inviter_id"`
		Status    string `gorm:"column:status"`
		Total     int64  `gorm:"column:total"`
	}
	var sums []rebateSumRow
	if err := DB.Model(&RebateRecord{}).
		Select("inviter_id, status, COALESCE(SUM(rebate_quota), 0) as total").
		Where("inviter_id IN ?", ids).
		Group("inviter_id, status").Scan(&sums).Error; err != nil {
		return nil, 0, err
	}
	pendingByUser := make(map[int]int64)
	paidByUser := make(map[int]int64)
	for _, s := range sums {
		switch s.Status {
		case RebateStatusPending:
			pendingByUser[s.InviterId] = s.Total
		case RebateStatusPaid:
			paidByUser[s.InviterId] = s.Total
		}
	}

	rows := make([]*InviteRankingRow, 0, len(users))
	for _, u := range users {
		pending := pendingByUser[u.Id]
		paid := paidByUser[u.Id]
		rows = append(rows, &InviteRankingRow{
			UserId:        u.Id,
			Username:      u.Username,
			DisplayName:   u.DisplayName,
			AffCount:      u.AffCount,
			AffQuota:      u.AffQuota,
			RebatePending: pending,
			RebatePaid:    paid,
			RebateTotal:   pending + paid,
		})
	}
	return rows, total, nil
}

// SetUserRebateRatio 设置某用户的专属返现比例，ratio 为 nil 时回退全局默认。
func SetUserRebateRatio(userId int, ratio *float64) error {
	if userId <= 0 {
		return errors.New("用户不存在")
	}
	if ratio != nil && (*ratio < 0 || *ratio > 1) {
		return errors.New("返现比例需在 0 到 1 之间")
	}
	return DB.Model(&User{}).Where("id = ?", userId).Update("rebate_ratio", ratio).Error
}
