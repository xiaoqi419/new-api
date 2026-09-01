package common

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestJsonRawMessageToString(t *testing.T) {
	tests := []struct {
		name string
		data json.RawMessage
		want string
	}{
		{
			name: "object",
			data: json.RawMessage(`{"city":"Paris","days":0,"strict":false}`),
			want: `{"city":"Paris","days":0,"strict":false}`,
		},
		{
			name: "string",
			data: json.RawMessage(`"{\"city\":\"Paris\",\"days\":0,\"strict\":false}"`),
			want: `{"city":"Paris","days":0,"strict":false}`,
		},
		{
			name: "null",
			data: json.RawMessage(`null`),
			want: "",
		},
		{
			name: "empty",
			data: nil,
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, JsonRawMessageToString(tt.data))
		})
	}
}

func TestDecodeJsonStrictRejectsUnknownFields(t *testing.T) {
	var payload struct {
		Name string `json:"name"`
	}

	err := DecodeJsonStrict(bytes.NewBufferString(`{"name":"payment","unexpected":true}`), &payload)

	require.Error(t, err)
}

func TestDecodeJsonStrictRejectsTrailingJSONValue(t *testing.T) {
	var payload struct {
		Name string `json:"name"`
	}

	err := DecodeJsonStrict(bytes.NewBufferString(`{"name":"payment"}{"name":"second"}`), &payload)

	require.Error(t, err)
	require.Equal(t, "payment", payload.Name)
}

func TestDecodeJsonStrictAcceptsCompleteKnownObject(t *testing.T) {
	var payload struct {
		Name string `json:"name"`
	}

	require.NoError(t, DecodeJsonStrict(bytes.NewBufferString(` {"name":"payment"} `), &payload))
	require.Equal(t, "payment", payload.Name)
}
