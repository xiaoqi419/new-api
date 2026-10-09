package middleware

import (
	"fmt"
	"maps"
	"slices"
	"sync"

	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/authz"
)

type accessTokenRuleKind int

const (
	// accessTokenRuleScope requires the token to carry scope.
	accessTokenRuleScope accessTokenRuleKind = iota + 1
	// accessTokenRuleAny accepts every valid scoped token; the handler applies
	// its own checks.
	accessTokenRuleAny
	// accessTokenRuleSession rejects every access token, legacy ones included.
	accessTokenRuleSession
)

type accessTokenRouteRule struct {
	kind  accessTokenRuleKind
	scope string
}

var (
	accessTokenAnyRule     = accessTokenRouteRule{kind: accessTokenRuleAny}
	accessTokenSessionRule = accessTokenRouteRule{kind: accessTokenRuleSession}
)

func accessTokenScopeRule(scope string) accessTokenRouteRule {
	return accessTokenRouteRule{kind: accessTokenRuleScope, scope: scope}
}

// accessTokenRouteRules declares the token rule of every dashboard route that
// is not guarded by RequirePermission, keyed by method and gin full path.
// Casbin-guarded routes declare themselves through
// DeclareAccessTokenPermissionRoute when they are registered.
var accessTokenRouteRules = map[string]accessTokenRouteRule{
	// router/api-router.go: top level
	"GET /api/models":                     accessTokenScopeRule("profile:read"),
	"GET /api/status/test":                accessTokenScopeRule("log:read"),
	"GET /api/pricing":                    accessTokenAnyRule,
	"GET /api/perf-metrics/summary":       accessTokenAnyRule,
	"GET /api/perf-metrics":               accessTokenAnyRule,
	"GET /api/rankings":                   accessTokenAnyRule,
	"POST /api/oauth/state":               accessTokenSessionRule,
	"POST /api/oauth/email/bind/start":    accessTokenScopeRule("account_security:write"),
	"POST /api/oauth/email/bind/resend":   accessTokenScopeRule("account_security:write"),
	"POST /api/oauth/email/bind":          accessTokenScopeRule("account_security:write"),
	"POST /api/oauth/wechat/bind":         accessTokenScopeRule("account_security:write"),
	"POST /api/oauth/telegram/bind/start": accessTokenSessionRule,
	"GET /api/oauth/:provider":            accessTokenSessionRule,
	"GET /api/verify/methods":             accessTokenAnyRule,
	"POST /api/verify":                    accessTokenAnyRule,

	// router/api-router.go: /api/user (self)
	"GET /api/user/sessions":                       accessTokenSessionRule,
	"DELETE /api/user/sessions/:sid":               accessTokenSessionRule,
	"POST /api/user/sessions/revoke-others":        accessTokenSessionRule,
	"GET /api/user/self/groups":                    accessTokenScopeRule("profile:read"),
	"GET /api/user/self":                           accessTokenScopeRule("profile:read"),
	"GET /api/user/models":                         accessTokenScopeRule("profile:read"),
	"PUT /api/user/self":                           accessTokenScopeRule("profile:write"),
	"DELETE /api/user/self":                        accessTokenScopeRule("account_security:write"),
	"GET /api/user/access_tokens":                  accessTokenSessionRule,
	"GET /api/user/access_tokens/catalog":          accessTokenSessionRule,
	"GET /api/user/access_tokens/scopes":           accessTokenSessionRule,
	"POST /api/user/access_tokens":                 accessTokenSessionRule,
	"PATCH /api/user/access_tokens/:id":            accessTokenSessionRule,
	"DELETE /api/user/access_tokens/:id":           accessTokenSessionRule,
	"DELETE /api/user/access_tokens/legacy":        accessTokenSessionRule,
	"GET /api/user/passkey":                        accessTokenScopeRule("account_security:read"),
	"POST /api/user/passkey/register/begin":        accessTokenScopeRule("account_security:write"),
	"POST /api/user/passkey/register/finish":       accessTokenScopeRule("account_security:write"),
	"POST /api/user/passkey/verify/begin":          accessTokenAnyRule,
	"POST /api/user/passkey/verify/finish":         accessTokenAnyRule,
	"DELETE /api/user/passkey":                     accessTokenScopeRule("account_security:write"),
	"GET /api/user/aff":                            accessTokenScopeRule("wallet:read"),
	"GET /api/user/topup/info":                     accessTokenScopeRule("wallet:read"),
	"GET /api/user/topup/self":                     accessTokenScopeRule("wallet:read"),
	"POST /api/user/topup":                         accessTokenScopeRule("wallet:write"),
	"POST /api/user/pay":                           accessTokenScopeRule("wallet:write"),
	"POST /api/user/amount":                        accessTokenScopeRule("wallet:read"),
	"POST /api/user/stripe/pay":                    accessTokenScopeRule("wallet:write"),
	"POST /api/user/stripe/amount":                 accessTokenScopeRule("wallet:read"),
	"POST /api/user/creem/pay":                     accessTokenScopeRule("wallet:write"),
	"POST /api/user/waffo/amount":                  accessTokenScopeRule("wallet:read"),
	"POST /api/user/waffo/pay":                     accessTokenScopeRule("wallet:write"),
	"POST /api/user/waffo-pancake/amount":          accessTokenScopeRule("wallet:read"),
	"POST /api/user/waffo-pancake/pay":             accessTokenScopeRule("wallet:write"),
	"POST /api/user/aff_transfer":                  accessTokenScopeRule("wallet:write"),
	"PUT /api/user/setting":                        accessTokenScopeRule("profile:write"),
	"GET /api/user/2fa/status":                     accessTokenScopeRule("account_security:read"),
	"POST /api/user/2fa/setup":                     accessTokenScopeRule("account_security:write"),
	"POST /api/user/2fa/enable":                    accessTokenScopeRule("account_security:write"),
	"POST /api/user/2fa/disable":                   accessTokenScopeRule("account_security:write"),
	"POST /api/user/2fa/backup_codes":              accessTokenScopeRule("account_security:write"),
	"GET /api/user/checkin":                        accessTokenScopeRule("wallet:read"),
	"POST /api/user/checkin":                       accessTokenScopeRule("wallet:write"),
	"GET /api/user/oauth/bindings":                 accessTokenScopeRule("account_security:read"),
	"DELETE /api/user/oauth/bindings/:provider_id": accessTokenScopeRule("account_security:write"),

	// router/api-router.go: /api/user (admin)
	"GET /api/user/":                                   accessTokenScopeRule("user:read"),
	"GET /api/user/topup":                              accessTokenScopeRule("billing:read"),
	"POST /api/user/topup/complete":                    accessTokenScopeRule("billing:write"),
	"GET /api/user/search":                             accessTokenScopeRule("user:read"),
	"GET /api/user/:id/oauth/bindings":                 accessTokenScopeRule("user:read"),
	"DELETE /api/user/:id/oauth/bindings/:provider_id": accessTokenScopeRule("user:write"),
	"DELETE /api/user/:id/bindings/:binding_type":      accessTokenScopeRule("user:write"),
	"GET /api/user/:id":                                accessTokenScopeRule("user:read"),
	"POST /api/user/":                                  accessTokenScopeRule("user:write"),
	"POST /api/user/manage":                            accessTokenScopeRule("user:write"),
	"PUT /api/user/":                                   accessTokenScopeRule("user:write"),
	"DELETE /api/user/:id":                             accessTokenScopeRule("user:write"),
	"DELETE /api/user/:id/reset_passkey":               accessTokenScopeRule("user:write"),
	"GET /api/user/2fa/stats":                          accessTokenScopeRule("user:read"),
	"DELETE /api/user/:id/2fa":                         accessTokenScopeRule("user:write"),

	// router/api-router.go: /api/subscription
	"GET /api/subscription/plans":                                    accessTokenScopeRule("wallet:read"),
	"GET /api/subscription/self":                                     accessTokenScopeRule("wallet:read"),
	"PUT /api/subscription/self/preference":                          accessTokenScopeRule("wallet:write"),
	"POST /api/subscription/balance/pay":                             accessTokenScopeRule("wallet:write"),
	"POST /api/subscription/epay/pay":                                accessTokenScopeRule("wallet:write"),
	"POST /api/subscription/stripe/pay":                              accessTokenScopeRule("wallet:write"),
	"POST /api/subscription/creem/pay":                               accessTokenScopeRule("wallet:write"),
	"POST /api/subscription/waffo-pancake/pay":                       accessTokenScopeRule("wallet:write"),
	"GET /api/subscription/admin/plans":                              accessTokenScopeRule("billing:read"),
	"POST /api/subscription/admin/plans":                             accessTokenScopeRule("billing:write"),
	"PUT /api/subscription/admin/plans/:id":                          accessTokenScopeRule("billing:write"),
	"PATCH /api/subscription/admin/plans/:id":                        accessTokenScopeRule("billing:write"),
	"POST /api/subscription/admin/bind":                              accessTokenScopeRule("billing:write"),
	"POST /api/subscription/admin/plans/:id/subscriptions/reset":     accessTokenScopeRule("billing:write"),
	"GET /api/subscription/admin/users/:id/subscriptions":            accessTokenScopeRule("billing:read"),
	"POST /api/subscription/admin/users/:id/subscriptions":           accessTokenScopeRule("billing:write"),
	"POST /api/subscription/admin/users/:id/subscriptions/reset":     accessTokenScopeRule("billing:write"),
	"POST /api/subscription/admin/user_subscriptions/:id/invalidate": accessTokenScopeRule("billing:write"),
	"DELETE /api/subscription/admin/user_subscriptions/:id":          accessTokenScopeRule("billing:write"),

	// router/api-router.go: /api/option
	"GET /api/option/":                                           accessTokenScopeRule("option:read"),
	"GET /api/option/request_policy":                             accessTokenScopeRule("option:read"),
	"PATCH /api/option/request_policy":                           accessTokenScopeRule("option:write"),
	"PUT /api/option/":                                           accessTokenScopeRule("option:write"),
	"PUT /api/option/passkey/domains":                            accessTokenScopeRule("option:write"),
	"GET /api/option/model_pricing":                              accessTokenScopeRule("option:read"),
	"PATCH /api/option/model_pricing":                            accessTokenScopeRule("option:write"),
	"POST /api/option/model_pricing/convert":                     accessTokenScopeRule("option:read"),
	"POST /api/option/model_pricing/preview":                     accessTokenScopeRule("option:read"),
	"POST /api/option/payment_compliance":                        accessTokenSessionRule,
	"GET /api/option/channel_affinity_cache":                     accessTokenScopeRule("option:read"),
	"DELETE /api/option/channel_affinity_cache":                  accessTokenScopeRule("option:write"),
	"POST /api/option/rest_model_ratio":                          accessTokenScopeRule("option:write"),
	"GET /api/option/waffo-pancake/catalog":                      accessTokenScopeRule("option:read"),
	"POST /api/option/waffo-pancake/pair":                        accessTokenScopeRule("option:write"),
	"POST /api/option/waffo-pancake/save":                        accessTokenScopeRule("option:write"),
	"POST /api/option/waffo-pancake/subscription-product":        accessTokenScopeRule("option:write"),
	"GET /api/option/waffo-pancake/subscription-product-options": accessTokenScopeRule("option:read"),

	// router/api-router.go: /api/custom-oauth-provider, /api/ratio_sync
	"POST /api/custom-oauth-provider/discovery": accessTokenScopeRule("option:write"),
	"GET /api/custom-oauth-provider/":           accessTokenScopeRule("option:read"),
	"GET /api/custom-oauth-provider/:id":        accessTokenScopeRule("option:read"),
	"POST /api/custom-oauth-provider/":          accessTokenScopeRule("option:write"),
	"PUT /api/custom-oauth-provider/:id":        accessTokenScopeRule("option:write"),
	"DELETE /api/custom-oauth-provider/:id":     accessTokenScopeRule("option:write"),
	"GET /api/ratio_sync/channels":              accessTokenScopeRule("option:read"),
	"POST /api/ratio_sync/fetch":                accessTokenScopeRule("option:write"),

	// router/api-router.go: /api/performance, /api/system-task, /api/system-info
	"GET /api/performance/stats":                   accessTokenScopeRule("ops:read"),
	"DELETE /api/performance/disk_cache":           accessTokenScopeRule("ops:write"),
	"POST /api/performance/reset_stats":            accessTokenScopeRule("ops:write"),
	"POST /api/performance/gc":                     accessTokenScopeRule("ops:write"),
	"GET /api/performance/logs":                    accessTokenScopeRule("ops:read"),
	"DELETE /api/performance/logs":                 accessTokenScopeRule("ops:write"),
	"POST /api/system-task/log-cleanup":            accessTokenScopeRule("ops:write"),
	"GET /api/system-task/list":                    accessTokenScopeRule("ops:read"),
	"DELETE /api/system-task/history":              accessTokenScopeRule("ops:write"),
	"GET /api/system-task/current":                 accessTokenScopeRule("ops:read"),
	"GET /api/system-task/:task_id":                accessTokenScopeRule("ops:read"),
	"GET /api/system-info/instances":               accessTokenScopeRule("ops:read"),
	"DELETE /api/system-info/stale-instances":      accessTokenScopeRule("ops:write"),
	"DELETE /api/system-info/instances/:node_name": accessTokenScopeRule("ops:write"),

	// router/api-router.go: /api/plugin/task
	"GET /api/plugin/task":                           accessTokenScopeRule("plugin:read"),
	"POST /api/plugin/task":                          accessTokenScopeRule("plugin:write"),
	"PUT /api/plugin/task":                           accessTokenScopeRule("plugin:write"),
	"GET /api/plugin/task/runtime/status":            accessTokenScopeRule("plugin:read"),
	"GET /api/plugin/task/marketplace/sources":       accessTokenScopeRule("plugin:read"),
	"PUT /api/plugin/task/marketplace/sources":       accessTokenScopeRule("plugin:write"),
	"GET /api/plugin/task/:key":                      accessTokenScopeRule("plugin:read"),
	"GET /api/plugin/task/:key/icon":                 accessTokenScopeRule("plugin:read"),
	"GET /api/plugin/task/:key/versions":             accessTokenScopeRule("plugin:read"),
	"POST /api/plugin/task/:key/activate":            accessTokenScopeRule("plugin:write"),
	"POST /api/plugin/task/:key/status":              accessTokenScopeRule("plugin:write"),
	"POST /api/plugin/task/:key/dryrun":              accessTokenScopeRule("plugin:write"),
	"DELETE /api/plugin/task/:key/versions/:version": accessTokenScopeRule("plugin:write"),

	// router/channel-router.go: the key route is RootAuth, not Casbin-guarded.
	"POST /api/channel/:id/key": accessTokenScopeRule(service.AccessTokenScopeOf(authz.ChannelSecretView)),

	// router/authz-router.go
	"GET /api/authz/catalog": accessTokenScopeRule("user:read"),

	// router/api-router.go: /api/token
	"GET /api/token/":            accessTokenScopeRule("api_key:read"),
	"GET /api/token/search":      accessTokenScopeRule("api_key:read"),
	"GET /api/token/auto-groups": accessTokenScopeRule("api_key:read"),
	"GET /api/token/:id":         accessTokenScopeRule("api_key:read"),
	"POST /api/token/:id/key":    accessTokenScopeRule("api_key:reveal"),
	"POST /api/token/":           accessTokenScopeRule("api_key:write"),
	"PUT /api/token/":            accessTokenScopeRule("api_key:write"),
	"DELETE /api/token/:id":      accessTokenScopeRule("api_key:write"),
	"POST /api/token/batch":      accessTokenScopeRule("api_key:write"),
	"POST /api/token/batch/keys": accessTokenScopeRule("api_key:reveal"),

	// router/api-router.go: /api/redemption
	"GET /api/redemption/":           accessTokenScopeRule("redemption:read"),
	"GET /api/redemption/search":     accessTokenScopeRule("redemption:read"),
	"GET /api/redemption/:id":        accessTokenScopeRule("redemption:read"),
	"POST /api/redemption/":          accessTokenScopeRule("redemption:write"),
	"POST /api/redemption/batch":     accessTokenScopeRule("redemption:write"),
	"PUT /api/redemption/":           accessTokenScopeRule("redemption:write"),
	"DELETE /api/redemption/invalid": accessTokenScopeRule("redemption:write"),
	"DELETE /api/redemption/:id":     accessTokenScopeRule("redemption:write"),

	// router/api-router.go: /api/audit, /api/log, /api/data
	"GET /api/audit/self":                       accessTokenScopeRule("usage:read"),
	"GET /api/log/":                             accessTokenScopeRule("log:read"),
	"GET /api/log/stat":                         accessTokenScopeRule("log:read"),
	"GET /api/log/self/stat":                    accessTokenScopeRule("usage:read"),
	"GET /api/log/channel_affinity_usage_cache": accessTokenScopeRule("log:read"),
	"GET /api/log/search":                       accessTokenScopeRule("log:read"),
	"GET /api/log/self":                         accessTokenScopeRule("usage:read"),
	"GET /api/log/self/search":                  accessTokenScopeRule("usage:read"),
	"GET /api/data/":                            accessTokenScopeRule("log:read"),
	"GET /api/data/users":                       accessTokenScopeRule("log:read"),
	"GET /api/data/self":                        accessTokenScopeRule("usage:read"),
	"GET /api/data/flow":                        accessTokenScopeRule("log:read"),
	"GET /api/data/flow/self":                   accessTokenScopeRule("usage:read"),

	// router/api-router.go: /api/group, /api/prefill_group
	"GET /api/group/":               accessTokenScopeRule("group:read"),
	"GET /api/prefill_group/":       accessTokenScopeRule("group:read"),
	"POST /api/prefill_group/":      accessTokenScopeRule("group:write"),
	"PUT /api/prefill_group/":       accessTokenScopeRule("group:write"),
	"DELETE /api/prefill_group/:id": accessTokenScopeRule("group:write"),

	// router/api-router.go: /api/mj, /api/task
	"GET /api/mj/self":                 accessTokenScopeRule("usage:read"),
	"GET /api/mj/":                     accessTokenScopeRule("log:read"),
	"GET /api/task/self":               accessTokenScopeRule("usage:read"),
	"GET /api/task":                    accessTokenScopeRule("log:read"),
	"GET /api/task/:task_id/artifacts": accessTokenScopeRule("usage:read"),

	// router/api-router.go: /api/vendors, /api/models (admin)
	"POST /api/vendors/operations/preview":  accessTokenScopeRule("model:read"),
	"POST /api/vendors/operations":          accessTokenScopeRule("model:write"),
	"GET /api/vendors/":                     accessTokenScopeRule("model:read"),
	"GET /api/vendors/search":               accessTokenScopeRule("model:read"),
	"GET /api/vendors/:id":                  accessTokenScopeRule("model:read"),
	"POST /api/vendors/":                    accessTokenScopeRule("model:write"),
	"PUT /api/vendors/":                     accessTokenScopeRule("model:write"),
	"DELETE /api/vendors/:id":               accessTokenScopeRule("model:write"),
	"GET /api/models/sync_upstream/preview": accessTokenScopeRule("model:read"),
	"POST /api/models/sync_upstream":        accessTokenScopeRule("model:write"),
	"POST /api/models/delete":               accessTokenScopeRule("model:write"),
	"GET /api/models/missing":               accessTokenScopeRule("model:read"),
	"GET /api/models/":                      accessTokenScopeRule("model:read"),
	"GET /api/models/search":                accessTokenScopeRule("model:read"),
	"GET /api/models/:id":                   accessTokenScopeRule("model:read"),
	"POST /api/models/":                     accessTokenScopeRule("model:write"),
	"PUT /api/models/":                      accessTokenScopeRule("model:write"),
	"DELETE /api/models/:id":                accessTokenScopeRule("model:write"),

	// router/api-router.go: /api/deployments
	"GET /api/deployments/settings":                     accessTokenScopeRule("deployment:read"),
	"POST /api/deployments/settings/test-connection":    accessTokenScopeRule("deployment:write"),
	"GET /api/deployments/":                             accessTokenScopeRule("deployment:read"),
	"GET /api/deployments/search":                       accessTokenScopeRule("deployment:read"),
	"POST /api/deployments/test-connection":             accessTokenScopeRule("deployment:write"),
	"GET /api/deployments/hardware-types":               accessTokenScopeRule("deployment:read"),
	"GET /api/deployments/locations":                    accessTokenScopeRule("deployment:read"),
	"GET /api/deployments/available-replicas":           accessTokenScopeRule("deployment:read"),
	"POST /api/deployments/price-estimation":            accessTokenScopeRule("deployment:read"),
	"GET /api/deployments/check-name":                   accessTokenScopeRule("deployment:read"),
	"POST /api/deployments/":                            accessTokenScopeRule("deployment:write"),
	"GET /api/deployments/:id":                          accessTokenScopeRule("deployment:read"),
	"GET /api/deployments/:id/logs":                     accessTokenScopeRule("deployment:read"),
	"GET /api/deployments/:id/containers":               accessTokenScopeRule("deployment:read"),
	"GET /api/deployments/:id/containers/:container_id": accessTokenScopeRule("deployment:read"),
	"PUT /api/deployments/:id":                          accessTokenScopeRule("deployment:write"),
	"PUT /api/deployments/:id/name":                     accessTokenScopeRule("deployment:write"),
	"POST /api/deployments/:id/extend":                  accessTokenScopeRule("deployment:write"),
	"DELETE /api/deployments/:id":                       accessTokenScopeRule("deployment:write"),

	// router/relay-router.go
	// Fork dashboard routes share existing grants; business role checks remain
	// in their handlers. Features without a separate grant require a session.
	"DELETE /api/group_buy/packages/:id":                        accessTokenScopeRule("billing:write"),
	"GET /api/activity/lottery/admin/rounds":                    accessTokenScopeRule("billing:read"),
	"GET /api/activity/lottery/admin/rounds/:id":                accessTokenScopeRule("billing:read"),
	"GET /api/activity/lottery/admin/rounds/:id/winners/export": accessTokenScopeRule("billing:read"),
	"GET /api/activity/lottery/current":                         accessTokenScopeRule("wallet:read"),
	"GET /api/activity/lottery/rounds/:id":                      accessTokenScopeRule("wallet:read"),
	"GET /api/channel/monitor":                                  accessTokenScopeRule("profile:read"),
	"GET /api/drawing_logs/":                                    accessTokenScopeRule("log:read"),
	"GET /api/drawing_logs/self":                                accessTokenScopeRule("usage:read"),
	"GET /api/group_buy/orders":                                 accessTokenScopeRule("billing:read"),
	"GET /api/group_buy/orders/:id":                             accessTokenScopeRule("billing:read"),
	"GET /api/group_buy/packages":                               accessTokenScopeRule("billing:read"),
	"GET /api/group_buy/refunds":                                accessTokenScopeRule("billing:read"),
	"GET /api/group/monitor":                                    accessTokenScopeRule("profile:read"),
	"GET /api/group/monitor/detail":                             accessTokenScopeRule("profile:read"),
	"GET /api/invoice/admin/":                                   accessTokenScopeRule("billing:read"),
	"GET /api/invoice/download/:id":                             accessTokenScopeRule("wallet:read"),
	"GET /api/invoice/eligible_orders":                          accessTokenScopeRule("wallet:read"),
	"GET /api/invoice/self":                                     accessTokenScopeRule("wallet:read"),
	"GET /api/log/error_stat":                                   accessTokenScopeRule("log:read"),
	"GET /api/log/self/daily_usage":                             accessTokenScopeRule("usage:read"),
	"GET /api/log/usage_stat":                                   accessTokenScopeRule("log:read"),
	"GET /api/log/user_stat":                                    accessTokenScopeRule("log:read"),
	"GET /api/lottery/admin/config":                             accessTokenScopeRule("billing:read"),
	"GET /api/lottery/admin/records":                            accessTokenScopeRule("billing:read"),
	"GET /api/lottery/cards":                                    accessTokenScopeRule("wallet:read"),
	"GET /api/lottery/records":                                  accessTokenScopeRule("wallet:read"),
	"GET /api/lottery/status":                                   accessTokenScopeRule("wallet:read"),
	"GET /api/option/gmpay_fee/status":                          accessTokenScopeRule("option:read"),
	"GET /api/option/payment_gateway_mode/status":               accessTokenScopeRule("option:read"),
	"GET /api/pelican/monitor":                                  accessTokenScopeRule("profile:read"),
	"GET /api/pelican/monitor/probes/:id":                       accessTokenScopeRule("profile:read"),
	"GET /api/rebate/":                                          accessTokenScopeRule("billing:read"),
	"GET /api/rebate/ranking":                                   accessTokenScopeRule("billing:read"),
	"GET /api/rebate/users":                                     accessTokenScopeRule("billing:read"),
	"GET /api/subscription/epay/status":                         accessTokenScopeRule("wallet:read"),
	"GET /api/token/concurrency":                                accessTokenScopeRule("api_key:read"),
	"GET /api/user_ranking/":                                    accessTokenScopeRule("user:read"),
	"GET /api/user/groupbuy/detail":                             accessTokenScopeRule("wallet:read"),
	"GET /api/user/groupbuy/hall":                               accessTokenScopeRule("wallet:read"),
	"GET /api/user/groupbuy/info":                               accessTokenScopeRule("wallet:read"),
	"GET /api/user/groupbuy/payment/status":                     accessTokenScopeRule("wallet:read"),
	"GET /api/user/groupbuy/self":                               accessTokenScopeRule("wallet:read"),
	"GET /api/user/ips":                                         accessTokenScopeRule("user:read"),
	"GET /api/user/self/rebate":                                 accessTokenScopeRule("wallet:read"),
	"GET /api/user/topup/status":                                accessTokenScopeRule("wallet:read"),
	"POST /api/activity/lottery/admin/rounds":                   accessTokenScopeRule("billing:write"),
	"POST /api/activity/lottery/admin/rounds/:id/cancel":        accessTokenScopeRule("billing:write"),
	"POST /api/activity/lottery/admin/rounds/:id/draw":          accessTokenScopeRule("billing:write"),
	"POST /api/activity/lottery/admin/rounds/:id/publish":       accessTokenScopeRule("billing:write"),
	"POST /api/group_buy/orders/:id/cancel":                     accessTokenScopeRule("billing:write"),
	"POST /api/group_buy/packages":                              accessTokenScopeRule("billing:write"),
	"POST /api/group_buy/refunds/:id/done":                      accessTokenScopeRule("billing:write"),
	"POST /api/invoice/":                                        accessTokenScopeRule("wallet:write"),
	"POST /api/invoice/admin/:id/issue":                         accessTokenScopeRule("billing:write"),
	"POST /api/invoice/admin/:id/reject":                        accessTokenScopeRule("billing:write"),
	"POST /api/log/error_alert_test":                            accessTokenScopeRule("ops:write"),
	"POST /api/lottery/admin/grant":                             accessTokenScopeRule("billing:write"),
	"POST /api/lottery/draw":                                    accessTokenScopeRule("wallet:write"),
	"POST /api/option/gmpay_fee/test":                           accessTokenScopeRule("option:read"),
	"POST /api/option/quota_reminder_test":                      accessTokenScopeRule("option:write"),
	"POST /api/option/test_email":                               accessTokenScopeRule("option:write"),
	"POST /api/rebate/cancel":                                   accessTokenScopeRule("billing:write"),
	"POST /api/rebate/pay":                                      accessTokenScopeRule("billing:write"),
	"POST /api/user/alipay/pay":                                 accessTokenScopeRule("wallet:write"),
	"POST /api/user/epay/checkout":                              accessTokenScopeRule("wallet:write"),
	"POST /api/user/groupbuy/cancel":                            accessTokenScopeRule("wallet:write"),
	"POST /api/user/groupbuy/create":                            accessTokenScopeRule("wallet:write"),
	"POST /api/user/groupbuy/join":                              accessTokenScopeRule("wallet:write"),
	"POST /api/user/wechatpay/jsapi/prepare":                    accessTokenScopeRule("wallet:write"),
	"POST /api/user/wechatpay/pay":                              accessTokenScopeRule("wallet:write"),
	"PUT /api/activity/lottery/admin/rounds/:id":                accessTokenScopeRule("billing:write"),
	"PUT /api/group_buy/packages":                               accessTokenScopeRule("billing:write"),
	"PUT /api/lottery/admin/config":                             accessTokenScopeRule("billing:write"),
	"PUT /api/option/quota_reminder":                            accessTokenScopeRule("option:write"),
	"PUT /api/rebate/user_ratio":                                accessTokenScopeRule("billing:write"),
	"DELETE /api/agent-console/domains/:id":                     accessTokenSessionRule,
	"DELETE /api/announcement/:id":                              accessTokenSessionRule,
	"GET /api/agent-apply":                                      accessTokenSessionRule,
	"GET /api/agent-console/domains":                            accessTokenSessionRule,
	"GET /api/agent-console/ledgers":                            accessTokenSessionRule,
	"GET /api/agent-console/options":                            accessTokenSessionRule,
	"GET /api/agent-console/payment":                            accessTokenSessionRule,
	"GET /api/agent-console/prepay/status":                      accessTokenSessionRule,
	"GET /api/agent-console/ratios":                             accessTokenSessionRule,
	"GET /api/agent-console/self":                               accessTokenSessionRule,
	"GET /api/agent-console/users":                              accessTokenSessionRule,
	"GET /api/agent/":                                           accessTokenSessionRule,
	"GET /api/agent/:id":                                        accessTokenSessionRule,
	"GET /api/agent/:id/ledgers":                                accessTokenSessionRule,
	"GET /api/announcement/":                                    accessTokenSessionRule,
	"GET /api/announcement/detail/:id":                          accessTokenSessionRule,
	"GET /api/identity_verification/admin/":                     accessTokenSessionRule,
	"GET /api/identity_verification/admin/config":               accessTokenSessionRule,
	"GET /api/identity_verification/proof/:id":                  accessTokenSessionRule,
	"GET /api/identity_verification/self":                       accessTokenSessionRule,
	"GET /api/identity_verification/types":                      accessTokenSessionRule,
	"GET /api/ticket/admin/":                                    accessTokenSessionRule,
	"GET /api/ticket/admin/detail/:id":                          accessTokenSessionRule,
	"GET /api/ticket/admin/stats":                               accessTokenSessionRule,
	"GET /api/ticket/attachment/:id/:file":                      accessTokenSessionRule,
	"GET /api/ticket/detail/:id":                                accessTokenSessionRule,
	"GET /api/ticket/meta":                                      accessTokenSessionRule,
	"GET /api/ticket/self":                                      accessTokenSessionRule,
	"GET /api/user/wechat/mp/bind/check":                        accessTokenSessionRule,
	"GET /api/user/wechat/mp/bind/code":                         accessTokenSessionRule,
	"POST /api/agent-apply":                                     accessTokenSessionRule,
	"POST /api/agent-console/domains":                           accessTokenSessionRule,
	"POST /api/agent-console/domains/:id/verify":                accessTokenSessionRule,
	"POST /api/agent-console/prepay":                            accessTokenSessionRule,
	"POST /api/agent/":                                          accessTokenSessionRule,
	"POST /api/agent/:id/approve":                               accessTokenSessionRule,
	"POST /api/agent/:id/disable":                               accessTokenSessionRule,
	"POST /api/agent/:id/wallet":                                accessTokenSessionRule,
	"POST /api/announcement/":                                   accessTokenSessionRule,
	"POST /api/identity_verification/":                          accessTokenSessionRule,
	"POST /api/identity_verification/admin/:id/approve":         accessTokenSessionRule,
	"POST /api/identity_verification/admin/:id/reject":          accessTokenSessionRule,
	"POST /api/option/payment_gateway_mode/apply":               accessTokenSessionRule,
	"POST /api/ticket/":                                         accessTokenSessionRule,
	"POST /api/ticket/admin/reply/:id":                          accessTokenSessionRule,
	"POST /api/ticket/attachment":                               accessTokenSessionRule,
	"POST /api/ticket/close/:id":                                accessTokenSessionRule,
	"POST /api/ticket/reply/:id":                                accessTokenSessionRule,
	"POST /api/user/agree_legal":                                accessTokenSessionRule,
	"PUT /api/agent-console/options":                            accessTokenSessionRule,
	"PUT /api/agent-console/payment":                            accessTokenSessionRule,
	"PUT /api/agent-console/ratios":                             accessTokenSessionRule,
	"PUT /api/agent/":                                           accessTokenSessionRule,
	"PUT /api/announcement/":                                    accessTokenSessionRule,
	"PUT /api/identity_verification/admin/config":               accessTokenSessionRule,
	"PUT /api/ticket/admin/priority/:id":                        accessTokenSessionRule,
	"PUT /api/ticket/admin/status/:id":                          accessTokenSessionRule,

	"POST /pg/chat/completions": accessTokenSessionRule,
}

var (
	permissionRouteRulesMu sync.RWMutex
	permissionRouteRules   = map[string]accessTokenRouteRule{}
)

// DeclareAccessTokenPermissionRoute records that the Casbin permission guarding
// a route is also the token scope it requires. It runs while routes are
// registered and panics on conflicting declarations.
func DeclareAccessTokenPermissionRoute(method, fullPath string, permission authz.Permission) {
	key := method + " " + fullPath
	rule := accessTokenScopeRule(service.AccessTokenScopeOf(permission))
	if _, ok := accessTokenRouteRules[key]; ok {
		panic(fmt.Sprintf("access token route %s is declared twice", key))
	}
	permissionRouteRulesMu.Lock()
	defer permissionRouteRulesMu.Unlock()
	if existing, ok := permissionRouteRules[key]; ok && existing != rule {
		panic(fmt.Sprintf("access token route %s is declared with %s and %s", key, existing.scope, rule.scope))
	}
	permissionRouteRules[key] = rule
}

// AccessTokenRouteRule returns the rule for "METHOD /full/path".
func AccessTokenRouteRule(key string) (accessTokenRouteRule, bool) {
	if rule, ok := accessTokenRouteRules[key]; ok {
		return rule, true
	}
	permissionRouteRulesMu.RLock()
	defer permissionRouteRulesMu.RUnlock()
	rule, ok := permissionRouteRules[key]
	return rule, ok
}

// AccessTokenRouteRuleKeys lists every declared route key, sorted.
func AccessTokenRouteRuleKeys() []string {
	permissionRouteRulesMu.RLock()
	keys := slices.Collect(maps.Keys(permissionRouteRules))
	permissionRouteRulesMu.RUnlock()
	keys = slices.AppendSeq(keys, maps.Keys(accessTokenRouteRules))
	slices.Sort(keys)
	return keys
}

// Scope returns the token scope the rule requires, or "" for any/session rules.
func (rule accessTokenRouteRule) Scope() string {
	return rule.scope
}

// Kind names the rule category: "scope", "any" or "session".
func (rule accessTokenRouteRule) Kind() string {
	switch rule.kind {
	case accessTokenRuleScope:
		return "scope"
	case accessTokenRuleAny:
		return "any"
	case accessTokenRuleSession:
		return "session"
	}
	return ""
}
