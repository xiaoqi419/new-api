package zhipu_4v

import (
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

const zhipuTestPNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

type zhipuCaptureCheckingWriter struct {
	gin.ResponseWriter
	capturedBeforeWrite func() bool
	captured            bool
}

func (writer *zhipuCaptureCheckingWriter) WriteHeader(statusCode int) {
	writer.captured = writer.captured || writer.capturedBeforeWrite()
	writer.ResponseWriter.WriteHeader(statusCode)
}

func (writer *zhipuCaptureCheckingWriter) Write(data []byte) (int, error) {
	writer.captured = writer.captured || writer.capturedBeforeWrite()
	return writer.ResponseWriter.Write(data)
}

func TestZhipu4vImageHandlerConvertsURLsAndCapturesBase64ResultsBeforeDelivery(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	imageData, err := base64.StdEncoding.DecodeString(zhipuTestPNG)
	require.NoError(t, err)
	t.Setenv("DRAWING_IMAGE_PATH", t.TempDir())

	proxyRequests := 0
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		proxyRequests++
		require.Equal(t, "http://example.com/result.png?token=must-not-leak", req.URL.String())
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
	checkingWriter := &zhipuCaptureCheckingWriter{
		ResponseWriter: c.Writer,
		capturedBeforeWrite: func() bool {
			keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys)
			if len(keys) != 2 {
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

	upstreamResponse := `{"created":1710000000,"data":[{"b64_json":"` + zhipuTestPNG + `"},{"url":"http://example.com/result.png?token=must-not-leak"}]}`
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(upstreamResponse)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}

	usage, relayErr := zhipu4vImageHandler(c, resp, info)

	require.Nil(t, relayErr)
	require.NotNil(t, usage)
	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "application/json", recorder.Header().Get("Content-Type"))
	require.Equal(t, `{"created":1710000000,"data":[{"b64_json":"`+zhipuTestPNG+`"},{"b64_json":"`+zhipuTestPNG+`"}]}`, recorder.Body.String())
	require.NotContains(t, recorder.Body.String(), "example.com")
	require.NotContains(t, recorder.Body.String(), "must-not-leak")
	require.Equal(t, 1, proxyRequests)
	require.True(t, checkingWriter.captured)

	keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys)
	require.Len(t, keys, 2)
	results, ok := common.GetContextKeyType[[]taskdto.ImageTaskResult](c, constant.ContextKeyDrawingTaskResults)
	require.True(t, ok)
	require.Len(t, results, 2)
	for index, key := range keys {
		require.Equal(t, taskdto.ImageTaskResult{
			Status:       taskdto.ImageTaskResultStatusAvailable,
			Key:          key,
			ThumbnailURL: service.DrawingImageURL(key, false),
			OriginalURL:  service.DrawingImageURL(key, true),
		}, results[index])
		original, originalOK := service.DrawingImageOriginalFilePath(key)
		thumbnail, thumbnailOK := service.DrawingImageFilePath(key)
		require.True(t, originalOK)
		require.True(t, thumbnailOK)
		storedOriginal, readErr := os.ReadFile(original)
		require.NoError(t, readErr)
		require.Equal(t, imageData, storedOriginal)
		storedThumbnail, readErr := os.ReadFile(thumbnail)
		require.NoError(t, readErr)
		require.NotEmpty(t, storedThumbnail)
	}
}

func TestZhipu4vImageHandlerKeepsConversionFailureInOrderedTaskResults(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	imageData, err := base64.StdEncoding.DecodeString(zhipuTestPNG)
	require.NoError(t, err)
	t.Setenv("DRAWING_IMAGE_PATH", t.TempDir())

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{StartTime: time.Unix(1710000000, 0)}
	checkingWriter := &zhipuCaptureCheckingWriter{
		ResponseWriter: c.Writer,
		capturedBeforeWrite: func() bool {
			results, ok := common.GetContextKeyType[[]taskdto.ImageTaskResult](c, constant.ContextKeyDrawingTaskResults)
			if !ok || len(results) != 2 {
				return false
			}
			if results[0] != (taskdto.ImageTaskResult{
				Status:    taskdto.ImageTaskResultStatusUnavailable,
				ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
			}) {
				return false
			}
			if results[1].Status != taskdto.ImageTaskResultStatusAvailable || results[1].Key == "" {
				return false
			}
			if _, ok := service.DrawingImageOriginalFilePath(results[1].Key); !ok {
				return false
			}
			if _, ok := service.DrawingImageFilePath(results[1].Key); !ok {
				return false
			}
			return true
		},
	}
	c.Writer = checkingWriter

	upstreamResponse := `{"created":1710000000,"data":[{"url":"file:///private/result.png?token=must-not-leak"},{"b64_json":"` + zhipuTestPNG + `"}]}`
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(upstreamResponse)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}

	usage, relayErr := zhipu4vImageHandler(c, resp, info)

	require.Nil(t, relayErr)
	require.NotNil(t, usage)
	require.Equal(t, `{"created":1710000000,"data":[{"b64_json":"`+zhipuTestPNG+`"}]}`, recorder.Body.String())
	require.NotContains(t, recorder.Body.String(), "file://")
	require.NotContains(t, recorder.Body.String(), "must-not-leak")
	require.True(t, checkingWriter.captured)

	results, ok := common.GetContextKeyType[[]taskdto.ImageTaskResult](c, constant.ContextKeyDrawingTaskResults)
	require.True(t, ok)
	require.Equal(t, []taskdto.ImageTaskResult{
		{
			Status:    taskdto.ImageTaskResultStatusUnavailable,
			ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
		},
		{
			Status:       taskdto.ImageTaskResultStatusAvailable,
			Key:          results[1].Key,
			ThumbnailURL: service.DrawingImageURL(results[1].Key, false),
			OriginalURL:  service.DrawingImageURL(results[1].Key, true),
		},
	}, results)
	require.Empty(t, results[0].Key)
	require.Empty(t, results[0].ThumbnailURL)
	require.Empty(t, results[0].OriginalURL)

	original, originalOK := service.DrawingImageOriginalFilePath(results[1].Key)
	thumbnail, thumbnailOK := service.DrawingImageFilePath(results[1].Key)
	require.True(t, originalOK)
	require.True(t, thumbnailOK)
	storedOriginal, readErr := os.ReadFile(original)
	require.NoError(t, readErr)
	require.Equal(t, imageData, storedOriginal)
	storedThumbnail, readErr := os.ReadFile(thumbnail)
	require.NoError(t, readErr)
	require.NotEmpty(t, storedThumbnail)
}

func TestZhipu4vImageHandlerKeepsAllFailedSlotsInTaskResults(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{StartTime: time.Unix(1710000000, 0)}
	checkingWriter := &zhipuCaptureCheckingWriter{
		ResponseWriter: c.Writer,
		capturedBeforeWrite: func() bool {
			results, ok := common.GetContextKeyType[[]taskdto.ImageTaskResult](c, constant.ContextKeyDrawingTaskResults)
			return ok && len(results) == 2 && results[0] == (taskdto.ImageTaskResult{
				Status:    taskdto.ImageTaskResultStatusUnavailable,
				ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
			}) && results[1] == (taskdto.ImageTaskResult{
				Status:    taskdto.ImageTaskResultStatusUnavailable,
				ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
			})
		},
	}
	c.Writer = checkingWriter

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body: io.NopCloser(strings.NewReader(
			`{"created":1710000000,"data":[{"url":"file:///private/failure.png?token=must-not-leak"},{}]}`,
		)),
		Header: http.Header{"Content-Type": []string{"application/json"}},
	}

	usage, relayErr := zhipu4vImageHandler(c, resp, info)

	require.Nil(t, relayErr)
	require.NotNil(t, usage)
	require.Equal(t, `{"created":1710000000,"data":null}`, recorder.Body.String())
	require.NotContains(t, recorder.Body.String(), "file://")
	require.NotContains(t, recorder.Body.String(), "must-not-leak")
	require.True(t, checkingWriter.captured)
	require.Empty(t, common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys))
	results, ok := common.GetContextKeyType[[]taskdto.ImageTaskResult](c, constant.ContextKeyDrawingTaskResults)
	require.True(t, ok)
	require.Equal(t, []taskdto.ImageTaskResult{
		{
			Status:    taskdto.ImageTaskResultStatusUnavailable,
			ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
		},
		{
			Status:    taskdto.ImageTaskResultStatusUnavailable,
			ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
		},
	}, results)
}
