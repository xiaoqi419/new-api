---
generated_from_state_version: 25
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 5
- Iteration: 1
- Verifier attempt: 2
- Completed: 2026-08-29T17:52:33.219Z
- Summary: Independent verification passes all acceptance items using source, CI, immutable image, backup, two-site deployment, live configuration and unpaid checkout evidence.

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1: 当 MAPI 返回成功响应时，仍按现有优先级解析 `qrcode`、`payurl` 或受允许的 `urlscheme`，不进入兼容回退。 | MAPI success checkout precedence is preserved and tested. |
| A2 | passed | brief.md | A2: 当 MAPI 返回 HTTP 404 时，返回绝对 HTTP/HTTPS `payurl`，路径为规范化支付基址下的 `/submit.php`，并包含由已有库生成的有效 MD5 签名字段。 | Only HTTP 404 invokes the signed absolute submit.php fallback. |
| A3 | passed | brief.md | A3: 回退请求完整保留 `type=usdt.tron`、`out_trade_no`、金额、逐单 `notify_url`、`return_url`、商品名和设备类型；商户密钥本身不进入浏览器响应或日志。 | Fallback fields and per-order callback are preserved; merchant key is not exposed. |
| A4 | passed | brief.md | A4: MAPI 的非 404 非 2xx、网络错误、超时、取消和无效响应仍失败，不静默降级到 `/submit.php`。 | Non-404, transport, timeout, cancellation and invalid responses remain errors without fallback. |
| A5 | passed | brief.md | A5: 配置支付基址已有 query 或 fragment 时，生成的 MAPI 和 `/submit.php` 地址不携带这些未签名输入，只包含本单已签名的 EPay 参数。 | MAPI and legacy URLs remove configured query and fragment input. |
| A6 | passed | brief.md | A6: `service` 和 `controller` 的相关 Go 测试通过，新增回归测试明确覆盖 `usdt.tron`、query/fragment 清理、404 回退和非 404 不回退。 | Service/controller regression suites passed with compatibility coverage. |
| A7 | passed | brief.md | A7: 维护文档记录国际/国内站边界、EPUSDT 路由和逐单回调语义；changelog 使用实际发布镜像标签对应的版本标识。 | Maintenance boundary documentation and changelog release tag are present. |
| A8 | passed | brief.md | A8: 候选通过精确提交的 Docker 构建与 CI 后才允许发布；部署前分别备份国内站和国际站 Compose、数据库及支付 Options，并为两站保留旧镜像回滚路径。 | Exact-merge Docker image, successful CI, separate backups and rollback images are evidenced. |
| A9 | passed | brief.md | A9: 国际站最终暴露名为 `GMPay`、类型为 `usdt.tron`、图标为 `SiTether`、最小充值额为字符串 `"10"` 的支付方式。 | International runtime exposes GMPay, usdt.tron, SiTether and min_topup string 10. |
| A10 | passed | brief.md | A10: 发布后只创建不付款的测试订单，验证 `/submit.php`、收银台跳转和逐单 `https://codezip.io/api/user/epay/notify`；若缺少真实 TRON 收款地址，则在下单前或明确失败处停止并报告，不伪造地址。 | Unpaid checkout reached submit.php and the EPUSDT cashier returned HTTP 200 without settlement. |
| A11 | passed | brief.md | A11: 发布前后分别记录国内站和国际站应用容器 ID、启动时间、镜像、健康状态和关键 Options；两站都只更新应用服务且保持数据、Redis 与站点配置隔离。 | Pre/post app and dependency records show only app services changed and remain healthy. |
| A12 | passed | brief.md | A12: 站内支付弹窗的返回按钮通过 `t('Return')` 渲染；简体中文界面显示 `返回`，英文界面保持 `Return`，其它支持的语言包均提供对应翻译且不回退为英文。 | Return uses independent i18n and Simplified Chinese displays 返回. |
| A13 | passed | specs/epusdt-international-compat/spec.md | New API 的通用 EPay 钱包 checkout 优先调用配置支付基址对应的 `mapi.php`。当且仅当网关明确返回 HTTP 404，服务端必须兼容 EPUSDT v2.0.0 的 EPay `/submit.php` 路由，并将安全的绝对支付页 URL 返回给既有站内 checkout。 | Generic checkout uses MAPI first and submit.php only on explicit 404. |
| A14 | passed | specs/epusdt-international-compat/spec.md | 该代码能力保持通用。本次用户确认将同一合并提交构建的应用镜像分别热更新到国际站 `codezip.io` 和国内站 `aierxin.cc`；两站仍使用各自的数据库、Redis、站点配置、支付配置和用户数据，不跨站复制或改配。EPUSDT 支付兼容配置仍只属于国际站。 | Same image is deployed to both sites while database, Redis, config and users remain isolated. |
| A15 | passed | specs/epusdt-international-compat/spec.md | MAPI 请求、签名、超时、响应体限制和成功响应解析保持现有行为。 | MAPI signing, timeout, response limit and parsing behavior remain intact. |
| A16 | passed | specs/epusdt-international-compat/spec.md | MAPI HTTP 404 进入 `/submit.php` 兼容路径。 | HTTP 404 explicitly enters the legacy checkout path and live request resolved there. |
| A17 | passed | specs/epusdt-international-compat/spec.md | 任何其他非 2xx 状态、网络错误、上下文取消、超时、无效 JSON、业务拒绝或无 checkout 目标都继续按现有错误路径返回，不进入兼容回退。 | All other failures remain failures without silent fallback. |
| A18 | passed | specs/epusdt-international-compat/spec.md | MAPI 成功响应仍按现有顺序选择 `qrcode`、`payurl` 或支付方式允许的 `urlscheme`。 | Checkout target precedence and URL allowlists remain intact. |
| A19 | passed | specs/epusdt-international-compat/spec.md | 兼容路径复用 `github.com/Calcium-Ion/go-epay v0.0.4`。生成的 checkout 至少包含： | go-epay v0.0.4 is reused for required EPay fields and MD5 signing. |
| A20 | passed | specs/epusdt-international-compat/spec.md | `type`、订单号、金额、逐单回调、浏览器返回地址、商品名和设备类型必须从当前 `EpayMAPIRequest` 原样传递。国际站使用的选择器为 `usdt.tron`。 | Current request fields and usdt.tron selector are preserved and observed live. |
| A21 | passed | specs/epusdt-international-compat/spec.md | 支付基址在生成 MAPI 或兼容 URL 前必须移除 `RawQuery`、`ForceQuery`、`Fragment` 和 `RawFragment`。兼容 URL 最终只能包含本单参与签名的 EPay 参数，不能混入配置基址原有但未参与签名的 query。 | Endpoint normalization removes query and fragment before generating signed parameters. |
| A22 | passed | specs/epusdt-international-compat/spec.md | 返回值使用： | Existing EpayCheckout JSON contract is returned. |
| A23 | passed | specs/epusdt-international-compat/spec.md | `checkout_value` 必须是带主机名的绝对 HTTP 或 HTTPS URL。商户密钥不得出现在响应或日志。EPay 兼容协议要求的单笔订单 `sign` 可以出现在支付 URL 中；它必须由现有库基于当前订单参数生成。 | Checkout URLs require absolute HTTP(S) hosts and merchant secrets stay private. |
| A24 | passed | specs/epusdt-international-compat/spec.md | 国际站每笔钱包充值订单使用： | Live international order contains https://codezip.io/api/user/epay/notify. |
| A25 | passed | specs/epusdt-international-compat/spec.md | 作为订单级 `notify_url`。EPUSDT API Key 页面中的 key 级 `notify_url` 不作为默认值，也不替代逐单回调。 | Per-order notify_url is used instead of the API-key-level default. |
| A26 | passed | specs/epusdt-international-compat/spec.md | MAPI 成功、`/submit.php` URL 生成成功、收银台打开、return URL 返回和状态轮询都不能直接结算。只有现有 EPay 异步通知通过 MD5 验签、订单归属、provider、支付方式、金额和 pending 状态检查后才能入账。 | Checkout, return and polling do not settle; existing signed callback guards remain required. |
| A27 | passed | specs/epusdt-international-compat/spec.md | 国际站支付基址保持： | International PayAddress remains the configured EPUSDT create-transaction base. |
| A28 | passed | specs/epusdt-international-compat/spec.md | 配置值不追加 `/submit.php`；客户端库负责拼接该路由。 | PayAddress omits submit.php and the client normalization adds it. |
| A29 | passed | specs/epusdt-international-compat/spec.md | 国际站支付方式包含一个展示名为 `GMPay` 的条目： | International payment method is exposed as GMPay. |
| A30 | passed | specs/epusdt-international-compat/spec.md | `name` 只用于展示，`type` 是发给 EPUSDT 并在回调中核对的协议标识。`min_topup` 按现有 `PayMethods` 契约保存为字符串。 | Runtime distinguishes GMPay display name from usdt.tron protocol type and string minimum. |
| A31 | passed | specs/epusdt-international-compat/spec.md | 站内 `EpayCheckoutDialog` 的返回按钮必须使用独立的 `Return` 翻译键。所有支持的前端语言包都必须包含该键：简体中文值为 `返回`，英文值为 `Return`，繁体中文、法语、日语、俄语和越南语使用自然的对应译文。该修正只改变按钮显示文本，不改变支付跳转、状态轮询、回调或结算语义。 | All seven locales define the independent Return translation, with zh=返回. |
| A32 | passed | specs/epusdt-international-compat/spec.md | 代码通过 Pull Request 合入 `main`，并等待所需 CI 成功。 | PR #13 is merged into main at 342afa485 and required CI succeeded. |
| A33 | passed | specs/epusdt-international-compat/spec.md | 镜像从最终合并提交构建并使用可追溯、不可变标签；changelog 版本与发布标签一致。 | Immutable image tag is labeled with the exact merge revision and matches changelog. |
| A34 | passed | specs/epusdt-international-compat/spec.md | 发布前分别备份国内站和 `/opt/new-api-international` 的 Compose、数据库及支付 Options。 | Both site Compose, runtime/database and payment Options backups are recorded on the server. |
| A35 | passed | specs/epusdt-international-compat/spec.md | 分别热更新两站应用服务，保留两站旧镜像作为各自回滚目标；不得重建或修改对方的数据库、Redis 或站点配置。 | Only domestic and international app services were hot-updated; old images remain for rollback. |
| A36 | passed | specs/epusdt-international-compat/spec.md | 发布前后分别记录两站应用容器 ID、启动时间、镜像、健康状态和关键 Options，证明两站使用相同代码镜像但数据与配置边界未串用。 | Pre/post IDs, start times, images, health and options hashes prove isolation. |
| A37 | passed | specs/epusdt-international-compat/spec.md | 线上验收只允许创建不付款的测试订单，确认请求落到 `/submit.php`、能够进入 EPUSDT 收银台，并且订单级回调地址为 `https://codezip.io/api/user/epay/notify`。 | Unpaid international order used submit.php, cashier HTTP 200 and the required callback URL. |
| A38 | passed | specs/epusdt-international-compat/spec.md | EPUSDT 必须存在用户提供的真实 TRON USDT 收款地址才能完成正常收款订单创建。地址缺失时应停止并报告，不生成地址、不代填地址，也不伪造支付成功、异步通知或到账证据。 | EPUSDT has one enabled TRON wallet row; test order remains pending and unpaid. |
| A39 | passed | specs/epusdt-international-compat/spec.md | Go 回归测试覆盖 MAPI 成功、MAPI 404 回退、`usdt.tron` 参数、有效签名、query/fragment 清理、非 404 不回退、非法 URL 和上下文取消。 | Regression coverage includes success, 404, signing, usdt.tron, normalization and failure paths. |
| A40 | passed | specs/epusdt-international-compat/spec.md | `service` 与 `controller` 测试、差异检查和正式 Docker 镜像构建必须通过。 | Go tests, frontend checks, diff check, Docker build and CI all passed. |
| A41 | passed | specs/epusdt-international-compat/spec.md | 独立只读 Verifier 逐项核对正式验收清单。 | This is an independent read-only verification of every acceptance item. |
| A42 | passed | specs/epusdt-international-compat/spec.md | 服务器验收记录国内站和国际站发布前后状态，确认两站应用均更新成功且数据库、Redis、支付配置与用户数据仍各自独立。 | Both public status endpoints return HTTP 200 and server evidence confirms isolation. |
| A43 | passed | specs/epusdt-international-compat/spec.md | 前端聚焦测试必须验证中文 `EpayCheckoutDialog` 的返回按钮显示 `返回`，且英文键值和其它语言包存在；i18n 同步与可用的前端类型/构建检查必须通过。 | Focused Return regression, locale validation, i18n sync, TypeScript and frontend CI passed. |

## Checks

| Check | Command | Working directory | Status | Exit | Duration |
| --- | --- | --- | --- | ---: | ---: |
| Go service and controller regression tests | test ./service ./controller -count=1 | . | passed | 0 | 5094 ms |
| EpayCheckoutDialog focused frontend test | node_modules/vitest/vitest.mjs run src/features/wallet/components/dialogs/epay-checkout-dialog.test.tsx --config vitest.config.ts | web | passed | 0 | 4447 ms |
| Frontend TypeScript check | node_modules/@typescript/native-preview/bin/tsgo -b | web | passed | 0 | 2807 ms |
| Frontend i18n synchronization | scripts/sync-i18n.mjs | web | passed | 0 | 164 ms |
| Git diff whitespace check | diff --check | . | passed | 0 | 93 ms |

## Blockers

_None._

## Risks and skipped work

- One unpaid pending test order remains intentionally and must not be manually settled.
- No real funds or callback settlement were exercised; provider post-payment delivery remains outside this verification.

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-08-28T08:53:07.300Z |
| 2 | 1 | 1 | blocked | A35 | Independent verification passes the implementation, configuration, deployment, security, callback, and domestic-isolation criteria. The only blocked acceptance is A35 because EPUSDT has zero TRON receiving addresses and returns status_code 10003 no available wallet addresses when the unpaid checkout URL is opened. The requested ZIP API site name remains unchanged by explicit confirmation. | 2026-08-29T03:34:42.128Z |
| 2 | 1 | 1 | recovery | — | The user clarified this is our New API payment modal and requires the Chinese Return action to display 返回. This changes the user-visible acceptance scope. | 2026-08-29T15:57:54.470Z |
| 3 | 1 | 1 | blocked | A7, A10, A37, A38 | The New API payment modal now translates its independent Return key correctly in all supported locales; 简体中文 displays 返回 and the focused regression test passes. The candidate is blocked only by the existing online wallet-address acceptance prerequisite and the lack of a new immutable release image for this untranslated-only changelog entry. | 2026-08-29T16:19:20.231Z |
| 3 | 1 | 1 | recovery | — | 用户明确授权：提交当前 Return 中文国际化修复，合并到 main，并在完成两站备份、构建、回滚准备和验收后热更新国内站与国际站。最新范围要求覆盖国内站和国际站，取代原仅国际站发布边界；保留站点数据与配置隔离，不做真实支付或伪造回调。 | 2026-08-29T16:46:36.264Z |
| 4 | 1 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-08-29T16:50:08.299Z |
| 5 | 1 | 1 | blocked | A7, A8, A9, A10, A11, A14, A24, A27, A29, A30, A32, A33, A34, A35, A36, A37, A38, A40, A42, A43 | Return i18n and EPay compatibility code pass local verification. The candidate remains blocked only by release, live configuration and two-site deployment evidence that the user has now authorized us to perform. | 2026-08-29T16:58:14.951Z |
| 5 | 1 | 2 | pass | — | Independent verification passes all acceptance items using source, CI, immutable image, backup, two-site deployment, live configuration and unpaid checkout evidence. | 2026-08-29T17:52:33.219Z |

## Conclusion

Independent verification passes all acceptance items using source, CI, immutable image, backup, two-site deployment, live configuration and unpaid checkout evidence.
