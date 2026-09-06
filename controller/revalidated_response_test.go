package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestServeRevalidatedJSONReturnsContentAndValidator(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/notice", nil)
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request

	serveRevalidatedJSON(context, "hello")

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, common.ETagFor(etagVersionPublicContent, "hello"), recorder.Header().Get("ETag"))
	assert.Equal(t, "no-cache", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, "Accept-Encoding", recorder.Header().Get("Vary"))
	assert.JSONEq(t, `{"success":true,"message":"","data":"hello"}`, recorder.Body.String())
}

func TestServeRevalidatedJSONAnswersConditionalRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	etag := common.ETagFor(etagVersionPublicContent, "hello")
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/notice", nil)
	request.Header.Set("If-None-Match", `"different", `+etag)
	router := gin.New()
	router.GET("/api/notice", func(context *gin.Context) {
		serveRevalidatedJSON(context, "hello")
	})
	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNotModified, recorder.Code)
	assert.Empty(t, recorder.Body.Bytes())
	assert.Equal(t, etag, recorder.Header().Get("ETag"))
}
