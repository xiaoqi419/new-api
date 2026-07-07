package doubao

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetVideoBillingRatio(t *testing.T) {
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
		{"std 720p no-video is base", "doubao-seedance-2-0-260128", "720p", false, 1.0, true},
		{"std 720p with-video", "doubao-seedance-2-0-260128", "720p", true, 28.0 / 46.0, true},
		{"std 1080p no-video", "doubao-seedance-2-0-260128", "1080p", false, 51.0 / 46.0, true},
		{"std 1080p with-video", "doubao-seedance-2-0-260128", "1080p", true, 31.0 / 46.0, true},
		{"std 4k no-video", "doubao-seedance-2-0-260128", "4k", false, 26.0 / 46.0, true},
		{"std 4k with-video", "doubao-seedance-2-0-260128", "4k", true, 16.0 / 46.0, true},
		{"std blank resolution falls back to base", "doubao-seedance-2-0-260128", "", false, 1.0, true},
		{"fast base no-video", "doubao-seedance-2-0-fast-260128", "720p", false, 1.0, true},
		{"fast with-video", "doubao-seedance-2-0-fast-260128", "480p", true, 22.0 / 37.0, true},
		{"fast 1080p unsupported falls back to base", "doubao-seedance-2-0-fast-260128", "1080p", false, 1.0, true},
		{"mini with-video", "doubao-seedance-2-0-mini", "720p", true, 14.0 / 23.0, true},
		{"unknown model returns not-ok", "gpt-4o", "1080p", true, 0, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ratio, ok := GetVideoBillingRatio(c.model, c.resolution, c.hasVideo)
			assert.Equal(t, c.wantOK, ok)
			if c.wantOK {
				assert.InDelta(t, c.wantRatio, ratio, eps)
			}
		})
	}
}

func TestHasVideoInput(t *testing.T) {
	cases := []struct {
		name     string
		metadata map[string]interface{}
		want     bool
	}{
		{"nil metadata", nil, false},
		{"top-level video_url string", map[string]interface{}{"video_url": "https://x/v.mp4"}, true},
		{"top-level video_url empty string", map[string]interface{}{"video_url": ""}, false},
		{"top-level video object url", map[string]interface{}{"video": map[string]interface{}{"url": "https://x/v.mp4"}}, true},
		{"top-level video object empty url", map[string]interface{}{"video": map[string]interface{}{"url": ""}}, false},
		{
			"content video_url object",
			map[string]interface{}{"content": []interface{}{
				map[string]interface{}{"type": "video_url", "video_url": map[string]interface{}{"url": "https://x/v.mp4"}},
			}},
			true,
		},
		{
			"content video_url empty url",
			map[string]interface{}{"content": []interface{}{
				map[string]interface{}{"type": "video_url", "video_url": map[string]interface{}{"url": ""}},
			}},
			false,
		},
		{
			"content only image",
			map[string]interface{}{"content": []interface{}{
				map[string]interface{}{"type": "image_url", "image_url": map[string]interface{}{"url": "https://x/i.jpg"}},
			}},
			false,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Equal(t, c.want, hasVideoInput(c.metadata))
		})
	}
}

func TestResolutionFromMetadata(t *testing.T) {
	assert.Equal(t, "720p", resolutionFromMetadata(nil))
	assert.Equal(t, "720p", resolutionFromMetadata(map[string]interface{}{}))
	assert.Equal(t, "720p", resolutionFromMetadata(map[string]interface{}{"resolution": "   "}))
	assert.Equal(t, "1080p", resolutionFromMetadata(map[string]interface{}{"resolution": "1080p"}))
}
