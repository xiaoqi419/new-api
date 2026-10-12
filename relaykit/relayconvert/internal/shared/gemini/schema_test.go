package gemini

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFunctionParametersPreservesJSONSchemaConstraints(t *testing.T) {
	schema := map[string]any{
		"type": "object", "additionalProperties": false,
		"properties": map[string]any{
			"value": map[string]any{"type": "integer", "enum": []any{1.0, 2.0}},
		},
	}
	field, value, misfits := FunctionParameters(schema, true)
	assert.Equal(t, "parametersJsonSchema", field)
	assert.Equal(t, schema, value)
	assert.Empty(t, misfits)

	field, value, misfits = FunctionParameters(schema, false)
	assert.Equal(t, "parameters", field)
	require.NotEmpty(t, misfits)
	legacy := value.(map[string]any)
	assert.NotContains(t, legacy, "additionalProperties")
	properties := legacy["properties"].(map[string]any)
	assert.Equal(t, map[string]any{"type": "INTEGER"}, properties["value"])
	assert.Equal(t, false, schema["additionalProperties"], "conversion must leave the caller schema intact")
}
