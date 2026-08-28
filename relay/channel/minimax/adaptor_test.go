package minimax

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
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
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGetRequestURLForImageGeneration(t *testing.T) {
	t.Parallel()

	info := &relaycommon.RelayInfo{
		RelayMode: relayconstant.RelayModeImagesGenerations,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: "https://api.minimax.chat",
		},
	}

	got, err := GetRequestURL(info)
	if err != nil {
		t.Fatalf("GetRequestURL returned error: %v", err)
	}

	want := "https://api.minimax.chat/v1/image_generation"
	if got != want {
		t.Fatalf("GetRequestURL() = %q, want %q", got, want)
	}
}

func TestConvertImageRequest(t *testing.T) {
	t.Parallel()

	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeImagesGenerations,
		OriginModelName: "image-01",
	}
	request := dto.ImageRequest{
		Model:          "image-01",
		Prompt:         "a red fox in snowfall",
		Size:           "1536x1024",
		ResponseFormat: "url",
		N:              uintPtr(2),
	}

	got, err := adaptor.ConvertImageRequest(gin.CreateTestContextOnly(httptest.NewRecorder(), gin.New()), info, request)
	if err != nil {
		t.Fatalf("ConvertImageRequest returned error: %v", err)
	}

	body, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("json.Unmarshal returned error: %v", err)
	}

	if payload["model"] != "image-01" {
		t.Fatalf("model = %#v, want %q", payload["model"], "image-01")
	}
	if payload["prompt"] != request.Prompt {
		t.Fatalf("prompt = %#v, want %q", payload["prompt"], request.Prompt)
	}
	if payload["n"] != float64(2) {
		t.Fatalf("n = %#v, want 2", payload["n"])
	}
	if payload["aspect_ratio"] != "3:2" {
		t.Fatalf("aspect_ratio = %#v, want %q", payload["aspect_ratio"], "3:2")
	}
	if payload["response_format"] != "url" {
		t.Fatalf("response_format = %#v, want %q", payload["response_format"], "url")
	}
}

func TestDoResponseForImageGeneration(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)

	info := &relaycommon.RelayInfo{
		RelayMode: relayconstant.RelayModeImagesGenerations,
		StartTime: time.Unix(1700000000, 0),
	}
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       httptest.NewRecorder().Result().Body,
	}
	resp.Body = ioNopCloser(`{"data":{"image_urls":["https://example.com/minimax.png"]}}`)

	adaptor := &Adaptor{}
	usage, err := adaptor.DoResponse(c, resp, info)
	if err != nil {
		t.Fatalf("DoResponse returned error: %v", err)
	}
	if usage == nil {
		t.Fatalf("DoResponse returned nil usage")
	}

	body := recorder.Body.String()
	if !strings.Contains(body, `"url":"https://example.com/minimax.png"`) {
		t.Fatalf("response body = %s, want OpenAI image response with image URL", body)
	}
	if strings.Contains(body, `"image_urls"`) {
		t.Fatalf("response body = %s, should not expose raw MiniMax image_urls payload", body)
	}
}

func TestMiniMaxImageHandlerCapturesBase64ResultsBeforeResponseDelivery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("DRAWING_IMAGE_PATH", t.TempDir())

	firstImage := miniMaxTestPNG(t, color.RGBA{R: 0x10, G: 0x20, B: 0x30, A: 0xff})
	secondImage := miniMaxTestPNG(t, color.RGBA{R: 0x40, G: 0x50, B: 0x60, A: 0xff})
	base64Images := []string{
		base64.StdEncoding.EncodeToString(firstImage),
		base64.StdEncoding.EncodeToString(secondImage),
	}

	responseWriter := &captureAssertingResponseWriter{recorder: httptest.NewRecorder()}
	c, _ := gin.CreateTestContext(responseWriter)
	responseWriter.beforeDelivery = func() {
		results, ok := common.GetContextKeyType[[]taskdto.ImageTaskResult](c, constant.ContextKeyDrawingTaskResults)
		require.True(t, ok)
		require.Len(t, results, len(base64Images))

		keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys)
		require.Len(t, keys, len(base64Images))
		for index, expectedOriginal := range [][]byte{firstImage, secondImage} {
			result := results[index]
			require.Equal(t, taskdto.ImageTaskResultStatusAvailable, result.Status)
			require.Empty(t, result.ErrorCode)
			require.Equal(t, keys[index], result.Key)
			require.Len(t, result.Key, 32)
			require.Equal(t, service.DrawingImageURL(result.Key, false), result.ThumbnailURL)
			require.Equal(t, service.DrawingImageURL(result.Key, true), result.OriginalURL)
			require.NotContains(t, result.ThumbnailURL, base64Images[index])
			require.NotContains(t, result.OriginalURL, base64Images[index])

			originalPath, ok := service.DrawingImageOriginalFilePath(result.Key)
			require.True(t, ok)
			original, err := os.ReadFile(originalPath)
			require.NoError(t, err)
			require.Equal(t, expectedOriginal, original)

			thumbnailPath, ok := service.DrawingImageFilePath(result.Key)
			require.True(t, ok)
			thumbnail, err := os.ReadFile(thumbnailPath)
			require.NoError(t, err)
			require.NotEmpty(t, thumbnail)
		}
	}

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       ioNopCloser(`{"data":{"image_base64":["` + base64Images[0] + `","` + base64Images[1] + `"]}}`),
	}
	startTime := time.Unix(1700000000, 0)
	usage, apiErr := miniMaxImageHandler(c, resp, &relaycommon.RelayInfo{StartTime: startTime})
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	require.True(t, responseWriter.deliveryStarted)

	var response dto.ImageResponse
	require.NoError(t, common.Unmarshal(responseWriter.recorder.Body.Bytes(), &response))
	require.Equal(t, startTime.Unix(), response.Created)
	require.Equal(t, []dto.ImageData{
		{B64Json: base64Images[0]},
		{B64Json: base64Images[1]},
	}, response.Data)
	require.NotContains(t, responseWriter.recorder.Body.String(), `"image_base64"`)
	require.Equal(t, http.StatusOK, responseWriter.recorder.Code)
	require.Equal(t, "application/json", responseWriter.recorder.Header().Get("Content-Type"))
}

func TestMiniMaxImageHandlerKeepsSuccessfulResultAfterDownstreamWriteFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("DRAWING_IMAGE_PATH", t.TempDir())

	originalImage := miniMaxTestPNG(t, color.RGBA{R: 0x70, G: 0x80, B: 0x90, A: 0xff})
	base64Image := base64.StdEncoding.EncodeToString(originalImage)
	responseWriter := &captureAssertingResponseWriter{
		recorder: httptest.NewRecorder(),
		writeErr: errors.New("downstream response write failed"),
	}
	c, _ := gin.CreateTestContext(responseWriter)
	responseWriter.beforeDelivery = func() {
		results, ok := common.GetContextKeyType[[]taskdto.ImageTaskResult](c, constant.ContextKeyDrawingTaskResults)
		require.True(t, ok)
		require.Len(t, results, 1)

		result := results[0]
		require.Equal(t, taskdto.ImageTaskResultStatusAvailable, result.Status)
		require.Empty(t, result.ErrorCode)
		require.Len(t, result.Key, 32)
		require.Equal(t, service.DrawingImageURL(result.Key, false), result.ThumbnailURL)
		require.Equal(t, service.DrawingImageURL(result.Key, true), result.OriginalURL)
		require.NotContains(t, result.OriginalURL, base64Image)

		originalPath, ok := service.DrawingImageOriginalFilePath(result.Key)
		require.True(t, ok)
		persistedOriginal, err := os.ReadFile(originalPath)
		require.NoError(t, err)
		require.Equal(t, originalImage, persistedOriginal)

		thumbnailPath, ok := service.DrawingImageFilePath(result.Key)
		require.True(t, ok)
		thumbnail, err := os.ReadFile(thumbnailPath)
		require.NoError(t, err)
		require.NotEmpty(t, thumbnail)
	}

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       ioNopCloser(`{"data":{"image_base64":["` + base64Image + `"]}}`),
	}
	usage, apiErr := miniMaxImageHandler(c, resp, &relaycommon.RelayInfo{StartTime: time.Unix(1700000000, 0)})
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	require.True(t, responseWriter.deliveryStarted)
	require.True(t, responseWriter.writeAttempted)
}

type captureAssertingResponseWriter struct {
	recorder        *httptest.ResponseRecorder
	beforeDelivery  func()
	deliveryStarted bool
	writeAttempted  bool
	writeErr        error
}

func (w *captureAssertingResponseWriter) Header() http.Header {
	w.beginDelivery()
	return w.recorder.Header()
}

func (w *captureAssertingResponseWriter) WriteHeader(statusCode int) {
	w.beginDelivery()
	w.recorder.WriteHeader(statusCode)
}

func (w *captureAssertingResponseWriter) Write(data []byte) (int, error) {
	w.beginDelivery()
	w.writeAttempted = true
	if w.writeErr != nil {
		return 0, w.writeErr
	}
	return w.recorder.Write(data)
}

func (w *captureAssertingResponseWriter) Flush() {
	w.beginDelivery()
	w.recorder.Flush()
}

func (w *captureAssertingResponseWriter) beginDelivery() {
	if w.deliveryStarted || w.beforeDelivery == nil {
		return
	}
	w.deliveryStarted = true
	w.beforeDelivery()
}

func miniMaxTestPNG(t *testing.T, pixel color.RGBA) []byte {
	t.Helper()

	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.SetRGBA(0, 0, pixel)
	var data bytes.Buffer
	require.NoError(t, png.Encode(&data, img))
	return data.Bytes()
}

type nopReadCloser struct {
	*strings.Reader
}

func (n nopReadCloser) Close() error {
	return nil
}

func ioNopCloser(body string) nopReadCloser {
	return nopReadCloser{Reader: strings.NewReader(body)}
}

func uintPtr(v uint) *uint {
	return &v
}
