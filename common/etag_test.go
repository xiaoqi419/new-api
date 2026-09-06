package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestETagForIsStableAndNamespaced(t *testing.T) {
	first := ETagFor("public-content:v1", "hello")
	assert.Equal(t, first, ETagFor("public-content:v1", "hello"))
	assert.NotEqual(t, first, ETagFor("public-content:v1", "changed"))
	assert.NotEqual(t, first, ETagFor("other:v1", "hello"))
	assert.Contains(t, first, `W/"`)
}

func TestETagMatchesWeakComparison(t *testing.T) {
	etag := ETagFor("public-content:v1", "hello")
	strong := etag[len("W/"):]

	tests := []struct {
		name   string
		header string
		want   bool
	}{
		{name: "weak exact", header: etag, want: true},
		{name: "strong equivalent", header: strong, want: true},
		{name: "comma separated", header: `"other", ` + etag, want: true},
		{name: "wildcard", header: "*", want: true},
		{name: "different", header: `W/"different"`, want: false},
		{name: "empty", header: "", want: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.want, ETagMatches(test.header, etag))
		})
	}

	require.False(t, ETagMatches(`W/"different"`, ""))
	require.True(t, ETagMatches("*", ""))
}
