package doubao

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

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

func TestGeneratesAudioInMetadata(t *testing.T) {
	cases := []struct {
		name     string
		metadata map[string]interface{}
		want     bool
	}{
		{"nil metadata", nil, false},
		{"absent means silent", map[string]interface{}{"resolution": "720p"}, false},
		{"bool true", map[string]interface{}{"generate_audio": true}, true},
		{"bool false", map[string]interface{}{"generate_audio": false}, false},
		{"string true", map[string]interface{}{"generate_audio": "true"}, true},
		{"string mixed case", map[string]interface{}{"generate_audio": "True"}, true},
		{"string false", map[string]interface{}{"generate_audio": "false"}, false},
		{"unsupported type", map[string]interface{}{"generate_audio": 1}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Equal(t, c.want, generatesAudioInMetadata(c.metadata))
		})
	}
}
