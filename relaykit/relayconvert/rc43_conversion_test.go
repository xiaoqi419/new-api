package relayconvert

import (
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/convmeta"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResponsesRetryOmitsTrailingAssistantButKeepsToolCalls(t *testing.T) {
	for _, target := range []types.RelayFormat{types.RelayFormatClaude, types.RelayFormatGemini} {
		t.Run(string(target), func(t *testing.T) {
			limit := uint(1024)
			request := &dto.OpenAIResponsesRequest{
				Model: "model-test", MaxOutputTokens: &limit,
				Input: []byte(`[
					{"role":"user","content":"run the tool"},
					{"type":"function_call","call_id":"call_1","name":"lookup","arguments":"{}"},
					{"type":"function_call_output","call_id":"call_1","output":"ok"},
					{"role":"assistant","content":"interrupted answer"}
				]`),
			}
			result, err := ConvertRequest(nil, &convmeta.Values{}, target, request)
			require.NoError(t, err)
			switch converted := result.Value.(type) {
			case *dto.ClaudeRequest:
				require.Len(t, converted.Messages, 3)
				assert.Equal(t, "assistant", converted.Messages[1].Role)
				assert.Equal(t, "user", converted.Messages[2].Role)
			case *dto.GeminiChatRequest:
				require.Len(t, converted.Contents, 3)
				assert.Equal(t, "model", converted.Contents[1].Role)
				require.NotNil(t, converted.Contents[1].Parts[0].FunctionCall)
				assert.Equal(t, "user", converted.Contents[2].Role)
			default:
				t.Fatalf("unexpected converted request %T", result.Value)
			}
			require.NotEmpty(t, result.Diagnostics)
		})
	}
}
