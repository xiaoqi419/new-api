---
generated_from_state_version: 13
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 3
- Iteration: 1
- Verifier attempt: 1
- Completed: 2026-09-05T12:03:40.566Z
- Summary: H5 跨域登录修复已从合并提交 b5e3bd0224e15832615085080cf8d6471cebcdc6 构建并部署到国内和国际应用容器。两个应用均健康运行新镜像 20260905-27ab1a99a，双 origin 可信配置和真实 OPTIONS 路由生效；线上 curl 与浏览器无效登录验证通过。

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | 从 `https://aierxin.cc/admin-h5/sign-in` 选择国际站并发起登录时，浏览器不再因 CORS 把响应转换为“暂时无法登录”；无效账号能够显示后端返回的业务错误。 | 在 https://aierxin.cc/admin-h5/sign-in 的浏览器中选择国际站并提交合成无效账号后，页面显示后端业务错误“用户名或密码错误，或用户已被封禁”，不再显示 CORS 网络错误或“暂时无法登录”。 |
| A2 | passed | brief.md | 对 `https://aierxin.cc` 和 `https://codezip.io` 的 API 请求分别返回匹配的 `Access-Control-Allow-Origin` 与 `Access-Control-Allow-Credentials: true`，并带 `Vary: Origin`。 | 线上从服务器实测 aierxin.cc 与 codezip.io 两个方向的跨站请求均返回匹配 ACAO、Allow-Credentials=true 和 Origin 变化；公共状态接口版本头与响应均为 20260905-27ab1a99a。 |
| A3 | passed | brief.md | OPTIONS 预检允许 H5 使用的 `POST` 方法和 `Content-Type`、`Authorization`、`X-Auth-Session`、`Cache-Control` 等请求头；未知 origin 不获得 CORS 放行头。 | 线上五个 API 路径的 OPTIONS 预检允许 POST 与 Content-Type、Authorization、X-Auth-Session 等请求头；未知 origin 返回 403 且无放行头；无 Origin 预检返回 204 且无 CORS origin 头。 |
| A4 | passed | brief.md | 真实 `SetApiRouter` 注册的 `/api` OPTIONS 预检能够命中 H5 CORS middleware，而不是因 Gin 未匹配 OPTIONS 路由返回 404。 | 真实 SetApiRouter 回归测试通过；线上 /api/user/login、/api/user/login/2fa、/api/user/auth/refresh、/api/user/auth/logout 和 /api/status 预检均返回 204 与显式来源。 |
| A5 | passed | brief.md | `/api/user/login`、`/api/user/login/2fa`、`/api/user/auth/refresh` 和 `/api/user/auth/logout` 均经过该策略，现有无 Origin 的同源请求继续工作。 | 以上登录、2FA、refresh、logout 路径均经 H5 CORS 策略；无 Origin 兼容性由本地测试和线上无 Origin OPTIONS 检查覆盖。 |
| A6 | passed | specs/h5-cross-origin-login-fix/spec.md | 统一 Admin H5 运行在一个站点 origin、请求另一个站点 API 时，后端必须按请求的 `Origin` 返回显式 CORS 允许值。`https://aierxin.cc` 与 `https://codezip.io` 是本次允许的 H5 origin；允许携带会话 Cookie，并覆盖 `/api` 路由组中的登录、2FA、refresh、logout、状态和用户 API。安全 Cookie 模式下 refresh Cookie 使用 `SameSite=None; Secure`，以便跨站 H5 在刷新页面后继续保持会话。没有 `Origin` 的同源请求保持现有行为，其他 origin 不获得放行头。 | H5CORS 仅使用两个 HTTPS origin，安全模式 refresh Cookie 使用 SameSite=None; Secure；两套运行环境均为 SESSION_COOKIE_SECURE=true 且 SESSION_COOKIE_TRUSTED_URL 包含两个 origin；本地 cookie 测试通过。 |
| A7 | passed | specs/h5-cross-origin-login-fix/spec.md | 不得将 `AllowAllOrigins=true` 与 `AllowCredentials=true` 用于 H5 跨域策略。预检必须限制到实际使用的方法和请求头。启用 `SESSION_COOKIE_SECURE` 时，refresh Cookie 为 `SameSite=None; Secure`，且两个 H5 origin 必须能够通过 `SESSION_COOKIE_TRUSTED_URL` 的可信 origin 校验；不安全本地模式继续使用 `SameSite=Strict`。 | 代码未将 H5 AllowAllOrigins 与凭据同时启用；预检方法和请求头为显式白名单；安全与不安全 cookie 模式测试均通过。 |
| A8 | passed | specs/h5-cross-origin-login-fix/spec.md | A1：允许 `https://aierxin.cc` 和 `https://codezip.io`，响应包含匹配的 `Access-Control-Allow-Origin`、`Access-Control-Allow-Credentials: true` 和 `Vary: Origin`。 | 线上双方向跨站实测返回精确 ACAO、Allow-Credentials=true；Vary: Origin 由应用返回并在请求经过网关时保留。 |
| A9 | passed | specs/h5-cross-origin-login-fix/spec.md | A2：真实 `SetApiRouter` 的 OPTIONS 预检能够命中 H5 CORS middleware，返回 204，并允许 H5 登录/会话所需的 POST、GET、PUT、DELETE、OPTIONS 方法以及 Content-Type、Authorization、X-Auth-Session、Cache-Control 等请求头。 | 真实路由测试覆盖 OPTIONS catch-all，线上所有认证相关路径预检均为 204，允许的方法包含 POST、GET、PUT、DELETE、OPTIONS 等。 |
| A10 | passed | specs/h5-cross-origin-login-fix/spec.md | A3：未知 origin 没有 CORS 放行头；没有 Origin 的同源请求仍返回业务响应。 | 未知来源线上预检返回 403 且无 ACAO；无 Origin 请求保持 204/业务兼容。 |
| A11 | passed | specs/h5-cross-origin-login-fix/spec.md | A4：`/api/user/login`、`/api/user/login/2fa`、`/api/user/auth/refresh`、`/api/user/auth/logout` 和 `/api/status` 都安装 H5 CORS，国际站无效账号请求能够读到后端 JSON 错误而不是浏览器网络错误。 | 线上 codezip.io 与 aierxin.cc 状态接口均返回 success=true 和版本 20260905-27ab1a99a；国际登录合成无效账号响应可被 H5 浏览器读取。 |
| A12 | passed | specs/h5-cross-origin-login-fix/spec.md | A5：Go middleware 回归测试和受影响测试通过；线上 curl/浏览器检查记录两个 origin 的预检和实际请求结果。 | go test -count=1 ./router ./middleware ./service ./controller ./common、go vet ./router ./middleware、git diff --check 均通过；服务器 Docker 构建成功；线上双域名 curl、预检、无效登录和浏览器检查通过。 |
| A13 | passed | specs/h5-cross-origin-login-fix/spec.md | A6：未写入认证凭据，未改变站点数据隔离或国内访问限制；Comet Verify 未通过前保持 change active。 | 未使用或写入真实认证凭据；仅更新应用镜像、Compose 环境和运行时 trusted origins，数据库、Redis、网关及国内访问限制未改动；配置已备份。 |

## Checks

| Check | Command | Working directory | Status | Exit | Duration |
| --- | --- | --- | --- | ---: | ---: |
| H5 preflight affected Go tests | -C .worktrees/h5-cors-preflight-fix test ./router ./middleware ./service ./controller ./common -count=1 | . | passed | 0 | 8862 ms |
| H5 preflight Go vet | -C .worktrees/h5-cors-preflight-fix vet ./router ./middleware | . | passed | 0 | 1357 ms |
| H5 preflight diff whitespace check | -C .worktrees/h5-cors-preflight-fix diff --check origin/main...HEAD | . | passed | 0 | 53 ms |

## Blockers

_None._

## Risks and skipped work

- 未使用真实管理员凭据，因此成功登录、2FA 和真实 refresh/logout Cookie 轮换未执行；使用合成无效登录验证了跨域错误响应可读性。
- codezip.io 作为自身页面 origin 的同源请求不需要 CORS 响应头；两个跨站方向均已分别用反向 origin 实测。
- 本机未安装 tsgo，直接 bun run typecheck 未运行；Docker 生产构建已完成前端构建，Go 类型与路由检查均通过。

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-09-05T11:11:31.129Z |
| 2 | 1 | 1 | recovery | — | Native confirmed acceptance criteria changed | 2026-09-05T11:30:05.875Z |
| 3 | 1 | 1 | pass | — | H5 跨域登录修复已从合并提交 b5e3bd0224e15832615085080cf8d6471cebcdc6 构建并部署到国内和国际应用容器。两个应用均健康运行新镜像 20260905-27ab1a99a，双 origin 可信配置和真实 OPTIONS 路由生效；线上 curl 与浏览器无效登录验证通过。 | 2026-09-05T12:03:40.566Z |

## Conclusion

H5 跨域登录修复已从合并提交 b5e3bd0224e15832615085080cf8d6471cebcdc6 构建并部署到国内和国际应用容器。两个应用均健康运行新镜像 20260905-27ab1a99a，双 origin 可信配置和真实 OPTIONS 路由生效；线上 curl 与浏览器无效登录验证通过。
