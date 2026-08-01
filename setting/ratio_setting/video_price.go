package ratio_setting

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/types"
)

// 视频生成模型的单价往往不是一个数：厂商会按输出分辨率、输入是否含视频、输出是否有声
// 分成好几档（例如豆包 Seedance 2.0 的 480p/720p 46 元、1080p 51 元，含视频输入再打到
// 28/31 元）。系统每个模型只存一个模型倍率，因此这里额外配置一张分档价格表：管理员按厂商
// 价目表原样填入各档单价，计费时取 该档单价/基准档单价 作为倍率乘到模型倍率上。
//
// 单价单位不影响结果（只参与除法），填元或美元都可以，但同一个模型内必须统一。

// VideoPriceTier 描述一档视频价格：命中该档需要满足的请求特征，以及厂商公布的该档单价。
// 三个特征字段留空/false 表示该档不限定这个维度。
type VideoPriceTier struct {
	Resolution string  `json:"resolution,omitempty"`
	HasVideo   bool    `json:"has_video,omitempty"`
	HasAudio   bool    `json:"has_audio,omitempty"`
	Price      float64 `json:"price"`
}

// VideoPriceConfig 是单个模型的视频分档价格表。BasePrice 是基准档单价，
// 也就是管理员配置的模型倍率所对应的那一档，Tiers 中不必重复列出基准档。
type VideoPriceConfig struct {
	BasePrice float64          `json:"base_price"`
	Tiers     []VideoPriceTier `json:"tiers,omitempty"`
}

// VideoRequestShape 描述一次视频生成请求中影响单价的维度，由各视频适配器从请求里解析后传入。
type VideoRequestShape struct {
	Resolution string
	HasVideo   bool
	HasAudio   bool
}

// 分档维度标识，随分档表一起返回给模型广场，前端据此决定展示哪几列。
const (
	VideoPriceAxisResolution  = "resolution"
	VideoPriceAxisVideoInput  = "video_input"
	VideoPriceAxisAudioOutput = "audio_output"
)

// 默认值来自火山方舟官方价目表（元/百万 token）。单价相同、不分档的模型（如
// Seedance 1.0 pro）不需要出现在这里，只配模型倍率即可。
var defaultVideoPrice = map[string]VideoPriceConfig{
	"doubao-seedance-2-0-260128": {
		BasePrice: 46,
		Tiers: []VideoPriceTier{
			{HasVideo: true, Price: 28},
			{Resolution: "1080p", Price: 51},
			{Resolution: "1080p", HasVideo: true, Price: 31},
			{Resolution: "4k", Price: 26},
			{Resolution: "4k", HasVideo: true, Price: 16},
		},
	},
	"doubao-seedance-2-0-fast-260128": {
		BasePrice: 37,
		Tiers:     []VideoPriceTier{{HasVideo: true, Price: 22}},
	},
	"doubao-seedance-2-0-mini-260615": {
		BasePrice: 23,
		Tiers:     []VideoPriceTier{{HasVideo: true, Price: 14}},
	},
	// 1.5 pro 按输出是否有声定价，基准档取无声：上游 generate_audio 不传时默认不出声。
	"doubao-seedance-1-5-pro-251215": {
		BasePrice: 8,
		Tiers:     []VideoPriceTier{{HasAudio: true, Price: 16}},
	},
}

var videoPriceMap = types.NewRWMap[string, VideoPriceConfig]()

func VideoPrice2JSONString() string {
	return videoPriceMap.MarshalJSONString()
}

func UpdateVideoPriceByJSONString(jsonStr string) error {
	parsed := types.NewRWMap[string, VideoPriceConfig]()
	if err := types.LoadFromJsonString(parsed, jsonStr); err != nil {
		return err
	}
	for name, cfg := range parsed.ReadAll() {
		if err := validateVideoPriceConfig(name, cfg); err != nil {
			return err
		}
	}
	return types.LoadFromJsonString(videoPriceMap, jsonStr)
}

func GetVideoPriceCopy() map[string]VideoPriceConfig {
	return videoPriceMap.ReadAll()
}

func GetVideoPriceConfig(modelName string) (VideoPriceConfig, bool) {
	cfg, ok := videoPriceMap.Get(modelName)
	if !ok || cfg.BasePrice <= 0 || len(cfg.Tiers) == 0 {
		return VideoPriceConfig{}, false
	}
	return cfg, true
}

// GetVideoPriceRatio 返回模型在给定请求特征下相对基准档的倍率。
// 第二个返回值表示该模型是否配置了可用的分档价格表；倍率为 1.0 时调用方可忽略。
func GetVideoPriceRatio(modelName string, shape VideoRequestShape) (float64, bool) {
	cfg, ok := GetVideoPriceConfig(modelName)
	if !ok {
		return 0, false
	}
	want := matchableVideoShape(cfg, shape)
	for _, tier := range cfg.Tiers {
		if normalizeVideoResolution(tier.Resolution) != want.Resolution ||
			tier.HasVideo != want.HasVideo || tier.HasAudio != want.HasAudio {
			continue
		}
		// 单价非正数在保存时已被拒绝，这里再兜一层，避免脏数据把请求算成免费或负数。
		if tier.Price <= 0 {
			return 1.0, true
		}
		return tier.Price / cfg.BasePrice, true
	}
	return 1.0, true
}

// VideoPriceAxes 返回该价格表实际分档的维度。
func VideoPriceAxes(cfg VideoPriceConfig) []string {
	axes := make([]string, 0, 3)
	if videoPriceUsesResolution(cfg) {
		axes = append(axes, VideoPriceAxisResolution)
	}
	for _, tier := range cfg.Tiers {
		if tier.HasVideo {
			axes = append(axes, VideoPriceAxisVideoInput)
			break
		}
	}
	for _, tier := range cfg.Tiers {
		if tier.HasAudio {
			axes = append(axes, VideoPriceAxisAudioOutput)
			break
		}
	}
	return axes
}

// matchableVideoShape 把请求特征裁剪成只保留该价格表真正分档的维度。
// 厂商可能支持某个参数却不按它定价——豆包 2.0 支持 generate_audio，但价格只随分辨率和
// 是否含视频输入变化。若把未分档的维度也带进匹配条件，一个「含视频且开了声音」的请求会
// 匹配不到任何一档而回落到基准价，把本该生效的折扣静默打丢。
func matchableVideoShape(cfg VideoPriceConfig, shape VideoRequestShape) VideoPriceTier {
	var want VideoPriceTier
	resolution := normalizeVideoResolution(shape.Resolution)
	for _, tier := range cfg.Tiers {
		if normalizeVideoResolution(tier.Resolution) == resolution && resolution != "" {
			want.Resolution = resolution
		}
		if tier.HasVideo {
			want.HasVideo = shape.HasVideo
		}
		if tier.HasAudio {
			want.HasAudio = shape.HasAudio
		}
	}
	return want
}

func videoPriceUsesResolution(cfg VideoPriceConfig) bool {
	for _, tier := range cfg.Tiers {
		if normalizeVideoResolution(tier.Resolution) != "" {
			return true
		}
	}
	return false
}

func normalizeVideoResolution(resolution string) string {
	return strings.ToLower(strings.TrimSpace(resolution))
}

func validateVideoPriceConfig(modelName string, cfg VideoPriceConfig) error {
	if len(cfg.Tiers) == 0 {
		return nil
	}
	if cfg.BasePrice <= 0 {
		return fmt.Errorf("模型 %s 的视频分档价格缺少基准档单价", modelName)
	}
	seen := make(map[VideoPriceTier]bool, len(cfg.Tiers))
	for _, tier := range cfg.Tiers {
		if tier.Price <= 0 {
			return fmt.Errorf("模型 %s 的视频分档单价必须大于 0", modelName)
		}
		key := VideoPriceTier{
			Resolution: normalizeVideoResolution(tier.Resolution),
			HasVideo:   tier.HasVideo,
			HasAudio:   tier.HasAudio,
		}
		if seen[key] {
			return fmt.Errorf("模型 %s 的视频分档条件重复", modelName)
		}
		seen[key] = true
	}
	return nil
}
