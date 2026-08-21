package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

// errStopResettle 用于在补发循环内提前终止（代理钱包再次不足），非真正错误。
var errStopResettle = errors.New("agent wallet drained, stop resettle")

// SettleTerminalUserTopupTx 在给定事务内为终端用户到账，并对代理用户按 cost_ratio
// 从代理钱包结算扣款。返回 credited=false（无 error）表示代理钱包不足，需由调用方挂单
// （S12：挂单不透支，钱包绝不为负）。平台直属用户(agentId<=0)直接到账。
func SettleTerminalUserTopupTx(tx *gorm.DB, userId int, agentId int, quotaToAdd int, refTradeNo string) (credited bool, err error) {
	if quotaToAdd <= 0 {
		return false, errors.New("无效的充值额度")
	}
	maxCurrentQuota, err := topUpQuotaMaxCurrent(quotaToAdd)
	if err != nil {
		return false, err
	}
	if agentId <= 0 {
		result := tx.Model(&User{}).Where("id = ? AND quota <= ?", userId, maxCurrentQuota).
			Update("quota", gorm.Expr("quota + ?", quotaToAdd))
		if result.Error != nil {
			return false, result.Error
		}
		if result.RowsAffected == 0 {
			return false, ErrTopUpQuotaLimitExceeded
		}
		return true, nil
	}

	agent := &Agent{}
	if err := tx.Where("id = ?", agentId).First(agent).Error; err != nil {
		return false, errors.New("代理不存在")
	}

	// 结算扣款额度 = 用户到账额度 × cost_ratio（int32 饱和，绝不产生负扣款）
	settleQuota, quotaErr := common.QuotaRoundStrict(float64(quotaToAdd) * agent.CostRatio)
	if quotaErr != nil {
		return false, quotaErr
	}
	if settleQuota < 0 {
		settleQuota = 0
	}

	// 仅在需要扣款时执行条件扣减，避免 MySQL 对零值 UPDATE 的 RowsAffected==0 误判为不足。
	if settleQuota > 0 {
		result := tx.Model(&Agent{}).Where("id = ? AND wallet_quota >= ?", agentId, settleQuota).
			Update("wallet_quota", gorm.Expr("wallet_quota - ?", settleQuota))
		if result.Error != nil {
			return false, result.Error
		}
		if result.RowsAffected == 0 {
			return false, nil // 代理钱包不足 → 挂单
		}
	}

	userCredit := tx.Model(&User{}).Where("id = ? AND quota <= ?", userId, maxCurrentQuota).
		Update("quota", gorm.Expr("quota + ?", quotaToAdd))
	if userCredit.Error != nil {
		return false, userCredit.Error
	}
	if userCredit.RowsAffected == 0 {
		return false, ErrTopUpQuotaLimitExceeded
	}

	var balanceAfter int
	if err := tx.Model(&Agent{}).Where("id = ?", agentId).
		Select("wallet_quota").Scan(&balanceAfter).Error; err != nil {
		return false, err
	}

	ledger := &AgentLedger{
		AgentId:      agentId,
		Type:         AgentLedgerTypeSettle,
		QuotaDelta:   int64(-settleQuota),
		BalanceAfter: balanceAfter,
		RefTradeNo:   refTradeNo,
		UserId:       userId,
		Content:      fmt.Sprintf("终端用户 %d 充值到账 %d，按折扣 %.4f 结算扣款 %d", userId, quotaToAdd, agent.CostRatio, settleQuota),
		CreatedTime:  common.GetTimestamp(),
	}
	if err := tx.Create(ledger).Error; err != nil {
		return false, err
	}
	return true, nil
}

// ApplyTerminalTopupTx 在给定事务内完成到账/挂单，并相应更新 topUp 状态（success/held）。
// 返回 credited；调用方仅在 credited=true 时执行充值成功钩子。
func ApplyTerminalTopupTx(tx *gorm.DB, topUp *TopUp, user *User, quotaToAdd int) (credited bool, err error) {
	credited, err = SettleTerminalUserTopupTx(tx, user.Id, user.AgentId, quotaToAdd, topUp.TradeNo)
	if err != nil {
		return false, err
	}
	topUp.CompleteTime = common.GetTimestamp()
	if credited {
		topUp.Status = common.TopUpStatusSuccess
		topUp.HeldQuota = 0
	} else {
		topUp.Status = common.TopUpStatusHeld
		topUp.HeldQuota = quotaToAdd
	}
	return credited, tx.Save(topUp).Error
}

// CompletePaidTopupTx 在调用方已锁定/校验过 topUp(status=pending) 的事务内，加载用户并
// 完成到账/挂单。返回 credited；调用方仅在 credited=true 时执行充值成功钩子。
func CompletePaidTopupTx(tx *gorm.DB, topUp *TopUp, quotaToAdd int) (credited bool, err error) {
	var user User
	if err := tx.Where("id = ?", topUp.UserId).First(&user).Error; err != nil {
		return false, err
	}
	return ApplyTerminalTopupTx(tx, topUp, &user, quotaToAdd)
}

// CompletePaidTopupByTradeNo 自开事务完成一笔已支付订单的到账/挂单（供 epay 等在 controller
// 内联入账的支付方式复用）。锁单 + 校验支付网关 + 幂等 + 代理结算，返回是否已到账。
func CompletePaidTopupByTradeNo(tradeNo string, expectedProvider string, paymentMethodOverride string, quotaToAdd int) (credited bool, err error) {
	if tradeNo == "" {
		return false, errors.New("未提供支付单号")
	}
	if quotaToAdd <= 0 {
		return false, errors.New("无效的充值额度")
	}
	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}
	var userId int
	err = DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		if e := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error; e != nil {
			return errors.New("充值订单不存在")
		}
		if expectedProvider != "" && topUp.PaymentProvider != expectedProvider {
			return ErrPaymentMethodMismatch
		}
		if topUp.Status == common.TopUpStatusSuccess || topUp.Status == common.TopUpStatusHeld {
			return nil // 幂等：已到账或已挂单
		}
		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}
		if paymentMethodOverride != "" && topUp.PaymentMethod != paymentMethodOverride {
			topUp.PaymentMethod = paymentMethodOverride
		}
		userId = topUp.UserId
		var e error
		credited, e = CompletePaidTopupTx(tx, topUp, quotaToAdd)
		return e
	})
	if err != nil {
		return false, err
	}
	if credited {
		syncCreditUserQuotaCache(userId, quotaToAdd, "paid topup")
	}
	return credited, nil
}

// TryCompleteAgentPrepay 处理一笔代理「预充值」订单：到账目标为代理钱包(1:1)，而非用户额度。
// 返回 handled=false 表示该订单不是预充值订单(调用方继续走普通充值流程)，仿 TrySettleGroupBuyOrder。
// 单事务内：锁单 + 校验网关/幂等 + 钱包入账 + 写 prepay 流水 + 订单置成功；开启自动审批时激活代理。
func TryCompleteAgentPrepay(tradeNo, expectedProvider, callerIp string) (handled bool, err error) {
	topUp := GetTopUpByTradeNo(tradeNo)
	if topUp == nil || topUp.AgentPrepayId <= 0 {
		return false, nil
	}
	agentId := topUp.AgentPrepayId
	var creditQuota int
	err = DB.Transaction(func(tx *gorm.DB) error {
		locked := &TopUp{}
		if e := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(locked).Error; e != nil {
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

		agent := &Agent{}
		if e := lockForUpdate(tx).Where("id = ?", agentId).First(agent).Error; e != nil {
			return errors.New("代理不存在")
		}

		// 预充 1:1，钱包入账额度 = 订单额度 × QuotaPerUnit（int32 饱和保护）
		var quotaErr error
		creditQuota, quotaErr = common.QuotaFromFloatStrict(float64(locked.Amount) * common.QuotaPerUnit)
		if quotaErr != nil {
			return quotaErr
		}
		if creditQuota <= 0 {
			return errors.New("无效的预充额度")
		}
		if e := tx.Model(&Agent{}).Where("id = ?", agentId).
			Update("wallet_quota", gorm.Expr("wallet_quota + ?", creditQuota)).Error; e != nil {
			return e
		}
		var balanceAfter int
		if e := tx.Model(&Agent{}).Where("id = ?", agentId).
			Select("wallet_quota").Scan(&balanceAfter).Error; e != nil {
			return e
		}
		ledger := &AgentLedger{
			AgentId:      agentId,
			Type:         AgentLedgerTypePrepay,
			QuotaDelta:   int64(creditQuota),
			BalanceAfter: balanceAfter,
			RefTradeNo:   locked.TradeNo,
			UserId:       locked.UserId,
			Content:      fmt.Sprintf("代理预充值到账 %d(订单 %s)", creditQuota, locked.TradeNo),
			CreatedTime:  common.GetTimestamp(),
		}
		if e := tx.Create(ledger).Error; e != nil {
			return e
		}

		// 自动审批：预充到账即激活代理并把 owner 升级为代理(is_agent=1)。
		if common.AgentAutoApproveEnabled && agent.Status == AgentStatusPending {
			if e := tx.Model(&Agent{}).Where("id = ?", agentId).
				Update("status", AgentStatusActive).Error; e != nil {
				return e
			}
			if e := tx.Model(&User{}).Where("id = ?", agent.OwnerUserId).
				Update("is_agent", true).Error; e != nil {
				return e
			}
		}

		locked.Status = common.TopUpStatusSuccess
		locked.CompleteTime = common.GetTimestamp()
		return tx.Save(locked).Error
	})
	if err != nil {
		return true, err
	}
	InvalidateAgentRatioCache(agentId)
	// 钱包入账后尝试补发此前挂起的终端用户订单(S12)
	gopool.Go(func() { ResettleHeldTopups(agentId) })
	common.SysLog(fmt.Sprintf("代理预充值成功 agent_id=%d trade_no=%s quota=%d client_ip=%s", agentId, tradeNo, creditQuota, callerIp))
	return true, nil
}

// PreCheckAgentWalletForTopup 支付前预检：代理用户下单前校验代理是否已开通且钱包足够本次结算。
func PreCheckAgentWalletForTopup(agentId int, quotaToAdd int) (ok bool, err error) {
	if agentId <= 0 {
		return true, nil
	}
	agent, err := GetAgentById(agentId)
	if err != nil {
		return false, errors.New("代理不存在")
	}
	if agent.Status != AgentStatusActive {
		return false, errors.New("代理未开通或已停用")
	}
	settleQuota, quotaErr := common.QuotaRoundStrict(float64(quotaToAdd) * agent.CostRatio)
	if quotaErr != nil {
		return false, quotaErr
	}
	if settleQuota < 0 {
		settleQuota = 0
	}
	return agent.WalletQuota >= settleQuota, nil
}

// ResettleHeldTopups 代理钱包补足后，按下单顺序补发该代理名下的 held 订单，直到钱包再次不足。
// 由代理钱包入账成功后异步触发。
func ResettleHeldTopups(agentId int) {
	if agentId <= 0 {
		return
	}
	var held []*TopUp
	subQuery := DB.Model(&User{}).Select("id").Where("agent_id = ?", agentId)
	if err := DB.Where("status = ? AND user_id IN (?)", common.TopUpStatusHeld, subQuery).
		Order("id asc").Find(&held).Error; err != nil {
		common.SysError("failed to load held topups: " + err.Error())
		return
	}

	for _, topUp := range held {
		creditedQuota := topUp.HeldQuota
		resettled := false
		err := DB.Transaction(func(tx *gorm.DB) error {
			locked := &TopUp{}
			if err := lockForUpdate(tx).Where("id = ?", topUp.Id).First(locked).Error; err != nil {
				return err
			}
			if locked.Status != common.TopUpStatusHeld {
				return nil // 已被其他流程处理，跳过
			}
			var user User
			if err := tx.Where("id = ?", locked.UserId).First(&user).Error; err != nil {
				return err
			}
			ok, err := SettleTerminalUserTopupTx(tx, user.Id, user.AgentId, locked.HeldQuota, locked.TradeNo)
			if err != nil {
				return err
			}
			if !ok {
				return errStopResettle // 钱包再次不足，终止本轮补发
			}
			locked.Status = common.TopUpStatusSuccess
			locked.CompleteTime = common.GetTimestamp()
			locked.HeldQuota = 0
			if err := tx.Save(locked).Error; err != nil {
				return err
			}
			resettled = true
			return nil
		})
		if err != nil {
			if errors.Is(err, errStopResettle) {
				break
			}
			common.SysError("failed to resettle held topup: " + err.Error())
			break
		}
		if !resettled {
			continue
		}
		syncCreditUserQuotaCache(topUp.UserId, creditedQuota, "agent held topup resettlement")
		RecordTopupLog(topUp.UserId, fmt.Sprintf("代理补足额度后自动补发充值，到账额度: %v", logger.FormatQuota(creditedQuota)), "", topUp.PaymentMethod, "agent_resettle")
		CreateInviterRebate(topUp.UserId, topUp.Id, topUp.TradeNo, creditedQuota)
		GrantTopupLotteryCards(topUp.UserId, creditedQuota)
		if OnTopUpSuccess != nil {
			OnTopUpSuccess(topUp, creditedQuota)
		}
	}
}
