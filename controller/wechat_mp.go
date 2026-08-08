package controller

import (
	"crypto/rand"
	"crypto/sha1"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// 内置微信公众号验证码登录：
// 网页生成验证码并展示 -> 用户在公众号内发送该码 -> 公众号回调匹配并绑定 openid ->
// 网页轮询确认后自动登录/注册或绑定，无需外部 wechat-server。

const (
	wechatMpCodeTTL    = 3 * time.Minute
	wechatMpConfirmTTL = 2 * time.Minute
	wechatMpCodePrefix = "wechat_mp_code:"
	// wechatMpPollPrefix 存放「轮询令牌 -> 验证码」的映射。浏览器只持有令牌，
	// 六位验证码仅用于用户手动发给公众号。两者分离是必要的：验证码只有 100 万种，
	// 且未确认的码会返回 pending，等于给出一个可枚举的在线码探测器，攻击者据此
	// 盯住某个码轮询就能在真实用户确认的瞬间抢先登录。令牌为 128 位随机量，
	// 无法枚举。
	wechatMpPollPrefix    = "wechat_mp_poll:"
	wechatMpPendingMarker = "PENDING"
)

type wechatMpCodeEntry struct {
	openid    string
	confirmed bool
	expireAt  time.Time
}

var (
	wechatMpStore   = make(map[string]*wechatMpCodeEntry)
	wechatMpPollMap = make(map[string]string)
	wechatMpStoreMu sync.Mutex
)

func wechatMpCleanupLocked() {
	now := time.Now()
	for k, v := range wechatMpStore {
		if now.After(v.expireAt) {
			delete(wechatMpStore, k)
		}
	}
	for token, code := range wechatMpPollMap {
		if _, ok := wechatMpStore[code]; !ok {
			delete(wechatMpPollMap, token)
		}
	}
}

// wechatMpIssuePollToken 为一个已生成的验证码签发浏览器侧轮询令牌。
func wechatMpIssuePollToken(code string) (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := hex.EncodeToString(buf)
	if common.RedisEnabled {
		if err := common.RedisSet(wechatMpPollPrefix+token, code, wechatMpCodeTTL); err != nil {
			return "", err
		}
		return token, nil
	}
	wechatMpStoreMu.Lock()
	defer wechatMpStoreMu.Unlock()
	wechatMpPollMap[token] = code
	return token, nil
}

// wechatMpCodeForToken 解出轮询令牌对应的验证码，令牌无效时返回空串。
func wechatMpCodeForToken(token string) string {
	if token == "" {
		return ""
	}
	if common.RedisEnabled {
		code, err := common.RedisGet(wechatMpPollPrefix + token)
		if err != nil {
			return ""
		}
		return code
	}
	wechatMpStoreMu.Lock()
	defer wechatMpStoreMu.Unlock()
	return wechatMpPollMap[token]
}

// wechatMpDropPollToken 在登录/绑定完成后作废令牌，避免同一张票被重复使用。
func wechatMpDropPollToken(token string) {
	if token == "" {
		return
	}
	if common.RedisEnabled {
		_ = common.RedisDel(wechatMpPollPrefix + token)
		return
	}
	wechatMpStoreMu.Lock()
	defer wechatMpStoreMu.Unlock()
	delete(wechatMpPollMap, token)
}

// wechatMpStoreCode 写入一个待确认的验证码，已存在返回 false。
func wechatMpStoreCode(code string) bool {
	if common.RedisEnabled {
		if _, err := common.RedisGet(wechatMpCodePrefix + code); err == nil {
			return false
		}
		if err := common.RedisSet(wechatMpCodePrefix+code, wechatMpPendingMarker, wechatMpCodeTTL); err != nil {
			return false
		}
		return true
	}
	wechatMpStoreMu.Lock()
	defer wechatMpStoreMu.Unlock()
	wechatMpCleanupLocked()
	if _, ok := wechatMpStore[code]; ok {
		return false
	}
	wechatMpStore[code] = &wechatMpCodeEntry{expireAt: time.Now().Add(wechatMpCodeTTL)}
	return true
}

func wechatMpGenerateCode() (string, error) {
	for i := 0; i < 5; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(1000000))
		if err != nil {
			return "", err
		}
		code := fmt.Sprintf("%06d", n.Int64())
		if wechatMpStoreCode(code) {
			return code, nil
		}
	}
	return "", errors.New("生成验证码失败，请重试")
}

// wechatMpConfirmCode 在收到公众号消息时，将待确认的验证码绑定到 openid。
func wechatMpConfirmCode(code, openid string) bool {
	if code == "" || openid == "" {
		return false
	}
	if common.RedisEnabled {
		val, err := common.RedisGet(wechatMpCodePrefix + code)
		if err != nil || val == "" {
			return false
		}
		if val != wechatMpPendingMarker {
			return true // 已确认，幂等
		}
		if err := common.RedisSet(wechatMpCodePrefix+code, openid, wechatMpConfirmTTL); err != nil {
			return false
		}
		return true
	}
	wechatMpStoreMu.Lock()
	defer wechatMpStoreMu.Unlock()
	entry, ok := wechatMpStore[code]
	if !ok || time.Now().After(entry.expireAt) {
		return false
	}
	entry.openid = openid
	entry.confirmed = true
	entry.expireAt = time.Now().Add(wechatMpConfirmTTL)
	return true
}

// wechatMpCheckCode 查询验证码状态，consume 为 true 时确认后删除。
// 返回 (openid, status)，status 为 "pending" | "confirmed" | "expired"。
func wechatMpCheckCode(code string, consume bool) (string, string) {
	if code == "" {
		return "", "expired"
	}
	if common.RedisEnabled {
		val, err := common.RedisGet(wechatMpCodePrefix + code)
		if err != nil || val == "" {
			return "", "expired"
		}
		if val == wechatMpPendingMarker {
			return "", "pending"
		}
		if consume {
			_ = common.RedisDel(wechatMpCodePrefix + code)
		}
		return val, "confirmed"
	}
	wechatMpStoreMu.Lock()
	defer wechatMpStoreMu.Unlock()
	wechatMpCleanupLocked()
	entry, ok := wechatMpStore[code]
	if !ok || time.Now().After(entry.expireAt) {
		return "", "expired"
	}
	if !entry.confirmed {
		return "", "pending"
	}
	openid := entry.openid
	if consume {
		delete(wechatMpStore, code)
	}
	return openid, "confirmed"
}

func wechatMpCheckSignature(c *gin.Context) bool {
	if common.WeChatMpToken == "" {
		return false
	}
	signature := c.Query("signature")
	timestamp := c.Query("timestamp")
	nonce := c.Query("nonce")
	arr := []string{common.WeChatMpToken, timestamp, nonce}
	sort.Strings(arr)
	h := sha1.New()
	_, _ = io.WriteString(h, strings.Join(arr, ""))
	return signature == hex.EncodeToString(h.Sum(nil))
}

type wechatMpMessage struct {
	XMLName      xml.Name `xml:"xml"`
	ToUserName   string   `xml:"ToUserName"`
	FromUserName string   `xml:"FromUserName"`
	MsgType      string   `xml:"MsgType"`
	Content      string   `xml:"Content"`
	Event        string   `xml:"Event"`
}

func wechatMpReplyText(c *gin.Context, toUser, fromUser, content string) {
	if content == "" {
		c.String(http.StatusOK, "success")
		return
	}
	reply := fmt.Sprintf(
		"<xml><ToUserName><![CDATA[%s]]></ToUserName><FromUserName><![CDATA[%s]]></FromUserName><CreateTime>%d</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[%s]]></Content></xml>",
		toUser, fromUser, time.Now().Unix(), content,
	)
	c.String(http.StatusOK, reply)
}

// WeChatMpVerify 处理微信服务器接入校验（GET）。
func WeChatMpVerify(c *gin.Context) {
	if !wechatMpCheckSignature(c) {
		c.String(http.StatusOK, "")
		return
	}
	c.String(http.StatusOK, c.Query("echostr"))
}

// WeChatMpMessage 处理公众号推送的消息（POST）。
func WeChatMpMessage(c *gin.Context) {
	if !wechatMpCheckSignature(c) {
		c.String(http.StatusOK, "")
		return
	}
	body, err := c.GetRawData()
	if err != nil {
		c.String(http.StatusOK, "success")
		return
	}
	var msg wechatMpMessage
	if err := xml.Unmarshal(body, &msg); err != nil {
		c.String(http.StatusOK, "success")
		return
	}
	switch msg.MsgType {
	case "text":
		code := strings.TrimSpace(msg.Content)
		if wechatMpConfirmCode(code, msg.FromUserName) {
			wechatMpReplyText(c, msg.FromUserName, msg.ToUserName, "验证成功，请返回网页继续操作。")
		} else {
			wechatMpReplyText(c, msg.FromUserName, msg.ToUserName, "验证码无效或已过期，请在网页重新获取。")
		}
	case "event":
		if msg.Event == "subscribe" {
			wechatMpReplyText(c, msg.FromUserName, msg.ToUserName, "欢迎关注！请发送网页上显示的验证码完成登录。")
		} else {
			c.String(http.StatusOK, "success")
		}
	default:
		c.String(http.StatusOK, "success")
	}
}

func wechatMpLoginEnabled() bool {
	return common.WeChatAuthEnabled && common.WeChatMpToken != ""
}

// WeChatMpLoginCode 生成登录验证码供网页展示。
func WeChatMpLoginCode(c *gin.Context) {
	if !wechatMpLoginEnabled() {
		common.ApiErrorMsg(c, "管理员未开启微信登录")
		return
	}
	code, err := wechatMpGenerateCode()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := wechatMpIssuePollToken(code)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"code":   code,
		"token":  token,
		"qrcode": common.WeChatAccountQRCodeImageURL,
		"expire": int(wechatMpCodeTTL.Seconds()),
	})
}

// wechatMpConfirmedOpenid 校验浏览器持有的轮询令牌，返回已确认的 openid。
// 第二个返回值为面向调用方的状态：确认之外的情况都不该继续往下走。
func wechatMpConfirmedOpenid(token string) (string, string) {
	code := wechatMpCodeForToken(token)
	if code == "" {
		return "", "expired"
	}
	return wechatMpCheckCode(code, false)
}

// wechatMpFinishLogin 消费掉验证码与令牌后建立会话。
func wechatMpFinishLogin(c *gin.Context, user *model.User, token string) {
	if user.Status != common.UserStatusEnabled {
		common.ApiErrorMsg(c, "用户已被封禁")
		return
	}
	if code := wechatMpCodeForToken(token); code != "" {
		wechatMpCheckCode(code, true)
	}
	wechatMpDropPollToken(token)
	setupLogin(user, c)
}

// WeChatMpLoginCheck 轮询登录状态。openid 已绑定账号则直接登录；未绑定时返回
// unbound 交由前端询问用户是绑定已有账号还是新建账号，不再静默注册一个陌生号。
func WeChatMpLoginCheck(c *gin.Context) {
	if !wechatMpLoginEnabled() {
		common.ApiErrorMsg(c, "管理员未开启微信登录")
		return
	}
	token := c.Query("token")
	openid, status := wechatMpConfirmedOpenid(token)
	if status != "confirmed" {
		common.ApiSuccess(c, gin.H{"status": status})
		return
	}
	if !model.IsWeChatIdAlreadyTaken(openid) {
		common.ApiSuccess(c, gin.H{
			"status":           "unbound",
			"register_enabled": common.RegisterEnabled,
		})
		return
	}
	user := model.User{WeChatId: openid}
	if err := user.FillUserByWeChatId(); err != nil {
		common.ApiError(c, err)
		return
	}
	if user.Id == 0 {
		common.ApiErrorMsg(c, "用户已注销")
		return
	}
	wechatMpFinishLogin(c, &user, token)
}

// WeChatMpLoginRegister 在用户选择「创建新账号」后建号并登录。
func WeChatMpLoginRegister(c *gin.Context) {
	if !wechatMpLoginEnabled() {
		common.ApiErrorMsg(c, "管理员未开启微信登录")
		return
	}
	var req struct {
		Token string `json:"token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	openid, status := wechatMpConfirmedOpenid(req.Token)
	if status != "confirmed" {
		common.ApiErrorMsg(c, "登录已过期，请重新扫码")
		return
	}
	if !common.RegisterEnabled {
		common.ApiErrorMsg(c, "管理员关闭了新用户注册")
		return
	}
	if model.IsWeChatIdAlreadyTaken(openid) {
		common.ApiErrorMsg(c, "该微信已绑定账号，请重新扫码登录")
		return
	}
	user := model.User{
		WeChatId:    openid,
		Username:    "wechat_" + strconv.Itoa(model.GetMaxUserId()+1),
		DisplayName: "WeChat User",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	if err := user.Insert(0); err != nil {
		common.ApiError(c, err)
		return
	}
	wechatMpFinishLogin(c, &user, req.Token)
}

// WeChatMpLoginBindVerification 向待绑定的已有账号邮箱发送验证码。
// 与找回密码一致，无论邮箱是否注册都回成功，避免把接口变成账号枚举工具；
// 「已绑定其他微信」也照发，该提示留到验证码校验通过后再给，只让证明了邮箱
// 所有权的人看到。
func WeChatMpLoginBindVerification(c *gin.Context) {
	if !wechatMpLoginEnabled() {
		common.ApiErrorMsg(c, "管理员未开启微信登录")
		return
	}
	if _, status := wechatMpConfirmedOpenid(c.Query("token")); status != "confirmed" {
		common.ApiErrorMsg(c, "登录已过期，请重新扫码")
		return
	}
	email := model.NormalizeEmail(c.Query("email"))
	if err := common.Validate.Var(email, "required,email"); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if _, err := model.GetUniqueUserByEmail(email); err == nil {
		code := common.GenerateVerificationCode(6)
		common.RegisterVerificationCodeWithKey(email, code, common.WeChatBindPurpose)
		subject := fmt.Sprintf("%s微信绑定验证", common.SystemName)
		content := fmt.Sprintf("<p>您好，你正在把微信绑定到 %s 的这个账号。</p>"+
			"<p>您的验证码为: <strong>%s</strong></p>"+
			"<p>验证码 %d 分钟内有效，如果不是本人操作，请忽略本邮件。</p>",
			common.SystemName, code, common.VerificationValidMinutes)
		if err := common.SendEmail(subject, email, content); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	common.ApiSuccess(c, nil)
}

// WeChatMpLoginBind 在用户选择「绑定已有账号」并通过邮箱验证码后完成绑定并登录。
func WeChatMpLoginBind(c *gin.Context) {
	if !wechatMpLoginEnabled() {
		common.ApiErrorMsg(c, "管理员未开启微信登录")
		return
	}
	var req struct {
		Token string `json:"token"`
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	openid, status := wechatMpConfirmedOpenid(req.Token)
	if status != "confirmed" {
		common.ApiErrorMsg(c, "登录已过期，请重新扫码")
		return
	}
	email := model.NormalizeEmail(req.Email)
	if !common.VerifyAndConsumeCodeWithKey(email, req.Code, common.WeChatBindPurpose) {
		common.ApiErrorMsg(c, "验证码错误或已过期")
		return
	}
	user, err := model.GetUniqueUserByEmail(email)
	if err != nil {
		common.ApiErrorMsg(c, "该邮箱未注册")
		return
	}
	if user.WeChatId != "" {
		common.ApiErrorMsg(c, "该账号已绑定其他微信，请先在个人中心解绑")
		return
	}
	// openid 可能在用户填验证码这段时间里被别处绑走，绑定前重新确认一次。
	if model.IsWeChatIdAlreadyTaken(openid) {
		common.ApiErrorMsg(c, "该微信已绑定其他账号")
		return
	}
	if err := model.BindWeChatIdToUser(user.Id, openid); err != nil {
		common.ApiError(c, err)
		return
	}
	user.WeChatId = openid
	wechatMpFinishLogin(c, user, req.Token)
}

// WeChatMpBindCode 生成绑定验证码（已登录用户）。
func WeChatMpBindCode(c *gin.Context) {
	if common.WeChatMpToken == "" {
		common.ApiErrorMsg(c, "管理员未配置微信公众号")
		return
	}
	code, err := wechatMpGenerateCode()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := wechatMpIssuePollToken(code)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"code":   code,
		"token":  token,
		"qrcode": common.WeChatAccountQRCodeImageURL,
		"expire": int(wechatMpCodeTTL.Seconds()),
	})
}

// WeChatMpBindCheck 轮询绑定状态，确认后写入当前用户的微信 openid。
func WeChatMpBindCheck(c *gin.Context) {
	if common.WeChatMpToken == "" {
		common.ApiErrorMsg(c, "管理员未配置微信公众号")
		return
	}
	token := c.Query("token")
	openid, status := wechatMpConfirmedOpenid(token)
	if status != "confirmed" {
		common.ApiSuccess(c, gin.H{"status": status})
		return
	}
	if model.IsWeChatIdAlreadyTaken(openid) {
		common.ApiErrorMsg(c, "该微信账号已被绑定")
		return
	}
	id := c.GetInt("id")
	if id == 0 {
		common.ApiErrorMsg(c, "未登录")
		return
	}
	if err := model.BindWeChatIdToUser(id, openid); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if code := wechatMpCodeForToken(token); code != "" {
		wechatMpCheckCode(code, true)
	}
	wechatMpDropPollToken(token)
	common.ApiSuccess(c, gin.H{"status": "bound"})
}
