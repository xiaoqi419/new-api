package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSetApiRouterHandlesH5Preflight(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	for _, origin := range []string{"https://aierxin.cc", "https://codezip.io"} {
		t.Run(origin, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodOptions, "/api/user/login", nil)
			request.Header.Set("Origin", origin)
			request.Header.Set("Access-Control-Request-Method", http.MethodPost)
			request.Header.Set("Access-Control-Request-Headers", "content-type, x-auth-session")

			engine.ServeHTTP(recorder, request)

			require.Equal(t, http.StatusNoContent, recorder.Code)
			assert.Equal(t, origin, recorder.Header().Get("Access-Control-Allow-Origin"))
			assert.Equal(t, "true", recorder.Header().Get("Access-Control-Allow-Credentials"))
			assert.Contains(t, recorder.Header().Get("Access-Control-Allow-Methods"), http.MethodPost)
		})
	}
}

func TestSetApiRouterRejectsUnknownH5PreflightOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodOptions, "/api/user/login", nil)
	request.Header.Set("Origin", "https://untrusted.example")
	request.Header.Set("Access-Control-Request-Method", http.MethodPost)

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusForbidden, recorder.Code)
	assert.Empty(t, recorder.Header().Get("Access-Control-Allow-Origin"))
}

func TestSetApiRouterHandlesPreflightWithoutOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodOptions, "/api/user/login", nil)

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	assert.Empty(t, recorder.Header().Get("Access-Control-Allow-Origin"))
}
