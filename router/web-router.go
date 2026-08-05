package router

import (
	"embed"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// ThemeAssets holds the embedded frontend assets for both themes,
// plus the infinite-canvas app mounted under canvasBasePath.
type ThemeAssets struct {
	DefaultBuildFS   embed.FS
	DefaultIndexPage []byte
	ClassicBuildFS   embed.FS
	ClassicIndexPage []byte
	CanvasBuildFS    embed.FS
	CanvasIndexPage  []byte
}

// canvasBasePath must match VITE_BASE used when building web/canvas. The app is
// embedded in an iframe by the main frontend's own /canvas page, so it is mounted
// on a separate path to leave /canvas to the main SPA router.
const canvasBasePath = "/canvas-app"

func SetWebRouter(router *gin.Engine, assets ThemeAssets) {
	defaultFS := common.EmbedFolder(assets.DefaultBuildFS, "web/dist")
	classicFS := common.EmbedFolder(assets.ClassicBuildFS, "web/classic/dist")
	themeFS := common.NewThemeAwareFS(defaultFS, classicFS)
	canvasFS := common.EmbedFolderAt(assets.CanvasBuildFS, "web/canvas/dist", canvasBasePath)

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	router.Use(static.Serve(canvasBasePath, canvasFS))
	router.Use(static.Serve("/", themeFS))
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		// 画布是独立的单页应用，深链要回落到它自己的 index.html，不受主站主题影响。
		if c.Request.URL.Path == canvasBasePath || strings.HasPrefix(c.Request.URL.Path, canvasBasePath+"/") {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.CanvasIndexPage)
			return
		}
		if common.GetTheme() == "classic" {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.ClassicIndexPage)
		} else {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.DefaultIndexPage)
		}
	})
}
