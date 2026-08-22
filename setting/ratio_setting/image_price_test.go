package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// DALL·E 的尺寸/质量倍率原先硬编码在图片请求 DTO 里，迁成配置表后必须逐项等价，
// 否则存量 DALL·E 渠道会静默改价。期望值直接照搬旧硬编码：
// 尺寸 256→0.4 / 512→0.45 / 1024²→1 / 1024x1792→2，dall-e-3 的 hd 在 1024² 上再乘 2、
// 在 1024x1792 上再乘 1.5。
func TestGetImagePriceRatioPreservesLegacyDalleRatios(t *testing.T) {
	InitRatioSettings()

	const eps = 1e-9
	cases := []struct {
		name      string
		model     string
		shape     ImageRequestShape
		wantRatio float64
	}{
		{"dall-e-2 base", "dall-e-2", ImageRequestShape{Size: "1024x1024"}, 1},
		{"dall-e-2 256", "dall-e-2", ImageRequestShape{Size: "256x256"}, 0.4},
		{"dall-e-2 512", "dall-e-2", ImageRequestShape{Size: "512x512"}, 0.45},
		{"dall-e-3 base standard", "dall-e-3", ImageRequestShape{Size: "1024x1024", Quality: "standard"}, 1},
		{"dall-e-3 base without quality", "dall-e-3", ImageRequestShape{Size: "1024x1024"}, 1},
		{"dall-e-3 square hd", "dall-e-3", ImageRequestShape{Size: "1024x1024", Quality: "hd"}, 2},
		{"dall-e-3 portrait standard", "dall-e-3", ImageRequestShape{Size: "1024x1792", Quality: "standard"}, 2},
		{"dall-e-3 landscape standard", "dall-e-3", ImageRequestShape{Size: "1792x1024", Quality: "standard"}, 2},
		{"dall-e-3 portrait hd", "dall-e-3", ImageRequestShape{Size: "1024x1792", Quality: "hd"}, 3},
		{"dall-e-3 landscape hd", "dall-e-3", ImageRequestShape{Size: "1792x1024", Quality: "hd"}, 3},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ratio, ok := GetImagePriceRatio(c.model, c.shape)
			require.True(t, ok, "模型应有分档表")
			assert.InDelta(t, c.wantRatio, ratio, eps)
		})
	}
}

func TestGetImagePriceRatioWithoutConfig(t *testing.T) {
	InitRatioSettings()

	ratio, ok := GetImagePriceRatio("gpt-image-1", ImageRequestShape{Size: "1024x1024"})
	assert.False(t, ok, "未配置分档表的模型不应参与分档计价")
	assert.Zero(t, ratio)
}

// 尺寸按像素量级就近归档，而不是要求字面相等：厂商同一档下有多种长宽比。
func TestGetImagePriceRatioSnapsSizeByPixelCount(t *testing.T) {
	require.NoError(t, UpdateImagePriceByJSONString(`{
		"seedream": {
			"base_size": "2K",
			"base_price": 0.2,
			"tiers": [
				{"size": "1K", "price": 0.1},
				{"size": "4K", "price": 0.4}
			]
		}
	}`))
	t.Cleanup(InitRatioSettings)

	const eps = 1e-9
	cases := []struct {
		name      string
		size      string
		wantRatio float64
	}{
		{"档位名命中基准档", "2K", 1},
		{"基准档的具体尺寸", "2048x2048", 1},
		{"基准档的其他长宽比", "1536x2752", 1},
		{"档位名大小写与空格", " 4k ", 2},
		{"低档位具体尺寸", "1024x1024", 0.5},
		{"高档位具体尺寸", "4096x4096", 2},
		{"星号分隔", "1024*1024", 0.5},
		{"1K 与 2K 分界线之下", "1440x1440", 0.5},
		{"1K 与 2K 分界线之上", "1536x1536", 1},
		{"超出最高档按最高档计", "8192x8192", 2},
		{"尺寸缺失时不分档", "", 1},
		{"无法识别的尺寸不分档", "huge", 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ratio, ok := GetImagePriceRatio("seedream", ImageRequestShape{Size: c.size})
			require.True(t, ok)
			assert.InDelta(t, c.wantRatio, ratio, eps)
		})
	}
}

// 基准档尺寸必须参与就近归档：否则一个正好落在基准档的请求会被归到最近的已列档位，
// 静默按错误的档位计费（例如 1024x1024 被归到 512x512 而少收 55%）。
func TestGetImagePriceRatioKeepsBaseSizeAsSnapCandidate(t *testing.T) {
	require.NoError(t, UpdateImagePriceByJSONString(`{
		"only-small-tiers": {
			"base_size": "1024x1024",
			"base_price": 1,
			"tiers": [{"size": "512x512", "price": 0.45}]
		}
	}`))
	t.Cleanup(InitRatioSettings)

	ratio, ok := GetImagePriceRatio("only-small-tiers", ImageRequestShape{Size: "1024x1024"})
	require.True(t, ok)
	assert.InDelta(t, 1.0, ratio, 1e-9)
}

// 越具体的档优先，避免只限质量的档盖过同时限定尺寸和质量的档。
func TestGetImagePriceRatioPrefersMoreSpecificTier(t *testing.T) {
	require.NoError(t, UpdateImagePriceByJSONString(`{
		"mixed": {
			"base_size": "1024x1024",
			"base_price": 1,
			"tiers": [
				{"quality": "hd", "price": 1.5},
				{"size": "2048x2048", "price": 2},
				{"size": "2048x2048", "quality": "hd", "price": 4}
			]
		}
	}`))
	t.Cleanup(InitRatioSettings)

	const eps = 1e-9
	cases := []struct {
		name      string
		shape     ImageRequestShape
		wantRatio float64
	}{
		{"仅质量命中", ImageRequestShape{Size: "1024x1024", Quality: "hd"}, 1.5},
		{"仅尺寸命中", ImageRequestShape{Size: "2048x2048", Quality: "standard"}, 2},
		{"尺寸加质量优先", ImageRequestShape{Size: "2048x2048", Quality: "hd"}, 4},
		{"都不命中回落基准档", ImageRequestShape{Size: "1024x1024", Quality: "standard"}, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ratio, ok := GetImagePriceRatio("mixed", c.shape)
			require.True(t, ok)
			assert.InDelta(t, c.wantRatio, ratio, eps)
		})
	}
}

func TestUpdateImagePriceByJSONStringRejectsInvalidConfig(t *testing.T) {
	t.Cleanup(InitRatioSettings)

	cases := []struct {
		name string
		json string
	}{
		{"缺基准档单价", `{"m": {"base_size": "1K", "tiers": [{"size": "2K", "price": 2}]}}`},
		{"基准档单价为零", `{"m": {"base_size": "1K", "base_price": 0, "tiers": [{"size": "2K", "price": 2}]}}`},
		{"档位单价为零", `{"m": {"base_size": "1K", "base_price": 1, "tiers": [{"size": "2K", "price": 0}]}}`},
		{"档位单价为负", `{"m": {"base_size": "1K", "base_price": 1, "tiers": [{"size": "2K", "price": -1}]}}`},
		{"按尺寸分档却没填基准档尺寸", `{"m": {"base_price": 1, "tiers": [{"size": "2K", "price": 2}]}}`},
		{"基准档尺寸无法识别", `{"m": {"base_size": "big", "base_price": 1, "tiers": [{"size": "2K", "price": 2}]}}`},
		{"档位尺寸无法识别", `{"m": {"base_size": "1K", "base_price": 1, "tiers": [{"size": "huge", "price": 2}]}}`},
		{"不同写法的同一尺寸重复", `{"m": {"base_size": "1K", "base_price": 1, "tiers": [{"size": "2K", "price": 2}, {"size": "2048x2048", "price": 3}]}}`},
		{"完全相同的条件重复", `{"m": {"base_size": "1K", "base_price": 1, "tiers": [{"size": "2K", "quality": "hd", "price": 2}, {"size": "2K", "quality": "HD", "price": 3}]}}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Error(t, UpdateImagePriceByJSONString(c.json))
		})
	}
}

func TestUpdateImagePriceByJSONStringAcceptsQualityOnlyTable(t *testing.T) {
	t.Cleanup(InitRatioSettings)

	require.NoError(t, UpdateImagePriceByJSONString(`{
		"quality-only": {
			"base_price": 1,
			"tiers": [{"quality": "hd", "price": 2}]
		}
	}`))

	ratio, ok := GetImagePriceRatio("quality-only", ImageRequestShape{Quality: "hd"})
	require.True(t, ok)
	assert.InDelta(t, 2.0, ratio, 1e-9)
}
