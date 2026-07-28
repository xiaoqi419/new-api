package service

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/error_alert_setting"
)

// NotifyTopUpSuccess 充值成功后推送企业微信群机器人：用户名/ID/支付金额/充值额度，
// 并附带今日、本月累计充值（实付金额与笔数）。复用错误告警的企业微信 webhook，
// 未配置则跳过。异步执行，失败仅记日志，不阻塞充值主流程。
//
// 通过 model.OnTopUpSuccess 钩子在各充值首次成功处调用（拼团为成员付款成功时，
// 额度尚未发放，quotaAdded 传 0）。
func NotifyTopUpSuccess(topUp *model.TopUp, quotaAdded int) {
	if topUp == nil {
		return
	}
	go func() {
		defer func() { _ = recover() }()

		webhook := error_alert_setting.GetSetting().WecomWebhookUrl
		if webhook == "" {
			return
		}

		username := fmt.Sprintf("用户#%d", topUp.UserId)
		if user, err := model.GetUserById(topUp.UserId, false); err == nil && user != nil && user.Username != "" {
			username = user.Username
		}

		now := time.Now()
		startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
		startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Unix()

		dayMoney, dayCount, err := model.SumSuccessTopUp(startOfDay)
		if err != nil {
			common.SysLog("topup notify sum day failed: " + err.Error())
		}
		monthMoney, monthCount, err := model.SumSuccessTopUp(startOfMonth)
		if err != nil {
			common.SysLog("topup notify sum month failed: " + err.Error())
		}

		quotaText := logger.FormatQuota(quotaAdded)
		if quotaAdded <= 0 && topUp.GroupBuyId != 0 {
			quotaText = "拼团待成团结算"
		}

		channel := topUp.PaymentMethod
		if channel == "" {
			channel = topUp.PaymentProvider
		}
		if topUp.GroupBuyId != 0 {
			channel = "拼团 / " + channel
		}

		md := fmt.Sprintf(
			"### 新充值到账\n"+
				"> 用户：%s（ID: %d）\n"+
				"> 支付金额：¥%.2f\n"+
				"> 充值额度：%s\n"+
				"> 支付方式：%s\n"+
				"> 订单号：%s\n"+
				"> 时间：%s\n\n"+
				"**今日累计**：¥%.2f（%d 笔）\n"+
				"**本月累计**：¥%.2f（%d 笔）",
			username, topUp.UserId,
			topUp.Money,
			quotaText,
			channel,
			topUp.TradeNo,
			now.Format("2006-01-02 15:04:05"),
			dayMoney, dayCount,
			monthMoney, monthCount,
		)

		if err := SendWecomBotMarkdown(webhook, md); err != nil {
			common.SysLog("topup wecom notify failed: " + err.Error())
		}
	}()
}
