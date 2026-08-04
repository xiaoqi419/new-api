package middleware

import (
	"testing"

	"github.com/QuantumNous/new-api/service/captcha"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The click positions arrive as an untrusted query string, so malformed input has
// to be rejected rather than silently parsed into (0,0) clicks, which would let a
// caller probe the challenge with junk.
func TestParseCaptchaPoints(t *testing.T) {
	cases := []struct {
		name    string
		raw     string
		want    []captcha.Point
		wantErr bool
	}{
		{name: "three points", raw: "10,20,30,40,50,60", want: []captcha.Point{{X: 10, Y: 20}, {X: 30, Y: 40}, {X: 50, Y: 60}}},
		{name: "tolerates spaces", raw: " 10 , 20 , 30,40 ", want: []captcha.Point{{X: 10, Y: 20}, {X: 30, Y: 40}}},
		{name: "negative coordinates", raw: "-5,-6", want: []captcha.Point{{X: -5, Y: -6}}},
		{name: "empty", raw: "", wantErr: true},
		{name: "odd field count", raw: "10,20,30", wantErr: true},
		{name: "not a number", raw: "10,abc", wantErr: true},
		{name: "trailing separator", raw: "10,20,", wantErr: true},
		{name: "float coordinates", raw: "10.5,20.5", wantErr: true},
		// A semicolon separator would be dropped by url.ParseQuery upstream of
		// this function, so it must not be silently accepted here either.
		{name: "semicolon separator", raw: "10,20;30,40", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseCaptchaPoints(tc.raw)
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}
}
