package ratio_setting

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/types"
)

// 图片生成模型的单价往往不是一个数：厂商按输出分辨率分档（例如 Seedream 的 1K/2K/4K），
// 部分模型还按质量档再分（例如 DALL·E 3 的 standard/hd）。系统每个模型只存一个按次固定
// 价格，因此这里额外配置一张分档价格表：管理员按厂商价目表原样填入各档单价，计费时取
// 该档单价/基准档单价 作为倍率乘到固定价格上。
//
// 单价单位不影响结果（只参与除法），填元或美元都可以，但同一个模型内必须统一。

// ImagePriceTier 描述一档图片价格：命中该档需要满足的请求特征，以及厂商公布的该档单价。
// Size 支持 "2K" 这类档位名和 "2048x2048" 这类具体尺寸；两个特征字段留空表示该档不限定
// 这个维度。
type ImagePriceTier struct {
	Size    string  `json:"size,omitempty"`
	Quality string  `json:"quality,omitempty"`
	Price   float64 `json:"price"`
}

// ImagePriceConfig 是单个模型的图片分档价格表。BasePrice 是基准档单价，也就是管理员
// 配置的按次固定价格所对应的那一档，Tiers 中不必重复列出基准档。
//
// BaseSize 是基准档对应的尺寸，必填（只要有任何一档限定了尺寸）。它不只是文档：尺寸是
// 按像素量级就近归档的，基准档尺寸必须参与归档候选，否则一个正好落在基准档的请求会被
// 归到最近的已列档位上，静默按错误的档位计费。
type ImagePriceConfig struct {
	BaseSize  string           `json:"base_size,omitempty"`
	BasePrice float64          `json:"base_price"`
	Tiers     []ImagePriceTier `json:"tiers,omitempty"`
}

// ImageRequestShape 描述一次图片生成请求中影响单价的维度。
type ImageRequestShape struct {
	Size    string
	Quality string
}

// 单边像素上限，用来挡住明显不合理的尺寸写法，同时保证像素数相乘不会溢出。
const maxImageSideLength = 1 << 16

var defaultImagePrice = map[string]ImagePriceConfig{
	// DALL·E 的尺寸/质量倍率原先硬编码在图片请求 DTO 里，这里原样迁成可配置的分档表。
	// 基准档是 1024x1024（DALL·E 3 为 standard 质量），倍率 1，所以不在 Tiers 里列出。
	"dall-e-2": {
		BaseSize:  "1024x1024",
		BasePrice: 1,
		Tiers: []ImagePriceTier{
			{Size: "256x256", Price: 0.4},
			{Size: "512x512", Price: 0.45},
		},
	},
	"dall-e-3": {
		BaseSize:  "1024x1024",
		BasePrice: 1,
		Tiers: []ImagePriceTier{
			{Size: "1024x1024", Quality: "hd", Price: 2},
			{Size: "1024x1792", Price: 2},
			{Size: "1024x1792", Quality: "hd", Price: 3},
		},
	},
}

var imagePriceMap = types.NewRWMap[string, ImagePriceConfig]()

func ImagePrice2JSONString() string {
	return imagePriceMap.MarshalJSONString()
}

func UpdateImagePriceByJSONString(jsonStr string) error {
	parsed := types.NewRWMap[string, ImagePriceConfig]()
	if err := types.LoadFromJsonString(parsed, jsonStr); err != nil {
		return err
	}
	for name, cfg := range parsed.ReadAll() {
		if err := validateImagePriceConfig(name, cfg); err != nil {
			return err
		}
	}
	return types.LoadFromJsonString(imagePriceMap, jsonStr)
}

func GetImagePriceCopy() map[string]ImagePriceConfig {
	return imagePriceMap.ReadAll()
}

func GetImagePriceConfig(modelName string) (ImagePriceConfig, bool) {
	cfg, ok := imagePriceMap.Get(modelName)
	if !ok || cfg.BasePrice <= 0 || len(cfg.Tiers) == 0 {
		return ImagePriceConfig{}, false
	}
	return cfg, true
}

// GetImagePriceRatio 返回模型在给定请求特征下相对基准档的倍率。
// 第二个返回值表示该模型是否配置了可用的分档价格表；倍率为 1.0 时调用方可忽略。
func GetImagePriceRatio(modelName string, shape ImageRequestShape) (float64, bool) {
	cfg, ok := GetImagePriceConfig(modelName)
	if !ok {
		return 0, false
	}

	quality := normalizeImageQuality(shape.Quality)
	snappedSize, hasSize := snapImageSizeToTier(cfg, shape.Size)

	// 越具体的档优先：同时限定尺寸和质量 > 只限定尺寸 > 只限定质量 > 基准档。
	// 保存时已拒绝重复条件，所以同一具体度上不会有两档同时命中。
	bestPrice := 0.0
	bestSpecificity := -1
	for _, tier := range cfg.Tiers {
		tierPixels, tierHasSize := imageSizePixels(tier.Size)
		if tierHasSize && (!hasSize || tierPixels != snappedSize) {
			continue
		}
		tierQuality := normalizeImageQuality(tier.Quality)
		if tierQuality != "" && tierQuality != quality {
			continue
		}

		specificity := 0
		if tierHasSize {
			specificity += 2
		}
		if tierQuality != "" {
			specificity++
		}
		if specificity > bestSpecificity {
			bestSpecificity = specificity
			bestPrice = tier.Price
		}
	}

	// 单价非正数在保存时已被拒绝，这里再兜一层，避免脏数据把请求算成免费或负数。
	if bestSpecificity < 0 || bestPrice <= 0 {
		return 1.0, true
	}
	return bestPrice / cfg.BasePrice, true
}

// snapImageSizeToTier 把请求尺寸归到价格表里像素量级最接近的那一档，返回该档的像素数。
//
// 按「就近」而不是「相等」归档，是因为厂商同一档下有多种长宽比：Seedream 的 2K 档既可能
// 是 2048x2048 也可能是 2560x1440，像素数和档位名对应的 2048² 并不相等。就近的分界线落在
// 相邻两档像素数的几何平均处；像素数同样接近时取更大的那一档，避免边界上少收费。
func snapImageSizeToTier(cfg ImagePriceConfig, size string) (int64, bool) {
	pixels, ok := imageSizePixels(size)
	if !ok {
		return 0, false
	}

	bestPixels := int64(0)
	bestCloseness := -1.0
	for _, candidate := range append([]ImagePriceTier{{Size: cfg.BaseSize}}, cfg.Tiers...) {
		candidatePixels, ok := imageSizePixels(candidate.Size)
		if !ok {
			continue
		}
		closeness := float64(min(pixels, candidatePixels)) / float64(max(pixels, candidatePixels))
		if closeness > bestCloseness || (closeness == bestCloseness && candidatePixels > bestPixels) {
			bestCloseness = closeness
			bestPixels = candidatePixels
		}
	}
	if bestPixels == 0 {
		return 0, false
	}
	return bestPixels, true
}

// imageSizePixels 把尺寸写法折算成像素总数，用于跨写法比较档位。
func imageSizePixels(size string) (int64, bool) {
	s := strings.ToLower(strings.TrimSpace(size))
	if s == "" {
		return 0, false
	}

	// "2K" 这类档位名：厂商用 nK 指代边长 n*1024 的方形像素量级。
	if digits, found := strings.CutSuffix(s, "k"); found {
		side, err := strconv.ParseInt(digits, 10, 64)
		if err != nil || side <= 0 || side*1024 > maxImageSideLength {
			return 0, false
		}
		side *= 1024
		return side * side, true
	}

	for _, separator := range []string{"x", "*", "×"} {
		rawWidth, rawHeight, found := strings.Cut(s, separator)
		if !found {
			continue
		}
		width, errWidth := strconv.ParseInt(strings.TrimSpace(rawWidth), 10, 64)
		height, errHeight := strconv.ParseInt(strings.TrimSpace(rawHeight), 10, 64)
		if errWidth != nil || errHeight != nil {
			return 0, false
		}
		if width <= 0 || height <= 0 || width > maxImageSideLength || height > maxImageSideLength {
			return 0, false
		}
		return width * height, true
	}
	return 0, false
}

func normalizeImageQuality(quality string) string {
	return strings.ToLower(strings.TrimSpace(quality))
}

func validateImagePriceConfig(modelName string, cfg ImagePriceConfig) error {
	if len(cfg.Tiers) == 0 {
		return nil
	}
	if cfg.BasePrice <= 0 {
		return fmt.Errorf("模型 %s 的图片分档价格缺少基准档单价", modelName)
	}

	usesSize := false
	for _, tier := range cfg.Tiers {
		if strings.TrimSpace(tier.Size) != "" {
			usesSize = true
			break
		}
	}
	if usesSize {
		if _, ok := imageSizePixels(cfg.BaseSize); !ok {
			return fmt.Errorf("模型 %s 的图片分档按尺寸区分，必须填写基准档尺寸（如 2K 或 1024x1024）", modelName)
		}
	}

	seen := make(map[[2]string]bool, len(cfg.Tiers))
	for _, tier := range cfg.Tiers {
		if tier.Price <= 0 {
			return fmt.Errorf("模型 %s 的图片分档单价必须大于 0", modelName)
		}
		key := [2]string{"", normalizeImageQuality(tier.Quality)}
		if strings.TrimSpace(tier.Size) != "" {
			pixels, ok := imageSizePixels(tier.Size)
			if !ok {
				return fmt.Errorf("模型 %s 的图片分档尺寸 %q 无法识别，请填 2K 或 2048x2048 这类写法", modelName, tier.Size)
			}
			key[0] = strconv.FormatInt(pixels, 10)
		}
		if seen[key] {
			return fmt.Errorf("模型 %s 的图片分档条件重复", modelName)
		}
		seen[key] = true
	}
	return nil
}
