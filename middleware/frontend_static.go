package middleware

import (
	"bytes"
	"compress/gzip"
	"errors"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"sync"

	ginGzip "github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// precompressedFile is the gzip encoding of one frontend build file.
type precompressedFile struct {
	once        sync.Once
	body        []byte
	contentType string
	err         error
}

// ServeFrontendFiles serves files from the embedded frontend build. The build
// never changes while the process runs, so each file is gzip-compressed once
// and the bytes are reused, instead of recompressing multi-megabyte chunks on
// every request. The cache holds at most one entry per build file. Clients
// without gzip, the image types the gzip middleware skips, directories, and
// the index.html redirect keep using http.FileServer.
func ServeFrontendFiles(frontendFS static.ServeFileSystem, mounts ...string) gin.HandlerFunc {
	var fileServer http.Handler = http.FileServer(frontendFS)
	mount := ""
	if len(mounts) > 0 {
		mount = strings.TrimSuffix(mounts[0], "/")
		fileServer = http.StripPrefix(mount, fileServer)
	}
	var cache sync.Map // URL path -> *precompressedFile
	return func(c *gin.Context) {
		urlPath := c.Request.URL.Path
		if mount != "" {
			if !strings.HasPrefix(urlPath, mount+"/") {
				return
			}
			urlPath = strings.TrimPrefix(urlPath, mount)
		}
		if !frontendFS.Exists("/", urlPath) {
			return
		}
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.AbortWithStatus(http.StatusMethodNotAllowed)
			return
		}
		c.Abort()
		gzipQuality, wildcardQuality := -1.0, 0.0
		for encoding := range strings.SplitSeq(c.GetHeader("Accept-Encoding"), ",") {
			name, params, err := mime.ParseMediaType(strings.TrimSpace(encoding))
			if err != nil {
				continue
			}
			quality := 1.0
			if rawQuality, exists := params["q"]; exists {
				parsed, err := strconv.ParseFloat(rawQuality, 64)
				if err != nil || !(parsed >= 0 && parsed <= 1) {
					quality = 0
				} else {
					quality = parsed
				}
			}
			switch name {
			case "gzip":
				gzipQuality = quality
			case "*":
				wildcardQuality = quality
			}
		}
		acceptsGzip := gzipQuality > 0 || (gzipQuality < 0 && wildcardQuality > 0)
		if !acceptsGzip ||
			ginGzip.DefaultExcludedExtentions.Contains(path.Ext(urlPath)) ||
			strings.HasSuffix(urlPath, "/index.html") {
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}

		value, ok := cache.Load(urlPath)
		if !ok {
			value, _ = cache.LoadOrStore(urlPath, &precompressedFile{})
		}
		file := value.(*precompressedFile)
		file.once.Do(func() {
			f, err := frontendFS.Open(urlPath)
			if err != nil {
				file.err = err
				return
			}
			defer f.Close()
			info, err := f.Stat()
			if err != nil {
				file.err = err
				return
			}
			if info.IsDir() {
				file.err = errors.New("directory")
				return
			}
			raw, err := io.ReadAll(f)
			if err != nil {
				file.err = err
				return
			}
			var compressed bytes.Buffer
			writer := gzip.NewWriter(&compressed)
			if _, err := writer.Write(raw); err != nil {
				file.err = err
				return
			}
			if err := writer.Close(); err != nil {
				file.err = err
				return
			}
			// Match http.FileServer: extension first, then content sniffing.
			file.contentType = mime.TypeByExtension(path.Ext(urlPath))
			if file.contentType == "" {
				file.contentType = http.DetectContentType(raw)
			}
			file.body = bytes.Clone(compressed.Bytes())
		})
		if file.err != nil {
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}

		// Range requests get the whole body; a server may ignore Range.
		header := c.Writer.Header()
		header.Set("Content-Encoding", "gzip")
		header.Set("Vary", "Accept-Encoding")
		header.Set("Content-Type", file.contentType)
		header.Set("Content-Length", strconv.Itoa(len(file.body)))
		c.Writer.WriteHeader(http.StatusOK)
		if c.Request.Method != http.MethodHead {
			_, _ = c.Writer.Write(file.body)
		}
	}
}
