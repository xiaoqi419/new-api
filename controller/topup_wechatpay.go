package controller

import (
	"context"
	"crypto/hmac"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	qrcode "github.com/skip2/go-qrcode"
	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/verifiers"
	"github.com/wechatpay-apiv3/wechatpay-go/core/downloader"
	"github.com/wechatpay-apiv3/wechatpay-go/core/notify"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/h5"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/jsapi"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/native"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"
)

var (
	wechatPayMu          sync.Mutex
	wechatPayFingerprint string
	wechatPayClient      *core.Client
	wechatPayHandler     *notify.Handler
	wechatPayPrivKey     *rsa.PrivateKey
)

// wechatEffectiveSerial 优先从公钥证书内容解析序列号，否则用手填序列号。
func wechatEffectiveSerial() string {
	if strings.TrimSpace(setting.WechatPayCert) != "" {
		if cert, err := utils.LoadCertificate(setting.WechatPayCert); err == nil {
			return utils.GetCertificateSerialNumber(*cert)
		}
	}
	return setting.WechatPayCertSerialNo
}

// wechatBaseUrl 返回回调/跳转使用的站点基地址（去掉末尾斜杠）。
func wechatBaseUrl() string {
	base := strings.TrimSpace(setting.WechatPayNotifyUrl)
	if base == "" {
		base = service.GetCallbackAddress()
	}
	return strings.TrimRight(base, "/")
}

func wechatNotifyUrl() string {
	return wechatBaseUrl() + "/api/user/wechatpay/notify"
}

func wechatPayConfigFingerprint() string {
	return fmt.Sprintf("%s|%s|%s", setting.WechatPayMchId, wechatEffectiveSerial(),
		common.Sha1([]byte(setting.WechatPayPrivateKey+"|"+setting.WechatPayApiV3Key)))
}

// ensureWechatPay 构建并缓存微信支付客户端与回调验签处理器，配置变更时自动重建。
func ensureWechatPay(ctx context.Context) (*core.Client, *notify.Handler, *rsa.PrivateKey, error) {
	if !isWechatPayConfigured() {
		return nil, nil, nil, errors.New("微信支付未配置")
	}
	serialNo := wechatEffectiveSerial()
	if serialNo == "" {
		return nil, nil, nil, errors.New("无法获取商户证书序列号")
	}
	fp := wechatPayConfigFingerprint()

	wechatPayMu.Lock()
	defer wechatPayMu.Unlock()
	if wechatPayClient != nil && wechatPayHandler != nil && wechatPayFingerprint == fp {
		return wechatPayClient, wechatPayHandler, wechatPayPrivKey, nil
	}

	privateKey, err := utils.LoadPrivateKey(setting.WechatPayPrivateKey)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("加载商户私钥失败: %w", err)
	}
	client, err := core.NewClient(ctx, option.WithWechatPayAutoAuthCipher(
		setting.WechatPayMchId, serialNo, privateKey, setting.WechatPayApiV3Key))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("初始化微信支付客户端失败: %w", err)
	}
	certVisitor := downloader.MgrInstance().GetCertificateVisitor(setting.WechatPayMchId)
	handler, err := notify.NewRSANotifyHandler(setting.WechatPayApiV3Key, verifiers.NewSHA256WithRSAVerifier(certVisitor))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("初始化微信支付回调处理器失败: %w", err)
	}

	wechatPayClient = client
	wechatPayHandler = handler
	wechatPayPrivKey = privateKey
	wechatPayFingerprint = fp
	return client, handler, privateKey, nil
}

func wechatPayTradeNo(userId int) string {
	return fmt.Sprintf("USR%dNO%s%d", userId, common.GetRandomString(4), time.Now().Unix())
}

// wechatConvertAmount 将充值数量按展示单位换算为入账单位（与易支付一致）。
func wechatConvertAmount(amount int64) int64 {
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		return decimal.NewFromInt(amount).Div(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart()
	}
	return amount
}

func insertWechatTopUp(userId int, amount int64, payMoney float64, tradeNo string) error {
	topUp := &model.TopUp{
		UserId:          userId,
		Amount:          wechatConvertAmount(amount),
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodWechatPay,
		PaymentProvider: model.PaymentProviderWechatPay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	return topUp.Insert()
}

// RequestWechatPay 处理 Native 扫码与 H5 两种渠道下单（scene: native / h5）。
func RequestWechatPay(c *gin.Context) {
	var req struct {
		Amount        int64  `json:"amount"`
		PaymentMethod string `json:"payment_method"`
		Scene         string `json:"scene"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	if !isWechatPayTopUpEnabled() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "管理员未开启微信支付"})
		return
	}
	if req.Amount < getMinTopup(0) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getMinTopup(0))})
		return
	}

	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getPayMoney(req.Amount, group, 0)
	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}

	client, _, _, err := ensureWechatPay(c.Request.Context())
	if err != nil {
		logger.LogError(c.Request.Context(), "微信支付 初始化失败 error="+err.Error())
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "微信支付暂不可用"})
		return
	}

	tradeNo := wechatPayTradeNo(id)
	totalCents := decimal.NewFromFloat(payMoney).Mul(decimal.NewFromInt(100)).Round(0).IntPart()
	desc := fmt.Sprintf("TUC%d", req.Amount)

	if req.Scene == "h5" {
		if !setting.WechatPayH5 {
			c.JSON(http.StatusOK, gin.H{"message": "error", "data": "未开启 H5 支付"})
			return
		}
		svc := h5.H5ApiService{Client: client}
		resp, _, err := svc.Prepay(c.Request.Context(), h5.PrepayRequest{
			Appid:       core.String(setting.WechatPayAppId),
			Mchid:       core.String(setting.WechatPayMchId),
			Description: core.String(desc),
			OutTradeNo:  core.String(tradeNo),
			NotifyUrl:   core.String(wechatNotifyUrl()),
			Amount:      &h5.Amount{Currency: core.String("CNY"), Total: core.Int64(totalCents)},
			SceneInfo: &h5.SceneInfo{
				PayerClientIp: core.String(c.ClientIP()),
				H5Info:        &h5.H5Info{Type: core.String("Wap")},
			},
		})
		if err != nil || resp == nil || resp.H5Url == nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("微信支付 H5 下单失败 user_id=%d trade_no=%s error=%v", id, tradeNo, err))
			c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
			return
		}
		if err := insertWechatTopUp(id, req.Amount, payMoney, tradeNo); err != nil {
			c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "success", "data": gin.H{"h5_url": *resp.H5Url, "trade_no": tradeNo}})
		return
	}

	// 默认 Native 扫码
	if !setting.WechatPayNative {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "未开启 Native 扫码支付"})
		return
	}
	svc := native.NativeApiService{Client: client}
	resp, _, err := svc.Prepay(c.Request.Context(), native.PrepayRequest{
		Appid:       core.String(setting.WechatPayAppId),
		Mchid:       core.String(setting.WechatPayMchId),
		Description: core.String(desc),
		OutTradeNo:  core.String(tradeNo),
		NotifyUrl:   core.String(wechatNotifyUrl()),
		Amount:      &native.Amount{Currency: core.String("CNY"), Total: core.Int64(totalCents)},
	})
	if err != nil || resp == nil || resp.CodeUrl == nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("微信支付 Native 下单失败 user_id=%d trade_no=%s error=%v", id, tradeNo, err))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}
	png, err := qrcode.Encode(*resp.CodeUrl, qrcode.Medium, 256)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "生成二维码失败"})
		return
	}
	if err := insertWechatTopUp(id, req.Amount, payMoney, tradeNo); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("微信支付 Native 订单创建成功 user_id=%d trade_no=%s amount=%d money=%.2f", id, tradeNo, req.Amount, payMoney))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"qr_code":  "data:image/png;base64," + base64.StdEncoding.EncodeToString(png),
			"trade_no": tradeNo,
		},
	})
}

// ===== JSAPI（微信内置浏览器，需服务号 + 网页授权取 openid）=====

func signJSAPIState(payload string) string {
	mac := hmac.New(sha256.New, []byte(common.CryptoSecret))
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

func buildJSAPIState(userId int, amount int64, totalCents int64) string {
	payload := fmt.Sprintf("%d|%d|%d|%d", userId, amount, totalCents, time.Now().Add(10*time.Minute).Unix())
	token := base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + signJSAPIState(payload)
	return token
}

func parseJSAPIState(token string) (userId int, amount int64, totalCents int64, err error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return 0, 0, 0, errors.New("state 格式错误")
	}
	raw, derr := base64.RawURLEncoding.DecodeString(parts[0])
	if derr != nil {
		return 0, 0, 0, errors.New("state 解码失败")
	}
	payload := string(raw)
	if !hmac.Equal([]byte(parts[1]), []byte(signJSAPIState(payload))) {
		return 0, 0, 0, errors.New("state 校验失败")
	}
	fields := strings.Split(payload, "|")
	if len(fields) != 4 {
		return 0, 0, 0, errors.New("state 字段错误")
	}
	userId, _ = strconv.Atoi(fields[0])
	amount, _ = strconv.ParseInt(fields[1], 10, 64)
	totalCents, _ = strconv.ParseInt(fields[2], 10, 64)
	exp, _ := strconv.ParseInt(fields[3], 10, 64)
	if time.Now().Unix() > exp {
		return 0, 0, 0, errors.New("支付会话已过期")
	}
	return userId, amount, totalCents, nil
}

// PrepareWechatJSAPI 鉴权请求：生成网页授权跳转地址（带签名 state）。
func PrepareWechatJSAPI(c *gin.Context) {
	var req struct {
		Amount int64 `json:"amount"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	if !isWechatPayTopUpEnabled() || !setting.WechatPayJSAPI {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "未开启微信内支付"})
		return
	}
	if setting.WechatPayAppSecret == "" {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "未配置服务号 AppSecret"})
		return
	}
	if req.Amount < getMinTopup(0) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getMinTopup(0))})
		return
	}
	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getPayMoney(req.Amount, group, 0)
	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	totalCents := decimal.NewFromFloat(payMoney).Mul(decimal.NewFromInt(100)).Round(0).IntPart()
	state := buildJSAPIState(id, req.Amount, totalCents)
	redirectUri := wechatBaseUrl() + "/api/user/wechatpay/jsapi/callback"
	authorizeUrl := fmt.Sprintf(
		"https://open.weixin.qq.com/connect/oauth2/authorize?appid=%s&redirect_uri=%s&response_type=code&scope=snsapi_base&state=%s#wechat_redirect",
		url.QueryEscape(setting.WechatPayAppId), url.QueryEscape(redirectUri), url.QueryEscape(state))
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": gin.H{"authorize_url": authorizeUrl}})
}

func fetchWechatOpenId(ctx context.Context, code string) (string, error) {
	api := fmt.Sprintf("https://api.weixin.qq.com/sns/oauth2/access_token?appid=%s&secret=%s&code=%s&grant_type=authorization_code",
		url.QueryEscape(setting.WechatPayAppId), url.QueryEscape(setting.WechatPayAppSecret), url.QueryEscape(code))
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, api, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Openid  string `json:"openid"`
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := common.Unmarshal(body, &result); err != nil {
		return "", err
	}
	if result.Openid == "" {
		return "", fmt.Errorf("获取 openid 失败: %s", result.ErrMsg)
	}
	return result.Openid, nil
}

// WechatJSAPICallback 公开回调：网页授权返回后下单并调起微信内支付。
func WechatJSAPICallback(c *gin.Context) {
	ctx := c.Request.Context()
	code := c.Query("code")
	state := c.Query("state")
	if code == "" || state == "" {
		c.Data(http.StatusBadRequest, "text/html; charset=utf-8", []byte("<h3>缺少参数</h3>"))
		return
	}
	userId, amount, totalCents, err := parseJSAPIState(state)
	if err != nil {
		c.Data(http.StatusBadRequest, "text/html; charset=utf-8", []byte("<h3>"+err.Error()+"</h3>"))
		return
	}
	if !isWechatPayTopUpEnabled() || !setting.WechatPayJSAPI {
		c.Data(http.StatusForbidden, "text/html; charset=utf-8", []byte("<h3>未开启微信内支付</h3>"))
		return
	}
	client, _, privKey, err := ensureWechatPay(ctx)
	if err != nil {
		c.Data(http.StatusInternalServerError, "text/html; charset=utf-8", []byte("<h3>微信支付暂不可用</h3>"))
		return
	}
	openid, err := fetchWechatOpenId(ctx, code)
	if err != nil {
		logger.LogError(ctx, "微信支付 JSAPI 获取 openid 失败 error="+err.Error())
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte("<h3>获取用户信息失败，请重试</h3>"))
		return
	}

	tradeNo := wechatPayTradeNo(userId)
	payMoney := decimal.NewFromInt(totalCents).Div(decimal.NewFromInt(100)).InexactFloat64()
	svc := jsapi.JsapiApiService{Client: client}
	resp, _, err := svc.Prepay(ctx, jsapi.PrepayRequest{
		Appid:       core.String(setting.WechatPayAppId),
		Mchid:       core.String(setting.WechatPayMchId),
		Description: core.String(fmt.Sprintf("TUC%d", amount)),
		OutTradeNo:  core.String(tradeNo),
		NotifyUrl:   core.String(wechatNotifyUrl()),
		Amount:      &jsapi.Amount{Currency: core.String("CNY"), Total: core.Int64(totalCents)},
		Payer:       &jsapi.Payer{Openid: core.String(openid)},
	})
	if err != nil || resp == nil || resp.PrepayId == nil {
		logger.LogError(ctx, fmt.Sprintf("微信支付 JSAPI 下单失败 trade_no=%s error=%v", tradeNo, err))
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte("<h3>下单失败，请重试</h3>"))
		return
	}
	if err := insertWechatTopUp(userId, amount, payMoney, tradeNo); err != nil {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte("<h3>创建订单失败</h3>"))
		return
	}

	timeStamp := strconv.FormatInt(time.Now().Unix(), 10)
	nonceStr := common.GetRandomString(32)
	packageStr := "prepay_id=" + *resp.PrepayId
	signSource := setting.WechatPayAppId + "\n" + timeStamp + "\n" + nonceStr + "\n" + packageStr + "\n"
	paySign, err := utils.SignSHA256WithRSA(signSource, privKey)
	if err != nil {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte("<h3>签名失败</h3>"))
		return
	}

	returnUrl := wechatBaseUrl() + "/console/log?show_history=true"
	html := fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>微信支付</title></head><body style="text-align:center;padding-top:80px;font-family:sans-serif"><p>正在调起微信支付…</p><script>
function onBridgeReady(){WeixinJSBridge.invoke('getBrandWCPayRequest',{"appId":"%s","timeStamp":"%s","nonceStr":"%s","package":"%s","signType":"RSA","paySign":"%s"},function(res){if(res.err_msg=="get_brand_wcpay_request:ok"){location.href="%s";}else{document.body.innerHTML="<p>支付未完成，可返回重试</p>";}});}
if(typeof WeixinJSBridge=="undefined"){document.addEventListener('WeixinJSBridgeReady',onBridgeReady,false);}else{onBridgeReady();}
</script></body></html>`, setting.WechatPayAppId, timeStamp, nonceStr, packageStr, paySign, returnUrl)
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(html))
}

// WechatPayNotify 处理微信支付 APIv3 异步回调。
func WechatPayNotify(c *gin.Context) {
	ctx := c.Request.Context()
	if !isWechatPayTopUpEnabled() {
		logger.LogWarn(ctx, "微信支付 回调被拒绝 reason=disabled")
		c.JSON(http.StatusForbidden, gin.H{"code": "FAIL", "message": "未开启"})
		return
	}
	_, handler, _, err := ensureWechatPay(ctx)
	if err != nil {
		logger.LogError(ctx, "微信支付 回调初始化失败 error="+err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "处理失败"})
		return
	}

	transaction := new(payments.Transaction)
	_, err = handler.ParseNotifyRequest(ctx, c.Request, transaction)
	if err != nil {
		logger.LogWarn(ctx, "微信支付 回调验签失败 error="+err.Error())
		c.JSON(http.StatusBadRequest, gin.H{"code": "FAIL", "message": "验签失败"})
		return
	}
	if transaction.OutTradeNo == nil || transaction.TradeState == nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "FAIL", "message": "参数缺失"})
		return
	}
	tradeNo := *transaction.OutTradeNo
	state := *transaction.TradeState
	logger.LogInfo(ctx, fmt.Sprintf("微信支付 回调收到 trade_no=%s trade_state=%s", tradeNo, state))

	if state != "SUCCESS" {
		logger.LogInfo(ctx, fmt.Sprintf("微信支付 回调忽略非成功状态 trade_no=%s state=%s", tradeNo, state))
		c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "成功"})
		return
	}

	LockOrder(tradeNo)
	defer UnlockOrder(tradeNo)
	if err := model.RechargeOfficialOrder(tradeNo, model.PaymentProviderWechatPay, "微信支付", c.ClientIP()); err != nil {
		logger.LogError(ctx, fmt.Sprintf("微信支付 入账失败 trade_no=%s error=%q", tradeNo, err.Error()))
		c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "入账失败"})
		return
	}
	logger.LogInfo(ctx, "微信支付 入账成功 trade_no="+tradeNo)
	c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "成功"})
}

// GetTopUpStatus 供前端轮询订单状态（仅本人订单）。
func GetTopUpStatus(c *gin.Context) {
	tradeNo := c.Query("trade_no")
	if tradeNo == "" {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil || topUp.UserId != c.GetInt("id") {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "订单不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": gin.H{"status": topUp.Status}})
}

// isWechatPayConfigured 仅判断凭据是否齐全（不含合规与开关）。
func isWechatPayConfigured() bool {
	hasSerial := strings.TrimSpace(setting.WechatPayCert) != "" || strings.TrimSpace(setting.WechatPayCertSerialNo) != ""
	return setting.WechatPayAppId != "" && setting.WechatPayMchId != "" &&
		setting.WechatPayApiV3Key != "" && setting.WechatPayPrivateKey != "" && hasSerial
}
