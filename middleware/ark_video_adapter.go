package middleware

import (
	"bytes"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/gin-gonic/gin"
)

// ArkVideoResponseFormatKey 标记本次请求需以火山官方 Ark 视频格式输出响应。
const ArkVideoResponseFormatKey = "relay_response_format"
const ArkVideoResponseFormatValue = "ark"

// ArkVideoRequestConvert 把下游“火山官方 Ark 视频格式”请求
// (POST /ark/api/v3/contents/generations/tasks，body: {model, content[], duration, resolution, ratio, ...})
// 转换为内部统一格式 {model, prompt, metadata}，并重写到 /v1/video/generations 复用既有视频中转管线；
// 同时标记响应以 Ark 原生格式输出。GET 查询重写到内部 fetch 路径，下游与火山官方完全一致。
func ArkVideoRequestConvert() func(c *gin.Context) {
	return func(c *gin.Context) {
		c.Set(ArkVideoResponseFormatKey, ArkVideoResponseFormatValue)

		if c.Request.Method == http.MethodGet {
			taskID := c.Param("id")
			if taskID == "" {
				abortWithOpenAiMessage(c, http.StatusBadRequest, "task id is required")
				return
			}
			c.Request.URL.Path = "/v1/video/generations/" + taskID
			c.Set("task_id", taskID)
			c.Set("relay_mode", relayconstant.RelayModeVideoFetchByID)
			c.Next()
			return
		}

		var bodyBytes []byte
		if c.Request.Body != nil {
			b, err := io.ReadAll(c.Request.Body)
			if err != nil {
				abortWithOpenAiMessage(c, http.StatusBadRequest, "failed to read request body")
				return
			}
			_ = c.Request.Body.Close()
			bodyBytes = b
		}

		var body map[string]interface{}
		if len(bodyBytes) > 0 {
			if err := common.Unmarshal(bodyBytes, &body); err != nil {
				abortWithOpenAiMessage(c, http.StatusBadRequest, "Invalid request body")
				return
			}
		}
		if body == nil {
			body = map[string]interface{}{}
		}

		modelName, _ := body["model"].(string)
		unified := map[string]interface{}{
			"model":    modelName,
			"prompt":   extractArkPromptText(body["content"]),
			"metadata": body,
		}
		jsonData, err := common.Marshal(unified)
		if err != nil {
			abortWithOpenAiMessage(c, http.StatusInternalServerError, "Failed to marshal request body")
			return
		}

		c.Request.Body = io.NopCloser(bytes.NewBuffer(jsonData))
		c.Request.ContentLength = int64(len(jsonData))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set(common.KeyRequestBody, jsonData)
		c.Set(common.KeyBodyStorage, nil)
		c.Request.URL.Path = "/v1/video/generations"
		c.Next()
	}
}

// extractArkPromptText 从 Ark content[] 中抽取并拼接所有 text 片段作为 prompt。
func extractArkPromptText(content interface{}) string {
	items, ok := content.([]interface{})
	if !ok {
		return ""
	}
	var parts []string
	for _, it := range items {
		m, ok := it.(map[string]interface{})
		if !ok {
			continue
		}
		if m["type"] == "text" {
			if t, ok := m["text"].(string); ok && t != "" {
				parts = append(parts, t)
			}
		}
	}
	return strings.Join(parts, "\n")
}
