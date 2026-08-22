package dto

import (
	"testing"

	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"

	"github.com/stretchr/testify/require"
)

// TestImageRequestRoundTripKeepsSequentialImageParams pins the upstream request
// contract for 火山方舟 Seedream: MarshalJSON deliberately does not flatten Extra
// back into the payload, so every parameter that must reach the provider has to be
// a declared field. Dropping one silently degrades 组图/联网搜索 into a single-image
// request with no error anywhere, which is why this is asserted rather than assumed.
func TestImageRequestRoundTripKeepsSequentialImageParams(t *testing.T) {
	body := `{
		"model": "doubao-seedream-5-0-260128",
		"prompt": "参考图1，生成四张连贯插画",
		"image": "https://example.com/ref.png",
		"size": "2K",
		"sequential_image_generation": "auto",
		"sequential_image_generation_options": {"max_images": 4},
		"optimize_prompt_options": {"mode": "fast"},
		"tools": [{"type": "web_search"}],
		"output_format": "png",
		"stream": true,
		"watermark": false,
		"totally_unknown_param": "must not reach upstream"
	}`

	var request ImageRequest
	require.NoError(t, kitutil.Unmarshal([]byte(body), &request))

	require.Equal(t, "auto", request.SequentialImageGeneration)
	require.NotNil(t, request.SequentialImageGenerationOptions)
	require.NotNil(t, request.SequentialImageGenerationOptions.MaxImages)
	require.Equal(t, 4, *request.SequentialImageGenerationOptions.MaxImages)
	require.Contains(t, request.Extra, "totally_unknown_param")

	marshaled, err := kitutil.Marshal(request)
	require.NoError(t, err)

	var upstream map[string]any
	require.NoError(t, kitutil.Unmarshal(marshaled, &upstream))

	require.Equal(t, "auto", upstream["sequential_image_generation"])
	require.Equal(t, map[string]any{"max_images": float64(4)}, upstream["sequential_image_generation_options"])
	require.Equal(t, map[string]any{"mode": "fast"}, upstream["optimize_prompt_options"])
	require.Equal(t, []any{map[string]any{"type": "web_search"}}, upstream["tools"])
	require.Equal(t, false, upstream["watermark"], "explicit false must survive instead of being omitted")
	require.NotContains(t, upstream, "totally_unknown_param", "Extra is intentionally not merged back into the upstream payload")
}

// TestImageRequestOmitsAbsentSequentialImageParams keeps the new fields invisible to
// every other provider: they may only appear when the client actually sent them.
func TestImageRequestOmitsAbsentSequentialImageParams(t *testing.T) {
	var request ImageRequest
	require.NoError(t, kitutil.Unmarshal([]byte(`{"model":"dall-e-3","prompt":"a cat"}`), &request))

	marshaled, err := kitutil.Marshal(request)
	require.NoError(t, err)

	var upstream map[string]any
	require.NoError(t, kitutil.Unmarshal(marshaled, &upstream))

	require.NotContains(t, upstream, "sequential_image_generation")
	require.NotContains(t, upstream, "sequential_image_generation_options")
	require.NotContains(t, upstream, "optimize_prompt_options")
	require.NotContains(t, upstream, "tools")
}
