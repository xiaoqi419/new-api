package doubao

import "strings"

var ModelList = []string{
	"doubao-seedance-1-0-pro-250528",
	"doubao-seedance-1-0-lite-t2v",
	"doubao-seedance-1-0-lite-i2v",
	"doubao-seedance-1-5-pro-251215",
	"doubao-seedance-2-0-260128",
	"doubao-seedance-2-0-fast-260128",
}

var ChannelName = "doubao-video"

// seedancePrice 火山官方 Seedance 2.0 在线推理单价（元/百万 token），
// 按 (模型, 输出分辨率档, 输入是否含视频) 区分。管理员只需把 ModelRatio 配成
// “基础档(480p/720p)、输入不含视频”的单价，系统据此表自动追加相对 OtherRatio，
// 无需为每个分辨率/输入形态单独配置。数据来源见 docs/seedance-2.0-接入方案.md §六。
// 每档为 [不含视频单价, 含视频单价]。
var seedancePrice = map[string]map[string][2]float64{
	"doubao-seedance-2-0-260128": {
		"base":  {46, 28}, // 480p / 720p
		"1080p": {51, 31},
		"4k":    {26, 16},
	},
	"doubao-seedance-2-0-fast-260128": {
		"base": {37, 22}, // 不支持 1080p / 4k
	},
	"doubao-seedance-2-0-mini": {
		"base": {23, 14}, // 不支持 1080p / 4k
	},
}

// resolutionBucket 把分辨率归一到价格档位；未知或缺省视为基础档。
func resolutionBucket(resolution string) string {
	switch strings.ToLower(strings.TrimSpace(resolution)) {
	case "1080p":
		return "1080p"
	case "4k", "2160p":
		return "4k"
	default: // 480p / 720p / 空 → 基础档
		return "base"
	}
}

// GetVideoBillingRatio 返回相对基础档(480p/720p、不含视频)的计费倍率。
// ok=false 表示该模型未配置动态价格表，调用方应回退到默认 token×倍率。
func GetVideoBillingRatio(modelName, resolution string, hasVideoInput bool) (float64, bool) {
	tiers, ok := seedancePrice[modelName]
	if !ok {
		return 0, false
	}
	base, ok := tiers["base"]
	if !ok || base[0] <= 0 {
		return 0, false
	}
	tier, ok := tiers[resolutionBucket(resolution)]
	if !ok {
		tier = base
	}
	price := tier[0]
	if hasVideoInput {
		price = tier[1]
	}
	return price / base[0], true
}

// resolutionFromMetadata 从请求 metadata 读取输出分辨率；缺省 720p（与官方默认一致）。
func resolutionFromMetadata(metadata map[string]interface{}) string {
	if metadata != nil {
		if r, ok := metadata["resolution"].(string); ok && strings.TrimSpace(r) != "" {
			return r
		}
	}
	return "720p"
}

// hasVideoInput 判断请求是否包含视频输入（据此选择含视频档单价）。
// 兼容顶层 video_url / video 以及 content[] 中 type=video_url 的条目，并校验值非空，
// 避免空 url 误判为视频输入、或官方顶层媒体请求被漏判。
func hasVideoInput(metadata map[string]interface{}) bool {
	if metadata == nil {
		return false
	}
	if nonEmptyMedia(metadata["video_url"]) || nonEmptyMedia(metadata["video"]) {
		return true
	}
	content, ok := metadata["content"].([]interface{})
	if !ok {
		return false
	}
	for _, item := range content {
		im, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		if im["type"] == "video_url" && nonEmptyMedia(im["video_url"]) {
			return true
		}
	}
	return false
}

// nonEmptyMedia 判断媒体字段是否为可用值：非空字符串，或含非空 url 的对象。
func nonEmptyMedia(v interface{}) bool {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t) != ""
	case map[string]interface{}:
		if u, ok := t["url"].(string); ok {
			return strings.TrimSpace(u) != ""
		}
	}
	return false
}
