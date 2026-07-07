package controller

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/volcengine"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func arkAssetLibError(c *gin.Context, msg string) {
	c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
}

// resolveUserArkAssetChannel 通过 sentinel 模型按用户分组选出与视频共用的 DoubaoVideo 渠道，
// 并校验其已配置火山素材库 AK/SK。
func resolveUserArkAssetChannel(userGroup string) (*model.Channel, error) {
	ch, err := model.GetRandomSatisfiedChannel(userGroup, middleware.ArkAssetSentinelModel, 0, "/ark/")
	if err != nil || ch == nil {
		return nil, fmt.Errorf("未找到可用的豆包视频素材库渠道（请在渠道里加入 %s 模型并配置 AK/SK）", middleware.ArkAssetSentinelModel)
	}
	s := ch.GetSetting()
	if s.VolcAssetAK == "" || s.VolcAssetSK == "" {
		return nil, fmt.Errorf("渠道未配置火山素材库 AK/SK")
	}
	return ch, nil
}

// arkAssetLibCall 用渠道 AK/SK 对火山素材库 Action 做 V4 签名并调用，返回解析后的 Result。
func arkAssetLibCall(ctx context.Context, ch *model.Channel, action string, body map[string]any) (map[string]any, error) {
	s := ch.GetSetting()
	projectName := s.VolcProjectName
	if projectName == "" {
		projectName = "default"
	}
	if body == nil {
		body = map[string]any{}
	}
	body["ProjectName"] = projectName
	bodyBytes, err := common.Marshal(body)
	if err != nil {
		return nil, err
	}
	upstreamURL := fmt.Sprintf("https://open.volcengineapi.com/?Action=%s&Version=2024-01-01", url.QueryEscape(action))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, upstreamURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	volcengine.SignRequestV4(req, bodyBytes, s.VolcAssetAK, s.VolcAssetSK, "cn-beijing", "ark")

	client := service.GetHttpClient()
	if s.Proxy != "" {
		if proxied, perr := service.GetHttpClientWithProxy(s.Proxy); perr == nil && proxied != nil {
			client = proxied
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var parsed map[string]any
	if err := common.Unmarshal(respBytes, &parsed); err != nil {
		return nil, fmt.Errorf("解析上游响应失败")
	}
	if meta, ok := parsed["ResponseMetadata"].(map[string]any); ok {
		if errObj, ok := meta["Error"].(map[string]any); ok {
			msg, _ := errObj["Message"].(string)
			if msg == "" {
				msg = "上游返回错误"
			}
			return nil, fmt.Errorf("%s", msg)
		}
	}
	result, _ := parsed["Result"].(map[string]any)
	return result, nil
}

// ensureUserArkGroup 取（或惰性创建）当前用户专属的素材组，用于隔离。
func ensureUserArkGroup(ctx context.Context, ch *model.Channel, userId int) (string, error) {
	if g, err := model.GetUserVolcAssetGroup(userId); err == nil && g != nil && g.GroupId != "" {
		return g.GroupId, nil
	}
	result, err := arkAssetLibCall(ctx, ch, "CreateAssetGroup", map[string]any{
		"Name":        fmt.Sprintf("ulib-%d", userId),
		"Description": fmt.Sprintf("user %d asset library", userId),
		"GroupType":   "AIGC",
	})
	if err != nil {
		return "", err
	}
	groupId, _ := result["Id"].(string)
	if groupId == "" {
		return "", fmt.Errorf("创建素材组失败：未返回 Id")
	}
	s := ch.GetSetting()
	projectName := s.VolcProjectName
	if projectName == "" {
		projectName = "default"
	}
	_ = model.SaveUserVolcAssetGroup(&model.VolcAssetGroup{
		UserId:      userId,
		ChannelId:   ch.Id,
		GroupId:     groupId,
		ProjectName: projectName,
	})
	return groupId, nil
}

// ArkAssetLibraryList 列出当前用户的素材库（本地归属），并刷新未就绪素材的状态。
func ArkAssetLibraryList(c *gin.Context) {
	userId := c.GetInt("id")
	assets, err := model.GetUserVolcAssets(userId)
	if err != nil {
		arkAssetLibError(c, err.Error())
		return
	}
	var ch *model.Channel
	for _, a := range assets {
		if a.Status == "Active" || a.Status == "Failed" {
			continue
		}
		if ch == nil {
			user, uerr := model.GetUserById(userId, false)
			if uerr != nil {
				break
			}
			ch, err = resolveUserArkAssetChannel(user.Group)
			if err != nil {
				break
			}
		}
		result, gerr := arkAssetLibCall(c.Request.Context(), ch, "GetAsset", map[string]any{"Id": a.AssetId})
		if gerr != nil || result == nil {
			continue
		}
		status, _ := result["Status"].(string)
		urlStr, _ := result["Url"].(string)
		if status != "" && status != a.Status {
			_ = model.UpdateVolcAssetStatus(a.Id, status, urlStr)
			a.Status = status
			if urlStr != "" {
				a.Url = urlStr
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": assets})
}

// ArkAssetLibraryCreate 添加一个人脸/形象素材（公网图片 URL）。
func ArkAssetLibraryCreate(c *gin.Context) {
	userId := c.GetInt("id")
	var req struct {
		Name      string `json:"name"`
		Url       string `json:"url"`
		AssetType string `json:"asset_type"`
	}
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		arkAssetLibError(c, "请求体解析失败")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Url = strings.TrimSpace(req.Url)
	if req.Url == "" || !(strings.HasPrefix(req.Url, "http://") || strings.HasPrefix(req.Url, "https://")) {
		arkAssetLibError(c, "请提供公网可访问的图片 URL（http/https）")
		return
	}
	if req.AssetType == "" {
		req.AssetType = "Image"
	}
	if req.Name == "" {
		req.Name = "asset"
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		arkAssetLibError(c, "用户不存在")
		return
	}
	ch, err := resolveUserArkAssetChannel(user.Group)
	if err != nil {
		arkAssetLibError(c, err.Error())
		return
	}
	groupId, err := ensureUserArkGroup(c.Request.Context(), ch, userId)
	if err != nil {
		arkAssetLibError(c, err.Error())
		return
	}
	result, err := arkAssetLibCall(c.Request.Context(), ch, "CreateAsset", map[string]any{
		"GroupId":   groupId,
		"URL":       req.Url,
		"AssetType": req.AssetType,
		"Name":      req.Name,
	})
	if err != nil {
		arkAssetLibError(c, err.Error())
		return
	}
	assetId, _ := result["Id"].(string)
	if assetId == "" {
		arkAssetLibError(c, "创建素材失败：未返回 Id")
		return
	}
	asset := &model.VolcAsset{
		UserId:    userId,
		ChannelId: ch.Id,
		GroupId:   groupId,
		AssetId:   assetId,
		Name:      req.Name,
		AssetType: req.AssetType,
		Status:    "Processing",
		Url:       req.Url,
	}
	if err := asset.Insert(); err != nil {
		arkAssetLibError(c, "本地保存失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": asset})
}

// ArkAssetLibraryDelete 删除当前用户的某个素材。
func ArkAssetLibraryDelete(c *gin.Context) {
	userId := c.GetInt("id")
	assetId := c.Param("asset_id")
	a, err := model.GetUserVolcAssetByAssetId(userId, assetId)
	if err != nil || a == nil {
		arkAssetLibError(c, "素材不存在")
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		arkAssetLibError(c, "用户不存在")
		return
	}
	ch, err := resolveUserArkAssetChannel(user.Group)
	if err != nil {
		arkAssetLibError(c, err.Error())
		return
	}
	if _, err := arkAssetLibCall(c.Request.Context(), ch, "DeleteAsset", map[string]any{"Id": assetId}); err != nil {
		arkAssetLibError(c, err.Error())
		return
	}
	_ = model.DeleteUserVolcAsset(userId, assetId)
	c.JSON(http.StatusOK, gin.H{"success": true})
}
