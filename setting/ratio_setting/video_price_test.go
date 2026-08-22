package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetVideoPriceRatioWithDefaults(t *testing.T) {
	InitRatioSettings()

	const eps = 1e-9
	cases := []struct {
		name      string
		model     string
		shape     VideoRequestShape
		wantRatio float64
		wantOK    bool
	}{
		{"2.0 base 480p", "doubao-seedance-2-0-260128", VideoRequestShape{Resolution: "480p"}, 1.0, true},
		{"2.0 720p shares base tier", "doubao-seedance-2-0-260128", VideoRequestShape{Resolution: "720p"}, 1.0, true},
		{"2.0 blank resolution is base", "doubao-seedance-2-0-260128", VideoRequestShape{}, 1.0, true},
		{"2.0 with video", "doubao-seedance-2-0-260128", VideoRequestShape{Resolution: "480p", HasVideo: true}, 28.0 / 46.0, true},
		{"2.0 1080p", "doubao-seedance-2-0-260128", VideoRequestShape{Resolution: "1080p"}, 51.0 / 46.0, true},
		{"2.0 1080p with video", "doubao-seedance-2-0-260128", VideoRequestShape{Resolution: "1080p", HasVideo: true}, 31.0 / 46.0, true},
		{"2.0 4k", "doubao-seedance-2-0-260128", VideoRequestShape{Resolution: "4k"}, 26.0 / 46.0, true},
		{"2.0 4k with video", "doubao-seedance-2-0-260128", VideoRequestShape{Resolution: "4k", HasVideo: true}, 16.0 / 46.0, true},
		{"2.0 resolution case insensitive", "doubao-seedance-2-0-260128", VideoRequestShape{Resolution: " 4K "}, 26.0 / 46.0, true},
		{"fast base", "doubao-seedance-2-0-fast-260128", VideoRequestShape{Resolution: "480p"}, 1.0, true},
		{"fast with video", "doubao-seedance-2-0-fast-260128", VideoRequestShape{Resolution: "480p", HasVideo: true}, 22.0 / 37.0, true},
		{"fast unsupported 1080p falls back to base", "doubao-seedance-2-0-fast-260128", VideoRequestShape{Resolution: "1080p"}, 1.0, true},
		{"mini base", "doubao-seedance-2-0-mini-260615", VideoRequestShape{Resolution: "720p"}, 1.0, true},
		{"mini with video", "doubao-seedance-2-0-mini-260615", VideoRequestShape{Resolution: "720p", HasVideo: true}, 14.0 / 23.0, true},
		{"1.5 pro silent is base", "doubao-seedance-1-5-pro-251215", VideoRequestShape{Resolution: "1080p"}, 1.0, true},
		{"1.5 pro with audio doubles", "doubao-seedance-1-5-pro-251215", VideoRequestShape{HasAudio: true}, 2.0, true},
		{"model without tier table", "doubao-seedance-1-0-pro-250528", VideoRequestShape{HasVideo: true}, 0, false},
		{"unknown model", "gpt-4o", VideoRequestShape{Resolution: "1080p", HasVideo: true}, 0, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ratio, ok := GetVideoPriceRatio(c.model, c.shape)
			assert.Equal(t, c.wantOK, ok)
			if c.wantOK {
				assert.InDelta(t, c.wantRatio, ratio, eps)
			}
		})
	}
}

// Seedance 2.0 支持 generate_audio，但官方不按有声无声定价。若匹配时把未分档的维度也
// 带上，含视频输入的请求就会匹配不到任何一档而回落到基准价，把 39% 的折扣静默打丢。
func TestGetVideoPriceRatioIgnoresUnpricedDimensions(t *testing.T) {
	InitRatioSettings()

	ratio, ok := GetVideoPriceRatio("doubao-seedance-2-0-260128", VideoRequestShape{
		Resolution: "1080p",
		HasVideo:   true,
		HasAudio:   true,
	})
	require.True(t, ok)
	assert.InDelta(t, 31.0/46.0, ratio, 1e-9)

	// 反向：1.5 pro 只按有声分档，请求里的分辨率与视频输入不应影响档位。
	ratio, ok = GetVideoPriceRatio("doubao-seedance-1-5-pro-251215", VideoRequestShape{
		Resolution: "1080p",
		HasVideo:   true,
		HasAudio:   true,
	})
	require.True(t, ok)
	assert.InDelta(t, 2.0, ratio, 1e-9)
}

func TestUpdateVideoPriceByJSONString(t *testing.T) {
	t.Cleanup(InitRatioSettings)

	require.NoError(t, UpdateVideoPriceByJSONString(`{
		"my-video-model": {"base_price": 10, "tiers": [{"has_video": true, "price": 6}]}
	}`))
	ratio, ok := GetVideoPriceRatio("my-video-model", VideoRequestShape{HasVideo: true})
	require.True(t, ok)
	assert.InDelta(t, 0.6, ratio, 1e-9)

	// 覆盖式保存：旧模型不再出现在 JSON 里就应当失效，避免删掉的档位仍在计费。
	_, ok = GetVideoPriceRatio("doubao-seedance-2-0-260128", VideoRequestShape{HasVideo: true})
	assert.False(t, ok)

	rejected := []struct {
		name string
		json string
	}{
		{"missing base price", `{"m": {"tiers": [{"has_video": true, "price": 6}]}}`},
		{"zero tier price", `{"m": {"base_price": 10, "tiers": [{"has_video": true, "price": 0}]}}`},
		{"negative tier price", `{"m": {"base_price": 10, "tiers": [{"has_video": true, "price": -6}]}}`},
		{"duplicate conditions", `{"m": {"base_price": 10, "tiers": [{"resolution": "4k", "price": 6}, {"resolution": "4K", "price": 7}]}}`},
		{"malformed json", `{`},
	}
	for _, c := range rejected {
		t.Run(c.name, func(t *testing.T) {
			assert.Error(t, UpdateVideoPriceByJSONString(c.json))
			// 校验失败必须整份拒绝，不能把前半部分写进去形成半套价格。
			_, ok := GetVideoPriceRatio("m", VideoRequestShape{HasVideo: true})
			assert.False(t, ok)
		})
	}
}

func TestVideoPriceAxes(t *testing.T) {
	InitRatioSettings()

	cfg, ok := GetVideoPriceConfig("doubao-seedance-2-0-260128")
	require.True(t, ok)
	assert.Equal(t, []string{VideoPriceAxisResolution, VideoPriceAxisVideoInput}, VideoPriceAxes(cfg))

	cfg, ok = GetVideoPriceConfig("doubao-seedance-1-5-pro-251215")
	require.True(t, ok)
	assert.Equal(t, []string{VideoPriceAxisAudioOutput}, VideoPriceAxes(cfg))
}
