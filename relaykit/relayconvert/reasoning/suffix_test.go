package reasoning

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseModelModifiers(t *testing.T) {
	tests := []struct {
		name      string
		modelName string
		raw       string
		base      string
		modifiers []ModelModifier
	}{
		{
			name:      "parses contiguous trailing modifiers",
			modelName: "gpt-6-astra@thinking:on@effort:high",
			raw:       "gpt-6-astra@thinking:on@effort:high",
			base:      "gpt-6-astra",
			modifiers: []ModelModifier{{Key: "thinking", Value: "on"}, {Key: "effort", Value: "high"}},
		},
		{
			name:      "preserves model name internal at sign",
			modelName: "vendor/model@v2@thinking:adaptive",
			raw:       "vendor/model@v2@thinking:adaptive",
			base:      "vendor/model@v2",
			modifiers: []ModelModifier{{Key: "thinking", Value: "adaptive"}},
		},
		{
			name:      "normalizes modifier keys",
			modelName: "gpt-5@THINKING:ON@EFFORT:XHIGH",
			raw:       "gpt-5@THINKING:ON@EFFORT:XHIGH",
			base:      "gpt-5",
			modifiers: []ModelModifier{{Key: "thinking", Value: "ON"}, {Key: "effort", Value: "XHIGH"}},
		},
		{
			name:      "leaves non modifier at segments untouched",
			modelName: "vendor/model@v2",
			raw:       "vendor/model@v2",
			base:      "vendor/model@v2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spec := ParseModelModifiers(tt.modelName)

			assert.Equal(t, tt.raw, spec.Raw)
			assert.Equal(t, tt.base, spec.Base)
			assert.Equal(t, tt.modifiers, spec.Modifiers)
			assert.Equal(t, len(tt.modifiers) > 0, spec.HasModifiers())
		})
	}
}

func TestParseThinkingModifier(t *testing.T) {
	minusOne := -1
	tests := []struct {
		name           string
		raw            string
		valid          bool
		expectedMode   Mode
		expectedEffort Effort
		expectedBudget *int
	}{
		{
			name:           "on",
			raw:            "on",
			valid:          true,
			expectedMode:   ModeEnabled,
			expectedBudget: nil,
		},
		{
			name:           "adaptive",
			raw:            "adaptive",
			valid:          true,
			expectedMode:   ModeAdaptive,
			expectedBudget: nil,
		},
		{
			name:           "off",
			raw:            "off",
			valid:          true,
			expectedMode:   ModeDisabled,
			expectedEffort: EffortNone,
			expectedBudget: nil,
		},
		{
			name:           "zero disables thinking",
			raw:            "0",
			valid:          true,
			expectedMode:   ModeDisabled,
			expectedEffort: EffortNone,
			expectedBudget: nil,
		},
		{
			name:           "minus one keeps automatic budget",
			raw:            "-1",
			valid:          true,
			expectedMode:   ModeEnabled,
			expectedBudget: &minusOne,
		},
		{
			name: "rejects budget below minus one",
			raw:  "-2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			intent, ok := ParseThinkingModifier(tt.raw)
			require.Equal(t, tt.valid, ok)
			if !tt.valid {
				return
			}

			assert.Equal(t, tt.expectedMode, intent.Mode)
			assert.Equal(t, tt.expectedEffort, intent.Effort)
			if tt.expectedBudget == nil {
				assert.Nil(t, intent.BudgetTokens)
				return
			}
			require.NotNil(t, intent.BudgetTokens)
			assert.Equal(t, *tt.expectedBudget, *intent.BudgetTokens)
		})
	}
}
