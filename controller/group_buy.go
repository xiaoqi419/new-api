package controller

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/skip2/go-qrcode"
	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/h5"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/native"
)

const groupBuyPayDesc = "拼团充值"

// GetGroupBuyInfo 返回拼团功能开关与可用套餐（登录用户）。
func GetGroupBuyInfo(c *gin.Context) {
	if !common.GroupBuyEnabled {
		common.ApiSuccess(c, gin.H{"enabled": false, "packages": []interface{}{}})
		return
	}
	packages, err := model.GetGroupBuyPackages(true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"enabled": true, "packages": packages})
}

type groupBuyCreateRequest struct {
	PackageId     int    `json:"package_id"`
	PaymentMethod string `json:"payment_method"`
	Scene         string `json:"scene"`
}

type groupBuyJoinRequest struct {
	GroupNo       string `json:"group_no"`
	PaymentMethod string `json:"payment_method"`
	Scene         string `json:"scene"`
}

type groupBuyCancelRequest struct {
	TradeNo string `json:"trade_no"`
}

// resolveGroupBuyProvider 校验并返回支付方式对应的支付网关标识。
func resolveGroupBuyProvider(paymentMethod string) (string, error) {
	switch paymentMethod {
	case model.PaymentMethodWechatPay:
		if !isWechatPayTopUpEnabled() {
			return "", fmt.Errorf("管理员未开启微信支付")
		}
		return model.PaymentProviderWechatPay, nil
	case model.PaymentMethodAlipay:
		if !isAlipayTopUpEnabled() {
			return "", fmt.Errorf("管理员未开启支付宝")
		}
		return model.PaymentProviderAlipay, nil
	default:
		if !isEpayTopUpEnabled() {
			return "", fmt.Errorf("管理员未开启在线充值")
		}
		if !operation_setting.ContainsPayMethod(paymentMethod) {
			return "", fmt.Errorf("支付方式不存在")
		}
		return model.PaymentProviderEpay, nil
	}
}

// CreateGroupBuy 发起拼团并拉起支付。
func CreateGroupBuy(c *gin.Context) {
	if !common.GroupBuyEnabled {
		common.ApiErrorMsg(c, "管理员未开启拼团充值")
		return
	}
	var req groupBuyCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PackageId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	provider, err := resolveGroupBuyProvider(req.PaymentMethod)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	pkg, err := model.GetGroupBuyPackageById(req.PackageId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !pkg.Enabled {
		common.ApiErrorMsg(c, "该拼团套餐未启用")
		return
	}

	userId := c.GetInt("id")
	username := c.GetString("username")
	tradeNo := groupBuyTradeNo(userId)

	groupBuy, err := model.CreateGroupBuyOrder(userId, username, pkg, tradeNo, provider, req.PaymentMethod)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	data, err := dispatchGroupBuyPayment(c, groupBuy, tradeNo, req.PaymentMethod, req.Scene)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	data["group_no"] = groupBuy.GroupNo
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": data})
}

// JoinGroupBuy 参团并拉起支付。
func JoinGroupBuy(c *gin.Context) {
	if !common.GroupBuyEnabled {
		common.ApiErrorMsg(c, "管理员未开启拼团充值")
		return
	}
	var req groupBuyJoinRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.GroupNo == "" {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	provider, err := resolveGroupBuyProvider(req.PaymentMethod)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	userId := c.GetInt("id")
	username := c.GetString("username")
	tradeNo := groupBuyTradeNo(userId)

	groupBuy, err := model.JoinGroupBuyOrder(userId, username, req.GroupNo, tradeNo, provider, req.PaymentMethod)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	data, err := dispatchGroupBuyPayment(c, groupBuy, tradeNo, req.PaymentMethod, req.Scene)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	data["group_no"] = groupBuy.GroupNo
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": data})
}

// CancelGroupBuyPayment 用户关闭收银台放弃支付，立即释放名额预占。
func CancelGroupBuyPayment(c *gin.Context) {
	var req groupBuyCancelRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.TradeNo == "" {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.ReleaseGroupBuyReservation(c.GetInt("id"), req.TradeNo); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// GetGroupBuyDetail 返回拼团详情与进度（登录用户）。
func GetGroupBuyDetail(c *gin.Context) {
	groupNo := c.Query("no")
	if groupNo == "" {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	groupBuy, participants, err := model.GetGroupBuyByNo(groupNo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userId := c.GetInt("id")
	if groupBuy.Status == model.GroupBuyStatusDraft && groupBuy.InitiatorId != userId {
		common.ApiErrorMsg(c, "拼团不存在") // 发起人未付款，对外等同于不存在
		return
	}
	now := common.GetTimestamp()
	joined := false
	memberViews := make([]gin.H, 0, len(participants))
	for _, p := range participants {
		// joined 判定的是"是否占着名额"，与后端参团校验同口径：已支付，或预占未过期的待支付。
		// 否则用户放弃支付后按钮会立刻恢复可点，点下去却被"你已在该拼团中"拦住。
		if p.UserId == userId && (p.PayStatus == model.GroupBuyParticipantPaid ||
			(p.PayStatus == model.GroupBuyParticipantPending && p.ReserveExpireTime > now)) {
			joined = true
		}
		// 名单只列已支付成员，与成团进度（paid_count）保持同一口径。
		if p.PayStatus != model.GroupBuyParticipantPaid {
			continue
		}
		memberViews = append(memberViews, gin.H{
			"username":   maskUsername(p.Username),
			"pay_status": p.PayStatus,
			"join_time":  p.JoinTime,
		})
	}
	gbSetting := operation_setting.GetGroupBuySetting()
	common.ApiSuccess(c, gin.H{
		"group_no":         groupBuy.GroupNo,
		"package_name":     groupBuy.PackageName,
		"status":           groupBuy.Status,
		"required_count":   groupBuy.RequiredCount,
		"target_count":     groupBuy.TargetCount,
		"paid_count":       groupBuy.PaidCount,
		"total_amount":     groupBuy.TotalAmount,
		"total_price":      groupBuy.TotalPrice,
		"per_share_amount": groupBuy.PerShareAmount,
		"per_share_price":  groupBuy.PerSharePrice,
		"tiers":            groupBuy.Tiers,
		"current_amount":   groupBuyCurrentAmount(groupBuy),
		"expire_time":      groupBuy.ExpireTime,
		"create_time":      groupBuy.CreateTime,
		"complete_time":    groupBuy.CompleteTime,
		"joined":           joined,
		"participants":     memberViews,
		"notes":            gbSetting.Notes,
		"models_hint":      gbSetting.ModelsHint,
	})
}

// groupBuyCurrentAmount 返回当前已支付人数下已解锁的每人到账额度；未解锁任何档时返回最低档保底额度。
func groupBuyCurrentAmount(groupBuy *model.GroupBuy) int64 {
	tiers := groupBuy.Tiers
	if len(tiers) == 0 {
		return groupBuy.PerShareAmount
	}
	current := int64(0)
	for _, tier := range tiers {
		if groupBuy.PaidCount >= tier.Count {
			current = tier.PerShareAmount
		}
	}
	if current == 0 {
		current = tiers[0].PerShareAmount
	}
	return current
}

// GetGroupBuyHall 返回拼团大厅可参与的拼团列表（登录用户）。
func GetGroupBuyHall(c *gin.Context) {
	if !common.GroupBuyEnabled {
		common.ApiSuccess(c, gin.H{"enabled": false, "items": []interface{}{}, "total": 0})
		return
	}
	now := common.GetTimestamp()
	pageInfo := common.GetPageQuery(c)
	groupBuys, total, err := model.GetActiveGroupBuysForHall(now, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(groupBuys)
	common.ApiSuccess(c, gin.H{"enabled": true, "page_info": pageInfo})
}

// GetSelfGroupBuys 返回当前用户参与过的拼团列表。
func GetSelfGroupBuys(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	groupBuys, total, err := model.GetUserGroupBuys(userId, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(groupBuys)
	common.ApiSuccess(c, pageInfo)
}

// ===== 支付拉起 =====

func groupBuyTradeNo(userId int) string {
	return fmt.Sprintf("GBU%dNO%s%d", userId, common.GetRandomString(4), time.Now().Unix())
}

func dispatchGroupBuyPayment(c *gin.Context, groupBuy *model.GroupBuy, tradeNo, paymentMethod, scene string) (gin.H, error) {
	ctx := c.Request.Context()
	payMoney := groupBuy.PerSharePrice
	switch paymentMethod {
	case model.PaymentMethodWechatPay:
		return groupBuyWechatPay(c, tradeNo, payMoney, scene)
	case model.PaymentMethodAlipay:
		data, err := groupBuyAlipay(ctx, tradeNo, payMoney)
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("拼团 支付宝下单失败 trade_no=%s error=%q", tradeNo, err.Error()))
			return nil, fmt.Errorf("拉起支付失败")
		}
		return data, nil
	default:
		payURL, params, err := groupBuyEpay(tradeNo, payMoney, paymentMethod)
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("拼团 易支付下单失败 trade_no=%s error=%q", tradeNo, err.Error()))
			return nil, fmt.Errorf("拉起支付失败")
		}
		return gin.H{"epay_url": payURL, "epay_params": params, "trade_no": tradeNo}, nil
	}
}

func groupBuyWechatPay(c *gin.Context, tradeNo string, payMoney float64, scene string) (gin.H, error) {
	ctx := c.Request.Context()
	client, _, _, err := ensureWechatPay(ctx)
	if err != nil {
		logger.LogError(ctx, "拼团 微信支付初始化失败 error="+err.Error())
		return nil, fmt.Errorf("微信支付暂不可用")
	}
	totalCents := decimal.NewFromFloat(payMoney).Mul(decimal.NewFromInt(100)).Round(0).IntPart()

	if scene == "h5" {
		if !setting.WechatPayH5 {
			return nil, fmt.Errorf("未开启 H5 支付")
		}
		svc := h5.H5ApiService{Client: client}
		resp, _, err := svc.Prepay(ctx, h5.PrepayRequest{
			Appid:       core.String(setting.WechatPayAppId),
			Mchid:       core.String(setting.WechatPayMchId),
			Description: core.String(groupBuyPayDesc),
			OutTradeNo:  core.String(tradeNo),
			NotifyUrl:   core.String(wechatNotifyUrl()),
			Amount:      &h5.Amount{Currency: core.String("CNY"), Total: core.Int64(totalCents)},
			SceneInfo: &h5.SceneInfo{
				PayerClientIp: core.String(c.ClientIP()),
				H5Info:        &h5.H5Info{Type: core.String("Wap")},
			},
		})
		if err != nil || resp == nil || resp.H5Url == nil {
			return nil, fmt.Errorf("拉起支付失败")
		}
		return gin.H{"h5_url": *resp.H5Url, "trade_no": tradeNo}, nil
	}

	if !setting.WechatPayNative {
		return nil, fmt.Errorf("未开启 Native 扫码支付")
	}
	svc := native.NativeApiService{Client: client}
	resp, _, err := svc.Prepay(ctx, native.PrepayRequest{
		Appid:       core.String(setting.WechatPayAppId),
		Mchid:       core.String(setting.WechatPayMchId),
		Description: core.String(groupBuyPayDesc),
		OutTradeNo:  core.String(tradeNo),
		NotifyUrl:   core.String(wechatNotifyUrl()),
		Amount:      &native.Amount{Currency: core.String("CNY"), Total: core.Int64(totalCents)},
	})
	if err != nil || resp == nil || resp.CodeUrl == nil {
		return nil, fmt.Errorf("拉起支付失败")
	}
	png, err := qrcode.Encode(*resp.CodeUrl, qrcode.Medium, 256)
	if err != nil {
		return nil, fmt.Errorf("生成二维码失败")
	}
	return gin.H{
		"qr_code":  "data:image/png;base64," + base64.StdEncoding.EncodeToString(png),
		"trade_no": tradeNo,
	}, nil
}

func groupBuyAlipay(ctx context.Context, tradeNo string, payMoney float64) (gin.H, error) {
	client, err := ensureAlipay()
	if err != nil {
		return nil, err
	}
	qrCode, err := alipayPreCreateQR(ctx, client, tradeNo, groupBuyPayDesc,
		decimal.NewFromFloat(payMoney).StringFixed(2))
	if err != nil {
		return nil, err
	}
	return gin.H{
		"qr_code":  qrCode,
		"trade_no": tradeNo,
	}, nil
}

func groupBuyEpay(tradeNo string, payMoney float64, paymentMethod string) (string, map[string]string, error) {
	client := GetEpayClient()
	if client == nil {
		return "", nil, fmt.Errorf("当前管理员未配置支付信息")
	}
	callBackAddress := service.GetCallbackAddress()
	returnUrl, _ := url.Parse(paymentReturnPath("/console/log?show_history=true"))
	notifyUrl, _ := url.Parse(callBackAddress + "/api/user/epay/notify")
	uri, params, err := client.Purchase(&epay.PurchaseArgs{
		Type:           paymentMethod,
		ServiceTradeNo: tradeNo,
		Name:           groupBuyPayDesc,
		Money:          strconv.FormatFloat(payMoney, 'f', 2, 64),
		Device:         epay.PC,
		NotifyUrl:      notifyUrl,
		ReturnUrl:      returnUrl,
	})
	if err != nil {
		return "", nil, err
	}
	return uri, params, nil
}

func maskUsername(name string) string {
	r := []rune(name)
	if len(r) <= 1 {
		return name
	}
	if len(r) == 2 {
		return string(r[0]) + "*"
	}
	return string(r[0]) + "***" + string(r[len(r)-1])
}
