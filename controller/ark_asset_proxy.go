package controller

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/relay/channel/volcengine"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const (
	arkAssetUpstreamHost = "https://open.volcengineapi.com"
	arkAssetRegion       = "cn-beijing"
	arkAssetService      = "ark"
	arkAssetDefaultVer   = "2024-01-01"
	arkAssetDefaultProj  = "default"
)

// arkAssetAllowedActions 仅放行 AIGC 私域素材库管理类 Action；
// 真人/活体等其它 Action 一律拒绝（与“仅虚拟人像 AIGC、无活体”策略一致）。
var arkAssetAllowedActions = map[string]bool{
	"CreateAssetGroup": true,
	"CreateAsset":      true,
	"GetAsset":         true,
	"ListAssets":       true,
	"ListAssetGroups":  true,
	"GetAssetGroup":    true,
	"UpdateAssetGroup": true,
	"UpdateAsset":      true,
	"DeleteAsset":      true,
	"DeleteAssetGroup": true,
}

func arkAssetError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"error": gin.H{"message": message, "type": "ark_asset_proxy_error"}})
}

// ArkAssetProxy 火山私域素材库代理。
//
// 下游用 Bearer sk-xxx 调 POST /ark/?Action=..&Version=..；本函数取所选渠道的 AK/SK
// 做火山 V4 签名后转发到 open.volcengineapi.com，响应体原样回传。
// 仅放行白名单 Action；缺省注入 ProjectName 做项目隔离，CreateAssetGroup 强制 AIGC。
func ArkAssetProxy(c *gin.Context) {
	action := c.Query("Action")
	if action == "" {
		arkAssetError(c, http.StatusBadRequest, "Action query parameter is required")
		return
	}
	if !arkAssetAllowedActions[action] {
		arkAssetError(c, http.StatusForbidden, fmt.Sprintf("Action %s is not allowed", action))
		return
	}
	version := c.Query("Version")
	if version == "" {
		version = arkAssetDefaultVer
	}

	settingAny, ok := common.GetContextKey(c, constant.ContextKeyChannelSetting)
	if !ok {
		arkAssetError(c, http.StatusInternalServerError, "channel setting missing")
		return
	}
	setting, ok := settingAny.(dto.ChannelSettings)
	if !ok {
		arkAssetError(c, http.StatusInternalServerError, "invalid channel setting")
		return
	}
	if setting.VolcAssetAK == "" || setting.VolcAssetSK == "" {
		arkAssetError(c, http.StatusBadRequest, "channel is missing Volc asset AK/SK; configure them on the DoubaoVideo channel")
		return
	}
	projectName := setting.VolcProjectName
	if projectName == "" {
		projectName = arkAssetDefaultProj
	}

	var bodyBytes []byte
	if v, ok := c.Get(middleware.ArkAssetOriginalBodyKey); ok && v != nil {
		if b, ok := v.([]byte); ok {
			bodyBytes = b
		}
	}
	bodyBytes = arkAssetInjectDefaults(bodyBytes, action, projectName)

	upstreamURL := fmt.Sprintf("%s/?Action=%s&Version=%s",
		arkAssetUpstreamHost, url.QueryEscape(action), url.QueryEscape(version))
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, upstreamURL, bytes.NewReader(bodyBytes))
	if err != nil {
		arkAssetError(c, http.StatusInternalServerError, "failed to build upstream request")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	volcengine.SignRequestV4(req, bodyBytes, setting.VolcAssetAK, setting.VolcAssetSK, arkAssetRegion, arkAssetService)

	client := service.GetHttpClient()
	if setting.Proxy != "" {
		if proxied, perr := service.GetHttpClientWithProxy(setting.Proxy); perr == nil && proxied != nil {
			client = proxied
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		logger.LogError(c, fmt.Sprintf("ark asset proxy upstream error (action=%s): %s", action, err.Error()))
		arkAssetError(c, http.StatusBadGateway, "upstream request failed")
		return
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		arkAssetError(c, http.StatusBadGateway, "failed to read upstream response")
		return
	}

	userId := common.GetContextKeyInt(c, constant.ContextKeyUserId)
	logger.LogInfo(c, fmt.Sprintf("ark asset proxy: user=%d action=%s project=%s status=%d", userId, action, projectName, resp.StatusCode))

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	c.Data(resp.StatusCode, contentType, respBody)
}

// arkAssetInjectDefaults 在 body 为 JSON 对象时缺省注入 ProjectName（不存在才注入，便于按需指定），
// 并在 CreateAssetGroup 时强制 GroupType=AIGC（仅虚拟人像，禁止真人组）。
func arkAssetInjectDefaults(bodyBytes []byte, action, projectName string) []byte {
	var m map[string]any
	if len(bytes.TrimSpace(bodyBytes)) == 0 {
		m = map[string]any{}
	} else if err := common.Unmarshal(bodyBytes, &m); err != nil {
		return bodyBytes
	}
	if v, ok := m["ProjectName"]; !ok || v == "" {
		m["ProjectName"] = projectName
	}
	if action == "CreateAssetGroup" {
		m["GroupType"] = "AIGC"
	}
	out, err := common.Marshal(m)
	if err != nil {
		return bodyBytes
	}
	return out
}
