package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type pelicanRunsResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    struct {
		Runs []struct {
			ID    int    `json:"id"`
			Title string `json:"title"`
		} `json:"runs"`
		Limit int `json:"limit"`
	} `json:"data"`
}

func usePelicanOrigin(t *testing.T, origin string) {
	t.Helper()
	pelicanOriginMu.Lock()
	previous := pelicanOrigin
	pelicanOrigin = origin
	pelicanOriginMu.Unlock()
	pelicanClearCache()
	t.Cleanup(func() {
		pelicanOriginMu.Lock()
		pelicanOrigin = previous
		pelicanOriginMu.Unlock()
		pelicanClearCache()
	})
}

func performPelicanRequest(t *testing.T, path string, params gin.Params, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	previousMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(previousMode) })
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = params
	ctx.Request = httptest.NewRequest(http.MethodGet, path, nil)
	handler(ctx)
	return recorder
}

func decodePelicanRuns(t *testing.T, recorder *httptest.ResponseRecorder) pelicanRunsResponse {
	t.Helper()
	var response pelicanRunsResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func TestGetPelicanRunsProxiesAndReusesCache(t *testing.T) {
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pelican/runs" {
			http.NotFound(w, r)
			return
		}
		if hits.Add(1) > 1 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"runs":[{"id":714,"title":"北极熊骑奥特曼"}],"limit":30}`)
	}))
	t.Cleanup(upstream.Close)
	usePelicanOrigin(t, upstream.URL)

	first := performPelicanRequest(t, "/api/pelican/runs", nil, GetPelicanRuns)
	require.Equal(t, http.StatusOK, first.Code)
	firstBody := decodePelicanRuns(t, first)
	require.True(t, firstBody.Success)
	require.Len(t, firstBody.Data.Runs, 1)
	assert.Equal(t, 714, firstBody.Data.Runs[0].ID)
	assert.Equal(t, "北极熊骑奥特曼", firstBody.Data.Runs[0].Title)
	assert.Equal(t, 30, firstBody.Data.Limit)

	second := performPelicanRequest(t, "/api/pelican/runs", nil, GetPelicanRuns)
	secondBody := decodePelicanRuns(t, second)
	require.True(t, secondBody.Success)
	assert.Equal(t, 714, secondBody.Data.Runs[0].ID)
	assert.Equal(t, int32(1), hits.Load())

	pelicanExpireCache()
	third := performPelicanRequest(t, "/api/pelican/runs", nil, GetPelicanRuns)
	thirdBody := decodePelicanRuns(t, third)
	require.True(t, thirdBody.Success)
	assert.Equal(t, 714, thirdBody.Data.Runs[0].ID)
	assert.Equal(t, int32(2), hits.Load())
}

func TestGetPelicanRunsRejectsInvalidPayload(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"runs":{"id":1}}`)
	}))
	t.Cleanup(upstream.Close)
	usePelicanOrigin(t, upstream.URL)

	recorder := performPelicanRequest(t, "/api/pelican/runs", nil, GetPelicanRuns)
	response := decodePelicanRuns(t, recorder)
	require.False(t, response.Success)
	assert.Equal(t, "pelican gallery unavailable", response.Message)
}

func TestGetPelicanPreviewServesPartnerPolicy(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pelican/runs/714/preview" {
			http.NotFound(w, r)
			return
		}
		_, _ = io.WriteString(w, "<!doctype html><html><body>ok</body></html>")
	}))
	t.Cleanup(upstream.Close)
	usePelicanOrigin(t, upstream.URL)

	recorder := performPelicanRequest(t, "/api/pelican/runs/714/preview", gin.Params{{Key: "id", Value: "714"}}, GetPelicanPreview)
	require.Equal(t, http.StatusOK, recorder.Code)
	require.Contains(t, recorder.Body.String(), "ok")
	assert.Equal(t, pelicanPreviewCSP, recorder.Header().Get("Content-Security-Policy"))
	assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "no-referrer", recorder.Header().Get("Referrer-Policy"))
	assert.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, "text/html; charset=utf-8", recorder.Header().Get("Content-Type"))

	rejected := performPelicanRequest(t, "/api/pelican/runs/0/preview", gin.Params{{Key: "id", Value: "0"}}, GetPelicanPreview)
	var payload struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(rejected.Body.Bytes(), &payload))
	require.False(t, payload.Success)
	assert.Equal(t, "invalid run id", payload.Message)
}
