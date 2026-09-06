package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeLocaleCanonicalizesSupportedLocales(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
		ok    bool
	}{
		{name: "english", input: "en", want: "en", ok: true},
		{name: "simplified chinese", input: " zh-cn ", want: "zh-CN", ok: true},
		{name: "traditional chinese", input: "ZH-TW", want: "zh-TW", ok: true},
		{name: "japanese", input: "ja", want: "ja", ok: true},
		{name: "unsupported", input: "fr", want: "", ok: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, ok := normalizeLocale(test.input)
			assert.Equal(t, test.ok, ok)
			assert.Equal(t, test.want, got)
		})
	}
}

func TestGetUpstreamURLsUsesCanonicalLocalePath(t *testing.T) {
	t.Setenv("SYNC_UPSTREAM_BASE", "https://example.test/metadata/")

	modelsURL, vendorsURL := getUpstreamURLs("zh-cn")
	require.Equal(t, "https://example.test/metadata/api/i18n/zh-CN/newapi/models.json", modelsURL)
	assert.Equal(t, "https://example.test/metadata/api/i18n/zh-CN/newapi/vendors.json", vendorsURL)

	modelsURL, vendorsURL = getUpstreamURLs("fr")
	assert.Equal(t, "https://example.test/metadata/api/newapi/models.json", modelsURL)
	assert.Equal(t, "https://example.test/metadata/api/newapi/vendors.json", vendorsURL)
}
