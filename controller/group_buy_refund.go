package controller

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/shopspring/decimal"
	"github.com/smartwalle/alipay/v3"
	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/services/refunddomestic"
)

// ErrRefundNotSupported 表示该支付网关暂不支持自动退款，需转人工。
var ErrRefundNotSupported = errors.New("该支付方式暂不支持自动退款")

// refundGroupBuyTopUp 按支付网关发起原路退款。
func refundGroupBuyTopUp(ctx context.Context, topUp *model.TopUp) error {
	refundNo := topUp.TradeNo + "RF"
	switch topUp.PaymentProvider {
	case model.PaymentProviderWechatPay:
		client, _, _, err := ensureWechatPay(ctx)
		if err != nil {
			return err
		}
		totalCents := decimal.NewFromFloat(topUp.Money).Mul(decimal.NewFromInt(100)).Round(0).IntPart()
		svc := refunddomestic.RefundsApiService{Client: client}
		_, _, err = svc.Create(ctx, refunddomestic.CreateRequest{
			OutTradeNo:  core.String(topUp.TradeNo),
			OutRefundNo: core.String(refundNo),
			Reason:      core.String("拼团未成功退款"),
			Amount: &refunddomestic.AmountReq{
				Refund:   core.Int64(totalCents),
				Total:    core.Int64(totalCents),
				Currency: core.String("CNY"),
			},
		})
		return err
	case model.PaymentProviderAlipay:
		client, err := ensureAlipay()
		if err != nil {
			return err
		}
		_, err = client.TradeRefund(ctx, alipay.TradeRefund{
			OutTradeNo:   topUp.TradeNo,
			RefundAmount: decimal.NewFromFloat(topUp.Money).StringFixed(2),
			RefundReason: "拼团未成功退款",
			OutRequestNo: refundNo,
		})
		return err
	default:
		return ErrRefundNotSupported
	}
}

// failGroupBuyAndRefund 将拼团置为失败并对已支付成员发起退款；无法自动退款的转人工队列。
func failGroupBuyAndRefund(groupBuyId int) {
	paidParticipants, err := model.MarkGroupBuyFailed(groupBuyId)
	if err != nil {
		common.SysLog(fmt.Sprintf("group-buy fail mark error group_buy_id=%d error=%s", groupBuyId, err.Error()))
		return
	}
	ctx := context.Background()
	for _, p := range paidParticipants {
		topUp := model.GetTopUpByTradeNo(p.TradeNo)
		if topUp == nil {
			_ = model.MarkParticipantRefundResult(p.Id, model.GroupBuyParticipantRefundPending)
			continue
		}
		LockOrder(p.TradeNo)
		refundErr := refundGroupBuyTopUp(ctx, topUp)
		UnlockOrder(p.TradeNo)
		if refundErr != nil {
			if errors.Is(refundErr, ErrRefundNotSupported) {
				logger.LogInfo(ctx, fmt.Sprintf("拼团 退款转人工 trade_no=%s provider=%s", p.TradeNo, topUp.PaymentProvider))
			} else {
				logger.LogError(ctx, fmt.Sprintf("拼团 自动退款失败 trade_no=%s provider=%s error=%q", p.TradeNo, topUp.PaymentProvider, refundErr.Error()))
			}
			_ = model.MarkParticipantRefundResult(p.Id, model.GroupBuyParticipantRefundPending)
			continue
		}
		if err := model.MarkParticipantRefundResult(p.Id, model.GroupBuyParticipantRefunded); err != nil {
			common.SysLog("group-buy mark refunded error: " + err.Error())
		}
		logger.LogInfo(ctx, fmt.Sprintf("拼团 自动退款成功 trade_no=%s provider=%s money=%.2f", p.TradeNo, topUp.PaymentProvider, topUp.Money))
	}
}

// StartGroupBuyExpiryTask 启动后台 sweeper，定期将过期未成团的拼团置为失败并退款。
func StartGroupBuyExpiryTask() {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				common.SysLog(fmt.Sprintf("group-buy expiry task panic: %v, restarting", r))
				time.Sleep(5 * time.Second)
				StartGroupBuyExpiryTask()
			}
		}()
		for {
			time.Sleep(60 * time.Second)
			runGroupBuyExpiryOnce()
		}
	}()
}

func runGroupBuyExpiryOnce() {
	now := common.GetTimestamp()
	ids, err := model.GetExpiredPendingGroupBuyIds(now, 100)
	if err != nil {
		common.SysLog("group-buy expiry query error: " + err.Error())
		return
	}
	for _, id := range ids {
		settled, err := model.SettleExpiredGroupBuyIfEligible(id)
		if err != nil {
			common.SysLog(fmt.Sprintf("group-buy expiry settle error group_buy_id=%d error=%s", id, err.Error()))
			continue
		}
		if !settled {
			// 未达最低成团档：置为失败并退款
			failGroupBuyAndRefund(id)
		}
	}
}
