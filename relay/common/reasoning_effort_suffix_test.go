package common

import (
	"fmt"
	"io"
	"strings"
	"testing"

	rootcommon "github.com/QuantumNous/new-api/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/reasoning"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReasoningEffortModelSuffixBody(t *testing.T) {
	for _, mode := range []int{relayconstant.RelayModeChatCompletions, relayconstant.RelayModeResponses} {
		for _, stream := range []bool{false, true} {
			for _, effort := range []string{"none", "minimal", "low", "medium", "high", "xhigh", "max"} {
				t.Run(fmt.Sprintf("mode=%d/stream=%t/%s", mode, stream, effort), func(t *testing.T) {
					info := &RelayInfo{OriginModelName: "gpt-5.6-sol", ChannelMeta: &ChannelMeta{
						UpstreamModelName: "gpt-5.6-sol", ChannelSetting: dto.ChannelSettings{ReasoningEffortToModelSuffix: true, PassThroughBodyEnabled: true},
					}, RelayMode: mode}
					control := fmt.Sprintf(`"reasoning_effort":%q`, effort)
					if mode == relayconstant.RelayModeResponses {
						control = fmt.Sprintf(`"reasoning":{"effort":%q,"summary":"auto","future":9007199254740993}`, effort)
					}
					payload := fmt.Sprintf(`{"model":"gpt-5.6-sol","stream":%t,%s,"unknown":{"id":9007199254740993}}`, stream, control)
					body, err := ReasoningEffortModelSuffixBody(info, strings.NewReader(payload))
					require.NoError(t, err)
					actual, err := io.ReadAll(body)
					require.NoError(t, err)
					assert.Contains(t, string(actual), `"id":9007199254740993`)
					remaining := ""
					if mode == relayconstant.RelayModeResponses {
						remaining = `,"reasoning":{"summary":"auto","future":9007199254740993}`
					}
					assert.JSONEq(t, fmt.Sprintf(`{"model":"gpt-5.6-sol-%s","stream":%t,"unknown":{"id":9007199254740993}%s}`, effort, stream, remaining), string(actual))
					assert.Equal(t, "gpt-5.6-sol", info.GetBillingModelName())
					assert.Equal(t, "gpt-5.6-sol", info.OriginModelName)
				})
			}
		}
	}
}

func TestReasoningEffortModelSuffixBoundaries(t *testing.T) {
	for _, tc := range []struct {
		name, payload, want string
		disabled, invalid   bool
	}{
		{"absent", `{"model":"gpt-5.6-sol-low"}`, `{"model":"gpt-5.6-sol-low"}`, false, false},
		{"empty", `{"model":"gpt-5.6-sol","reasoning_effort":""}`, `{"model":"gpt-5.6-sol","reasoning_effort":""}`, false, false},
		{"duplicate", `{"model":"gpt-5.6-sol-low","reasoning_effort":"low"}`, `{"model":"gpt-5.6-sol-low"}`, false, false},
		{"replace", `{"model":"gpt-5.6-sol-high","reasoning_effort":"low"}`, `{"model":"gpt-5.6-sol-low"}`, false, false},
		{"disabled", `{"model":"gpt-5.6-sol","reasoning_effort":"fast"}`, `{"model":"gpt-5.6-sol","reasoning_effort":"fast"}`, true, false},
		{"invalid", `{"model":"gpt-5.6-sol","reasoning_effort":"fast"}`, "", false, true},
		{"non string", `{"model":"gpt-5.6-sol","reasoning_effort":4}`, "", false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			info := &RelayInfo{RelayMode: relayconstant.RelayModeChatCompletions, ChannelMeta: &ChannelMeta{ChannelSetting: dto.ChannelSettings{ReasoningEffortToModelSuffix: !tc.disabled}}}
			body, err := ReasoningEffortModelSuffixBody(info, strings.NewReader(tc.payload))
			if tc.invalid {
				require.Error(t, err)
				assert.True(t, reasoning.IsClientError(err))
				return
			}
			require.NoError(t, err)
			actual, err := io.ReadAll(body)
			require.NoError(t, err)
			assert.JSONEq(t, tc.want, string(actual))
		})
	}
}

func TestReasoningEffortModelSuffixMappedPassthrough(t *testing.T) {
	info := &RelayInfo{RelayMode: relayconstant.RelayModeResponses, OriginModelName: "alias", ChannelMeta: &ChannelMeta{
		IsModelMapped: true, UpstreamModelName: "gpt-5.6-sol", ChannelSetting: dto.ChannelSettings{PassThroughBodyEnabled: true, ReasoningEffortToModelSuffix: true},
	}}
	body, err := ReasoningEffortModelSuffixBody(info, strings.NewReader(`{"model":"alias","reasoning":{"effort":"low"}}`))
	require.NoError(t, err)
	actual, err := io.ReadAll(body)
	require.NoError(t, err)
	assert.JSONEq(t, `{"model":"gpt-5.6-sol-low"}`, string(actual))
	assert.Equal(t, "alias", info.GetBillingModelName())
}

func TestChannelReasoningEffortSettingRoundTrip(t *testing.T) {
	var setting dto.ChannelSettings
	require.NoError(t, rootcommon.Unmarshal([]byte(`{}`), &setting))
	assert.False(t, setting.ReasoningEffortToModelSuffix)
	require.NoError(t, rootcommon.Unmarshal([]byte(`{"reasoning_effort_to_model_suffix":true}`), &setting))
	encoded, err := rootcommon.Marshal(setting)
	require.NoError(t, err)
	var restored dto.ChannelSettings
	require.NoError(t, rootcommon.Unmarshal(encoded, &restored))
	assert.True(t, restored.ReasoningEffortToModelSuffix)
}
