package jimeng

import (
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

const jimengTestPNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

type captureCheckingWriter struct {
	gin.ResponseWriter
	capturedBeforeWrite func() bool
	captured            bool
}

func (writer *captureCheckingWriter) WriteHeader(statusCode int) {
	writer.captured = writer.captured || writer.capturedBeforeWrite()
	writer.ResponseWriter.WriteHeader(statusCode)
}

func (writer *captureCheckingWriter) Write(data []byte) (int, error) {
	writer.captured = writer.captured || writer.capturedBeforeWrite()
	return writer.ResponseWriter.Write(data)
}

type failingCaptureCheckingWriter struct {
	*captureCheckingWriter
	writeErr error
}

func (writer *failingCaptureCheckingWriter) Write(data []byte) (int, error) {
	writer.captured = writer.captured || writer.capturedBeforeWrite()
	return 0, writer.writeErr
}

func TestJimengImageHandlerArchivesOrderedResultsBeforeDelivery(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	imageData, err := base64.StdEncoding.DecodeString(jimengTestPNG)
	require.NoError(t, err)
	t.Setenv("DRAWING_IMAGE_PATH", t.TempDir())

	proxyRequests := 0
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		proxyRequests++
		require.Equal(t, "http://example.com/jimeng-result.png", request.URL.String())
		w.Header().Set("Content-Type", "image/png")
		_, err := w.Write(imageData)
		require.NoError(t, err)
	}))
	t.Cleanup(proxy.Close)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{
		StartTime: time.Unix(1710000000, 0),
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelSetting: dto.ChannelSettings{Proxy: proxy.URL},
		},
	}
	checkingWriter := &captureCheckingWriter{
		ResponseWriter: c.Writer,
		capturedBeforeWrite: func() bool {
			keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys)
			if len(keys) != 3 {
				return false
			}
			for _, key := range keys {
				if _, ok := service.DrawingImageOriginalFilePath(key); !ok {
					return false
				}
				if _, ok := service.DrawingImageFilePath(key); !ok {
					return false
				}
			}
			return true
		},
	}
	c.Writer = checkingWriter

	upstreamResponse := `{"code":10000,"data":{"binary_data_base64":["` + jimengTestPNG + `","` + jimengTestPNG + `"],"image_urls":["http://example.com/jimeng-result.png"]}}`
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(upstreamResponse)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}

	usage, relayErr := jimengImageHandler(c, resp, info)

	require.Nil(t, relayErr)
	require.NotNil(t, usage)
	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "application/json", recorder.Header().Get("Content-Type"))
	require.Equal(t, `{"data":[{"url":"","b64_json":"`+jimengTestPNG+`","revised_prompt":""},{"url":"","b64_json":"`+jimengTestPNG+`","revised_prompt":""},{"url":"http://example.com/jimeng-result.png","b64_json":"","revised_prompt":""}],"created":1710000000}`, recorder.Body.String())
	require.Equal(t, 1, proxyRequests)
	require.True(t, checkingWriter.captured)

	keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys)
	require.Len(t, keys, 3)
	for _, key := range keys {
		original, ok := service.DrawingImageOriginalFilePath(key)
		require.True(t, ok)
		thumbnail, ok := service.DrawingImageFilePath(key)
		require.True(t, ok)
		originalData, err := os.ReadFile(original)
		require.NoError(t, err)
		require.Equal(t, imageData, originalData)
		thumbnailData, err := os.ReadFile(thumbnail)
		require.NoError(t, err)
		require.NotEmpty(t, thumbnailData)
	}

	var publicResponse dto.ImageResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &publicResponse))
	require.Equal(t, []dto.ImageData{
		{B64Json: jimengTestPNG},
		{B64Json: jimengTestPNG},
		{Url: "http://example.com/jimeng-result.png"},
	}, publicResponse.Data)
}

func TestJimengImageHandlerKeepsSuccessfulUsageWhenResponseWriteFails(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })
	t.Setenv("DRAWING_IMAGE_PATH", t.TempDir())

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	checkingWriter := &captureCheckingWriter{
		ResponseWriter: c.Writer,
		capturedBeforeWrite: func() bool {
			keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys)
			if len(keys) != 1 {
				return false
			}
			key := keys[0]
			if _, ok := service.DrawingImageOriginalFilePath(key); !ok {
				return false
			}
			_, ok := service.DrawingImageFilePath(key)
			return ok
		},
	}
	c.Writer = &failingCaptureCheckingWriter{
		captureCheckingWriter: checkingWriter,
		writeErr:              errors.New("downstream response write failed"),
	}

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body: io.NopCloser(strings.NewReader(
			`{"code":10000,"data":{"binary_data_base64":["` + jimengTestPNG + `"]}}`,
		)),
	}
	info := &relaycommon.RelayInfo{StartTime: time.Unix(1710000000, 0)}

	usage, relayErr := jimengImageHandler(c, resp, info)

	require.Nil(t, relayErr)
	require.NotNil(t, usage)
	require.True(t, checkingWriter.captured)
	keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys)
	require.Len(t, keys, 1)
	original, ok := service.DrawingImageOriginalFilePath(keys[0])
	require.True(t, ok)
	thumbnail, ok := service.DrawingImageFilePath(keys[0])
	require.True(t, ok)
	originalData, err := os.ReadFile(original)
	require.NoError(t, err)
	require.NotEmpty(t, originalData)
	thumbnailData, err := os.ReadFile(thumbnail)
	require.NoError(t, err)
	require.NotEmpty(t, thumbnailData)
	require.Equal(t, "application/json", recorder.Header().Get("Content-Type"))
}
