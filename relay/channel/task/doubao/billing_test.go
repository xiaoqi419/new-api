package doubao

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetVideoInputRatio(t *testing.T) {
	const eps = 1e-9
	cases := []struct {
		name       string
		model      string
		resolution string
		hasVideo   bool
		wantRatio  float64
		wantOK     bool
	}{
		{"std 480p no-video is base", "doubao-seedance-2-0-260128", "480p", false, 1.0, true},
		{"std 720p no-video falls back to base", "doubao-seedance-2-0-260128", "720p", false, 1.0, true},
		{"std base with-video", "doubao-seedance-2-0-260128", "480p", true, 28.0 / 46.0, true},
		{"std 1080p no-video", "doubao-seedance-2-0-260128", "1080p", false, 51.0 / 46.0, true},
		{"std 1080p with-video", "doubao-seedance-2-0-260128", "1080p", true, 31.0 / 46.0, true},
		{"std 4k no-video", "doubao-seedance-2-0-260128", "4k", false, 26.0 / 46.0, true},
		{"std 4k with-video", "doubao-seedance-2-0-260128", "4k", true, 16.0 / 46.0, true},
		{"std blank resolution falls back to base", "doubao-seedance-2-0-260128", "", false, 1.0, true},
		{"fast base no-video", "doubao-seedance-2-0-fast-260128", "480p", false, 1.0, true},
		{"fast with-video", "doubao-seedance-2-0-fast-260128", "480p", true, 22.0 / 37.0, true},
		{"fast 1080p unsupported falls back to base", "doubao-seedance-2-0-fast-260128", "1080p", false, 1.0, true},
		{"unknown model returns not-ok", "gpt-4o", "1080p", true, 0, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ratio, ok := GetVideoInputRatio(c.model, c.resolution, c.hasVideo)
			assert.Equal(t, c.wantOK, ok)
			if c.wantOK {
				assert.InDelta(t, c.wantRatio, ratio, eps)
			}
		})
	}
}

func TestHasVideoInMetadata(t *testing.T) {
	cases := []struct {
		name     string
		metadata map[string]interface{}
		want     bool
	}{
		{"nil metadata", nil, false},
		{
			"content video_url type",
			map[string]interface{}{"content": []interface{}{
				map[string]interface{}{"type": "video_url", "video_url": map[string]interface{}{"url": "https://x/v.mp4"}},
			}},
			true,
		},
		{
			"content video_url key present",
			map[string]interface{}{"content": []interface{}{
				map[string]interface{}{"video_url": map[string]interface{}{"url": "https://x/v.mp4"}},
			}},
			true,
		},
		{
			"content only image",
			map[string]interface{}{"content": []interface{}{
				map[string]interface{}{"type": "image_url", "image_url": map[string]interface{}{"url": "https://x/i.jpg"}},
			}},
			false,
		},
		{"no content key", map[string]interface{}{"resolution": "1080p"}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Equal(t, c.want, hasVideoInMetadata(c.metadata))
		})
	}
}
