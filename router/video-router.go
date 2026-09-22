package router

import (
	"context"
	"os"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// Native legacy routes run only after the plugin dispatcher misses. Keeping
// them out of the public static route table lets the bundled plugins own these
// paths while preserving existing clients when those plugins are disabled.
func legacyTaskRouteDispatcher() gin.HandlerFunc {
	engine := gin.New()
	engine.RedirectTrailingSlash = false
	engine.RedirectFixedPath = false
	trustedProxies, _, err := common.ResolveTrustedProxies(os.Getenv("TRUSTED_PROXIES"))
	if err == nil {
		err = common.ConfigureTrustedProxies(engine, trustedProxies)
	}
	if err != nil {
		common.SysError("configure legacy task router trusted proxies: " + err.Error())
	}
	engine.Use(importPluginDispatchState())
	kling := engine.Group("/kling/v1")
	kling.Use(middleware.KlingRequestConvert(), middleware.TokenAuth(), middleware.Distribute())
	kling.POST("/videos/text2video", controller.RelayTask)
	kling.POST("/videos/image2video", controller.RelayTask)
	kling.GET("/videos/text2video/:task_id", controller.RelayTaskFetch)
	kling.GET("/videos/image2video/:task_id", controller.RelayTaskFetch)
	jimeng := engine.Group("/jimeng")
	jimeng.Use(middleware.JimengRequestConvert(), middleware.TokenAuth(), middleware.Distribute())
	jimeng.POST("/", controller.RelayTask)
	suno := engine.Group("/suno")
	suno.Use(middleware.SystemPerformanceCheck(), middleware.TokenAuth(), middleware.Distribute())
	suno.POST("/submit/:action", controller.RelayTask)
	suno.POST("/fetch", controller.RelayTaskFetch)
	suno.GET("/fetch/:id", controller.RelayTaskFetch)
	return func(c *gin.Context) {
		originalContext := c.Request.Context()
		state := &pluginDispatchState{requestID: c.GetString(common.RequestIdKey), language: c.GetString(string(constant.ContextKeyLanguage)), writer: newGatedResponseWriter(c.Writer)}
		request := c.Request.WithContext(context.WithValue(originalContext, pluginDispatchStateKey{}, state))
		engine.ServeHTTP(state.writer, request)
		if state.hit.Load() {
			c.Set(middleware.RouteTagKey, "relay")
			if !c.Writer.Written() {
				c.Writer.WriteHeaderNow()
			}
			c.Abort()
			return
		}
		c.Next()
	}
}

func SetVideoRouter(router *gin.Engine) {
	videoSharedRouter := router.Group("/v1")
	videoSharedRouter.Use(middleware.RouteTag("relay"))
	videoSharedRouter.Use(middleware.TokenAuth())
	videoSharedRouter.Use(middleware.SystemPerformanceCheck())
	videoSharedRouter.POST(
		"/video/generations",
		middleware.PinTaskPluginEndpoint(),
		middleware.TaskPluginEndpointOnly(middleware.ModelRequestRateLimit()),
		middleware.PrepareTaskPluginEndpoint(),
		middleware.Distribute(),
		func(c *gin.Context) {
			controller.RelayTaskPluginEndpoint(c, controller.RelayTask)
		},
	)

	videoV1Router := router.Group("/v1")
	videoV1Router.Use(middleware.RouteTag("relay"))
	videoV1Router.Use(middleware.TokenAuth(), middleware.Distribute())
	{
		videoV1Router.GET("/video/generations/:task_id", controller.RelayTaskFetch)
		videoV1Router.POST("/videos/:video_id/remix", controller.RelayTask)
	}
	// 火山私域素材库（虚拟人像 AIGC）：下游用 Bearer sk-xxx 调 /ark/?Action=..&Version=..
	// 经 ArkAssetRequestConvert 注入 sentinel 模型路由到与视频共用的 DoubaoVideo 渠道，
	// 由 ArkAssetProxy 取渠道 AK/SK 做 V4 签名转发到 open.volcengineapi.com。
	arkAssetGroup := router.Group("/ark")
	arkAssetGroup.Use(middleware.RouteTag("relay"))
	arkAssetGroup.Use(middleware.ArkAssetRequestConvert(), middleware.TokenAuth(), middleware.Distribute())
	{
		arkAssetGroup.POST("/", controller.ArkAssetProxy)
	}

	// 火山官方 Ark 视频格式（Seedance 2.0）：下游用 Bearer sk-xxx 调官方端点，
	// 经 ArkVideoRequestConvert 转成内部统一格式并复用视频中转管线，响应以 Ark 原生格式输出。
	arkVideoGroup := router.Group("/ark/api/v3/contents/generations")
	arkVideoGroup.Use(middleware.RouteTag("relay"))
	arkVideoGroup.Use(middleware.ArkVideoRequestConvert(), middleware.TokenAuth(), middleware.Distribute())
	{
		arkVideoGroup.POST("/tasks", controller.RelayTask)
		arkVideoGroup.GET("/tasks/:id", controller.RelayTaskFetch)
	}
}
