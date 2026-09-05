package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newH5CORSTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(H5CORS())
	router.GET("/api/status", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	return router
}

func TestH5CORSAllowsConfiguredOrigins(t *testing.T) {
	for _, origin := range h5CORSOrigins {
		t.Run(origin, func(t *testing.T) {
			router := newH5CORSTestRouter()
			request := httptest.NewRequest(http.MethodGet, "/api/status", nil)
			request.Header.Set("Origin", origin)
			response := httptest.NewRecorder()

			router.ServeHTTP(response, request)

			require.Equal(t, http.StatusNoContent, response.Code)
			assert.Equal(t, origin, response.Header().Get("Access-Control-Allow-Origin"))
			assert.Equal(t, "true", response.Header().Get("Access-Control-Allow-Credentials"))
			assert.Contains(t, response.Header().Values("Vary"), "Origin")
		})
	}
}

func TestH5CORSHandlesPreflight(t *testing.T) {
	router := newH5CORSTestRouter()
	request := httptest.NewRequest(http.MethodOptions, "/api/user/login", nil)
	request.Header.Set("Origin", "https://codezip.io")
	request.Header.Set("Access-Control-Request-Method", http.MethodPost)
	request.Header.Set("Access-Control-Request-Headers", "content-type, x-auth-session")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusNoContent, response.Code)
	assert.Equal(t, "https://codezip.io", response.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "true", response.Header().Get("Access-Control-Allow-Credentials"))
	assert.Contains(t, response.Header().Get("Access-Control-Allow-Methods"), "POST")
	allowHeaders := response.Header().Get("Access-Control-Allow-Headers")
	assert.Contains(t, allowHeaders, "Content-Type")
	assert.Contains(t, allowHeaders, "X-Auth-Session")
	assert.Contains(t, response.Header().Values("Vary"), "Origin")
	assert.Contains(t, response.Header().Values("Vary"), "Access-Control-Request-Method")
	assert.Contains(t, response.Header().Values("Vary"), "Access-Control-Request-Headers")
}

func TestH5CORSRejectsUnknownOrigins(t *testing.T) {
	router := newH5CORSTestRouter()
	request := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	request.Header.Set("Origin", "https://untrusted.example")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusForbidden, response.Code)
	assert.Empty(t, response.Header().Get("Access-Control-Allow-Origin"))
}

func TestH5CORSLeavesRequestsWithoutOriginUntouched(t *testing.T) {
	router := newH5CORSTestRouter()
	request := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusNoContent, response.Code)
	assert.Empty(t, response.Header().Get("Access-Control-Allow-Origin"))
	assert.Empty(t, response.Header().Get("Access-Control-Allow-Credentials"))
}

func TestCORSUsesCredentialSafeHeadersForH5Origins(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(CORS())
	router.GET("/api/usage", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodGet, "/api/usage", nil)
	request.Header.Set("Origin", "https://aierxin.cc")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusNoContent, response.Code)
	assert.Equal(t, "https://aierxin.cc", response.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "true", response.Header().Get("Access-Control-Allow-Credentials"))
}
