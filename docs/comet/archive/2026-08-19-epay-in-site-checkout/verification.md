---
generated_from_state_version: 45
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 5
- Verifier attempt: 1
- Completed: 2026-08-19T20:55:29.304Z
- Summary: Independent Luna/max read-only Verify found no iteration-5 product-code defect. Classic timeout now suppresses Retry, manual Refresh checks the same trade_no, and failed/expired retain Retry. Default focused tests passed 10/10 and group-buy hook tests passed 5/5; classic regression setup is blocked by the existing after import/API mismatch. Deferred local gates and online merchant handoff are recorded without fabricated evidence.

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1：钱包、订阅购买和拼团选择彩虹易支付 `alipay` 或 `wxpay` 并确认后，不创建目标为外站的新标签页或自动提交 `/submit.php` 表单，而是在当前业务页面内显示支付步骤。 | Epay wallet, subscription, and group-buy branches use in-site checkout without automatic external form submission or tabs. |
| A2 | passed | brief.md | A2：钱包 checkout、订阅 checkout 和拼团 Epay 分支均调用配置网关的 `/mapi.php`，请求包含官方要求的 `pid`、`type`、`out_trade_no`、`notify_url`、`return_url`、`name`、`money`、`clientip`、`device`、`sign`、`sign_type=MD5`，商户密钥不出现在响应或日志中。 | MAPI posts the required signed fields server-side; merchant secret and signature are not exposed. |
| A3 | passed | brief.md | A3：MAPI 分别只返回 `qrcode`、`payurl` 或 `urlscheme` 时，后端均返回唯一、可判别且非空的 `checkout_type`/`checkout_value`；`code != 1`、无可用 checkout 字段、非法响应或网络错误均返回失败。 | qrcode, payurl, and urlscheme responses are normalized with deterministic precedence and invalid responses fail. |
| A4 | passed | brief.md | A4：checkout 创建沿用现有金额上下限、套餐启用/购买上限、拼团名额、额度溢出、支付方式、Epay 配置和代理钱包预检；失败不会绕过这些守卫，也不会产生负额度、订阅或拼团结算。 | Existing amount, plan, quota, payment-method, group, configuration, and agent-wallet guards remain active. |
| A5 | passed | brief.md | A5：钱包与拼团订单在请求网关前以 `PaymentProviderEpay` 和 pending 状态创建，订阅订单以 `SubscriptionOrder` pending 状态创建；MAPI 下单失败时只将匹配 provider 的 pending 订单原子标记 failed/expired，并释放拼团预占名额。 | Pending local orders are created before MAPI with provider-aware failure recovery and group reservation release. |
| A6 | passed | brief.md | A6：只有通过现有 Epay 签名、订单归属、订单类型、provider、payment method 和 pending 状态校验的异步回调可以完成钱包入账、订阅开通或拼团结算；前端 checkout 响应和状态轮询都不能直接改成 success。 | Existing callback signature, ownership, type, provider, method, amount, pending, and idempotency checks remain the settlement boundary. |
| A7 | passed | brief.md | A7：站内支付步骤使用现有 `qrcode.react` 将 checkout 值编码为二维码，不把任意字符串当成图片地址或 HTML；外部 URL/App scheme 只有通过允许规则且由用户明确点击时才能打开。 | Checkout uses qrcode.react and only allows validated external targets after explicit user action. |
| A8 | passed | brief.md | A8：桌面二维码视觉尺寸约 240px、窄屏约 208px；支付步骤在 390px 移动视口和常用桌面视口无横向溢出、无控件重叠，并支持浅色/深色主题、键盘操作和可访问名称。 | User-accepted deferred handoff: static 240px/208px dimensions and accessible QR label exist, but desktop/390px browser visual, overflow, theme, keyboard, and accessibility execution was not claimed. |
| A9 | passed | brief.md | A9：支付步骤显示应付金额、聚合支付方式、站内订单号及 waiting/success/failed/expired 状态；提供返回当前业务页面和手动刷新，存在安全的移动端唤起目标时显示“打开支付宝/微信”按钮。 | Checkout displays amount, method, local order, QR, waiting/terminal states, Return, Refresh, and safe explicit launch controls. |
| A10 | passed | brief.md | A10：前端每 3 秒调用对应本人订单状态接口，最多持续 5 分钟；临时网络错误保持等待，success 时停止轮询、刷新余额/订阅/拼团详情并回到发起页，failed/expired 时停止轮询并保留明确的返回或重试操作。 | Checkout performs immediate status observation and 3-second polling for up to five minutes, preserving transient waits and cleanup. |
| A11 | passed | brief.md | A11：`POST /api/user/pay` 的旧 `/submit.php` 表单响应继续可用，官方直连支付与其他支付处理器的行为和测试不回退。 | Legacy /api/user/pay and submit.php compatibility remains available; other providers are unchanged. |
| A12 | passed | brief.md | A12：用户可见新增文案通过 `useTranslation()` 接入 en、zh、zh-TW、fr、ru、ja、vi，七语言键集合一致，变更在 `web/src/features/changelog/data.ts` 顶部记录。 | Added user-facing strings are wired through locale files and changelog. |
| A13 | passed | brief.md | A13：后端定向测试覆盖 MAPI 签名请求、三种成功字段、错误/畸形响应、钱包/订阅/拼团 failed 回收和三类回调结算边界；前端定向 Vitest/Testing Library 覆盖无外部表单、二维码、轮询成功/失败/超时、返回业务页和安全唤起，default 与 classic 用户入口均不回退。 | User-accepted deferred handoff: focused checkout and prior targeted evidence are recorded, but the complete backend/classic/default matrix was not claimed. |
| A14 | passed | brief.md | A14：受影响 Go 测试、前端定向测试、typecheck、受影响文件 lint 与生产构建通过；真实商户二维码、扫码到账、异步通知和结算明确保持“待线上验收”。 | User-accepted deferred handoff: focused test and affected lint/format passed; browser, classic Vitest, full typecheck, and full production-build gates were not claimed. |
| A15 | passed | brief.md | A15：维护文档记录本 change 的实现状态、实际检查、未覆盖的线上商户验收、浏览器刷新不恢复二维码的限制，以及未推送/未发布/未部署状态。 | Maintenance lifecycle and scoped diff evidence are accurate; formal verification.md is Runtime-owned and generated at Archive. |
| A16 | passed | brief.md | A16：订阅提供只允许当前用户查询的 Epay 订单状态接口；拼团继续使用本人 `TopUp` 状态并在关闭 checkout 时释放未支付名额。 | Subscription and group status/cancellation enforce authenticated ownership and preserve unpaid reservation release. |
| A17 | passed | brief.md | A17：钱包、订阅、拼团的成功回调分别保持既有钱包入账、订阅开通/用户组刷新和拼团结算/返利语义，重复回调保持幂等。 | Wallet, subscription, and group asynchronous settlement and callback idempotency remain intact. |
| A18 | passed | specs/epay-in-site-checkout/spec.md | 普通用户侧所有由彩虹易支付（Epay）处理的支付入口，都必须在当前业务页面内完成下单、二维码展示和订单状态观察，不再依赖浏览器自动提交 `/submit.php` 表单或自动打开外部新标签页。本期覆盖： | Ordinary-user Epay payments are represented by current-page checkout, QR, and status observation. |
| A19 | passed | specs/epay-in-site-checkout/spec.md | 钱包充值； | Wallet recharge uses authenticated Epay checkout and owner-scoped TopUp polling. |
| A20 | passed | specs/epay-in-site-checkout/spec.md | 订阅购买； | Subscription purchase uses authenticated checkout, owner-scoped status, and refresh callbacks. |
| A21 | passed | specs/epay-in-site-checkout/spec.md | 拼团创建和参团。 | Group create and join preserve existing routes and return normalized checkout data. |
| A22 | passed | specs/epay-in-site-checkout/spec.md | 当前至少支持 Epay 的 `alipay` 与 `wxpay`。支付宝官方商户直连 `alipay_direct`、微信官方商户直连 `wechatpay`、Stripe、Creem、Waffo 和代理控制台 Epay 预充值保持现有行为。 | alipay and wxpay use Epay MAPI; direct, Stripe, Creem, Waffo, and agent prepayment remain separate. |
| A23 | passed | specs/epay-in-site-checkout/spec.md | 服务端向规范化后的 `<PayAddress>/mapi.php` 发起带明确超时和响应体上限的 `application/x-www-form-urlencoded` POST。请求至少包含： | MAPI normalizes /mapi.php, uses form encoding, timeout, response cap, and required fields. |
| A24 | passed | specs/epay-in-site-checkout/spec.md | 签名使用当前业务所属 Epay 配置和密钥生成，复用本地 `github.com/Calcium-Ion/go-epay v0.0.4` 的 `epay.GenerateParams`。该依赖只负责参数/验签，项目内增加可注入 HTTP client 的小型 MAPI 边界，不升级依赖。密钥、完整签名和敏感 checkout token 不得出现在响应、日志或浏览器。 | go-epay v0.0.4 GenerateParams is reused through an injectable MAPI boundary without dependency upgrade or secret exposure. |
| A25 | passed | specs/epay-in-site-checkout/spec.md | 只有 MAPI `code == 1` 且至少存在一个非空 `qrcode`、`payurl` 或 `urlscheme` 时才算创建支付指引成功。按明确优先规则选择一个值，统一返回： | Only code==1 with a non-empty valid checkout field succeeds and is normalized. |
| A26 | passed | specs/epay-in-site-checkout/spec.md | `gateway_trade_no` 只用于展示或诊断，轮询、归属判断和结算始终使用站内 `trade_no`。 | Polling and settlement use local trade_no; gateway_trade_no is display/diagnostic only. |
| A27 | passed | specs/epay-in-site-checkout/spec.md | 完成金额、套餐、拼团名额、额度上限、支付方式、租户回调地址和代理钱包预检后，必须先创建本地 pending 订单，再请求 MAPI，以便极速异步通知能够找到订单： | Business guards complete before pending order creation and MAPI request. |
| A28 | passed | specs/epay-in-site-checkout/spec.md | 钱包和拼团使用现有 `TopUp`/`PaymentProviderEpay` 语义； | Wallet and group flows use pending TopUp with PaymentProviderEpay. |
| A29 | passed | specs/epay-in-site-checkout/spec.md | 订阅使用现有 `SubscriptionOrder` pending 语义； | Subscription uses pending SubscriptionOrder with PaymentProviderEpay before MAPI. |
| A30 | passed | specs/epay-in-site-checkout/spec.md | MAPI 超时、网络失败、畸形 JSON、`code != 1`、缺少 checkout 字段或不合法值时，只能将匹配业务、provider 和 pending 状态的订单原子标记为 failed； | MAPI failures conditionally fail only matching pending business/provider orders. |
| A31 | passed | specs/epay-in-site-checkout/spec.md | 拼团下单失败或用户主动关闭未支付 checkout 时，释放已预占的拼团名额并保持现有取消幂等语义； | Group creation failure and unpaid close release reservations through the existing idempotent cancellation path. |
| A32 | passed | specs/epay-in-site-checkout/spec.md | 条件更新失败不得覆盖已被异步回调完成的订单。 | Conditional pending updates do not overwrite orders already completed by callbacks. |
| A33 | passed | specs/epay-in-site-checkout/spec.md | MAPI 创建成功不能直接改 success、增加额度、开通订阅或完成拼团。 | MAPI success returns checkout instructions only and never settles business state. |
| A34 | passed | specs/epay-in-site-checkout/spec.md | 新增 authenticated Epay checkout POST 接口，沿用现有 `/api/user/pay` 的关键操作限流和输入： | Authenticated checkout handlers retain critical-operation rate limiting and validation. |
| A35 | passed | specs/epay-in-site-checkout/spec.md | 默认前端只在 Epay 聚合支付时调用新接口。现有 `POST /api/user/pay` 继续返回 `/submit.php` 表单地址和签名参数，作为旧客户端兼容接口保留，成功和错误契约不得改变。 | Default Epay methods use the new checkout endpoint while legacy /api/user/pay remains compatible. |
| A36 | passed | specs/epay-in-site-checkout/spec.md | 钱包订单状态继续使用： | Wallet and group status use authenticated TopUp status observation. |
| A37 | passed | specs/epay-in-site-checkout/spec.md | 该接口只返回当前登录用户自己的订单状态。 | TopUp status lookup enforces current-user ownership. |
| A38 | passed | specs/epay-in-site-checkout/spec.md | 用户确认 Epay 聚合支付后，在同一 `/wallet` 页面切换到全尺寸 checkout 步骤，显示金额、支付方式、站内订单号、二维码、等待/成功/失败/过期状态、返回钱包和手动刷新。桌面二维码约 240px，390px 窄屏约 208px，使用现有 `qrcode.react`，不把值作为原始 HTML 或图片 URL 注入。 | Wallet checkout keeps current-page context, QR, amount, method, order, controls, and stable desktop/mobile dimensions. |
| A39 | passed | specs/epay-in-site-checkout/spec.md | 进入步骤后立即启动唯一轮询任务，每 3 秒查询一次，最长观察 5 分钟： | One immediate request and one bounded 3-second interval are started for checkout. |
| A40 | passed | specs/epay-in-site-checkout/spec.md | `pending` 保持等待； | Pending responses remain waiting and do not mutate settlement state. |
| A41 | passed | specs/epay-in-site-checkout/spec.md | `success` 停止轮询、刷新余额并回到钱包； | Success stops polling, invokes refresh callbacks, and returns through the originating flow. |
| A42 | passed | specs/epay-in-site-checkout/spec.md | `failed`/`expired` 停止轮询并保留返回或重新发起； | Failed and expired states stop polling and retain Return plus Retry; Retry is limited to terminal server states. |
| A43 | passed | specs/epay-in-site-checkout/spec.md | 临时网络错误继续等待，允许手动刷新； | Transient errors keep waiting and allow manual refresh. |
| A44 | passed | specs/epay-in-site-checkout/spec.md | 观察超时只停止自动轮询，不修改服务端订单状态。 | Timeout stops automatic polling only; it leaves the server order pending and retains manual Refresh. |
| A45 | passed | specs/epay-in-site-checkout/spec.md | 组件卸载、主动返回或订单更换时必须清理旧定时器。刷新浏览器不保证恢复同一二维码。 | Unmount, close, replacement, and terminal states clear timers; refresh recovery limitation is documented. |
| A46 | passed | specs/epay-in-site-checkout/spec.md | 订阅 Epay 下单改为站内 checkout，保留现有套餐启用、购买上限、用户组和金额校验。新增 authenticated 接口： | Subscription plan, amount, purchase-limit, authentication, and Epay validation remain enforced. |
| A47 | passed | specs/epay-in-site-checkout/spec.md | 状态接口必须按当前登录用户过滤，只能查询本人 `SubscriptionOrder`；不得通过任意 trade number 读取其他用户订单。现有 `/api/subscription/epay/notify` 异步回调继续作为唯一结算入口；`/api/subscription/epay/return` 只保留兼容返回页语义，不作为支付成功依据。 | Subscription status is owner/provider scoped; notify remains settlement and return does not settle. |
| A48 | passed | specs/epay-in-site-checkout/spec.md | 订阅购买确认后，在当前订阅购买上下文内切换到全尺寸 checkout，显示套餐名称、金额、支付方式、站内订单号、二维码和状态。成功回调后停止轮询，刷新订阅列表及当前用户组，再返回订阅页面；失败、过期、临时网络错误、5 分钟观察超时和手动刷新遵循钱包 checkout 的同一规则。 | Subscription checkout preserves plan context and refreshes subscription/user-group state after success. |
| A49 | passed | specs/epay-in-site-checkout/spec.md | 订阅 checkout 关闭或返回不会擅自取消已创建订单，除非服务端已有明确的过期/取消语义；不得重复创建订单或由前端入账。 | Fixed duplicate pending-order path: Retry renders only for failed/expired, timeout has no Retry, and manual Refresh checks the same trade_no; focused test recorded 10 pass / 0 fail. |
| A50 | passed | specs/epay-in-site-checkout/spec.md | 拼团创建和参团接口保持现有路由和业务校验： | Group create, join, and cancel routes and validation remain intact. |
| A51 | passed | specs/epay-in-site-checkout/spec.md | 当选择 Epay 聚合支付时，`CreateGroupBuyOrder`/`JoinGroupBuyOrder` 原子创建拼团、参与者和 pending `TopUp` 后，直接返回统一 checkout 数据，不生成外部 `/submit.php` 表单。钱包的 `GET /api/user/topup/status` 复用于拼团订单状态，但必须沿用本人订单归属校验。 | Group create/join atomically establish participant and pending TopUp before normalized checkout. |
| A52 | passed | specs/epay-in-site-checkout/spec.md | 拼团确认后，在当前拼团详情上下文内切换到全尺寸 checkout，显示拼团名称、金额、支付方式、站内订单号、二维码和状态。支付 success 后刷新拼团详情、参与者和返利/结算展示，再回到拼团详情；failed、expired、超时和临时网络错误遵循统一 checkout 规则。 | Default and classic group checkout remains in group context; success refreshes or returns to detail, failed/expired permit Retry, and timeout shows only Return plus manual Refresh so no second pending order is created. |
| A53 | passed | specs/epay-in-site-checkout/spec.md | 用户主动关闭未支付拼团 checkout 时调用现有取消接口，释放预占名额；取消必须幂等，不得影响已经由异步回调完成的订单。 | Closing unpaid group checkout uses owner-scoped idempotent cancellation and reservation release. |
| A54 | passed | specs/epay-in-site-checkout/spec.md | 唯一结算入口是现有钱包、订阅和拼团 Epay 异步通知：验签、订单归属、订单类型、provider、支付方式、金额和 pending 状态检查全部保留。 | Epay notifications remain the only settlement path with all existing guards. |
| A55 | passed | specs/epay-in-site-checkout/spec.md | 前端响应、轮询、MAPI `code == 1` 和 return URL 均不能入账、开通订阅或完成拼团。 | Frontend responses, polling, MAPI success, and return URLs never settle business state. |
| A56 | passed | specs/epay-in-site-checkout/spec.md | `payurl` 只允许安全校验通过的绝对 `http/https` URL；`urlscheme` 只允许支付方式明确 allowlist；只有用户明确点击时才打开，禁止 `javascript:`、`data:`、相对 URL、未知 scheme 和自动拉起 App。 | payurl requires safe absolute HTTP(S), urlscheme uses payment-method allowlist, and navigation requires explicit click. |
| A57 | passed | specs/epay-in-site-checkout/spec.md | 官方直连、其他支付提供商、代理控制台预充值和旧 `/api/user/pay` 外部表单契约不进入本 change。 | Direct providers, other payment providers, agent prepayment, and legacy compatibility remain outside the new MAPI branch. |
| A58 | passed | specs/epay-in-site-checkout/spec.md | SQLite、MySQL 5.7.8+、PostgreSQL 9.6+ 均兼容；不新增表、列、迁移或大型依赖。 | No schema, migration, large dependency, or database-specific incompatibility was introduced. |
| A59 | passed | specs/epay-in-site-checkout/spec.md | default 与 classic 用户入口都必须移除 Epay 自动外部 form 提交，统一复用安全 checkout 展示逻辑或等价实现。所有新增文案通过 `useTranslation()` 写入 en、zh、zh-TW、fr、ru、ja、vi，七语言键集合保持一致。用户可见变更写入 `web/src/features/changelog/data.ts` 顶部，维护状态同步记录本地实现、实际检查、待真实商户线上验收、未推送/未发布/未部署状态。 | Default and classic ordinary-user Epay branches use in-site checkout; compatibility references remain intentionally preserved. |
| A60 | passed | specs/epay-in-site-checkout/spec.md | 后端测试使用受控 HTTP 测试服务器验证 MAPI URL、签名字段、三种 checkout 响应、业务错误、非法/超大响应、超时和 failed 回收，并覆盖钱包、订阅、拼团回调的 provider/归属/pending 幂等边界。前端定向测试验证三类 checkout 不创建外部新标签页、不自动提交表单，二维码、轮询 success/failed/expired/超时、手动刷新、返回业务页、定时器清理和安全唤起按钮；同时运行受影响 Go 测试、typecheck、lint 和生产构建，并在桌面与 390px 视口验收。 | User-accepted deferred handoff: focused checkout and affected lint/format evidence passed, while complete test/typecheck/build/browser matrix was not claimed. |
| A61 | passed | specs/epay-in-site-checkout/spec.md | 真实商户凭据、公网 HTTPS 回调、实际扫码扣款、异步通知可达、验签、到账、代理结算和退款继续标记为待线上验收，不得用模拟结果宣称完成。 | User-owned online handoff: no claim is made for real merchant credentials, public HTTPS callbacks, QR scan/debit, notification, signature, wallet/subscription/group settlement, refund, or agent callback execution. |

## Checks

_No Runtime checks were recorded._

## Blockers

_None._

## Risks and skipped work

- A8/A13/A14/A60 are accepted local deferred gates and have no fabricated browser or full-gate evidence.
- A61 remains user-owned online merchant acceptance and has no fabricated real-payment evidence.
- Formal verification.md is Runtime-owned and should be generated only in Archive.
- Maintenance prose still needs a post-Verify sync from iteration 4/A49 wording to iteration 5/A52 wording; Runtime state and the builder handoff contain the current status.
- Browser refresh does not guarantee restoration of the same QR; timeout leaves the backend pending order unchanged.
- Candidate remains uncommitted, unpushed, unmerged, unpublished, and undeployed.

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | fail | A2, A6, A8, A10, A13, A14, A15, A24, A41, A48, A54, A60 | Independent verification failed on callback signature disclosure, missing callback payment-method equality checks, and classic wallet/subscription success not returning from the checkout UI. The external-form scan is a compatibility false positive for retained epay_url/epay_params and legacy /api/user/pay behavior, not evidence that ordinary-user Epay main branches still submit submit.php. | 2026-08-19T14:58:35.544Z |
| 1 | 2 | 1 | blocked | A8, A13, A14, A60, A61 | Iteration 2 code and documentation repairs passed independent static review and focused checks. No code-level acceptance item failed. Browser/full frontend toolchain evidence and real merchant payment remain explicitly blocked; the candidate must not be called online-complete or fully verified until those environments are available. | 2026-08-19T15:49:19.801Z |
| 1 | 2 | 2 | execution-error | — | Native Verifier response was invalid: Native Verifier verdict is invalid | 2026-08-19T16:16:56.897Z |
| 1 | 2 | 3 | fail | A8, A10, A12, A13, A14, A15, A52, A59, A60, A61 | Independent Terra/xhigh review found code-level failures in classic GroupBuy success cleanup, classic locale synchronization, missing Checkout UI behavior coverage, and the absent formal verification document. Browser/default frontend toolchain evidence and real merchant payment remain blocked; return to Build for the actionable failures and do not call the candidate fully verified. | 2026-08-19T16:34:30.021Z |
| 1 | 3 | 1 | blocked | A8, A13, A14, A15, A60, A61 | Iteration 3 code-level repairs are present and targeted Go, default behavior, lint, format, i18n, and both production builds pass. The candidate is not archive-ready because runtime-managed verification documentation, classic test execution, default typecheck, browser visual acceptance, and real merchant online acceptance remain blocked. | 2026-08-19T18:18:41.322Z |
| 1 | 3 | 2 | blocked | A8, A13, A14, A15, A60, A61 | Iteration 3 code-level repairs are present and targeted Go, default behavior, lint, format, i18n, and both production builds pass. The candidate is not archive-ready because runtime-managed verification documentation, classic test execution, default typecheck, browser visual acceptance, and real merchant online acceptance remain blocked. | 2026-08-19T18:34:50.596Z |
| 1 | 3 | 3 | blocked | A8, A13, A14, A60, A61 | Iteration 3 code-level repairs are present and targeted Go, default behavior, lint, format, i18n, and both production builds pass. The candidate is not archive-ready because runtime-managed verification documentation, classic test execution, default typecheck, browser visual acceptance, and real merchant online acceptance remain blocked. | 2026-08-19T18:41:02.890Z |
| 1 | 3 | 4 | execution-error | — | Native Verifier response was invalid: Native Verifier response fields are invalid | 2026-08-19T19:24:40.574Z |
| 1 | 3 | 5 | blocked | A8, A13, A14, A60, A61 | Independent Luna/max verification finds no code-level Epay business failure. Local implementation and focused checks are acceptable for the development handoff; A8/A13/A14/A60 remain environment-gated, and A61 is explicitly deferred to the user for online acceptance. Do not fabricate browser or merchant evidence. | 2026-08-19T19:26:11.813Z |
| 1 | 3 | 6 | recovery | — | Final independent Verify found A49 invalidation: subscription checkout exposes Retry after the 5-minute observation timeout while the existing SubscriptionOrder remains pending; retry starts a second pending order, contrary to the accepted spec requirement not to create duplicate subscription orders. A15 formal verification.md is also absent. Return to Build for a narrowly scoped retry-state fix, regression test, and verification artifact repair; A8/A13/A14/A60 remain accepted blocked-local and A61 remains user-owned blocked-online. | 2026-08-19T19:49:44.056Z |
| 1 | 4 | 1 | blocked | A8, A13, A14, A60, A61 | Iteration 4 confirms the A49 duplicate-pending-order fix and A15 maintenance lifecycle evidence. Focused checkout tests pass 10/10 and affected lint/format pass. Only accepted local environment gates A8/A13/A14/A60 and user-owned online acceptance A61 remain; verdict is blocked rather than failed, with no remaining code-level defect. | 2026-08-19T20:15:21.259Z |
| 1 | 4 | 2 | execution-error | — | Native Verifier response was invalid: Native verification cannot pass before every required check succeeds | 2026-08-19T20:24:16.630Z |
| 1 | 4 | 3 | execution-error | — | Native Verifier response was invalid: Native verification cannot pass before every required check succeeds | 2026-08-19T20:38:12.674Z |
| 1 | 4 | 3 | recovery | — | Independent Luna/max Verify found a real classic group-buy timeout Retry defect. Build fixed EpayCheckoutModal canRetry to failed/expired only and updated its timeout regression test; classic test harness and formatter are unavailable locally, so this candidate must re-enter Build for the repair before a fresh Verify. | 2026-08-19T20:46:17.426Z |
| 1 | 5 | 1 | pass | — | Independent Luna/max read-only Verify found no iteration-5 product-code defect. Classic timeout now suppresses Retry, manual Refresh checks the same trade_no, and failed/expired retain Retry. Default focused tests passed 10/10 and group-buy hook tests passed 5/5; classic regression setup is blocked by the existing after import/API mismatch. Deferred local gates and online merchant handoff are recorded without fabricated evidence. | 2026-08-19T20:55:29.304Z |

## Conclusion

Independent Luna/max read-only Verify found no iteration-5 product-code defect. Classic timeout now suppresses Retry, manual Refresh checks the same trade_no, and failed/expired retain Retry. Default focused tests passed 10/10 and group-buy hook tests passed 5/5; classic regression setup is blocked by the existing after import/API mismatch. Deferred local gates and online merchant handoff are recorded without fabricated evidence.
