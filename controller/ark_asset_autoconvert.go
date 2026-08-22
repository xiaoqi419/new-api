package controller

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/gin-gonic/gin"
)

const arkAssetAutoConvertedKey = "ark_asset_auto_converted"

// arkAssetActiveTimeout 自动入库时等待素材变为 Active 的上限。
const arkAssetActiveTimeout = 90 * time.Second

// isArkPrivacyBlocked 判断任务错误是否为火山"输入图疑似真人"的内容拦截
// （InputImageSensitiveContentDetected.PrivacyInformation）。
func isArkPrivacyBlocked(taskErr *dto.TaskError) bool {
	if taskErr == nil || taskErr.LocalError {
		return false
	}
	return strings.Contains(taskErr.Message, "InputImageSensitiveContentDetected")
}

// autoConvertArkAssetsOnPrivacyBlock 在视频提交被"真人"拦截后，把请求体中的真人原图 URL
// 自动入库（CreateAsset）换成 asset:// 引用，并改写请求体供重试。
// 使用与视频同一渠道的 AK/SK，保证素材与视频在同一火山账号 / 项目下，asset:// 才可解析。
// 返回 true 表示已改写至少一张图，可重试一次。
func autoConvertArkAssetsOnPrivacyBlock(c *gin.Context, info *relaycommon.RelayInfo) bool {
	if c.GetBool(arkAssetAutoConvertedKey) {
		return false
	}

	ch, err := model.GetChannelById(info.ChannelId, true)
	if err != nil || ch == nil {
		return false
	}
	s := ch.GetSetting()
	if s.VolcAssetAK == "" || s.VolcAssetSK == "" {
		return false
	}

	userId := info.UserId
	if userId == 0 {
		userId = c.GetInt("id")
	}

	var body map[string]any
	if err := common.UnmarshalBodyReusable(c, &body); err != nil {
		return false
	}

	ctx := c.Request.Context()
	converted := 0
	rewrite := func(rawURL string) (string, bool) {
		u := strings.TrimSpace(rawURL)
		if u == "" || strings.HasPrefix(u, "asset://") {
			return rawURL, false
		}
		if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
			return rawURL, false
		}
		assetID, aerr := ensureArkAssetForURL(ctx, ch, userId, u)
		if aerr != nil || assetID == "" {
			logger.LogError(c, "ark asset auto-convert failed for image: "+aerr.Error())
			return rawURL, false
		}
		return "asset://" + assetID, true
	}

	if md, ok := body["metadata"].(map[string]any); ok {
		if content, ok := md["content"].([]any); ok {
			for _, it := range content {
				item, ok := it.(map[string]any)
				if !ok || item["type"] != "image_url" {
					continue
				}
				iu, ok := item["image_url"].(map[string]any)
				if !ok {
					continue
				}
				if urlStr, ok := iu["url"].(string); ok {
					if newURL, changed := rewrite(urlStr); changed {
						iu["url"] = newURL
						converted++
					}
				}
			}
		}
	}

	if imgs, ok := body["images"].([]any); ok {
		for i, v := range imgs {
			if urlStr, ok := v.(string); ok {
				if newURL, changed := rewrite(urlStr); changed {
					imgs[i] = newURL
					converted++
				}
			}
		}
	}

	if urlStr, ok := body["image"].(string); ok {
		if newURL, changed := rewrite(urlStr); changed {
			body["image"] = newURL
			converted++
		}
	}

	if converted == 0 {
		return false
	}

	newBody, err := common.Marshal(body)
	if err != nil {
		return false
	}
	c.Set(common.KeyRequestBody, newBody)
	c.Set(common.KeyBodyStorage, nil)
	c.Set(arkAssetAutoConvertedKey, true)
	logger.LogInfo(c, fmt.Sprintf("ark asset auto-convert: uploaded %d image(s) to asset library, retrying with asset://", converted))
	return true
}

// ensureArkAssetForURL 复用或创建某图片 URL 对应的素材，轮询至 Active，返回 asset-id。
func ensureArkAssetForURL(ctx context.Context, ch *model.Channel, userId int, imageURL string) (string, error) {
	if existing, err := model.GetUserVolcAssetByUrl(userId, imageURL); err == nil && existing != nil &&
		existing.Status == "Active" && existing.AssetId != "" {
		return existing.AssetId, nil
	}

	groupID, err := ensureUserArkGroup(ctx, ch, userId)
	if err != nil {
		return "", err
	}

	result, err := arkAssetLibCall(ctx, ch, "CreateAsset", map[string]any{
		"GroupId":   groupID,
		"URL":       imageURL,
		"AssetType": "Image",
		"Name":      "auto",
	})
	if err != nil {
		return "", err
	}
	assetID, _ := result["Id"].(string)
	if assetID == "" {
		return "", fmt.Errorf("create asset returned empty id")
	}

	asset := &model.VolcAsset{
		UserId:    userId,
		ChannelId: ch.Id,
		GroupId:   groupID,
		AssetId:   assetID,
		Name:      "auto",
		AssetType: "Image",
		Status:    "Processing",
		Url:       imageURL,
	}
	_ = asset.Insert()

	deadline := time.Now().Add(arkAssetActiveTimeout)
	for time.Now().Before(deadline) {
		r, gerr := arkAssetLibCall(ctx, ch, "GetAsset", map[string]any{"Id": assetID})
		if gerr == nil && r != nil {
			status, _ := r["Status"].(string)
			if status == "Active" {
				_ = model.UpdateVolcAssetStatus(asset.Id, status, "")
				return assetID, nil
			}
			if status == "Failed" {
				_ = model.UpdateVolcAssetStatus(asset.Id, status, "")
				return "", fmt.Errorf("asset processing failed")
			}
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return "", fmt.Errorf("asset not active before timeout")
}
