package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

func SetVideoRouter(router *gin.Engine) {
	// Video proxy: accepts either session auth (dashboard) or token auth (API clients)
	videoProxyRouter := router.Group("/v1")
	videoProxyRouter.Use(middleware.RouteTag("relay"))
	videoProxyRouter.Use(middleware.TokenOrUserAuth())
	{
		videoProxyRouter.GET("/videos/:task_id/content", controller.VideoProxy)
	}

	videoV1Router := router.Group("/v1")
	videoV1Router.Use(middleware.RouteTag("relay"))
	videoV1Router.Use(middleware.TokenAuth(), middleware.Distribute())
	{
		videoV1Router.POST("/video/generations", controller.RelayTask)
		videoV1Router.GET("/video/generations/:task_id", controller.RelayTaskFetch)
		videoV1Router.POST("/videos/:video_id/remix", controller.RelayTask)
	}
	// openai compatible API video routes
	// docs: https://platform.openai.com/docs/api-reference/videos/create
	{
		videoV1Router.POST("/videos", controller.RelayTask)
		videoV1Router.GET("/videos/:task_id", controller.RelayTaskFetch)
	}

	klingV1Router := router.Group("/kling/v1")
	klingV1Router.Use(middleware.RouteTag("relay"))
	klingV1Router.Use(middleware.KlingRequestConvert(), middleware.TokenAuth(), middleware.Distribute())
	{
		klingV1Router.POST("/videos/text2video", controller.RelayTask)
		klingV1Router.POST("/videos/image2video", controller.RelayTask)
		klingV1Router.GET("/videos/text2video/:task_id", controller.RelayTaskFetch)
		klingV1Router.GET("/videos/image2video/:task_id", controller.RelayTaskFetch)
	}

	// Jimeng official API routes - direct mapping to official API format
	jimengOfficialGroup := router.Group("jimeng")
	jimengOfficialGroup.Use(middleware.RouteTag("relay"))
	jimengOfficialGroup.Use(middleware.JimengRequestConvert(), middleware.TokenAuth(), middleware.Distribute())
	{
		// Maps to: /?Action=CVSync2AsyncSubmitTask&Version=2022-08-31 and /?Action=CVSync2AsyncGetResult&Version=2022-08-31
		jimengOfficialGroup.POST("/", controller.RelayTask)
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
