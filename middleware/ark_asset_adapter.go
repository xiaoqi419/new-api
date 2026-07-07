package middleware

import (
	"bytes"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// ArkAssetSentinelModel 素材库管理类请求没有 model 字段，
// 用固定 sentinel 模型名让 Distribute() 选到与视频共用的同一个 DoubaoVideo 渠道（同 key、同 AK/SK）。
// 管理员需把该模型名加入对应 DoubaoVideo 渠道的模型列表。
const ArkAssetSentinelModel = "doubao-seedance-asset"

// ArkAssetOriginalBodyKey 暂存下游原始请求体，供 controller 原样签名转发。
const ArkAssetOriginalBodyKey = "ark_asset_original_body"

// ArkAssetRequestConvert 在进入 TokenAuth/Distribute 之前执行：
// 暂存下游原始请求体，并用 sentinel 模型替换“路由用”请求体，
// 从而复用现有“按模型选渠道”逻辑，同时不污染转发给火山的原始 body。
func ArkAssetRequestConvert() func(c *gin.Context) {
	return func(c *gin.Context) {
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
		c.Set(ArkAssetOriginalBodyKey, bodyBytes)

		routingBody := []byte(`{"model":"` + ArkAssetSentinelModel + `"}`)
		c.Request.Body = io.NopCloser(bytes.NewBuffer(routingBody))
		c.Request.ContentLength = int64(len(routingBody))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set(common.KeyRequestBody, routingBody)
		// 清掉可能存在的 body 缓存，确保 Distribute 读到 sentinel 而非原始 body。
		c.Set(common.KeyBodyStorage, nil)
		c.Next()
	}
}
