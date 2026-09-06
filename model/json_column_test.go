package model

import (
	"database/sql/driver"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// PostgreSQL's simple protocol binds []byte parameters as bytea.  JSON column
// Valuers therefore need to return text (or nil for a null value) so writes do
// not fail with SQLSTATE 22P02.
func TestJSONColumnValuersReturnString(t *testing.T) {
	testCases := []struct {
		name   string
		valuer driver.Valuer
		want   string
	}{
		{
			name:   "ChannelInfo",
			valuer: ChannelInfo{IsMultiKey: true, MultiKeySize: 2},
			want:   `{"is_multi_key":true,"multi_key_size":2,"multi_key_status_list":null,"multi_key_polling_index":0,"multi_key_mode":""}`,
		},
		{
			name:   "Properties",
			valuer: Properties{Input: "hello"},
			want:   `{"input":"hello"}`,
		},
		{
			name:   "TaskPrivateData",
			valuer: TaskPrivateData{Key: "k"},
			want:   `{"key":"k"}`,
		},
		{
			name:   "JSONValue",
			valuer: JSONValue(`[{"k":"v"}]`),
			want:   `[{"k":"v"}]`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			value, err := testCase.valuer.Value()
			require.NoError(t, err)
			str, ok := value.(string)
			require.True(t, ok, "Value() must return string, got %T", value)
			assert.JSONEq(t, testCase.want, str)
		})
	}
}

func TestJSONColumnValuersZeroValueIsNil(t *testing.T) {
	for name, valuer := range map[string]driver.Valuer{
		"Properties":      Properties{},
		"TaskPrivateData": TaskPrivateData{},
		"JSONValue":       JSONValue(nil),
	} {
		t.Run(name, func(t *testing.T) {
			value, err := valuer.Value()
			require.NoError(t, err)
			assert.Nil(t, value)
		})
	}
}

func TestJSONColumnScannersAcceptStringAndBytes(t *testing.T) {
	toInput := func(kind string, payload string) interface{} {
		if kind == "bytes" {
			return []byte(payload)
		}
		return payload
	}

	for _, kind := range []string{"bytes", "string"} {
		t.Run(kind, func(t *testing.T) {
			var info ChannelInfo
			require.NoError(t, info.Scan(toInput(kind, `{"is_multi_key":true,"multi_key_size":2}`)))
			assert.True(t, info.IsMultiKey)
			assert.Equal(t, 2, info.MultiKeySize)

			var props Properties
			require.NoError(t, props.Scan(toInput(kind, `{"input":"hello"}`)))
			assert.Equal(t, "hello", props.Input)

			var private TaskPrivateData
			require.NoError(t, private.Scan(toInput(kind, `{"key":"k"}`)))
			assert.Equal(t, "k", private.Key)

			var items JSONValue
			require.NoError(t, items.Scan(toInput(kind, `[{"name":"gpt-4o"}]`)))
			assert.JSONEq(t, `[{"name":"gpt-4o"}]`, string(items))
		})
	}
}
