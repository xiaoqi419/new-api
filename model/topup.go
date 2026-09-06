package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type TopUp struct {
	Id              int     `json:"id"`
	UserId          int     `json:"user_id" gorm:"index"`
	Amount          int64   `json:"amount"`
	Money           float64 `json:"money"`
	TradeNo         string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PaymentMethod   string  `json:"payment_method" gorm:"type:varchar(50)"`
	PaymentProvider string  `json:"payment_provider" gorm:"type:varchar(50);default:''"`
	GroupBuyId      int     `json:"group_buy_id" gorm:"index;default:0"`
	AgentPrepayId   int     `json:"agent_prepay_id" gorm:"index;default:0"` // >0 表示这是一笔代理预充值订单，到账目标为该代理钱包(而非用户额度)
	CreateTime      int64   `json:"create_time"`
	CompleteTime    int64   `json:"complete_time"`
	Status          string  `json:"status"`
	HeldQuota       int     `json:"held_quota" gorm:"type:bigint;default:0"` // held 状态时记录的待补发到账额度（代理钱包补足后补发）
}

const (
	PaymentMethodStripe       = "stripe"
	PaymentMethodCreem        = "creem"
	PaymentMethodWaffo        = "waffo"
	PaymentMethodWaffoPancake = "waffo_pancake"
	PaymentMethodBalance      = "balance"
	PaymentMethodWechatPay    = "wechatpay"
	PaymentMethodAlipay       = "alipay_direct"
)

const (
	PaymentProviderEpay         = "epay"
	PaymentProviderStripe       = "stripe"
	PaymentProviderCreem        = "creem"
	PaymentProviderWaffo        = "waffo"
	PaymentProviderWaffoPancake = "waffo_pancake"
	PaymentProviderBalance      = "balance"
	PaymentProviderWechatPay    = "wechatpay"
	PaymentProviderAlipay       = "alipay"
)

var (
	ErrPaymentMethodMismatch    = errors.New("payment method mismatch")
	ErrTopUpNotFound            = errors.New("topup not found")
	ErrTopUpStatusInvalid       = errors.New("topup status invalid")
	ErrInvalidTopUpQuota        = errors.New("invalid top-up quota")
	ErrTopUpQuotaLimitExceeded  = errors.New("top-up quota limit exceeded")
	ErrWalletQuotaLimitExceeded = errors.New("wallet quota limit exceeded")
)

// OnTopUpSuccess 充值首次成功时的回调钩子（拼团为成员付款成功时）。
// 由 service 层在启动时注入 service.NotifyTopUpSuccess，以避免 model -> service 循环依赖。
// quotaAdded 为本次到账额度；拼团成员付款时额度尚未发放，传 0。
var OnTopUpSuccess func(topUp *TopUp, quotaAdded int)

// SumSuccessTopUp 统计自 since（含）以来已成功充值的实付金额合计与笔数，
// 按完成时间过滤，供充值通知展示今日/本月累计。三种数据库通用。
func SumSuccessTopUp(since int64) (money float64, count int64, err error) {
	var result struct {
		Money float64
		Count int64
	}
	err = DB.Model(&TopUp{}).
		Where("status = ? AND complete_time >= ?", common.TopUpStatusSuccess, since).
		Select("COALESCE(SUM(money), 0) AS money, COUNT(*) AS count").
		Scan(&result).Error
	return result.Money, result.Count, err
}

func (topUp *TopUp) Insert() error {
	var err error
	err = DB.Create(topUp).Error
	return err
}

func topUpQuotaMaxCurrent(creditedQuota int) (int, error) {
	if creditedQuota <= 0 || creditedQuota > common.MaxWalletQuota {
		return 0, ErrInvalidTopUpQuota
	}
	return common.MaxWalletQuota - creditedQuota, nil
}

// ValidateTopUpQuotaCapacity performs the user-facing pre-payment check. The
// settlement path repeats the same invariant with an atomic conditional
// update, because the wallet balance can change after checkout creation.
func ValidateTopUpQuotaCapacity(userId int, creditedQuota int) error {
	maxCurrentQuota, err := topUpQuotaMaxCurrent(creditedQuota)
	if err != nil {
		return err
	}

	var user User
	if err := DB.Select("quota").Where("id = ?", userId).First(&user).Error; err != nil {
		return err
	}
	if user.Quota > maxCurrentQuota {
		return ErrTopUpQuotaLimitExceeded
	}
	return nil
}

// creditTopUpQuota atomically enforces the wallet ceiling while adding quota.
// Keeping the predicate and increment in one UPDATE prevents two
// concurrent callbacks from both passing a separate read/check.
func creditTopUpQuota(tx *gorm.DB, userId int, creditedQuota int, updates map[string]interface{}) error {
	maxCurrentQuota, err := topUpQuotaMaxCurrent(creditedQuota)
	if err != nil {
		return err
	}

	updateFields := make(map[string]interface{}, len(updates)+1)
	for key, value := range updates {
		updateFields[key] = value
	}
	updateFields["quota"] = gorm.Expr("quota + ?", creditedQuota)

	result := tx.Model(&User{}).
		Where("id = ? AND quota <= ?", userId, maxCurrentQuota).
		Updates(updateFields)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 1 {
		return nil
	}

	var count int64
	if err := tx.Model(&User{}).Where("id = ?", userId).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return gorm.ErrRecordNotFound
	}
	return ErrTopUpQuotaLimitExceeded
}

func (topUp *TopUp) Update() error {
	var err error
	err = DB.Save(topUp).Error
	return err
}

func GetTopUpById(id int) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("id = ?", id).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

// GetSuccessTopUpsByUser 返回该用户所有已支付成功的充值订单，按完成时间倒序。
func GetSuccessTopUpsByUser(userId int) ([]*TopUp, error) {
	var topUps []*TopUp
	err := DB.Where("user_id = ? AND status = ?", userId, common.TopUpStatusSuccess).
		Order("id desc").Find(&topUps).Error
	return topUps, err
}

func GetTopUpByTradeNo(tradeNo string) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("trade_no = ?", tradeNo).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func UpdatePendingTopUpStatus(tradeNo string, expectedPaymentProvider string, targetStatus string) error {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		if err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return ErrTopUpNotFound
		}
		if expectedPaymentProvider != "" && topUp.PaymentProvider != expectedPaymentProvider {
			return ErrPaymentMethodMismatch
		}
		if topUp.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}

		topUp.Status = targetStatus
		return tx.Save(topUp).Error
	})
}

// RechargeEpay 原子完成易支付订单：订单行锁、状态校验、成功更新与用户额度增加
// 在同一个事务内完成，因此同一订单的并发/重复回调（包括多实例部署下）最多充值一次。
// alreadyDone=true 表示订单此前已完成，本次为幂等重复回调。
// 进程内的 LockOrder 只是优化，正确性由本函数的数据库行锁保证。
func RechargeEpay(tradeNo string, actualPaymentMethod string, callerIp string) (alreadyDone bool, err error) {
	if tradeNo == "" {
		return false, errors.New("未提供支付单号")
	}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	var quotaToAdd int
	topUp := &TopUp{}
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return ErrTopUpNotFound
		}
		if topUp.PaymentProvider != PaymentProviderEpay {
			return ErrPaymentMethodMismatch
		}
		if topUp.Status == common.TopUpStatusSuccess {
			alreadyDone = true
			return nil
		}
		if topUp.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}
		if actualPaymentMethod != "" && topUp.PaymentMethod != actualPaymentMethod {
			topUp.PaymentMethod = actualPaymentMethod
		}
		var quotaErr error
		quotaToAdd, quotaErr = common.WalletQuotaFromDecimalStrict(
			decimal.NewFromInt(topUp.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)),
		)
		if quotaErr != nil || quotaToAdd <= 0 {
			return ErrInvalidTopUpQuota
		}
		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}
		return creditTopUpQuota(tx, topUp.UserId, quotaToAdd, nil)
	})
	if err != nil {
		if !errors.Is(err, ErrTopUpNotFound) && !errors.Is(err, ErrPaymentMethodMismatch) && !errors.Is(err, ErrTopUpStatusInvalid) {
			common.SysError("epay topup failed: " + err.Error())
		}
		return false, err
	}
	if alreadyDone {
		return true, nil
	}
	syncCreditUserQuotaCache(topUp.UserId, quotaToAdd, "epay topup")
	if current, readErr := GetUserQuota(topUp.UserId, true); readErr == nil {
		ObserveQuotaReminderBalance(topUp.UserId, QuotaReminderBalanceWallet, 0, int64(current))
	}

	common.SysLog(fmt.Sprintf("易支付充值成功 trade_no=%s user_id=%d quota_to_add=%d money=%.2f", topUp.TradeNo, topUp.UserId, quotaToAdd, topUp.Money))
	RecordTopupLog(topUp.UserId, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%f", logger.LogQuota(quotaToAdd), topUp.Money), callerIp, topUp.PaymentMethod, PaymentProviderEpay)
	return false, nil
}

func Recharge(referenceId string, customerId string, callerIp string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	if handled, gerr := TrySettleGroupBuyOrder(referenceId, PaymentProviderStripe, callerIp); handled {
		return gerr
	}

	var quotaToAdd int
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	var credited bool
	err = DB.Transaction(func(tx *gorm.DB) error {
		err := lockForUpdate(tx).Where(refCol+" = ?", referenceId).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderStripe {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		// 记录 stripe customer（不含额度，额度由结算统一处理）
		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("stripe_customer", customerId).Error; err != nil {
			return err
		}

		var quotaErr error
		quotaToAdd, quotaErr = common.WalletQuotaFromDecimalStrict(
			decimal.NewFromFloat(topUp.Money).
				Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Truncate(0),
		)
		if quotaErr != nil {
			return errors.New("无效的充值额度")
		}
		var e error
		credited, e = CompletePaidTopupTx(tx, topUp, quotaToAdd)
		return e
	})

	if err != nil {
		common.SysError("topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if !credited {
		return nil // 代理钱包不足，已挂单，待代理补足后自动补发
	}

	syncCreditUserQuotaCache(topUp.UserId, quotaToAdd, "stripe topup")
	RecordTopupLog(topUp.UserId, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%d", logger.FormatQuota(quotaToAdd), topUp.Amount), callerIp, topUp.PaymentMethod, PaymentMethodStripe)
	CreateInviterRebate(topUp.UserId, topUp.Id, topUp.TradeNo, quotaToAdd)
	GrantTopupLotteryCards(topUp.UserId, quotaToAdd)
	if OnTopUpSuccess != nil {
		OnTopUpSuccess(topUp, quotaToAdd)
	}

	return nil
}

// topUpQueryWindowSeconds 限制充值记录查询的时间窗口（秒）。
const topUpQueryWindowSeconds int64 = 30 * 24 * 60 * 60

// topUpQueryCutoff 返回允许查询的最早 create_time（秒级 Unix 时间戳）。
func topUpQueryCutoff() int64 {
	return common.GetTimestamp() - topUpQueryWindowSeconds
}

func GetUserTopUps(userId int, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	// Start transaction
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	cutoff := topUpQueryCutoff()

	// Get total count within transaction
	err = tx.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userId, cutoff).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Get paginated topups within same transaction
	err = tx.Where("user_id = ? AND create_time >= ?", userId, cutoff).Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Commit transaction
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// GetAllTopUpsByUser returns an administrator's complete top-up history for one user.
// Unlike the self-service query, administrator history is not restricted to the
// recent top-up window.
func GetAllTopUpsByUser(userID int, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{}).Where("user_id = ?", userID)
	if err = query.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// GetAllTopUps 获取全平台的充值记录（管理员使用，不限制时间窗口）
func GetAllTopUps(pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err = tx.Model(&TopUp{}).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// searchTopUpCountHardLimit 搜索充值记录时 COUNT 的安全上限，
// 防止对超大表执行无界 COUNT 触发 DoS。
const searchTopUpCountHardLimit = 10000

// SearchUserTopUps 按订单号搜索某用户的充值记录
func SearchUserTopUps(userId int, keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userId, topUpQueryCutoff())
	if keyword != "" {
		pattern, perr := sanitizeLikePattern(keyword)
		if perr != nil {
			tx.Rollback()
			return nil, 0, perr
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
	}

	if err = query.Limit(searchTopUpCountHardLimit).Count(&total).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to count search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// SearchAllTopUps 按订单号搜索全平台充值记录（管理员使用，不限制时间窗口）
func SearchAllTopUps(keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{})
	if keyword != "" {
		pattern, perr := sanitizeLikePattern(keyword)
		if perr != nil {
			tx.Rollback()
			return nil, 0, perr
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
	}

	if err = query.Limit(searchTopUpCountHardLimit).Count(&total).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to count search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// ManualCompleteTopUp 管理员手动完成订单并给用户充值
func ManualCompleteTopUp(tradeNo string, callerIp string) error {
	if tradeNo == "" {
		return errors.New("未提供订单号")
	}

	if handled, gerr := TrySettleGroupBuyOrder(tradeNo, "", callerIp); handled {
		return gerr
	}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	var userId int
	var topUpId int
	var quotaToAdd int
	var payMoney float64
	var paymentMethod string
	var credited bool
	var completedTopUp *TopUp

	err := DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		// 行级锁，避免并发补单
		if err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}

		// 幂等处理：已成功或已挂单直接返回
		if topUp.Status == common.TopUpStatusSuccess || topUp.Status == common.TopUpStatusHeld {
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("订单状态不是待支付，无法补单")
		}

		// 计算应充值额度：
		// - Stripe 订单：Money 代表经分组倍率换算后的美元数量，直接 * QuotaPerUnit
		// - 其他订单（如易支付）：Amount 为美元数量，* QuotaPerUnit
		if topUp.PaymentProvider == PaymentProviderStripe {
			dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
			var quotaErr error
			quotaToAdd, quotaErr = common.WalletQuotaFromDecimalStrict(decimal.NewFromFloat(topUp.Money).Mul(dQuotaPerUnit).Truncate(0))
			if quotaErr != nil {
				return errors.New("无效的充值额度")
			}
		} else {
			dAmount := decimal.NewFromInt(topUp.Amount)
			dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
			var quotaErr error
			quotaToAdd, quotaErr = common.WalletQuotaFromDecimalStrict(dAmount.Mul(dQuotaPerUnit).Truncate(0))
			if quotaErr != nil {
				return errors.New("无效的充值额度")
			}
		}
		if quotaToAdd <= 0 {
			return ErrInvalidTopUpQuota
		}

		userId = topUp.UserId
		topUpId = topUp.Id
		payMoney = topUp.Money
		paymentMethod = topUp.PaymentMethod
		completedTopUp = topUp

		// 到账/挂单（代理用户按 cost_ratio 结算，钱包不足则挂单）
		var e error
		credited, e = CompletePaidTopupTx(tx, topUp, quotaToAdd)
		return e
	})

	if err != nil {
		return err
	}
	if !credited {
		return nil // 幂等命中或代理挂单，不重复发放
	}

	// 事务外记录日志，避免阻塞
	syncCreditUserQuotaCache(userId, quotaToAdd, "manual topup")
	RecordTopupLog(userId, fmt.Sprintf("管理员补单成功，充值金额: %v，支付金额：%f", logger.FormatQuota(quotaToAdd), payMoney), callerIp, paymentMethod, "admin")
	CreateInviterRebate(userId, topUpId, tradeNo, quotaToAdd)
	GrantTopupLotteryCards(userId, quotaToAdd)
	if quotaToAdd > 0 && completedTopUp != nil && OnTopUpSuccess != nil {
		OnTopUpSuccess(completedTopUp, quotaToAdd)
	}
	return nil
}
func RechargeCreem(referenceId string, customerEmail string, customerName string, callerIp string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	if handled, gerr := TrySettleGroupBuyOrder(referenceId, PaymentProviderCreem, callerIp); handled {
		return gerr
	}

	var quota int
	var credited bool
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := lockForUpdate(tx).Where(refCol+" = ?", referenceId).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderCreem {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		// Creem 直接使用 Amount 作为充值额度（整数），仍需经过 quota 饱和检查。
		var quotaErr error
		quota, quotaErr = common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(topUp.Amount))
		if quotaErr != nil || quota <= 0 {
			return errors.New("无效的充值额度")
		}

		// 如果有客户邮箱且用户邮箱为空，则更新为支付时使用的邮箱（不含额度）
		if customerEmail != "" {
			var user User
			if err := tx.Where("id = ?", topUp.UserId).First(&user).Error; err != nil {
				return err
			}
			if user.Email == "" {
				if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("email", customerEmail).Error; err != nil {
					return err
				}
			}
		}

		var e error
		credited, e = CompletePaidTopupTx(tx, topUp, quota)
		return e
	})

	if err != nil {
		common.SysError("creem topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if !credited {
		return nil // 代理钱包不足，已挂单，待代理补足后自动补发
	}
	syncCreditUserQuotaCache(topUp.UserId, quota, "creem topup")

	RecordTopupLog(topUp.UserId, fmt.Sprintf("使用Creem充值成功，充值额度: %v，支付金额：%.2f", quota, topUp.Money), callerIp, topUp.PaymentMethod, PaymentMethodCreem)
	CreateInviterRebate(topUp.UserId, topUp.Id, topUp.TradeNo, quota)
	GrantTopupLotteryCards(topUp.UserId, quota)
	if OnTopUpSuccess != nil {
		OnTopUpSuccess(topUp, quota)
	}

	return nil
}

func RechargeWaffo(tradeNo string, callerIp string) (err error) {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	if handled, gerr := TrySettleGroupBuyOrder(tradeNo, PaymentProviderWaffo, callerIp); handled {
		return gerr
	}

	var quotaToAdd int
	var credited bool
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderWaffo {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status == common.TopUpStatusSuccess || topUp.Status == common.TopUpStatusHeld {
			return nil // 幂等：已成功或已挂单
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		dAmount := decimal.NewFromInt(topUp.Amount)
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		var quotaErr error
		quotaToAdd, quotaErr = common.WalletQuotaFromDecimalStrict(dAmount.Mul(dQuotaPerUnit).Truncate(0))
		if quotaErr != nil {
			return errors.New("无效的充值额度")
		}
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		var e error
		credited, e = CompletePaidTopupTx(tx, topUp, quotaToAdd)
		return e
	})

	if err != nil {
		common.SysError("waffo topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if credited && quotaToAdd > 0 {
		syncCreditUserQuotaCache(topUp.UserId, quotaToAdd, "waffo topup")
		RecordTopupLog(topUp.UserId, fmt.Sprintf("Waffo充值成功，充值额度: %v，支付金额: %.2f", logger.FormatQuota(quotaToAdd), topUp.Money), callerIp, topUp.PaymentMethod, PaymentMethodWaffo)
		CreateInviterRebate(topUp.UserId, topUp.Id, topUp.TradeNo, quotaToAdd)
		GrantTopupLotteryCards(topUp.UserId, quotaToAdd)
		if OnTopUpSuccess != nil {
			OnTopUpSuccess(topUp, quotaToAdd)
		}
	}

	return nil
}

// RechargeOfficialOrder 完成微信/支付宝官方直连订单并给用户加额度（幂等）。
// 充值额度按 Amount * QuotaPerUnit 计算，与易支付保持一致，确保管理员补单口径相同。
func RechargeOfficialOrder(tradeNo string, expectedProvider string, logSource string, callerIp string) (err error) {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	if handled, gerr := TrySettleGroupBuyOrder(tradeNo, expectedProvider, callerIp); handled {
		return gerr
	}

	var quotaToAdd int
	var paymentMethod string
	var credited bool
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != expectedProvider {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status == common.TopUpStatusSuccess || topUp.Status == common.TopUpStatusHeld {
			return nil // 幂等：已成功或已挂单
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		dAmount := decimal.NewFromInt(topUp.Amount)
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		var quotaErr error
		quotaToAdd, quotaErr = common.WalletQuotaFromDecimalStrict(dAmount.Mul(dQuotaPerUnit).Truncate(0))
		if quotaErr != nil {
			return errors.New("无效的充值额度")
		}
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		paymentMethod = topUp.PaymentMethod
		var e error
		credited, e = CompletePaidTopupTx(tx, topUp, quotaToAdd)
		return e
	})

	if err != nil {
		common.SysError(logSource + " topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	if credited && quotaToAdd > 0 {
		syncCreditUserQuotaCache(topUp.UserId, quotaToAdd, logSource+" topup")
		RecordTopupLog(topUp.UserId, fmt.Sprintf("%s充值成功，充值额度: %v，支付金额: %.2f", logSource, logger.FormatQuota(quotaToAdd), topUp.Money), callerIp, paymentMethod, logSource)
		CreateInviterRebate(topUp.UserId, topUp.Id, topUp.TradeNo, quotaToAdd)
		GrantTopupLotteryCards(topUp.UserId, quotaToAdd)
		if OnTopUpSuccess != nil {
			OnTopUpSuccess(topUp, quotaToAdd)
		}
	}

	return nil
}

func RechargeWaffoPancake(tradeNo string) (err error) {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	if handled, gerr := TrySettleGroupBuyOrder(tradeNo, PaymentProviderWaffoPancake, ""); handled {
		return gerr
	}

	var quotaToAdd int
	var credited bool
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderWaffoPancake {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status == common.TopUpStatusSuccess || topUp.Status == common.TopUpStatusHeld {
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		var quotaErr error
		quotaToAdd, quotaErr = common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(topUp.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Truncate(0))
		if quotaErr != nil {
			return errors.New("无效的充值额度")
		}
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		var e error
		credited, e = CompletePaidTopupTx(tx, topUp, quotaToAdd)
		return e
	})

	if err != nil {
		common.SysError("waffo pancake topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if credited && quotaToAdd > 0 {
		syncCreditUserQuotaCache(topUp.UserId, quotaToAdd, "waffo pancake topup")
		RecordLog(topUp.UserId, LogTypeTopup, fmt.Sprintf("Waffo Pancake充值成功，充值额度: %v，支付金额: %.2f", logger.FormatQuota(quotaToAdd), topUp.Money))
		CreateInviterRebate(topUp.UserId, topUp.Id, topUp.TradeNo, quotaToAdd)
		GrantTopupLotteryCards(topUp.UserId, quotaToAdd)
		if OnTopUpSuccess != nil {
			OnTopUpSuccess(topUp, quotaToAdd)
		}
	}

	return nil
}
