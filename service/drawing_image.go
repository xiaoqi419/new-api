package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	// Register image decoders used by the thumbnail pipeline.
	_ "image/gif"
	_ "image/png"

	_ "golang.org/x/image/webp"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	relaykitdto "github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	xdraw "golang.org/x/image/draw"
)

const (
	drawingThumbnailMaxDim   = 512
	drawingThumbnailQuality  = 82
	drawingImageMaxBytes     = 40 << 20 // 40MB source cap
	drawingKeyLength         = 32
	drawingImageCaptureLimit = 45 * time.Second
	drawingImageFetchTimeout = 30 * time.Second
	drawingImageFetchRetries = 3
	drawingImageRetryDelay   = 200 * time.Millisecond
)

// DrawingImageAssets identifies the stable assets captured for one image.
type DrawingImageAssets struct {
	ThumbnailKey string
	OriginalKey  string
}

func drawingImageBaseDir() string {
	if p := strings.TrimSpace(os.Getenv("DRAWING_IMAGE_PATH")); p != "" {
		return p
	}
	// Relative to the working directory, which is the persistent /data volume
	// in the Docker image.
	return "drawing_images"
}

func drawingImageTTLDays() int {
	days := common.GetEnvOrDefault("DRAWING_IMAGE_TTL_DAYS", 30)
	if days <= 0 {
		return 30
	}
	return days
}

func isValidDrawingKey(key string) bool {
	if len(key) != drawingKeyLength {
		return false
	}
	for _, r := range key {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') {
			return false
		}
	}
	return true
}

func drawingImagePath(key string) string {
	return filepath.Join(drawingImageBaseDir(), key[:2], key+".jpg")
}

func drawingImageOriginalPath(key string) string {
	return filepath.Join(drawingImageBaseDir(), key[:2], key+".original")
}

// DrawingImageFilePath resolves a stored thumbnail path for serving. It returns
// ("", false) when the key is malformed or the file is missing.
func DrawingImageFilePath(key string) (string, bool) {
	if !isValidDrawingKey(key) {
		return "", false
	}
	path := drawingImagePath(key)
	if info, err := os.Stat(path); err != nil || info.IsDir() {
		return "", false
	}
	return path, true
}

// DrawingImageOriginalFilePath resolves the durable original asset associated
// with a thumbnail key.
func DrawingImageOriginalFilePath(key string) (string, bool) {
	if !isValidDrawingKey(key) {
		return "", false
	}
	path := drawingImageOriginalPath(key)
	if info, err := os.Stat(path); err != nil || info.IsDir() {
		return "", false
	}
	return path, true
}

// DrawingImageURL returns a stable first-party URL for a captured asset.
func DrawingImageURL(key string, original bool) string {
	url := "/api/drawing_logs/image/" + key
	if original {
		url += "?variant=original"
	}
	return url
}

// CaptureImageResults persists assets from an OpenAI-shaped image response.
// Only keys backed by both an original and thumbnail are published on c.
func CaptureImageResults(c *gin.Context, responseBody []byte) {
	captureImageResultsWithClient(c, responseBody, nil)
}

// CaptureImageResultsWithProxy uses the channel's egress proxy when a provider
// result URL is not reachable directly. Capture is best-effort and never
// changes the successful provider response delivered to the client.
func CaptureImageResultsWithProxy(c *gin.Context, responseBody []byte, proxy string) {
	client, err := GetSSRFProtectedHTTPClientWithProxy(proxy)
	if err != nil {
		requestID := ""
		if c != nil {
			requestID = c.GetString(common.RequestIdKey)
		}
		common.SysError(drawingImageCaptureLogMessage(requestID, -1, "client_setup_failed"))
		return
	}
	captureImageResultsWithClient(c, responseBody, client)
}

// ConvertProviderImageURLToBase64WithProxy downloads a provider image through
// the protected fetch path and returns the OpenAI-compatible base64 payload.
// Its timeout is detached from the downstream request so the provider result
// can be converted independently once it has been received.
func ConvertProviderImageURLToBase64WithProxy(providerURL, proxy string) (string, error) {
	imageClient, err := GetSSRFProtectedHTTPClientWithProxy(proxy)
	if err != nil {
		return "", errors.New("provider image conversion failed")
	}
	conversionCtx, cancel := context.WithTimeout(context.Background(), drawingImageCaptureLimit)
	defer cancel()
	data, err := fetchDrawingImageBytesContextWithClient(conversionCtx, providerURL, "", imageClient)
	if err != nil {
		return "", errors.New("provider image conversion failed")
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

func drawingImageCaptureLogMessage(requestID string, index int, code string) string {
	return fmt.Sprintf("drawing image capture failed request_id=%s index=%d code=%s", requestID, index, code)
}

func captureImageResultsWithClient(c *gin.Context, responseBody []byte, imageClient *http.Client) {
	if c == nil || len(responseBody) == 0 {
		return
	}
	count := gjson.GetBytes(responseBody, "data.#").Int()
	if count <= 0 {
		return
	}
	if count > int64(relaykitdto.MaxImageN) {
		count = int64(relaykitdto.MaxImageN)
	}

	var keys []string
	results := make([]taskdto.ImageTaskResult, 0, count)
	requestID := c.GetString(common.RequestIdKey)
	captureCtx, cancel := context.WithTimeout(context.Background(), drawingImageCaptureLimit)
	defer cancel()
	for i := int64(0); i < count; i++ {
		d := gjson.GetBytes(responseBody, "data."+strconv.FormatInt(i, 10))
		url := d.Get("url").String()
		b64 := d.Get("b64_json").String()
		if url == "" && b64 == "" {
			continue
		}
		unavailable := taskdto.ImageTaskResult{
			Status:    taskdto.ImageTaskResultStatusUnavailable,
			ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
		}
		if captureCtx.Err() != nil {
			common.SysError(drawingImageCaptureLogMessage(requestID, int(i), "capture_deadline_exceeded"))
			results = append(results, unavailable)
			continue
		}
		key, err := common.GenerateRandomCharsKey(drawingKeyLength)
		if err != nil {
			common.SysError(drawingImageCaptureLogMessage(requestID, int(i), "key_generation_failed"))
			results = append(results, unavailable)
			continue
		}
		assets, err := persistDrawingImageWithClient(captureCtx, key, url, b64, imageClient)
		if err != nil {
			common.SysError(drawingImageCaptureLogMessage(requestID, int(i), taskdto.ImageTaskResultErrorCaptureFailed))
			results = append(results, unavailable)
			continue
		}
		keys = append(keys, assets.ThumbnailKey)
		results = append(results, taskdto.ImageTaskResult{
			Status:       taskdto.ImageTaskResultStatusAvailable,
			Key:          assets.ThumbnailKey,
			ThumbnailURL: DrawingImageURL(assets.ThumbnailKey, false),
			OriginalURL:  DrawingImageURL(assets.OriginalKey, true),
		})
	}
	if len(results) > 0 {
		common.SetContextKey(c, constant.ContextKeyDrawingTaskResults, results)
	}
	if len(keys) > 0 {
		common.SetContextKey(c, constant.ContextKeyDrawingResultKeys, keys)
	}
}

func fetchDrawingImageBytesContextWithClient(ctx context.Context, url string, b64 string, imageClient *http.Client) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if b64 != "" {
		if idx := strings.Index(b64, ","); strings.HasPrefix(b64, "data:") && idx != -1 {
			b64 = b64[idx+1:]
		}
		data, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return nil, fmt.Errorf("decode b64: %w", err)
		}
		if len(data) > drawingImageMaxBytes {
			return nil, fmt.Errorf("image too large: %d bytes", len(data))
		}
		if !isImageBytes(data) {
			return nil, fmt.Errorf("unsupported image MIME type")
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		return data, nil
	}
	if url == "" {
		return nil, fmt.Errorf("image URL is empty")
	}
	if err := ValidateSSRFProtectedFetchURL(url); err != nil {
		return nil, fmt.Errorf("image URL rejected: %w", err)
	}
	client := imageClient
	if client == nil {
		client = GetSSRFProtectedHTTPClient()
	}
	if client == nil {
		return nil, fmt.Errorf("image HTTP client unavailable")
	}
	var lastErr error
	for attempt := 0; attempt < drawingImageFetchRetries; attempt++ {
		requestCtx, cancel := context.WithTimeout(ctx, drawingImageFetchTimeout)
		req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, url, nil)
		if err != nil {
			cancel()
			return nil, err
		}
		resp, err := client.Do(req)
		if err == nil {
			data, readErr := io.ReadAll(io.LimitReader(resp.Body, drawingImageMaxBytes+1))
			contentType := strings.ToLower(strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]))
			resp.Body.Close()
			cancel()
			if readErr != nil {
				lastErr = readErr
			} else if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
				lastErr = fmt.Errorf("upstream image status %d", resp.StatusCode)
			} else if len(data) > drawingImageMaxBytes {
				return nil, fmt.Errorf("image too large")
			} else if contentType != "" && !strings.HasPrefix(contentType, "image/") {
				return nil, fmt.Errorf("unsupported image MIME type: %s", contentType)
			} else if !isImageBytes(data) {
				return nil, fmt.Errorf("unsupported image MIME type")
			} else {
				return data, nil
			}
		} else {
			cancel()
			lastErr = err
		}
		if attempt+1 < drawingImageFetchRetries {
			timer := time.NewTimer(drawingImageRetryDelay)
			select {
			case <-ctx.Done():
				if !timer.Stop() {
					<-timer.C
				}
				return nil, ctx.Err()
			case <-timer.C:
			}
		}
	}
	return nil, lastErr
}

func isImageBytes(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	return strings.HasPrefix(strings.ToLower(http.DetectContentType(data)), "image/")
}

func persistDrawingImage(ctx context.Context, key, url, b64 string) (DrawingImageAssets, error) {
	return persistDrawingImageWithClient(ctx, key, url, b64, nil)
}

func persistDrawingImageWithClient(ctx context.Context, key, url, b64 string, imageClient *http.Client) (DrawingImageAssets, error) {
	data, err := fetchDrawingImageBytesContextWithClient(ctx, url, b64, imageClient)
	if err != nil {
		return DrawingImageAssets{}, err
	}
	if err := ctx.Err(); err != nil {
		return DrawingImageAssets{}, err
	}
	if err := saveDrawingOriginal(key, data); err != nil {
		return DrawingImageAssets{}, fmt.Errorf("save drawing original: %w", err)
	}
	if err := ctx.Err(); err != nil {
		_ = os.Remove(drawingImageOriginalPath(key))
		return DrawingImageAssets{}, err
	}
	if err := saveDrawingThumbnail(key, data); err != nil {
		_ = os.Remove(drawingImageOriginalPath(key))
		_ = os.Remove(drawingImagePath(key))
		return DrawingImageAssets{}, fmt.Errorf("save drawing thumbnail: %w", err)
	}
	return DrawingImageAssets{ThumbnailKey: key, OriginalKey: key}, nil
}

func saveDrawingOriginal(key string, data []byte) error {
	path := drawingImageOriginalPath(key)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func saveDrawingThumbnail(key string, data []byte) error {
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("decode image: %w", err)
	}
	thumb := resizeDrawingImage(src, drawingThumbnailMaxDim)

	path := drawingImagePath(key)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if err := jpeg.Encode(f, thumb, &jpeg.Options{Quality: drawingThumbnailQuality}); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

func resizeDrawingImage(src image.Image, maxDim int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= maxDim && h <= maxDim {
		return src
	}
	longest := w
	if h > longest {
		longest = h
	}
	scale := float64(maxDim) / float64(longest)
	nw := int(float64(w) * scale)
	nh := int(float64(h) * scale)
	if nw < 1 {
		nw = 1
	}
	if nh < 1 {
		nh = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, b, xdraw.Over, nil)
	return dst
}

// StartDrawingImageCleanupTask periodically removes original and thumbnail assets older than the
// configured TTL. Master-only to avoid redundant sweeps on a shared volume.
func StartDrawingImageCleanupTask() {
	if !common.IsMasterNode {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				common.SysError(fmt.Sprintf("panic in drawing image cleanup: %v", r))
			}
		}()
		cleanupOldDrawingImages()
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cleanupOldDrawingImages()
		}
	}()
}

func cleanupOldDrawingImages() {
	baseDir := drawingImageBaseDir()
	cutoff := time.Now().Add(-time.Duration(drawingImageTTLDays()) * 24 * time.Hour)
	removed := 0
	_ = filepath.Walk(baseDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		if info.ModTime().Before(cutoff) {
			if rmErr := os.Remove(path); rmErr == nil {
				removed++
			}
		}
		return nil
	})
	if removed > 0 {
		common.SysLog(fmt.Sprintf("drawing image cleanup removed %d expired image assets", removed))
	}
}
