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
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

// 内置微信公众号验证码登录：
// 网页生成验证码并展示 -> 用户在公众号内发送该码 -> 公众号回调匹配并绑定 openid ->
// 网页轮询确认后自动登录/注册或绑定，无需外部 wechat-server。

const (
	wechatMpCodeTTL       = 3 * time.Minute
	wechatMpConfirmTTL    = 2 * time.Minute
	wechatMpCodePrefix    = "wechat_mp_code:"
	wechatMpPendingMarker = "PENDING"
)

type wechatMpCodeEntry struct {
	openid    string
	confirmed bool
	expireAt  time.Time
}

var (
	wechatMpStore   = make(map[string]*wechatMpCodeEntry)
	wechatMpStoreMu sync.Mutex
)

func wechatMpCleanupLocked() {
	now := time.Now()
	for k, v := range wechatMpStore {
		if now.After(v.expireAt) {
			delete(wechatMpStore, k)
		}
	}
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
	common.ApiSuccess(c, gin.H{
		"code":   code,
		"qrcode": common.WeChatAccountQRCodeImageURL,
		"expire": int(wechatMpCodeTTL.Seconds()),
	})
}

// WeChatMpLoginCheck 轮询登录状态，确认后自动登录或注册。
func WeChatMpLoginCheck(c *gin.Context) {
	if !wechatMpLoginEnabled() {
		common.ApiErrorMsg(c, "管理员未开启微信登录")
		return
	}
	code := c.Query("code")
	openid, status := wechatMpCheckCode(code, false)
	if status != "confirmed" {
		common.ApiSuccess(c, gin.H{"status": status})
		return
	}

	user := model.User{WeChatId: openid}
	if model.IsWeChatIdAlreadyTaken(openid) {
		if err := user.FillUserByWeChatId(); err != nil {
			common.ApiError(c, err)
			return
		}
		if user.Id == 0 {
			common.ApiErrorMsg(c, "用户已注销")
			return
		}
	} else {
		if !common.RegisterEnabled {
			common.ApiErrorMsg(c, "管理员关闭了新用户注册")
			return
		}
		user.Username = "wechat_" + strconv.Itoa(model.GetMaxUserId()+1)
		user.DisplayName = "WeChat User"
		user.Role = common.RoleCommonUser
		user.Status = common.UserStatusEnabled
		if err := user.Insert(0); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	if user.Status != common.UserStatusEnabled {
		common.ApiErrorMsg(c, "用户已被封禁")
		return
	}
	wechatMpCheckCode(code, true)
	setupLogin(&user, c)
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
	common.ApiSuccess(c, gin.H{
		"code":   code,
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
	code := c.Query("code")
	openid, status := wechatMpCheckCode(code, false)
	if status != "confirmed" {
		common.ApiSuccess(c, gin.H{"status": status})
		return
	}
	if model.IsWeChatIdAlreadyTaken(openid) {
		common.ApiErrorMsg(c, "该微信账号已被绑定")
		return
	}
	session := sessions.Default(c)
	id := session.Get("id")
	if id == nil {
		common.ApiErrorMsg(c, "未登录")
		return
	}
	user := model.User{Id: id.(int)}
	if err := user.FillUserById(); err != nil {
		common.ApiError(c, err)
		return
	}
	user.WeChatId = openid
	if err := user.Update(false); err != nil {
		common.ApiError(c, err)
		return
	}
	wechatMpCheckCode(code, true)
	common.ApiSuccess(c, gin.H{"status": "bound"})
}
