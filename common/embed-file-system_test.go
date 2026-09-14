package common

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
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
		"/assets/index.js":    true,
		"/logo.svg":           true,
		"2/assets/index.js":   true,
		"%2Fassets/index.js":  true,
		"/../assets/index.js": true,
	}}
	var fs static.ServeFileSystem = &subPathFileSystem{ServeFileSystem: inner, prefix: "/canvas-app"}

	cases := []struct {
		name       string
		path       string
		wantExists bool
		wantAsked  string
	}{
		{name: "asset under prefix", path: "/canvas-app/assets/index.js", wantExists: true, wantAsked: "/assets/index.js"},
		{name: "public file under prefix", path: "/canvas-app/logo.svg", wantExists: true, wantAsked: "/logo.svg"},
		{name: "unknown file under prefix", path: "/canvas-app/missing.js", wantExists: false, wantAsked: "/missing.js"},
		{name: "prefix collision is not served", path: "/canvas-app2/assets/index.js", wantExists: false},
		{name: "encoded separator is not a byte prefix", path: "/canvas-app%2Fassets/index.js", wantExists: false},
		{name: "dot segment is not delegated", path: "/canvas-app/../assets/index.js", wantExists: false},
		{name: "dot root is not delegated", path: "/canvas-app/.", wantExists: false},
		{name: "exact mount root is left for SPA fallback", path: "/canvas-app", wantExists: false},
		{name: "mount root slash is left for SPA fallback", path: "/canvas-app/", wantExists: false},
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

// TestSubPathFileSystemWithGinStatic exercises the middleware contract that
// matters in production: Exists sees the original URL path, while the static
// handler strips the mount prefix before calling Open. The mounted asset must
// still be served, and a lookalike prefix must fall through to the next route.
func TestSubPathFileSystemWithGinStatic(t *testing.T) {
	gin.SetMode(gin.TestMode)
	assets := fstest.MapFS{
		"assets/index.js": &fstest.MapFile{Data: []byte("canvas asset"), Mode: 0o644},
	}

	mounted := &subPathFileSystem{
		ServeFileSystem: &embedFileSystem{FileSystem: http.FS(assets)},
		prefix:          "/canvas-app",
	}
	router := gin.New()
	router.Use(static.Serve("/canvas-app", mounted))
	router.NoRoute(func(c *gin.Context) {
		c.String(http.StatusNotFound, "fallback")
	})

	cases := []struct {
		name       string
		target     string
		wantStatus int
		wantBody   string
	}{
		{name: "mounted asset", target: "/canvas-app/assets/index.js", wantStatus: http.StatusOK, wantBody: "canvas asset"},
		{name: "encoded slash in descendant", target: "/canvas-app%2Fassets%2Findex.js", wantStatus: http.StatusOK, wantBody: "canvas asset"},
		{name: "prefix collision", target: "/canvas-app2/assets/index.js", wantStatus: http.StatusNotFound, wantBody: "fallback"},
		{name: "encoded prefix collision", target: "/canvas-app%32/assets/index.js", wantStatus: http.StatusNotFound, wantBody: "fallback"},
		{name: "double encoded separator", target: "/canvas-app%252Fassets/index.js", wantStatus: http.StatusNotFound, wantBody: "fallback"},
		{name: "mount root", target: "/canvas-app", wantStatus: http.StatusNotFound, wantBody: "fallback"},
		{name: "mount root slash", target: "/canvas-app/", wantStatus: http.StatusNotFound, wantBody: "fallback"},
		{name: "encoded traversal", target: "/canvas-app/%2e%2e/assets/index.js", wantStatus: http.StatusNotFound, wantBody: "fallback"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, tc.target, nil)
			router.ServeHTTP(recorder, request)

			assert.Equal(t, tc.wantStatus, recorder.Code)
			assert.Equal(t, tc.wantBody, recorder.Body.String())
		})
	}
}
