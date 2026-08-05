package common

import (
	"net/http"
	"testing"

	"github.com/gin-contrib/static"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recordingFileSystem stands in for an embedded folder: it reports existence for
// paths relative to that folder and records what it was asked for.
type recordingFileSystem struct {
	present map[string]bool
	asked   []string
}

func (r *recordingFileSystem) Exists(prefix string, path string) bool {
	r.asked = append(r.asked, path)
	return r.present[path]
}

func (r *recordingFileSystem) Open(name string) (http.File, error) {
	return nil, http.ErrMissingFile
}

// TestSubPathFileSystemExists guards the contract that a frontend mounted under a
// URL prefix resolves its assets. static.Serve strips the prefix only for the file
// server, so Exists receives the full request path; if the prefix is not trimmed
// here every asset is reported missing and falls through to the SPA fallback,
// which serves index.html in place of JavaScript and breaks the mounted app.
func TestSubPathFileSystemExists(t *testing.T) {
	inner := &recordingFileSystem{present: map[string]bool{
		"/assets/index.js": true,
		"/logo.svg":        true,
	}}
	var fs static.ServeFileSystem = &subPathFileSystem{ServeFileSystem: inner, prefix: "/canvas"}

	cases := []struct {
		name       string
		path       string
		wantExists bool
		wantAsked  string
	}{
		{name: "asset under prefix", path: "/canvas/assets/index.js", wantExists: true, wantAsked: "/assets/index.js"},
		{name: "public file under prefix", path: "/canvas/logo.svg", wantExists: true, wantAsked: "/logo.svg"},
		{name: "unknown file under prefix", path: "/canvas/missing.js", wantExists: false, wantAsked: "/missing.js"},
		{name: "outside prefix is not served", path: "/assets/index.js", wantExists: false},
		{name: "main app route is not served", path: "/dashboard", wantExists: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			inner.asked = nil

			assert.Equal(t, tc.wantExists, fs.Exists("/canvas", tc.path))

			if tc.wantAsked == "" {
				assert.Empty(t, inner.asked, "path outside the prefix must not reach the embedded folder")
				return
			}
			require.Len(t, inner.asked, 1)
			assert.Equal(t, tc.wantAsked, inner.asked[0])
		})
	}
}
