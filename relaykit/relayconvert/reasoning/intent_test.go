package reasoning

import (
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOpenAIPivotRetainsExactStrengthAndBudget(t *testing.T) {
	budget, include := 16384, false
	for _, effort := range []Effort{EffortMax, EffortXHigh} {
		t.Run(string(effort), func(t *testing.T) {
			intent := Intent{Mode: ModeEnabled, Effort: effort, BudgetTokens: &budget, IncludeThoughts: &include}
			chat := &dto.GeneralOpenAIRequest{}
			require.NoError(t, ApplyToOpenAIChat(chat, intent))
			assert.Equal(t, string(effort), chat.ReasoningEffort)
			restored, err := FromOpenAIChat(chat)
			require.NoError(t, err)
			assert.Equal(t, effort, restored.Effort)
			require.NotNil(t, restored.BudgetTokens)
			assert.Equal(t, budget, *restored.BudgetTokens)

			responses := &dto.OpenAIResponsesRequest{}
			require.NoError(t, ApplyToOpenAIResponses(responses, restored))
			require.NotNil(t, responses.Reasoning)
			assert.Equal(t, string(effort), responses.Reasoning.Effort)
			restored, err = FromOpenAIResponses(responses)
			require.NoError(t, err)
			assert.Equal(t, effort, restored.Effort)
		})
	}
}

func TestOpenAIPivotDoesNotTreatMaxAndXHighAsEquivalent(t *testing.T) {
	intent := Intent{Mode: ModeEnabled, Effort: EffortMax}
	chat := &dto.GeneralOpenAIRequest{}
	require.NoError(t, ApplyToOpenAIChat(chat, intent))
	chat.ReasoningEffort = "xhigh"
	_, err := FromOpenAIChat(chat)
	require.ErrorIs(t, err, ErrEffortConflict)

	responses := &dto.OpenAIResponsesRequest{}
	require.NoError(t, ApplyToOpenAIResponses(responses, intent))
	responses.Reasoning.Effort = "xhigh"
	_, err = FromOpenAIResponses(responses)
	require.ErrorIs(t, err, ErrEffortConflict)
}
