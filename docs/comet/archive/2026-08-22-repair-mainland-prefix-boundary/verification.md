---
generated_from_state_version: 8
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 1
- Verifier attempt: 1
- Completed: 2026-08-22T04:40:51.206Z
- Summary: 独立核对正式规格、当前实现和 Runtime 检查，并完成 Go 与本地 Edge 浏览器矩阵；A1-A21 全部通过。

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A11/A21：当前候选在真实 reduced-motion 渲染时，认证叙事区保持静态连接且信息与操作完整。 | 本机 Edge 强制 reduced-motion 验证登录与忘记密码页连接静止且内容操作完整。 |
| A2 | passed | brief.md | A12/A22：可信 CN 对所有官网 HTML 路由均直接收到主题化 HTTP 451；前缀碰撞与 `FRONTEND_BASE_URL` NoRoute 不能绕过。 | 可信 CN 的官网 HTML、前缀碰撞和 FRONTEND_BASE_URL NoRoute 均返回 451。 |
| A3 | passed | brief.md | A17：当前登录和忘记密码页面的桌面/320px、中文/英文、reduced-motion 浏览器验收，以及 CN、非 CN、未知与伪造头 HTTP 验收均有可复现证据。 | 完成中英文、1440px/320px、reduced-motion 八组本地浏览器证据及 HTTP 信任边界验证。 |
| A4 | passed | brief.md | A25：区域访问回归测试断言精确豁免分段、前缀碰撞 HTML 路由与保留的 API/静态/健康边界。 | 回归测试覆盖精确豁免分段、前缀碰撞和健康路径。 |
| A5 | passed | specs/mainland-web-access/spec.md | The embedded website server can enforce a mainland-China website access policy without changing API relay behavior. The policy is disabled unless `MAINLAND_WEB_ACCESS_COUNTRY_HEADER` is set to the name of the reverse proxy header that carries the country code. | 国家头变量为空时策略禁用并保持原 SPA 路径。 |
| A6 | passed | specs/mainland-web-access/spec.md | When enabled, the server reads that header only if all of the following are true: | 配置头、可信代理、直接对端和 CN 值四项条件串联判定。 |
| A7 | passed | specs/mainland-web-access/spec.md | `TRUSTED_PROXIES` is an explicit, non-empty comma-separated list of concrete IP addresses or CIDRs. | 仅接受非空显式 IP 或 CIDR 可信代理列表。 |
| A8 | passed | specs/mainland-web-access/spec.md | The list is not `none`, does not contain `*`, and every entry is a valid IP address or CIDR. | 空值、none、通配和非法代理配置均 fail-open。 |
| A9 | passed | specs/mainland-web-access/spec.md | The direct TCP peer parsed from `Request.RemoteAddr` belongs to one of those entries. | 只使用 Request.RemoteAddr 并校验直接 TCP 对端。 |
| A10 | passed | specs/mainland-web-access/spec.md | The configured header value trims and case-insensitively equals `CN`. | 国家值 TrimSpace 后以 EqualFold 匹配 CN。 |
| A11 | passed | specs/mainland-web-access/spec.md | The policy does not use `ClientIP()`, `X-Forwarded-For`, another forwarded address, a GeoIP lookup, or a default/private trusted-proxy range to decide whether a country header is authoritative. If any input cannot establish trust, the request follows its existing path. | 未使用转发地址或 GeoIP，不可信直接对端不能触发策略。 |
| A12 | passed | specs/mainland-web-access/spec.md | The policy is evaluated before static serving for root and direct HTML document requests, including `/index.html`. It is also evaluated immediately before the main SPA fallback, the canvas SPA fallback, and the fallback used when `FRONTEND_BASE_URL` redirects website routes. Therefore trusted `CN` requests cannot obtain website HTML or bypass the policy through login, registration, documentation, canvas, or another SPA deep link. | 静态服务、主 SPA、canvas SPA 和重定向 fallback 前均执行策略。 |
| A13 | passed | specs/mainland-web-access/spec.md | When the policy applies, the response is HTTP 451 with `text/html; charset=utf-8`, `Cache-Control: no-store`, and a restrictive inline-document security policy. The page uses the active `classic` or default theme via `common.GetTheme()`, contains no pink palette, and localizes its status, title, and explanation from backend i18n. | 451 响应头、CSP、主题和本地化内容符合规格且无粉色。 |
| A14 | passed | specs/mainland-web-access/spec.md | The policy never blocks the exact paths `/api`, `/v1`, or `/assets`, their slash-delimited descendants, conventional health and metrics paths (`/health`, `/healthz`, `/ready`, `/readyz`, `/live`, `/livez`, and `/metrics`), or static non-document resources served by existing static middleware. Lookalike website paths that merely share those byte prefixes, including `/api-login`, `/v1-docs`, and `/assets-page`, are not exempt and remain subject to the website document policy. | API、relay、静态和健康路径按分段豁免，前缀碰撞不豁免。 |
| A15 | passed | specs/mainland-web-access/spec.md | Operators enable the policy by configuring both variables with a proxy they control. For example, a proxy at `192.0.2.10` that supplies `CF-IPCountry` uses: | 运行配置与正式 Spec 的受控代理示例一致。 |
| A16 | passed | specs/mainland-web-access/spec.md | Leaving the country-header variable empty disables the policy. `TRUSTED_PROXIES` compatibility defaults, `none`, wildcard entries, malformed lists, or a direct peer outside the list leave the policy fail-open even if a request presents `CN`. | 禁用、无效代理和不可信来源全部 fail-open。 |
| A17 | passed | specs/mainland-web-access/spec.md | Focused tests prove trusted CN requests receive HTTP 451 on direct document and SPA fallback paths, including prefix-collision routes and the `FRONTEND_BASE_URL` NoRoute redirect path. | 聚焦 HTTP 测试覆盖文档、SPA fallback、前缀碰撞和重定向边界。 |
| A18 | passed | specs/mainland-web-access/spec.md | Tests prove trusted non-CN, missing values, disabled configuration, untrusted direct clients, and malformed/implicit trusted-proxy configuration do not trigger HTTP 451. | 非 CN、缺失信号、不可信来源和无效配置均有放行测试。 |
| A19 | passed | specs/mainland-web-access/spec.md | Tests prove exact API/relay/static paths and slash-delimited descendants, plus health/metrics paths, remain outside the policy boundary. | 精确 API、relay、静态及健康路径放行测试通过。 |
| A20 | passed | specs/mainland-web-access/spec.md | Locale tests or static assertions confirm the English, Simplified Chinese, and Traditional Chinese backend message keys resolve. | 英文、简体中文和繁体中文后端文案键均解析正确。 |
| A21 | passed | specs/mainland-web-access/spec.md | Current-candidate browser evidence uses installed Chrome/Edge with `--force-prefers-reduced-motion=reduce` or equivalent CDP to verify existing login and forgot-password behavior at desktop and 320px, Chinese and English, and reduced motion without adding a browser dependency. | 系统 Edge 对登录和忘记密码完成中英文、桌面/320px、reduced-motion 八组真实渲染，无横向溢出。 |

## Checks

| Check | Command | Working directory | Status | Exit | Duration |
| --- | --- | --- | --- | ---: | ---: |
| Mainland access middleware regressions | test ./middleware -count=1 | . | passed | 0 | 28787 ms |
| Common and middleware integration tests | test ./common ./middleware -count=1 | . | passed | 0 | 3594 ms |
| Mainland middleware vet | vet ./middleware | . | passed | 0 | 1815 ms |
| Mainland access whitespace check | diff --check HEAD^ -- middleware/mainland_web_access.go middleware/mainland_web_access_test.go docs/comet/changes/repair-mainland-prefix-boundary | . | passed | 0 | 77 ms |

## Blockers

_None._

## Risks and skipped work

- 浏览器验证使用本地开发服务和确定性 API 响应替身，不包含真实认证提交。
- 截图中的 TanStack Router 调试入口仅出现在开发模式。

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | 独立核对正式规格、当前实现和 Runtime 检查，并完成 Go 与本地 Edge 浏览器矩阵；A1-A21 全部通过。 | 2026-08-22T04:40:51.206Z |

## Conclusion

独立核对正式规格、当前实现和 Runtime 检查，并完成 Go 与本地 Edge 浏览器矩阵；A1-A21 全部通过。
