# Outcome

让统一 Admin H5 在 `aierxin.cc` 与 `codezip.io` 之间访问各自 API 时，国际站登录、二次验证、会话刷新和退出登录都能正常完成。跨域请求应返回与请求 origin 匹配的 CORS 响应头，浏览器能够读取后端真实的登录错误或成功响应。

# Scope

- 为 H5 双站点定义显式、可携带 Cookie 的 CORS 策略，允许 `https://aierxin.cc` 和 `https://codezip.io`。
- 将该策略安装到 `/api` 路由组，使登录、2FA、refresh、logout 以及 H5 使用的用户和状态 API 都覆盖普通请求与 OPTIONS 预检。
- 保留会话 Cookie 的安全 origin 校验；安全 Cookie 模式下使用 `SameSite=None; Secure` 支持跨站 H5 会话，且两个 H5 origin 都必须能够通过可信 origin 配置。
- 增加 middleware 回归测试，验证允许 origin、凭据、预检方法和请求头、拒绝未知 origin，以及无 Origin 的同源请求。

# Non-goals

- 不改变国内站访问限制、国际站业务数据、账号密码或认证流程本身。
- 不把两个站点的数据库、Cookie、用户或配置合并为一个站点。
- 不在代码、日志、Comet 产物或提交中写入任何真实认证凭据。

# Acceptance examples

- 从 `https://aierxin.cc/admin-h5/sign-in` 选择国际站并发起登录时，浏览器不再因 CORS 把响应转换为“暂时无法登录”；无效账号能够显示后端返回的业务错误。
- 对 `https://aierxin.cc` 和 `https://codezip.io` 的 API 请求分别返回匹配的 `Access-Control-Allow-Origin` 与 `Access-Control-Allow-Credentials: true`，并带 `Vary: Origin`。
- OPTIONS 预检允许 H5 使用的 `POST` 方法和 `Content-Type`、`Authorization`、`X-Auth-Session`、`Cache-Control` 等请求头；未知 origin 不获得 CORS 放行头。
- 真实 `SetApiRouter` 注册的 `/api` OPTIONS 预检能够命中 H5 CORS middleware，而不是因 Gin 未匹配 OPTIONS 路由返回 404。
- `/api/user/login`、`/api/user/login/2fa`、`/api/user/auth/refresh` 和 `/api/user/auth/logout` 均经过该策略，现有无 Origin 的同源请求继续工作。

# Constraints and invariants

- 只允许明确列出的 HTTPS origin；不得使用 `AllowAllOrigins` 与凭据同时开启。
- 生产发布仍须遵守从已合并 `origin/main` 构建、推送和部署的项目发布纪律；本次本地修复完成前不归档 Comet change。

# Decisions

- 新增独立的 H5 CORS middleware，避免改变已有 relay/旧 dashboard 的通用 CORS 行为。
- 允许 origin 以代码中的安全白名单集中定义；Cookie origin guard 继续由 `SESSION_COOKIE_TRUSTED_URL` 配置负责安全模式校验。

# Open questions

无。线上真实账号登录仅在用户明确授权使用凭据后验证；本次回归先使用无效测试账号和预检请求。

# Verification expectations

- 运行 middleware 单元测试及受影响的 Go 测试。
- 使用 `curl` 检查两个生产 origin 的登录 OPTIONS/POST 响应头，并确认浏览器页面不再报告 CORS 网络错误。
- 对照完整规格、Git diff 和 Comet 验收矩阵，记录所有已执行与未执行的检查。
