package dto

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateUpstreamTransport(t *testing.T) {
	for _, tt := range []struct {
		name, value string
		valid       bool
	}{
		{"empty", "", true},
		{"http", "http", true},
		{"websocket", "websocket", true},
		{"trimmed", " WebSocket ", true},
		{"invalid", "grpc", false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := (&ChannelSettings{UpstreamTransport: tt.value}).ValidateUpstreamTransport()
			if tt.valid {
				require.NoError(t, err)
			} else {
				require.ErrorContains(t, err, "invalid upstream_transport")
			}
		})
	}
}
