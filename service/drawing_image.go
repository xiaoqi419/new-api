package service

import (
	"bytes"
	"encoding/base64"
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
	"github.com/QuantumNous/new-api/dto"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	xdraw "golang.org/x/image/draw"
)

const (
	drawingThumbnailMaxDim  = 512
	drawingThumbnailQuality = 82
	drawingImageMaxBytes    = 40 << 20 // 40MB source cap
	drawingKeyLength        = 32
)

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

// CaptureImageResults extracts image results from an OpenAI-shaped image
// response, allocates unguessable thumbnail keys, stashes them on the request
// context for the consume-log writer, and persists thumbnails off the request
// path. Only used on the image generations/edits relay path.
func CaptureImageResults(c *gin.Context, responseBody []byte) {
	if c == nil || len(responseBody) == 0 {
		return
	}
	count := gjson.GetBytes(responseBody, "data.#").Int()
	if count <= 0 {
		return
	}
	if count > int64(dto.MaxImageN) {
		count = int64(dto.MaxImageN)
	}

	type pendingImage struct {
		key string
		url string
		b64 string
	}
	var pending []pendingImage
	var keys []string
	for i := int64(0); i < count; i++ {
		d := gjson.GetBytes(responseBody, "data."+strconv.FormatInt(i, 10))
		url := d.Get("url").String()
		b64 := d.Get("b64_json").String()
		if url == "" && b64 == "" {
			continue
		}
		key := common.GetRandomString(drawingKeyLength)
		keys = append(keys, key)
		pending = append(pending, pendingImage{key: key, url: url, b64: b64})
	}
	if len(keys) == 0 {
		return
	}
	common.SetContextKey(c, constant.ContextKeyDrawingResultKeys, keys)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				common.SysError(fmt.Sprintf("panic in CaptureImageResults: %v", r))
			}
		}()
		for _, p := range pending {
			data, err := fetchDrawingImageBytes(p.url, p.b64)
			if err != nil {
				common.SysError("drawing image fetch failed: " + err.Error())
				continue
			}
			if err := saveDrawingThumbnail(p.key, data); err != nil {
				common.SysError("drawing thumbnail save failed: " + err.Error())
			}
		}
	}()
}

func fetchDrawingImageBytes(url string, b64 string) ([]byte, error) {
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
		return data, nil
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream image status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, drawingImageMaxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > drawingImageMaxBytes {
		return nil, fmt.Errorf("image too large")
	}
	return data, nil
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

// StartDrawingImageCleanupTask periodically removes thumbnails older than the
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
		common.SysLog(fmt.Sprintf("drawing image cleanup removed %d expired thumbnails", removed))
	}
}
