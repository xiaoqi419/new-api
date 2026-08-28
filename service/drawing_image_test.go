package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

const testDrawingPNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

type imageRoundTripFunc func(*http.Request) (*http.Response, error)

func (f imageRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func imageResponse(req *http.Request, contentType string, body []byte) *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{contentType}},
		Body:       io.NopCloser(bytes.NewReader(body)),
		Request:    req,
	}
}

func testPNGBytes(t *testing.T) []byte {
	t.Helper()
	data, err := base64.StdEncoding.DecodeString(testDrawingPNG)
	require.NoError(t, err)
	return data
}

func newDrawingCaptureContext() *gin.Context {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	return c
}

func TestPersistDrawingImageWritesOriginalAndThumbnail(t *testing.T) {
	baseDir := t.TempDir()
	t.Setenv("DRAWING_IMAGE_PATH", baseDir)
	key := "0123456789abcdefghijklmnopqrstuv"
	pngData := testPNGBytes(t)

	assets, err := persistDrawingImage(context.Background(), key, "", base64.StdEncoding.EncodeToString(pngData))
	require.NoError(t, err)
	require.Equal(t, key, assets.OriginalKey)
	require.Equal(t, key, assets.ThumbnailKey)

	original, ok := DrawingImageOriginalFilePath(key)
	require.True(t, ok)
	thumbnail, ok := DrawingImageFilePath(key)
	require.True(t, ok)
	require.Equal(t, pngData, mustReadFile(t, original))
	require.NotEmpty(t, mustReadFile(t, thumbnail))
	require.Equal(t, filepath.Join(baseDir, key[:2], key+".original"), original)
}

func TestPersistDrawingImageRemovesOriginalWhenThumbnailCreationFails(t *testing.T) {
	t.Setenv("DRAWING_IMAGE_PATH", t.TempDir())
	key := "fedcba9876543210abcdefghijklmnop"
	truncatedPNG := base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\n"))

	_, err := persistDrawingImage(context.Background(), key, "", truncatedPNG)

	require.ErrorContains(t, err, "save drawing thumbnail")
	_, originalOK := DrawingImageOriginalFilePath(key)
	_, thumbnailOK := DrawingImageFilePath(key)
	require.False(t, originalOK)
	require.False(t, thumbnailOK)
}

func TestCaptureImageResultsAllocatesFreshKeysAndRecordsOnlyCompletedAssets(t *testing.T) {
	baseDir := t.TempDir()
	t.Setenv("DRAWING_IMAGE_PATH", baseDir)
	body := []byte(`{"data":[{"b64_json":"` + testDrawingPNG + `"}]}`)

	firstContext := newDrawingCaptureContext()
	captureImageResultsWithClient(firstContext, body, nil)
	firstKeys := common.GetContextKeyStringSlice(firstContext, constant.ContextKeyDrawingResultKeys)
	require.Len(t, firstKeys, 1)
	require.Regexp(t, `^[A-Za-z0-9]{32}$`, firstKeys[0])
	_, originalOK := DrawingImageOriginalFilePath(firstKeys[0])
	_, thumbnailOK := DrawingImageFilePath(firstKeys[0])
	require.True(t, originalOK)
	require.True(t, thumbnailOK)

	secondContext := newDrawingCaptureContext()
	captureImageResultsWithClient(secondContext, body, nil)
	secondKeys := common.GetContextKeyStringSlice(secondContext, constant.ContextKeyDrawingResultKeys)
	require.Len(t, secondKeys, 1)
	require.NotEqual(t, firstKeys[0], secondKeys[0])
}

func TestCaptureImageResultsPersistsProviderURLWithoutChangingResponse(t *testing.T) {
	baseDir := t.TempDir()
	t.Setenv("DRAWING_IMAGE_PATH", baseDir)
	pngData := testPNGBytes(t)
	body := []byte(`{"created":1710000000,"data":[{"url":"https://example.com/result.png"}]}`)
	client := &http.Client{Transport: imageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		return imageResponse(req, "image/png", pngData), nil
	})}
	c := newDrawingCaptureContext()
	originalBody := string(body)

	captureImageResultsWithClient(c, body, client)

	require.Equal(t, originalBody, string(body))
	keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys)
	require.Len(t, keys, 1)
	original, ok := DrawingImageOriginalFilePath(keys[0])
	require.True(t, ok)
	require.Equal(t, pngData, mustReadFile(t, original))
}

func TestCaptureImageResultsWithProxyFetchesProviderURLThroughChannelProxy(t *testing.T) {
	t.Setenv("DRAWING_IMAGE_PATH", t.TempDir())
	pngData := testPNGBytes(t)
	requests := 0
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		requests++
		require.Equal(t, "http://example.com/result.png", req.URL.String())
		w.Header().Set("Content-Type", "image/png")
		_, err := w.Write(pngData)
		require.NoError(t, err)
	}))
	t.Cleanup(proxy.Close)
	c := newDrawingCaptureContext()

	CaptureImageResultsWithProxy(c, []byte(`{"data":[{"url":"http://example.com/result.png"}]}`), proxy.URL)

	require.Equal(t, 1, requests)
	require.Len(t, common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys), 1)
}

func TestCaptureImageResultsUsesIndependentHardTimeoutContext(t *testing.T) {
	baseDir := t.TempDir()
	t.Setenv("DRAWING_IMAGE_PATH", baseDir)
	pngData := testPNGBytes(t)
	requestContext, cancel := context.WithCancel(context.Background())
	cancel()
	c := newDrawingCaptureContext()
	c.Request = c.Request.WithContext(requestContext)
	var sawDeadline bool
	client := &http.Client{Transport: imageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		require.NoError(t, req.Context().Err())
		_, sawDeadline = req.Context().Deadline()
		return imageResponse(req, "image/png", pngData), nil
	})}

	captureImageResultsWithClient(c, []byte(`{"data":[{"url":"https://example.com/result.png"}]}`), client)

	require.True(t, sawDeadline)
	require.Len(t, common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys), 1)
}

func TestCaptureImageResultsRecordsOnlySuccessfulKeys(t *testing.T) {
	baseDir := t.TempDir()
	t.Setenv("DRAWING_IMAGE_PATH", baseDir)
	pngData := testPNGBytes(t)
	client := &http.Client{Transport: imageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		if strings.HasSuffix(req.URL.Path, "/ok.png") {
			return imageResponse(req, "image/png", pngData), nil
		}
		return imageResponse(req, "text/plain", []byte("not an image")), nil
	})}
	c := newDrawingCaptureContext()
	body := []byte(`{"data":[{"url":"https://example.com/ok.png"},{"url":"https://example.com/fail.txt"}]}`)

	captureImageResultsWithClient(c, body, client)

	keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys)
	require.Len(t, keys, 1)
	_, originalOK := DrawingImageOriginalFilePath(keys[0])
	_, thumbnailOK := DrawingImageFilePath(keys[0])
	require.True(t, originalOK)
	require.True(t, thumbnailOK)
}

func TestCaptureImageResultsPreservesOrderedSafeMetadataForMixedResults(t *testing.T) {
	t.Setenv("DRAWING_IMAGE_PATH", t.TempDir())
	pngData := testPNGBytes(t)
	client := &http.Client{Transport: imageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		if strings.HasSuffix(req.URL.Path, "/ok.png") {
			return imageResponse(req, "image/png", pngData), nil
		}
		return nil, errors.New("provider URL https://secret.example/result.png?token=must-not-leak failed")
	})}
	c := newDrawingCaptureContext()
	c.Set(common.RequestIdKey, "req-mixed-capture")
	body := []byte(`{"data":[{"url":"https://example.com/ok.png"},{"url":"https://secret.example/fail.png?token=must-not-leak"},{"b64_json":"` + testDrawingPNG + `"}]}`)

	captureImageResultsWithClient(c, body, client)

	keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys)
	require.Len(t, keys, 2)
	results, ok := common.GetContextKeyType[[]taskdto.ImageTaskResult](c, constant.ContextKeyDrawingTaskResults)
	require.True(t, ok)
	require.Len(t, results, 3)
	require.Equal(t, taskdto.ImageTaskResult{
		Status:       taskdto.ImageTaskResultStatusAvailable,
		Key:          keys[0],
		ThumbnailURL: DrawingImageURL(keys[0], false),
		OriginalURL:  DrawingImageURL(keys[0], true),
	}, results[0])
	require.Equal(t, taskdto.ImageTaskResult{
		Status:    taskdto.ImageTaskResultStatusUnavailable,
		ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
	}, results[1])
	require.Equal(t, taskdto.ImageTaskResult{
		Status:       taskdto.ImageTaskResultStatusAvailable,
		Key:          keys[1],
		ThumbnailURL: DrawingImageURL(keys[1], false),
		OriginalURL:  DrawingImageURL(keys[1], true),
	}, results[2])

	encoded, err := common.Marshal(results)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "secret.example")
	require.NotContains(t, string(encoded), "must-not-leak")
}

func TestCaptureImageResultsFailureDoesNotPublishAKey(t *testing.T) {
	baseDir := t.TempDir()
	t.Setenv("DRAWING_IMAGE_PATH", baseDir)
	client := &http.Client{Transport: imageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		return nil, errors.New("temporary provider failure")
	})}
	c := newDrawingCaptureContext()
	c.Set(common.RequestIdKey, "req-failed-capture")

	captureImageResultsWithClient(c, []byte(`{"data":[{"url":"https://example.com/result.png"}]}`), client)

	require.Empty(t, common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys))
	results, ok := common.GetContextKeyType[[]taskdto.ImageTaskResult](c, constant.ContextKeyDrawingTaskResults)
	require.True(t, ok)
	require.Equal(t, []taskdto.ImageTaskResult{{
		Status:    taskdto.ImageTaskResultStatusUnavailable,
		ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
	}}, results)
	entries, err := os.ReadDir(baseDir)
	require.NoError(t, err)
	require.Empty(t, entries)
}

func TestDrawingImageCaptureLogMessageIsRequestCorrelatedAndSanitized(t *testing.T) {
	message := drawingImageCaptureLogMessage("req-log-123", 2, taskdto.ImageTaskResultErrorCaptureFailed)

	require.Equal(t, "drawing image capture failed request_id=req-log-123 index=2 code=capture_failed", message)
	require.NotContains(t, message, "http://")
	require.NotContains(t, message, "https://")
}

func TestFetchDrawingImageRejectsNonImageContent(t *testing.T) {
	client := &http.Client{Transport: imageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		return imageResponse(req, "text/plain; charset=utf-8", []byte("not an image")), nil
	})}

	_, err := fetchDrawingImageBytesContextWithClient(context.Background(), "https://example.com/result", "", client)
	require.ErrorContains(t, err, "unsupported image MIME type")
}

func TestConvertProviderImageURLToBase64WithProxyUsesProtectedClient(t *testing.T) {
	pngData := testPNGBytes(t)
	requests := 0
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		requests++
		require.Equal(t, "http://example.com/result.png", req.URL.String())
		w.Header().Set("Content-Type", "image/png")
		_, err := w.Write(pngData)
		require.NoError(t, err)
	}))
	t.Cleanup(proxy.Close)

	b64, err := ConvertProviderImageURLToBase64WithProxy("http://example.com/result.png", proxy.URL)

	require.NoError(t, err)
	require.Equal(t, base64.StdEncoding.EncodeToString(pngData), b64)
	require.Equal(t, 1, requests)
}

func TestConvertProviderImageURLToBase64WithProxyRejectsUnsafeAndInvalidResults(t *testing.T) {
	unsafeURL := "file:///private/result.png?token=must-not-leak"
	_, err := ConvertProviderImageURLToBase64WithProxy(unsafeURL, "")
	require.Error(t, err)
	require.NotContains(t, err.Error(), unsafeURL)
	require.NotContains(t, err.Error(), "must-not-leak")

	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, writeErr := w.Write([]byte("not an image"))
		require.NoError(t, writeErr)
	}))
	t.Cleanup(proxy.Close)

	_, err = ConvertProviderImageURLToBase64WithProxy("http://example.com/invalid.png", proxy.URL)
	require.Error(t, err)
	require.NotContains(t, err.Error(), "example.com")
}

func TestCleanupOldDrawingImagesRemovesOriginalAndThumbnail(t *testing.T) {
	baseDir := t.TempDir()
	t.Setenv("DRAWING_IMAGE_PATH", baseDir)
	t.Setenv("DRAWING_IMAGE_TTL_DAYS", "1")
	key := "00112233445566778899aabbccddeeff"
	_, err := persistDrawingImage(context.Background(), key, "", testDrawingPNG)
	require.NoError(t, err)
	old := time.Now().Add(-48 * time.Hour)
	original, ok := DrawingImageOriginalFilePath(key)
	require.True(t, ok)
	thumbnail, ok := DrawingImageFilePath(key)
	require.True(t, ok)
	require.NoError(t, os.Chtimes(original, old, old))
	require.NoError(t, os.Chtimes(thumbnail, old, old))

	cleanupOldDrawingImages()

	_, ok = DrawingImageOriginalFilePath(key)
	require.False(t, ok)
	_, ok = DrawingImageFilePath(key)
	require.False(t, ok)
}

func mustReadFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	return data
}
