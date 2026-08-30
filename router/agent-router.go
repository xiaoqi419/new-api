package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// registerAgentRoutes 平台管理员的代理商(白标租户)管理接口。
func registerAgentRoutes(apiRouter *gin.RouterGroup) {
	// 代理自有支付回调(匿名 + 显式 agentId，处理器内按代理密钥验签 + 订单归属双校验)。
	// 与下方管理接口共用 /agent 前缀，故 path 参数沿用 :id 以避免 gin 通配符命名冲突。
	paymentCallback := apiRouter.Group("/agent")
	{
		paymentCallback.POST("/:id/epay/notify", middleware.AnonymousRequestBodyLimit(), controller.AgentEpayNotify)
		paymentCallback.GET("/:id/epay/notify", controller.AgentEpayNotify)
		paymentCallback.POST("/:id/gmpay/notify", middleware.AnonymousRequestBodyLimit(), controller.AgentGMPayNotify)
		paymentCallback.POST("/:id/stripe/webhook", middleware.AnonymousRequestBodyLimit(), controller.AgentStripeWebhook)
	}

	// 前台申请成为代理(登录用户即可，避免与 /agent/:id 通配符冲突，使用独立前缀)。
	applyRoute := apiRouter.Group("/agent-apply")
	applyRoute.Use(middleware.UserAuth())
	{
		applyRoute.GET("", controller.AgentApplyStatus)
		applyRoute.POST("", middleware.CriticalRateLimit(), controller.AgentApply)
	}

	agentRoute := apiRouter.Group("/agent")
	agentRoute.Use(middleware.AdminAuth())
	{
		agentRoute.GET("/", controller.AdminGetAllAgents)
		agentRoute.GET("/:id", controller.AdminGetAgent)
		agentRoute.GET("/:id/ledgers", controller.AdminGetAgentLedgers)
		agentRoute.POST("/", controller.AdminCreateAgent)
		agentRoute.PUT("/", controller.AdminUpdateAgent)
		agentRoute.POST("/:id/wallet", controller.AdminAdjustAgentWallet)
		agentRoute.POST("/:id/approve", controller.AdminApproveAgent)
		agentRoute.POST("/:id/disable", controller.AdminDisableAgent)
	}

	// 代理自助后台：登录的 owner 管理自己的域名/品牌/倍率/钱包/终端用户。
	consoleRoute := apiRouter.Group("/agent-console")
	consoleRoute.Use(middleware.UserAuth(), middleware.RequireAgentOwner())
	{
		consoleRoute.GET("/self", controller.AgentConsoleGetSelf)
		consoleRoute.GET("/domains", controller.AgentConsoleListDomains)
		consoleRoute.POST("/domains", controller.AgentConsoleAddDomain)
		consoleRoute.POST("/domains/:id/verify", controller.AgentConsoleVerifyDomain)
		consoleRoute.DELETE("/domains/:id", controller.AgentConsoleDeleteDomain)
		consoleRoute.GET("/options", controller.AgentConsoleGetOptions)
		consoleRoute.PUT("/options", controller.AgentConsoleUpdateOptions)
		consoleRoute.GET("/ratios", controller.AgentConsoleGetRatios)
		consoleRoute.PUT("/ratios", controller.AgentConsoleUpdateRatios)
		consoleRoute.GET("/payment", controller.AgentConsoleGetPayment)
		consoleRoute.PUT("/payment", controller.AgentConsoleUpdatePayment)
		consoleRoute.POST("/prepay", middleware.CriticalRateLimit(), controller.AgentConsolePrepayEpay)
		consoleRoute.GET("/ledgers", controller.AgentConsoleGetLedgers)
		consoleRoute.GET("/users", controller.AgentConsoleListUsers)
	}
}
