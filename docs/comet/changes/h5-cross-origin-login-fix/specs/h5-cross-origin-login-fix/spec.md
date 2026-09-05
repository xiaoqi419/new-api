# H5 跨域登录修复

## 行为

统一 Admin H5 运行在一个站点 origin、请求另一个站点 API 时，后端必须按请求的 `Origin` 返回显式 CORS 允许值。`https://aierxin.cc` 与 `https://codezip.io` 是本次允许的 H5 origin；允许携带会话 Cookie，并覆盖 `/api` 路由组中的登录、2FA、refresh、logout、状态和用户 API。安全 Cookie 模式下 refresh Cookie 使用 `SameSite=None; Secure`，以便跨站 H5 在刷新页面后继续保持会话。没有 `Origin` 的同源请求保持现有行为，其他 origin 不获得放行头。

## 安全

不得将 `AllowAllOrigins=true` 与 `AllowCredentials=true` 用于 H5 跨域策略。预检必须限制到实际使用的方法和请求头。启用 `SESSION_COOKIE_SECURE` 时，refresh Cookie 为 `SameSite=None; Secure`，且两个 H5 origin 必须能够通过 `SESSION_COOKIE_TRUSTED_URL` 的可信 origin 校验；不安全本地模式继续使用 `SameSite=Strict`。

## 验收标准

- A1：允许 `https://aierxin.cc` 和 `https://codezip.io`，响应包含匹配的 `Access-Control-Allow-Origin`、`Access-Control-Allow-Credentials: true` 和 `Vary: Origin`。
- A2：OPTIONS 预检允许 H5 登录/会话所需的 POST、GET、PUT、DELETE、OPTIONS 方法以及 Content-Type、Authorization、X-Auth-Session、Cache-Control 等请求头。
- A3：未知 origin 没有 CORS 放行头；没有 Origin 的同源请求仍返回业务响应。
- A4：`/api/user/login`、`/api/user/login/2fa`、`/api/user/auth/refresh`、`/api/user/auth/logout` 和 `/api/status` 都安装 H5 CORS，国际站无效账号请求能够读到后端 JSON 错误而不是浏览器网络错误。
- A5：Go middleware 回归测试和受影响测试通过；线上 curl/浏览器检查记录两个 origin 的预检和实际请求结果。
- A6：未写入认证凭据，未改变站点数据隔离或国内访问限制；Comet Verify 未通过前保持 change active。
