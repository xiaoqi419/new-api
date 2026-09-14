package common

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"strings"

	"github.com/gin-contrib/static"
)

// Credit: https://github.com/gin-contrib/static/issues/19

type embedFileSystem struct {
	http.FileSystem
}

func (e *embedFileSystem) Exists(prefix string, path string) bool {
	file, err := e.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()
	return true
}

func (e *embedFileSystem) Open(name string) (http.File, error) {
	if name == "/" {
		// This will make sure the index page goes to NoRouter handler,
		// which will use the replaced index bytes with analytic codes.
		return nil, os.ErrNotExist
	}
	return e.FileSystem.Open(name)
}

func EmbedFolder(fsEmbed embed.FS, targetPath string) static.ServeFileSystem {
	efs, err := fs.Sub(fsEmbed, targetPath)
	if err != nil {
		panic(err)
	}
	return &embedFileSystem{
		FileSystem: http.FS(efs),
	}
}

// subPathFileSystem serves an embedded folder mounted under a URL prefix.
// static.Serve only strips the prefix for the file server, so Exists still
// receives the full request path; without trimming it here every asset under
// the prefix is reported missing and falls through to the SPA fallback.
type subPathFileSystem struct {
	static.ServeFileSystem
	prefix string
}

func (s *subPathFileSystem) Exists(prefix string, path string) bool {
	// Match a complete URL path segment. A byte-prefix check would also accept
	// lookalike mounts such as /canvas-app2 and let this filesystem claim paths
	// owned by another handler. Keep the exact mount root out of the static
	// lookup: embedFileSystem deliberately reports its root as missing so the
	// caller's SPA fallback can provide index.html.
	if path != s.prefix {
		childPrefix := s.prefix
		if !strings.HasSuffix(childPrefix, "/") {
			childPrefix += "/"
		}
		if !strings.HasPrefix(path, childPrefix) {
			return false
		}
	}

	relativePath := strings.TrimPrefix(path, s.prefix)
	if relativePath == "" || relativePath == "/" {
		return false
	}
	// http.FS expects a slash-free, fs.ValidPath-compatible name after its
	// leading slash is removed. Reject dot segments here as well so a custom
	// ServeFileSystem cannot reinterpret an encoded traversal differently from
	// the embedded filesystem used by EmbedFolder.
	relativeName := strings.TrimPrefix(relativePath, "/")
	if relativeName == "." || !fs.ValidPath(relativeName) {
		return false
	}
	return s.ServeFileSystem.Exists(prefix, relativePath)
}

func EmbedFolderAt(fsEmbed embed.FS, targetPath string, urlPrefix string) static.ServeFileSystem {
	return &subPathFileSystem{
		ServeFileSystem: EmbedFolder(fsEmbed, targetPath),
		prefix:          urlPrefix,
	}
}

// themeAwareFileSystem delegates to the appropriate embedded FS based on
// the current theme (via GetTheme). This enables serving either the default
// or the classic frontend without restarting the server.
type themeAwareFileSystem struct {
	defaultFS static.ServeFileSystem
	classicFS static.ServeFileSystem
}

func (t *themeAwareFileSystem) Exists(prefix string, path string) bool {
	if GetTheme() == "classic" {
		return t.classicFS.Exists(prefix, path)
	}
	return t.defaultFS.Exists(prefix, path)
}

func (t *themeAwareFileSystem) Open(name string) (http.File, error) {
	if GetTheme() == "classic" {
		return t.classicFS.Open(name)
	}
	return t.defaultFS.Open(name)
}

func NewThemeAwareFS(defaultFS, classicFS static.ServeFileSystem) static.ServeFileSystem {
	return &themeAwareFileSystem{defaultFS: defaultFS, classicFS: classicFS}
}
