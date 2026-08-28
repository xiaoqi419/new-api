package controller

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestServeDrawingImageServesThumbnailAndOriginalVariants(t *testing.T) {
	baseDir := t.TempDir()
	t.Setenv("DRAWING_IMAGE_PATH", baseDir)
	pngData, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	require.NoError(t, err)
	captureContext, _ := gin.CreateTestContext(httptest.NewRecorder())
	captureContext.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	body := []byte(`{"data":[{"b64_json":"` + base64.StdEncoding.EncodeToString(pngData) + `"}]}`)
	service.CaptureImageResults(captureContext, body)
	keys := common.GetContextKeyStringSlice(captureContext, constant.ContextKeyDrawingResultKeys)
	require.Len(t, keys, 1)
	key := keys[0]

	for _, tc := range []struct {
		name        string
		query       string
		contentType string
		want        []byte
	}{
		{name: "thumbnail", contentType: "image/jpeg"},
		{name: "original", query: "?variant=original", contentType: "image/png", want: pngData},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodGet, "/api/drawing_logs/image/"+key+tc.query, nil)
			c.Params = gin.Params{{Key: "key", Value: key}}
			ServeDrawingImage(c)
			require.Equal(t, http.StatusOK, recorder.Code)
			require.Equal(t, tc.contentType, recorder.Header().Get("Content-Type"))
			require.NotEmpty(t, recorder.Body.Bytes())
			if tc.want != nil {
				require.Equal(t, tc.want, recorder.Body.Bytes())
			}
		})
	}
}
