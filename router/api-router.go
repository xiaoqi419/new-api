package router

import (
	"net/http"

	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	// Import oauth package to register providers via init()
	_ "github.com/QuantumNous/new-api/oauth"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

func SetApiRouter(router *gin.Engine) {
	apiRouter := router.Group("/api")
	apiRouter.Use(middleware.RouteTag("api"))
	apiRouter.Use(middleware.H5CORS())
	apiRouter.Use(gzip.Gzip(gzip.DefaultCompression))
	apiRouter.Use(middleware.BodyStorageCleanup()) // 清理请求体存储
	apiRouter.Use(middleware.GlobalAPIRateLimit())
	// Gin only runs a route group's middleware when a route matches the
	// request method. Register an OPTIONS catch-all so browser preflight
	// requests reach H5CORS even though the API endpoints are POST/GET-only.
	apiRouter.OPTIONS("/*path", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	anonymousRequestBodyLimit := middleware.AnonymousRequestBodyLimit()
	{
		apiRouter.GET("/setup", controller.GetSetup)
		apiRouter.POST("/setup", anonymousRequestBodyLimit, controller.PostSetup)
		apiRouter.GET("/status", controller.GetStatus)
		apiRouter.GET("/tls/check", controller.CheckTLSDomain)
		apiRouter.GET("/uptime/status", controller.GetUptimeKumaStatus)
		apiRouter.GET("/models", middleware.UserAuth(), controller.DashboardListModels)
		apiRouter.GET("/status/test", middleware.AdminAuth(), controller.TestStatus)
		apiRouter.GET("/notice", controller.GetNotice)
		apiRouter.GET("/announcements", controller.GetAnnouncements)
		apiRouter.GET("/captcha", middleware.CaptchaRateLimit(), middleware.DisableCache(), controller.GetCaptcha)
		apiRouter.GET("/announcements/detail/:id", controller.GetAnnouncement)
		apiRouter.GET("/user-agreement", controller.GetUserAgreement)
		apiRouter.GET("/privacy-policy", controller.GetPrivacyPolicy)
		apiRouter.GET("/about", controller.GetAbout)
		//apiRouter.GET("/midjourney", controller.GetMidjourney)
		apiRouter.GET("/home_page_content", controller.GetHomePageContent)
		apiRouter.GET("/home_page_config", controller.GetHomePageConfig)
		apiRouter.GET("/pricing", middleware.HeaderNavModuleAuth("pricing"), controller.GetPricing)
		perfMetricsRoute := apiRouter.Group("/perf-metrics")
		perfMetricsRoute.Use(middleware.HeaderNavModulePublicOrUserAuth("pricing"))
		{
			perfMetricsRoute.GET("/summary", controller.GetPerfMetricsSummary)
			perfMetricsRoute.GET("", controller.GetPerfMetrics)
		}
		apiRouter.GET("/rankings", middleware.HeaderNavModuleAuth("rankings"), controller.GetRankings)
		apiRouter.GET("/verification", middleware.EmailVerificationRateLimit(), middleware.ClickCaptchaCheck(), middleware.TurnstileCheck(), controller.SendEmailVerification)
		apiRouter.GET("/reset_password", middleware.CriticalRateLimit(), middleware.ClickCaptchaCheck(), middleware.TurnstileCheck(), controller.SendPasswordResetEmail)
		apiRouter.POST("/user/reset", middleware.CriticalRateLimit(), anonymousRequestBodyLimit, controller.ResetPassword)
		// OAuth routes - specific routes must come before :provider wildcard
		apiRouter.POST("/oauth/state", middleware.CriticalRateLimit(), middleware.DisableCache(), middleware.TryUserAuth(), anonymousRequestBodyLimit, controller.GenerateOAuthCode)
		apiRouter.POST("/oauth/email/bind", middleware.UserAuth(), middleware.CriticalRateLimit(), controller.EmailBind)
		// Non-standard OAuth (WeChat, Telegram) - keep original routes
		apiRouter.GET("/oauth/wechat", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.WeChatAuth)
		apiRouter.POST("/oauth/wechat/bind", middleware.UserAuth(), middleware.CriticalRateLimit(), controller.WeChatBind)
		// 内置微信公众号验证码登录回调（无需外部 wechat-server）
		// /api/wechat/callback 与 /api/wechat/mp 为同一处理，任填其一到公众号后台「服务器配置」
		apiRouter.GET("/wechat/callback", controller.WeChatMpVerify)
		apiRouter.POST("/wechat/callback", anonymousRequestBodyLimit, controller.WeChatMpMessage)
		apiRouter.GET("/wechat/mp", controller.WeChatMpVerify)
		apiRouter.POST("/wechat/mp", anonymousRequestBodyLimit, controller.WeChatMpMessage)
		apiRouter.GET("/wechat/mp/login/code", middleware.CriticalRateLimit(), controller.WeChatMpLoginCode)
		// login/check 由浏览器高频轮询，不能套 CriticalRateLimit，否则正常登录会被
		// 自己的轮询打成 429；防爆破靠的是 128 位轮询令牌而不是限流。下面三个都是
		// 一次性动作，按关键接口限流。
		apiRouter.GET("/wechat/mp/login/check", controller.WeChatMpLoginCheck)
		apiRouter.POST("/wechat/mp/login/register", middleware.CriticalRateLimit(), controller.WeChatMpLoginRegister)
		apiRouter.GET("/wechat/mp/login/bind/verification", middleware.EmailVerificationRateLimit(), controller.WeChatMpLoginBindVerification)
		apiRouter.POST("/wechat/mp/login/bind", middleware.CriticalRateLimit(), controller.WeChatMpLoginBind)
		apiRouter.GET("/oauth/telegram/login", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.TelegramLogin)
		apiRouter.POST("/oauth/telegram/bind/start", middleware.UserAuth(), middleware.CriticalRateLimit(), middleware.DisableCache(), controller.TelegramBindStart)
		apiRouter.GET("/oauth/telegram/bind/:flow_token", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.TelegramBind)
		// Standard OAuth providers (GitHub, Discord, OIDC, LinuxDO) - unified route
		apiRouter.GET("/oauth/:provider", middleware.CriticalRateLimit(), middleware.DisableCache(), middleware.TryUserAuth(), controller.HandleOAuth)
		apiRouter.GET("/ratio_config", middleware.CriticalRateLimit(), controller.GetRatioConfig)

		apiRouter.POST("/stripe/webhook", anonymousRequestBodyLimit, controller.StripeWebhook)
		apiRouter.POST("/creem/webhook", anonymousRequestBodyLimit, controller.CreemWebhook)
		apiRouter.POST("/waffo/webhook", anonymousRequestBodyLimit, controller.WaffoWebhook)
		// :env separates test vs prod URLs so the operator can register each
		// in Pancake's matching webhook slot; handler enforces env match.
		apiRouter.POST("/waffo-pancake/webhook/:env", anonymousRequestBodyLimit, controller.WaffoPancakeWebhook)

		// Universal secure verification routes
		apiRouter.POST("/verify", middleware.UserAuth(), middleware.CriticalRateLimit(), middleware.DisableCache(), controller.UniversalVerify)

		// 火山私域素材库（虚拟人像 AIGC）：控制台/接口共用，按用户本地归属隔离
		arkAssetRoute := apiRouter.Group("/ark_asset")
		arkAssetRoute.Use(middleware.TokenOrUserAuth())
		{
			arkAssetRoute.GET("", controller.ArkAssetLibraryList)
			arkAssetRoute.POST("", controller.ArkAssetLibraryCreate)
			arkAssetRoute.DELETE("/:asset_id", controller.ArkAssetLibraryDelete)
		}

		userRoute := apiRouter.Group("/user")
		{
			userRoute.POST("/auth/refresh", middleware.SessionCookieOriginGuard(), middleware.AuthRefreshRateLimit(), middleware.DisableCache(), controller.RefreshAuth)
			userRoute.POST("/auth/logout", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), middleware.DisableCache(), controller.AuthLogout)
			userRoute.POST("/register", middleware.CriticalRateLimit(), anonymousRequestBodyLimit, middleware.ClickCaptchaCheck(), middleware.TurnstileCheck(), controller.Register)
			userRoute.POST("/login", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, middleware.ClickCaptchaCheck(), middleware.TurnstileCheck(), controller.Login)
			userRoute.POST("/login/2fa", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.Verify2FALogin)
			userRoute.POST("/passkey/login/begin", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.PasskeyLoginBegin)
			userRoute.POST("/passkey/login/finish", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.PasskeyLoginFinish)
			//userRoute.POST("/tokenlog", middleware.CriticalRateLimit(), controller.TokenLog)
			userRoute.POST("/epay/notify", anonymousRequestBodyLimit, controller.EpayNotify)
			userRoute.GET("/epay/notify", controller.EpayNotify)
			userRoute.POST("/gmpay/notify", anonymousRequestBodyLimit, controller.GMPayNotify)
			// 微信支付 / 支付宝官方商户直连回调（公开放行，处理器内验签）
			userRoute.POST("/wechatpay/notify", anonymousRequestBodyLimit, controller.WechatPayNotify)
			userRoute.GET("/wechatpay/jsapi/callback", controller.WechatJSAPICallback)
			userRoute.POST("/alipay/notify", anonymousRequestBodyLimit, controller.AlipayNotify)
			userRoute.GET("/alipay/notify", controller.AlipayNotify)
			userRoute.GET("/groups", controller.GetUserGroups)

			selfRoute := userRoute.Group("/")
			selfRoute.Use(middleware.UserAuth())
			{
				selfRoute.GET("/sessions", middleware.DisableCache(), controller.GetLoginSessions)
				selfRoute.DELETE("/sessions/:sid", middleware.DisableCache(), controller.DeleteLoginSession)
				selfRoute.POST("/sessions/revoke-others", middleware.DisableCache(), controller.RevokeOtherLoginSessions)
				selfRoute.GET("/self/groups", controller.GetUserGroups)
				selfRoute.GET("/self", controller.GetSelf)
				selfRoute.GET("/models", controller.GetUserModels)
				selfRoute.PUT("/self", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.UpdateSelf)
				selfRoute.DELETE("/self", controller.DeleteSelf)
				// POST, not GET: the handler rotates the caller's access token, so a
				// link prefetch or crawler hitting it would silently invalidate the
				// user's credential. Both the current and classic dashboards POST here.
				selfRoute.POST("/token", middleware.CriticalRateLimit(), middleware.UserCriticalRateLimit("access-token"), middleware.DisableCache(), controller.GenerateAccessToken)
				selfRoute.GET("/passkey", controller.PasskeyStatus)
				selfRoute.POST("/passkey/register/begin", middleware.DisableCache(), controller.PasskeyRegisterBegin)
				selfRoute.POST("/passkey/register/finish", middleware.DisableCache(), controller.PasskeyRegisterFinish)
				selfRoute.POST("/passkey/verify/begin", middleware.DisableCache(), controller.PasskeyVerifyBegin)
				selfRoute.POST("/passkey/verify/finish", middleware.DisableCache(), controller.PasskeyVerifyFinish)
				selfRoute.DELETE("/passkey", middleware.DisableCache(), controller.PasskeyDelete)
				selfRoute.GET("/aff", controller.GetAffCode)
				selfRoute.GET("/self/rebate", controller.GetSelfRebate)
				selfRoute.GET("/wechat/mp/bind/code", controller.WeChatMpBindCode)
				selfRoute.GET("/wechat/mp/bind/check", controller.WeChatMpBindCheck)
				selfRoute.GET("/topup/info", controller.GetTopUpInfo)
				selfRoute.GET("/topup/self", controller.GetUserTopUps)
				selfRoute.POST("/topup", middleware.CriticalRateLimit(), controller.TopUp)
				selfRoute.POST("/pay", middleware.CriticalRateLimit(), controller.RequestEpay)
				selfRoute.POST("/epay/checkout", middleware.CriticalRateLimit(), controller.RequestEpayCheckout)
				selfRoute.POST("/amount", controller.RequestAmount)
				selfRoute.POST("/wechatpay/pay", middleware.CriticalRateLimit(), controller.RequestWechatPay)
				selfRoute.POST("/wechatpay/jsapi/prepare", middleware.CriticalRateLimit(), controller.PrepareWechatJSAPI)
				selfRoute.POST("/alipay/pay", middleware.CriticalRateLimit(), controller.RequestAlipay)
				selfRoute.GET("/topup/status", controller.GetTopUpStatus)
				selfRoute.POST("/stripe/pay", middleware.CriticalRateLimit(), controller.RequestStripePay)
				selfRoute.POST("/stripe/amount", controller.RequestStripeAmount)
				selfRoute.POST("/creem/pay", middleware.CriticalRateLimit(), controller.RequestCreemPay)
				selfRoute.POST("/waffo/amount", controller.RequestWaffoAmount)
				selfRoute.POST("/waffo/pay", middleware.CriticalRateLimit(), controller.RequestWaffoPay)
				selfRoute.POST("/waffo-pancake/amount", controller.RequestWaffoPancakeAmount)
				selfRoute.POST("/waffo-pancake/pay", middleware.CriticalRateLimit(), controller.RequestWaffoPancakePay)
				selfRoute.POST("/aff_transfer", middleware.UserCriticalRateLimit("aff-transfer"), controller.TransferAffQuota)
				selfRoute.PUT("/setting", controller.UpdateUserSetting)
				selfRoute.POST("/agree_legal", controller.AgreeLegal)

				// 拼团充值
				selfRoute.GET("/groupbuy/info", controller.GetGroupBuyInfo)
				selfRoute.GET("/groupbuy/hall", controller.GetGroupBuyHall)
				selfRoute.GET("/groupbuy/self", controller.GetSelfGroupBuys)
				selfRoute.GET("/groupbuy/detail", controller.GetGroupBuyDetail)
				selfRoute.POST("/groupbuy/create", middleware.CriticalRateLimit(), controller.CreateGroupBuy)
				selfRoute.POST("/groupbuy/join", middleware.CriticalRateLimit(), controller.JoinGroupBuy)
				selfRoute.POST("/groupbuy/cancel", middleware.CriticalRateLimit(), controller.CancelGroupBuyPayment)
				selfRoute.GET("/groupbuy/payment/status", controller.GetGroupBuyPaymentStatus)

				// 2FA routes
				selfRoute.GET("/2fa/status", controller.Get2FAStatus)
				selfRoute.POST("/2fa/setup", middleware.DisableCache(), controller.Setup2FA)
				selfRoute.POST("/2fa/enable", middleware.DisableCache(), controller.Enable2FA)
				selfRoute.POST("/2fa/disable", middleware.DisableCache(), controller.Disable2FA)
				selfRoute.POST("/2fa/backup_codes", middleware.DisableCache(), controller.RegenerateBackupCodes)

				// Check-in routes
				selfRoute.GET("/checkin", controller.GetCheckinStatus)
				selfRoute.POST("/checkin", middleware.ClickCaptchaCheck(), middleware.TurnstileCheck(), controller.DoCheckin)

				// Custom OAuth bindings
				selfRoute.GET("/oauth/bindings", controller.GetUserOAuthBindings)
				selfRoute.DELETE("/oauth/bindings/:provider_id", controller.UnbindCustomOAuth)
			}

			adminRoute := userRoute.Group("/")
			adminRoute.Use(middleware.AdminAuth())
			{
				adminRoute.GET("/", controller.GetAllUsers)
				adminRoute.GET("/ips", controller.GetUserIps)
				adminRoute.GET("/topup", controller.GetAllTopUps)
				adminRoute.POST("/topup/complete", controller.AdminCompleteTopUp)
				adminRoute.GET("/search", controller.SearchUsers)
				adminRoute.GET("/:id/oauth/bindings", controller.GetUserOAuthBindingsByAdmin)
				adminRoute.DELETE("/:id/oauth/bindings/:provider_id", controller.UnbindCustomOAuthByAdmin)
				adminRoute.DELETE("/:id/bindings/:binding_type", controller.AdminClearUserBinding)
				adminRoute.GET("/:id", controller.GetUser)
				adminRoute.POST("/", controller.CreateUser)
				adminRoute.POST("/manage", controller.ManageUser)
				adminRoute.PUT("/", controller.UpdateUser)
				adminRoute.DELETE("/:id", controller.DeleteUser)
				adminRoute.DELETE("/:id/reset_passkey", controller.AdminResetPasskey)

				// Admin 2FA routes
				adminRoute.GET("/2fa/stats", controller.Admin2FAStats)
				adminRoute.DELETE("/:id/2fa", controller.AdminDisable2FA)
			}
		}

		// Subscription billing (plans, purchase, admin management)
		subscriptionRoute := apiRouter.Group("/subscription")
		subscriptionRoute.Use(middleware.UserAuth())
		{
			subscriptionRoute.GET("/plans", controller.GetSubscriptionPlans)
			subscriptionRoute.GET("/self", controller.GetSubscriptionSelf)
			subscriptionRoute.PUT("/self/preference", controller.UpdateSubscriptionPreference)
			subscriptionRoute.POST("/balance/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestBalancePay)
			subscriptionRoute.POST("/epay/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestEpay)
			subscriptionRoute.GET("/epay/status", controller.GetSubscriptionEpayStatus)
			subscriptionRoute.POST("/stripe/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestStripePay)
			subscriptionRoute.POST("/creem/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestCreemPay)
			subscriptionRoute.POST("/waffo-pancake/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestWaffoPancakePay)
		}
		subscriptionAdminRoute := apiRouter.Group("/subscription/admin")
		subscriptionAdminRoute.Use(middleware.AdminAuth())
		{
			subscriptionAdminRoute.GET("/plans", controller.AdminListSubscriptionPlans)
			subscriptionAdminRoute.POST("/plans", controller.AdminCreateSubscriptionPlan)
			subscriptionAdminRoute.PUT("/plans/:id", controller.AdminUpdateSubscriptionPlan)
			subscriptionAdminRoute.PATCH("/plans/:id", controller.AdminUpdateSubscriptionPlanStatus)
			subscriptionAdminRoute.POST("/bind", controller.AdminBindSubscription)
			subscriptionAdminRoute.POST("/plans/:id/subscriptions/reset", controller.AdminResetPlanSubscriptions)

			// User subscription management (admin)
			subscriptionAdminRoute.GET("/users/:id/subscriptions", controller.AdminListUserSubscriptions)
			subscriptionAdminRoute.POST("/users/:id/subscriptions", controller.AdminCreateUserSubscription)
			subscriptionAdminRoute.POST("/users/:id/subscriptions/reset", controller.AdminResetUserSubscriptionsByPlan)
			subscriptionAdminRoute.POST("/user_subscriptions/:id/invalidate", controller.AdminInvalidateUserSubscription)
			subscriptionAdminRoute.DELETE("/user_subscriptions/:id", controller.AdminDeleteUserSubscription)
		}

		// Subscription payment callbacks (no auth)
		apiRouter.POST("/subscription/epay/notify", anonymousRequestBodyLimit, controller.SubscriptionEpayNotify)
		apiRouter.GET("/subscription/epay/notify", controller.SubscriptionEpayNotify)
		apiRouter.GET("/subscription/epay/return", controller.SubscriptionEpayReturn)
		apiRouter.POST("/subscription/epay/return", anonymousRequestBodyLimit, controller.SubscriptionEpayReturn)
		optionRoute := apiRouter.Group("/option")
		optionRoute.Use(middleware.RootAuth())
		{
			optionRoute.GET("/", controller.GetOptions)
			optionRoute.PUT("/", controller.UpdateOption)
			optionRoute.PUT("/quota_reminder", controller.UpdateQuotaReminderConfig)
			optionRoute.GET("/payment_gateway_mode/status", controller.GetPaymentGatewayModeStatus)
			optionRoute.GET("/gmpay_fee/status", controller.GetGMPayFeeStatus)
			optionRoute.POST("/gmpay_fee/test", controller.TestGMPayFeeEstimate)
			optionRoute.POST("/payment_gateway_mode/apply", middleware.UserCriticalRateLimit("payment-gateway-mode-apply"), controller.ApplyPaymentGatewayMode)
			optionRoute.POST("/payment_compliance", controller.ConfirmPaymentCompliance)
			optionRoute.POST("/test_email", middleware.CriticalRateLimit(), controller.SendTestEmail)
			optionRoute.POST("/quota_reminder_test", middleware.CriticalRateLimit(), controller.SendQuotaReminderTestEmail)
			optionRoute.GET("/channel_affinity_cache", controller.GetChannelAffinityCacheStats)
			optionRoute.DELETE("/channel_affinity_cache", controller.ClearChannelAffinityCache)
			optionRoute.POST("/rest_model_ratio", controller.ResetModelRatio)
			optionRoute.GET("/waffo-pancake/catalog", controller.ListWaffoPancakeCatalog)
			optionRoute.POST("/waffo-pancake/pair", controller.CreateWaffoPancakePair)
			optionRoute.POST("/waffo-pancake/save", controller.SaveWaffoPancake)
			optionRoute.POST("/waffo-pancake/subscription-product", controller.CreateWaffoPancakeSubscriptionProduct)
			optionRoute.GET("/waffo-pancake/subscription-product-options", controller.ListWaffoPancakeSubscriptionProductOptions)
		}

		// Custom OAuth provider management (root only)
		customOAuthRoute := apiRouter.Group("/custom-oauth-provider")
		customOAuthRoute.Use(middleware.RootAuth())
		{
			customOAuthRoute.POST("/discovery", controller.FetchCustomOAuthDiscovery)
			customOAuthRoute.GET("/", controller.GetCustomOAuthProviders)
			customOAuthRoute.GET("/:id", controller.GetCustomOAuthProvider)
			customOAuthRoute.POST("/", controller.CreateCustomOAuthProvider)
			customOAuthRoute.PUT("/:id", controller.UpdateCustomOAuthProvider)
			customOAuthRoute.DELETE("/:id", controller.DeleteCustomOAuthProvider)
		}
		performanceRoute := apiRouter.Group("/performance")
		performanceRoute.Use(middleware.RootAuth())
		{
			performanceRoute.GET("/stats", controller.GetPerformanceStats)
			performanceRoute.DELETE("/disk_cache", controller.ClearDiskCache)
			performanceRoute.POST("/reset_stats", controller.ResetPerformanceStats)
			performanceRoute.POST("/gc", controller.ForceGC)
			performanceRoute.GET("/logs", controller.GetLogFiles)
			performanceRoute.DELETE("/logs", controller.CleanupLogFiles)
		}
		ratioSyncRoute := apiRouter.Group("/ratio_sync")
		ratioSyncRoute.Use(middleware.RootAuth())
		{
			ratioSyncRoute.GET("/channels", controller.GetSyncableChannels)
			ratioSyncRoute.POST("/fetch", controller.FetchUpstreamRatios)
		}
		registerChannelRoutes(apiRouter)
		registerAuthzRoutes(apiRouter)
		registerAgentRoutes(apiRouter)
		tokenRoute := apiRouter.Group("/token")
		tokenRoute.Use(middleware.UserAuth())
		{
			tokenRoute.GET("/", controller.GetAllTokens)
			tokenRoute.GET("/concurrency", controller.GetTokensConcurrency)
			tokenRoute.GET("/search", middleware.SearchRateLimit(), controller.SearchTokens)
			tokenRoute.GET("/auto-groups", controller.GetTokenAutoGroups)
			tokenRoute.GET("/:id", controller.GetToken)
			tokenRoute.POST("/:id/key", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.GetTokenKey)
			tokenRoute.POST("/", controller.AddToken)
			tokenRoute.PUT("/", controller.UpdateToken)
			tokenRoute.DELETE("/:id", controller.DeleteToken)
			tokenRoute.POST("/batch", controller.DeleteTokenBatch)
			tokenRoute.POST("/batch/keys", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.GetTokenKeysBatch)
		}

		invoiceRoute := apiRouter.Group("/invoice")
		invoiceRoute.Use(middleware.UserAuth())
		{
			invoiceRoute.POST("/", controller.SubmitInvoiceRequest)
			invoiceRoute.GET("/self", controller.GetSelfInvoices)
			invoiceRoute.GET("/eligible_orders", controller.GetEligibleOrders)
			invoiceRoute.GET("/download/:id", controller.DownloadInvoice)

			invoiceAdminRoute := invoiceRoute.Group("/admin")
			invoiceAdminRoute.Use(middleware.AdminAuth())
			{
				invoiceAdminRoute.GET("/", controller.GetAllInvoices)
				invoiceAdminRoute.POST("/:id/issue", controller.IssueInvoice)
				invoiceAdminRoute.POST("/:id/reject", controller.RejectInvoice)
			}
		}

		identityVerifyRoute := apiRouter.Group("/identity_verification")
		identityVerifyRoute.Use(middleware.UserAuth())
		{
			identityVerifyRoute.GET("/types", controller.GetIdentityVerifyTypes)
			identityVerifyRoute.POST("/", controller.SubmitIdentityVerification)
			identityVerifyRoute.GET("/self", controller.GetSelfIdentityVerifications)
			identityVerifyRoute.GET("/proof/:id", controller.DownloadIdentityProof)

			identityVerifyAdminRoute := identityVerifyRoute.Group("/admin")
			identityVerifyAdminRoute.Use(middleware.AdminAuth())
			{
				identityVerifyAdminRoute.GET("/", controller.GetAllIdentityVerifications)
				identityVerifyAdminRoute.POST("/:id/approve", controller.ApproveIdentityVerification)
				identityVerifyAdminRoute.POST("/:id/reject", controller.RejectIdentityVerification)
				identityVerifyAdminRoute.GET("/config", controller.GetIdentityVerifyConfig)
				identityVerifyAdminRoute.PUT("/config", controller.SaveIdentityVerifyConfig)
			}
		}

		lotteryRoute := apiRouter.Group("/lottery")
		lotteryRoute.Use(middleware.UserAuth())
		{
			lotteryRoute.GET("/status", controller.GetLotteryStatus)
			lotteryRoute.POST("/draw", controller.DrawLottery)
			lotteryRoute.GET("/cards", controller.GetSelfLotteryCards)
			lotteryRoute.GET("/records", controller.GetSelfLotteryRecords)

			lotteryAdminRoute := lotteryRoute.Group("/admin")
			lotteryAdminRoute.Use(middleware.AdminAuth())
			{
				lotteryAdminRoute.GET("/records", controller.GetAllLotteryRecords)
				lotteryAdminRoute.POST("/grant", controller.GrantLotteryCards)
				lotteryAdminRoute.GET("/config", controller.GetLotteryConfig)
				lotteryAdminRoute.PUT("/config", controller.SaveLotteryConfig)
			}
		}

		// 工单系统（用户提交/回复 + 管理端处理）
		ticketRoute := apiRouter.Group("/ticket")
		ticketRoute.Use(middleware.UserAuth())
		{
			ticketRoute.GET("/meta", controller.GetTicketMeta)
			ticketRoute.GET("/self", controller.GetSelfTickets)
			ticketRoute.POST("/", middleware.CriticalRateLimit(), controller.CreateTicket)
			ticketRoute.GET("/detail/:id", controller.GetTicketDetail)
			ticketRoute.POST("/reply/:id", middleware.CriticalRateLimit(), controller.ReplyTicket)
			ticketRoute.POST("/close/:id", controller.CloseTicket)
			ticketRoute.POST("/attachment", middleware.CriticalRateLimit(), controller.UploadTicketAttachment)
			ticketRoute.GET("/attachment/:id/:file", controller.DownloadTicketAttachment)

			ticketAdminRoute := ticketRoute.Group("/admin")
			ticketAdminRoute.Use(middleware.AdminAuth())
			{
				ticketAdminRoute.GET("/", controller.GetAllTickets)
				ticketAdminRoute.GET("/stats", controller.GetTicketStats)
				ticketAdminRoute.GET("/detail/:id", controller.AdminGetTicketDetail)
				ticketAdminRoute.POST("/reply/:id", controller.AdminReplyTicket)
				ticketAdminRoute.PUT("/status/:id", controller.AdminUpdateTicketStatus)
				ticketAdminRoute.PUT("/priority/:id", controller.AdminUpdateTicketPriority)
			}
		}

		// 公告 / 更新公告（后台可编辑）
		announcementAdminRoute := apiRouter.Group("/announcement")
		announcementAdminRoute.Use(middleware.AdminAuth())
		{
			announcementAdminRoute.GET("/", controller.AdminListAnnouncements)
			announcementAdminRoute.GET("/detail/:id", controller.AdminGetAnnouncement)
			announcementAdminRoute.POST("/", controller.AdminCreateAnnouncement)
			announcementAdminRoute.PUT("/", controller.AdminUpdateAnnouncement)
			announcementAdminRoute.DELETE("/:id", controller.AdminDeleteAnnouncement)
		}

		usageRoute := apiRouter.Group("/usage")
		usageRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())
		{
			tokenUsageRoute := usageRoute.Group("/token")
			tokenUsageRoute.Use(middleware.TokenAuthReadOnly())
			{
				tokenUsageRoute.GET("/", controller.GetTokenUsage)
			}
		}

		rebateRoute := apiRouter.Group("/rebate")
		rebateRoute.Use(middleware.AdminAuth())
		{
			rebateRoute.GET("/", controller.GetRebateRecords)
			rebateRoute.POST("/pay", controller.PayRebate)
			rebateRoute.POST("/cancel", controller.CancelRebate)
			rebateRoute.GET("/users", controller.GetRebateUsers)
			rebateRoute.GET("/ranking", controller.GetInviteRanking)
			rebateRoute.PUT("/user_ratio", controller.SetUserRebateRatio)
		}

		userRankingRoute := apiRouter.Group("/user_ranking")
		userRankingRoute.Use(middleware.AdminAuth())
		{
			userRankingRoute.GET("/", controller.GetUserRanking)
		}

		groupBuyAdminRoute := apiRouter.Group("/group_buy")
		groupBuyAdminRoute.Use(middleware.AdminAuth())
		{
			groupBuyAdminRoute.GET("/packages", controller.AdminListGroupBuyPackages)
			groupBuyAdminRoute.POST("/packages", controller.AdminCreateGroupBuyPackage)
			groupBuyAdminRoute.PUT("/packages", controller.AdminUpdateGroupBuyPackage)
			groupBuyAdminRoute.DELETE("/packages/:id", controller.AdminDeleteGroupBuyPackage)
			groupBuyAdminRoute.GET("/orders", controller.AdminListGroupBuys)
			groupBuyAdminRoute.GET("/orders/:id", controller.AdminGetGroupBuy)
			groupBuyAdminRoute.POST("/orders/:id/cancel", controller.AdminCancelGroupBuy)
			groupBuyAdminRoute.GET("/refunds", controller.AdminListGroupBuyRefundPending)
			groupBuyAdminRoute.POST("/refunds/:id/done", controller.AdminMarkGroupBuyRefunded)
		}

		redemptionRoute := apiRouter.Group("/redemption")
		redemptionRoute.Use(middleware.AdminAuth())
		{
			redemptionRoute.GET("/", controller.GetAllRedemptions)
			redemptionRoute.GET("/search", controller.SearchRedemptions)
			redemptionRoute.GET("/:id", controller.GetRedemption)
			redemptionRoute.POST("/", controller.AddRedemption)
			redemptionRoute.PUT("/", controller.UpdateRedemption)
			redemptionRoute.DELETE("/invalid", controller.DeleteInvalidRedemption)
			redemptionRoute.DELETE("/:id", controller.DeleteRedemption)
		}
		logRoute := apiRouter.Group("/log")
		logRoute.GET("/", middleware.AdminAuth(), controller.GetAllLogs)
		logRoute.GET("/stat", middleware.AdminAuth(), controller.GetLogsStat)
		logRoute.GET("/usage_stat", middleware.AdminAuth(), controller.GetConsumeUsageStat)
		logRoute.GET("/error_stat", middleware.AdminAuth(), controller.GetErrorStat)
		logRoute.GET("/user_stat", middleware.AdminAuth(), controller.GetUserStat)
		logRoute.POST("/error_alert_test", middleware.AdminAuth(), controller.TestErrorAlert)
		logRoute.GET("/self/stat", middleware.UserAuth(), controller.GetLogsSelfStat)
		logRoute.GET("/channel_affinity_usage_cache", middleware.AdminAuth(), controller.GetChannelAffinityUsageCacheStats)
		logRoute.GET("/search", middleware.AdminAuth(), controller.SearchAllLogs)
		logRoute.GET("/self", middleware.UserAuth(), controller.GetUserLogs)
		logRoute.GET("/self/search", middleware.UserAuth(), middleware.SearchRateLimit(), controller.SearchUserLogs)

		systemTaskRoute := apiRouter.Group("/system-task")
		systemTaskRoute.Use(middleware.RootAuth())
		{
			systemTaskRoute.POST("/log-cleanup", controller.CreateLogCleanupSystemTask)
			systemTaskRoute.GET("/list", controller.ListSystemTasks)
			systemTaskRoute.GET("/current", controller.GetCurrentSystemTask)
			systemTaskRoute.GET("/:task_id", controller.GetSystemTask)
		}
		systemInfoRoute := apiRouter.Group("/system-info")
		systemInfoRoute.Use(middleware.RootAuth())
		{
			systemInfoRoute.GET("/instances", controller.ListSystemInstances)
			systemInfoRoute.DELETE("/stale-instances", controller.DeleteStaleSystemInstances)
			systemInfoRoute.DELETE("/instances/:node_name", controller.DeleteStaleSystemInstance)
		}

		dataRoute := apiRouter.Group("/data")
		dataRoute.GET("/", middleware.AdminAuth(), controller.GetAllQuotaDates)
		dataRoute.GET("/users", middleware.AdminAuth(), controller.GetQuotaDatesByUser)
		dataRoute.GET("/self", middleware.UserAuth(), controller.GetUserQuotaDates)
		dataRoute.GET("/flow", middleware.AdminAuth(), controller.GetAllFlowQuotaDates)
		dataRoute.GET("/flow/self", middleware.UserAuth(), controller.GetUserFlowQuotaDates)

		logRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())
		{
			logRoute.GET("/token", middleware.TokenAuthReadOnly(), controller.GetLogByKey)
		}
		groupRoute := apiRouter.Group("/group")
		groupRoute.Use(middleware.AdminAuth())
		{
			groupRoute.GET("/", controller.GetGroups)
		}

		// 渠道监控（按用户分组聚合健康度），普通用户亦可查看（classic 主题使用）
		groupMonitorRoute := apiRouter.Group("/group/monitor")
		groupMonitorRoute.Use(middleware.UserAuth())
		{
			groupMonitorRoute.GET("", controller.GetGroupMonitor)
			groupMonitorRoute.GET("/detail", controller.GetGroupMonitorDetail)
		}
		// 渠道监控（按渠道聚合健康度，渠道下细分到各模型），普通用户亦可查看（default 主题使用）
		channelMonitorRoute := apiRouter.Group("/channel/monitor")
		channelMonitorRoute.Use(middleware.UserAuth())
		{
			channelMonitorRoute.GET("", controller.GetChannelMonitor)
		}

		prefillGroupRoute := apiRouter.Group("/prefill_group")
		prefillGroupRoute.Use(middleware.AdminAuth())
		{
			prefillGroupRoute.GET("/", controller.GetPrefillGroups)
			prefillGroupRoute.POST("/", controller.CreatePrefillGroup)
			prefillGroupRoute.PUT("/", controller.UpdatePrefillGroup)
			prefillGroupRoute.DELETE("/:id", controller.DeletePrefillGroup)
		}

		mjRoute := apiRouter.Group("/mj")
		mjRoute.GET("/self", middleware.UserAuth(), controller.GetUserMidjourney)
		mjRoute.GET("/", middleware.AdminAuth(), controller.GetAllMidjourney)

		taskRoute := apiRouter.Group("/task")
		{
			taskRoute.GET("/self", middleware.UserAuth(), controller.GetUserTask)
			taskRoute.GET("/", middleware.AdminAuth(), controller.GetAllTask)
		}

		drawingLogRoute := apiRouter.Group("/drawing_logs")
		{
			// Public: thumbnails are served by their unguessable 32-char key.
			drawingLogRoute.GET("/image/:key", controller.ServeDrawingImage)
			drawingLogRoute.GET("/self", middleware.UserAuth(), controller.GetUserDrawingLogs)
			drawingLogRoute.GET("/", middleware.AdminAuth(), controller.GetAllDrawingLogs)
		}

		vendorRoute := apiRouter.Group("/vendors")
		vendorRoute.Use(middleware.AdminAuth())
		{
			vendorRoute.GET("/", controller.GetAllVendors)
			vendorRoute.GET("/search", controller.SearchVendors)
			vendorRoute.GET("/:id", controller.GetVendorMeta)
			vendorRoute.POST("/", controller.CreateVendorMeta)
			vendorRoute.PUT("/", controller.UpdateVendorMeta)
			vendorRoute.DELETE("/:id", controller.DeleteVendorMeta)
		}

		modelsRoute := apiRouter.Group("/models")
		modelsRoute.Use(middleware.AdminAuth())
		{
			modelsRoute.GET("/sync_upstream/preview", controller.SyncUpstreamPreview)
			modelsRoute.POST("/sync_upstream", controller.SyncUpstreamModels)
			modelsRoute.GET("/missing", controller.GetMissingModels)
			modelsRoute.GET("/", controller.GetAllModelsMeta)
			modelsRoute.GET("/search", controller.SearchModelsMeta)
			modelsRoute.GET("/:id", controller.GetModelMeta)
			modelsRoute.POST("/", controller.CreateModelMeta)
			modelsRoute.PUT("/", controller.UpdateModelMeta)
			modelsRoute.DELETE("/:id", controller.DeleteModelMeta)
		}

		// Deployments (model deployment management)
		deploymentsRoute := apiRouter.Group("/deployments")
		deploymentsRoute.Use(middleware.AdminAuth())
		{
			deploymentsRoute.GET("/settings", controller.GetModelDeploymentSettings)
			deploymentsRoute.POST("/settings/test-connection", controller.TestIoNetConnection)
			deploymentsRoute.GET("/", controller.GetAllDeployments)
			deploymentsRoute.GET("/search", controller.SearchDeployments)
			deploymentsRoute.POST("/test-connection", controller.TestIoNetConnection)
			deploymentsRoute.GET("/hardware-types", controller.GetHardwareTypes)
			deploymentsRoute.GET("/locations", controller.GetLocations)
			deploymentsRoute.GET("/available-replicas", controller.GetAvailableReplicas)
			deploymentsRoute.POST("/price-estimation", controller.GetPriceEstimation)
			deploymentsRoute.GET("/check-name", controller.CheckClusterNameAvailability)
			deploymentsRoute.POST("/", controller.CreateDeployment)

			deploymentsRoute.GET("/:id", controller.GetDeployment)
			deploymentsRoute.GET("/:id/logs", controller.GetDeploymentLogs)
			deploymentsRoute.GET("/:id/containers", controller.ListDeploymentContainers)
			deploymentsRoute.GET("/:id/containers/:container_id", controller.GetContainerDetails)
			deploymentsRoute.PUT("/:id", controller.UpdateDeployment)
			deploymentsRoute.PUT("/:id/name", controller.UpdateDeploymentName)
			deploymentsRoute.POST("/:id/extend", controller.ExtendDeployment)
			deploymentsRoute.DELETE("/:id", controller.DeleteDeployment)
		}
	}
}
