package middleware

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type countingFrontendFS struct {
	static.ServeFileSystem
	opens atomic.Int32
}

func (f *countingFrontendFS) Open(name string) (http.File, error) {
	f.opens.Add(1)
	return f.ServeFileSystem.Open(name)
}

func performFrontendRequest(router http.Handler, method, target, acceptEncoding string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(method, target, nil)
	if acceptEncoding != "" {
		request.Header.Set("Accept-Encoding", acceptEncoding)
	}
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestServeFrontendFilesCompressesEachFileOnce(t *testing.T) {
	gin.SetMode(gin.TestMode)
	frontendDir := t.TempDir()
	script := []byte(strings.Repeat("export const answer = 42;\n", 400))
	image := []byte("\x89PNG\r\n\x1a\nnot-really-an-image")
	require.NoError(t, os.MkdirAll(filepath.Join(frontendDir, "static", "js"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(frontendDir, "static", "js", "app.js"), script, 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(frontendDir, "logo.png"), image, 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(frontendDir, "index.html"), []byte("<html></html>"), 0o644))
	frontendFS := &countingFrontendFS{ServeFileSystem: static.LocalFile(frontendDir, false)}

	router := gin.New()
	router.NoRoute(ServeFrontendFiles(frontendFS), func(c *gin.Context) {
		c.String(http.StatusTeapot, "fallback")
	})

	plain := performFrontendRequest(router, http.MethodGet, "/static/js/app.js", "")
	require.Equal(t, http.StatusOK, plain.Code)
	assert.Empty(t, plain.Header().Get("Content-Encoding"))
	assert.Equal(t, script, plain.Body.Bytes())
	frontendFS.opens.Store(0)

	responses := make([]*httptest.ResponseRecorder, 8)
	var wg sync.WaitGroup
	for i := range responses {
		wg.Go(func() {
			responses[i] = performFrontendRequest(router, http.MethodGet, "/static/js/app.js", "gzip, deflate, br")
		})
	}
	wg.Wait()
	for _, response := range responses {
		require.Equal(t, http.StatusOK, response.Code)
		assert.Equal(t, "gzip", response.Header().Get("Content-Encoding"))
		assert.Equal(t, "Accept-Encoding", response.Header().Get("Vary"))
		assert.Equal(t, plain.Header().Get("Content-Type"), response.Header().Get("Content-Type"))
		assert.Equal(t, strconv.Itoa(response.Body.Len()), response.Header().Get("Content-Length"))
		assert.Equal(t, responses[0].Body.Bytes(), response.Body.Bytes())
	}
	reader, err := gzip.NewReader(bytes.NewReader(responses[0].Body.Bytes()))
	require.NoError(t, err)
	decoded, err := io.ReadAll(reader)
	require.NoError(t, err)
	assert.Equal(t, script, decoded)

	head := performFrontendRequest(router, http.MethodHead, "/static/js/app.js", "gzip")
	assert.Equal(t, http.StatusOK, head.Code)
	assert.Equal(t, "gzip", head.Header().Get("Content-Encoding"))
	assert.Equal(t, strconv.Itoa(responses[0].Body.Len()), head.Header().Get("Content-Length"))
	assert.Empty(t, head.Body.Bytes())
	assert.Equal(t, int32(1), frontendFS.opens.Load(), "the file must be read and compressed once")

	png := performFrontendRequest(router, http.MethodGet, "/logo.png", "gzip")
	assert.Equal(t, http.StatusOK, png.Code)
	assert.Empty(t, png.Header().Get("Content-Encoding"))
	assert.Equal(t, image, png.Body.Bytes())

	index := performFrontendRequest(router, http.MethodGet, "/index.html", "gzip")
	assert.Equal(t, http.StatusMovedPermanently, index.Code)
	assert.Equal(t, "./", index.Header().Get("Location"))

	missing := performFrontendRequest(router, http.MethodGet, "/static/js/missing.js", "gzip")
	assert.Equal(t, http.StatusTeapot, missing.Code)
	assert.Equal(t, "fallback", missing.Body.String())
}

func TestServeFrontendFilesSupportsCanvasMount(t *testing.T) {
	gin.SetMode(gin.TestMode)
	frontendDir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(frontendDir, "assets"), 0o755))
	script := []byte("export const canvas = true;\n")
	require.NoError(t, os.WriteFile(filepath.Join(frontendDir, "assets", "app.js"), script, 0o644))
	router := gin.New()
	router.NoRoute(ServeFrontendFiles(static.LocalFile(frontendDir, false), "/canvas-app"), func(c *gin.Context) {
		c.String(http.StatusTeapot, "fallback")
	})

	plain := performFrontendRequest(router, http.MethodGet, "/canvas-app/assets/app.js", "")
	require.Equal(t, http.StatusOK, plain.Code)
	assert.Equal(t, script, plain.Body.Bytes())
	compressed := performFrontendRequest(router, http.MethodGet, "/canvas-app/assets/app.js", "gzip")
	require.Equal(t, http.StatusOK, compressed.Code)
	assert.Equal(t, "gzip", compressed.Header().Get("Content-Encoding"))
	reader, err := gzip.NewReader(bytes.NewReader(compressed.Body.Bytes()))
	require.NoError(t, err)
	decoded, err := io.ReadAll(reader)
	require.NoError(t, err)
	require.NoError(t, reader.Close())
	assert.Equal(t, script, decoded)
	for _, target := range []string{"/assets/app.js", "/canvas-app2/assets/app.js", "/canvas-app", "/canvas-app/missing.js"} {
		assert.Equal(t, http.StatusTeapot, performFrontendRequest(router, http.MethodGet, target, "gzip").Code, target)
	}
}

func TestSeparateThemeHandlersCacheTheirOwnAssets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	defaultDir, classicDir := t.TempDir(), t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(defaultDir, "app.js"), []byte("default-theme"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(classicDir, "app.js"), []byte("classic-theme"), 0o644))
	defaultFiles := ServeFrontendFiles(static.LocalFile(defaultDir, false))
	classicFiles := ServeFrontendFiles(static.LocalFile(classicDir, false))
	useClassic := false
	router := gin.New()
	router.NoRoute(func(c *gin.Context) {
		if useClassic {
			classicFiles(c)
		} else {
			defaultFiles(c)
		}
	})
	for _, theme := range []bool{false, true, false} {
		useClassic = theme
		response := performFrontendRequest(router, http.MethodGet, "/app.js", "gzip")
		require.Equal(t, http.StatusOK, response.Code)
		reader, err := gzip.NewReader(bytes.NewReader(response.Body.Bytes()))
		require.NoError(t, err)
		decoded, err := io.ReadAll(reader)
		require.NoError(t, err)
		require.NoError(t, reader.Close())
		want := "default-theme"
		if useClassic {
			want = "classic-theme"
		}
		assert.Equal(t, want, string(decoded))
	}
}

func TestServeFrontendFilesHonorsEncodingAndReadOnlyMethods(t *testing.T) {
	gin.SetMode(gin.TestMode)
	frontendDir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(frontendDir, "app.js"), []byte("export const answer = 42;"), 0o644))
	router := gin.New()
	router.NoRoute(ServeFrontendFiles(static.LocalFile(frontendDir, false)))
	for _, test := range []struct {
		encoding string
		gzip     bool
	}{
		{"gzip", true},
		{"br, gzip;q=0.5", true},
		{"*;q=1", true},
		{"gzip;q=0", false},
		{"*;q=1, gzip;q=0", false},
		{"xgzip", false},
		{"gzip;q=invalid", false},
		{"gzip;q=NaN", false},
	} {
		t.Run(test.encoding, func(t *testing.T) {
			response := performFrontendRequest(router, http.MethodGet, "/app.js", test.encoding)
			require.Equal(t, http.StatusOK, response.Code)
			assert.Equal(t, test.gzip, response.Header().Get("Content-Encoding") == "gzip")
		})
	}
	for _, method := range []string{http.MethodPost, http.MethodDelete, http.MethodPut} {
		response := performFrontendRequest(router, method, "/app.js", "gzip")
		assert.Equal(t, http.StatusMethodNotAllowed, response.Code, method)
	}
}
