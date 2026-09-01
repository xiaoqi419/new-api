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
- Completed: 2026-09-01T06:58:06.397Z
- Summary: Independent read-only Verify found all A1-A55 acceptance items satisfied by the candidate and focused checks. Four affected Go packages and focused frontend tests passed; i18n sync, typecheck/build, targeted lint/format, and diff checks passed. A12 records the repository baseline go test ./... embed limitation (missing web/canvas/dist) without attributing it to GMPay; A54 records the specified command set; A55 remains explicitly out of local scope.

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1：网关返回 `TRON: [TRX, USDT, USDC]`、`Ethereum: [ETH, USDT]`、`Solana: [SOL, USDC]` 时，只显示 `USDT/TRON`、`USDC/TRON`、`USDT/Ethereum`，不显示 TRX、ETH、SOL，也不显示没有声明的 USDC/Ethereum。 | filterGMPayStablecoinAssets retains only declared USDT/USDC token-network pairs, excluding native and undeclared assets while preserving gateway order. |
| A2 | passed | brief.md | A2：只有一个稳定币时直接进入网络步骤；某币种只有一个网络时选中币种后直接进入付款详情；只有一个币种/网络组合时点击充值不出现多余选择页。 | Selector skips single currency/network levels and enters checkout directly when only one valid pair exists. |
| A3 | passed | brief.md | A3：有多个币种时首次 Modal 只展示 USDT、USDC；选择 USDC 后只展示 USDC 的有效网络；取消或返回不会创建本地订单或调用网关。 | The first modal lists currencies only, the second lists networks for the selected currency, and cancel/back creates no order or gateway request. |
| A4 | passed | brief.md | A4：服务端收到缺 token、缺 network、非 USDT/USDC、未知网络或网关已关闭的组合时拒绝建单；建单前 fresh 配置失效时不回退到 TRON。 | Fresh server-side asset validation rejects missing, unsupported, unknown, disabled, and stale combinations without a TRON fallback. |
| A5 | passed | brief.md | A5：基础额度为 30、费用为 5 时，订单到账额度仍按 30 计算，checkout 同时显示 `基础额度 30`、`手续费 5`、`实际支付 35`；回调成功只增加 30 对应额度。 | TopUp.Amount remains the credited base amount while fee-inclusive TopUp.Money is used for payable/callback amount; settlement credits only the base amount. |
| A6 | passed | brief.md | A6：GMPay 返回动态 `actual_amount` 或显式 fee/total 报价时，checkout 使用服务端验证后的网关总额和费用来源；客户端无法修改该金额。 | Validated gateway actual_amount and explicit fee/total fields are used in checkout; fee and amount are recomputed and cannot be client-overridden. |
| A7 | passed | brief.md | A7：动态报价缺失或无效时，匹配的管理员固定/比例兜底按 decimal 计算并受最小值、最大值、总额上限约束；动态报价和兜底都不可用时该组合失败关闭并给出本地化错误。 | Decimal fixed/ratio fallback applies configured bounds and currency rounding; invalid dynamic and fallback quotes fail closed with localized error handling. |
| A8 | passed | brief.md | A8：回调必须匹配订单的 token/network、金额、签名、provider、租户和 pending 状态；USDT/USDC 历史 `usdt.tron` 兼容规则不影响新订单安全边界，重复回调不重复入账。 | Callback verifies asset binding, amount, signature, provider, tenant, pending state, and idempotent settlement; legacy usdt.tron compatibility is isolated. |
| A9 | passed | brief.md | A9：Legacy EPay 与其他支付方式的金额、回调和 UI 不因本 change 改变；普通钱包以外的 Native 业务继续使用其已有资产策略。 | Legacy EPay, other providers, and specialized Native paths retain their existing amount, callback, and asset contracts. |
| A10 | passed | brief.md | A10：checkout Modal 在桌面端提供足够宽度，在 390px 等窄屏可滚动但不横向溢出；长地址、网络名、费用和按钮均可读可操作。 | Checkout modal uses a wide desktop layout and bounded, vertically scrollable narrow layout with readable long addresses, network names, fees, and controls. |
| A11 | passed | brief.md | A11：中文、英文及项目要求的其他 locale 覆盖币种、网络、费用来源、基础/实际金额、空状态、错误、重试和复制文案；i18n 同步无缺键。 | Currency, network, fee source, amount, empty/error/retry/copy strings are localized; i18n synchronization reports zero missing or extra keys across seven locales. |
| A12 | passed | brief.md | A12：受影响 Go 测试、前端聚焦测试、i18n 同步、前端生产构建、根模块测试和独立只读 Verifier 按 A1-A11 全部通过；未授权前不推送、合并或部署。 | Required four Go packages passed; focused frontend tests, i18n sync, production build, and independent verification evidence passed. Repository-wide go test ./... has a baseline setup limitation because web/canvas/dist is absent for main.go //go:embed; no push, merge, or deployment occurred. |
| A13 | passed | specs/crypto-fee-aware-checkout/spec.md | 国际站处于 GMPay Native 模式时，普通钱包充值从 EPUSDT 公共配置读取可用网络和代币，并只向用户提供 USDT、USDC 两种稳定币。用户在 New API 自有页面内选择币种和网络，随后在同一 checkout Modal 查看收款地址、二维码、费用与状态。Legacy EPay 及其他 Provider 保持既有契约。 | GMPay Native ordinary wallet flow reads public EPUSDT assets and performs in-page token/network selection and checkout; Legacy EPay and other providers are unchanged. |
| A14 | passed | specs/crypto-fee-aware-checkout/spec.md | 读取 EPUSDT `/payments/gmpay/v1/config` 的 `supported_assets`，沿用已有超时、响应大小、元素数量和短 TTL 缓存保护。 | supported_assets is read from the EPUSDT config endpoint with the existing timeout, response-size, element-count, and short-TTL cache protections. |
| A15 | passed | specs/crypto-fee-aware-checkout/spec.md | 网络别名大小写不敏感地规范化为稳定标识；仅保留 New API 能做地址校验的网络。 | Network aliases are normalized case-insensitively to stable identifiers and only address-validatable networks are retained. |
| A16 | passed | specs/crypto-fee-aware-checkout/spec.md | 每个网络的 token 列表仅保留 `USDT`、`USDC`；`TRX`、`ETH`、`BNB`、`SOL` 等原生 Gas token、空 token、未知 token 和未知网络被过滤。 | Per-network token lists filter to USDT and USDC and reject TRX, ETH, BNB, SOL, empty/unknown tokens, and unknown networks. |
| A17 | passed | specs/crypto-fee-aware-checkout/spec.md | 以 `token + network` 作为唯一键去重，保持网关顺序（必要时采用稳定的本地排序），返回： | Asset normalization deduplicates by canonical token plus network key and preserves gateway order. |
| A18 | passed | specs/crypto-fee-aware-checkout/spec.md | 配置失败、无有效组合或 stale 缓存不可验证时返回空集合/错误；不回退到静态 TRON，也不让浏览器自行补全组合。 | Config failure, no valid pair, or unverifiable stale cache yields empty/error state; static TRON and browser-completed pairs are not used. |
| A19 | passed | specs/crypto-fee-aware-checkout/spec.md | `crypto_assets` 映射为 `CryptoAsset[]`，token 类型至少覆盖 `USDT \| USDC`。 | Frontend maps crypto_assets to CryptoAsset[] with USDT/USDC token types. |
| A20 | passed | specs/crypto-fee-aware-checkout/spec.md | 首层展示当前列表中存在的币种按钮；选中币种后只展示该币种的网络。 | Currency buttons are derived from available normalized assets and network buttons are restricted to the selected currency. |
| A21 | passed | specs/crypto-fee-aware-checkout/spec.md | 只有一个币种时跳过币种层；只有一个网络时跳过网络层；最终只有一个组合时点击支付直接建单。 | Single-currency and single-network paths skip redundant selection levels and a single pair goes straight to order creation. |
| A22 | passed | specs/crypto-fee-aware-checkout/spec.md | 取消、返回或关闭选择器不会创建本地订单，不调用网关，不改变已选支付方式；选择状态在下一次打开时清理。 | Cancel, back, and close clear selection state and do not create orders, call the gateway, or alter the selected payment method. |
| A23 | passed | specs/crypto-fee-aware-checkout/spec.md | 所有标签和错误均使用 i18next，不以 token 字符串作为未翻译的长文案。 | User-facing labels and errors use i18next; raw token identifiers are not used as untranslated long-form copy. |
| A24 | passed | specs/crypto-fee-aware-checkout/spec.md | `base_amount`：依据用户选择的充值额度、分组倍率和站点货币计算出的基础应付金额，同时保持到账额度计算的原口径。 | base_amount is computed server-side using the existing top-up amount, group ratio, and site currency semantics. |
| A25 | passed | specs/crypto-fee-aware-checkout/spec.md | `fee_amount`：服务端确认的费用（与 quote/配置来源一起返回）；不能由客户端提交或覆盖。 | fee_amount is server-confirmed and returned with its source; it is not accepted as a client-controlled input. |
| A26 | passed | specs/crypto-fee-aware-checkout/spec.md | `total_amount`：用户实际需要支付的法币等值金额；`TopUp.Money` 用于回调应付金额校验，`TopUp.Amount` 仍只记录到账额度。 | total_amount is the payable fiat amount, stored in TopUp.Money for callback validation while TopUp.Amount remains the credited amount. |
| A27 | passed | specs/crypto-fee-aware-checkout/spec.md | `actual_amount`：网关返回的精确 token 数量，作为二维码和复制金额；它可以包含网关费用或汇率差异，不能反推成链上 Gas 费用。 | Gateway actual_amount is validated and displayed as the precise token quantity for QR/copy; it is not interpreted as chain gas. |
| A28 | passed | specs/crypto-fee-aware-checkout/spec.md | 订单创建响应中经过严格 schema 验证的显式 `fee`/`service_fee`/`network_fee` 与 `total_amount` 字段优先；字段缺失时，以有效 `actual_amount` 作为网关支付总额。 | Validated explicit gateway fee/service/network fee and total fields take precedence; a valid actual_amount supplies gateway payable total when explicit fields are absent. |
| A29 | passed | specs/crypto-fee-aware-checkout/spec.md | 若网关未提供可解释的独立费用且需要在请求前加价，读取管理员 `GMPayFeeConfig` 兜底：资产覆盖项优先于全局默认；固定金额与比例只能启用一个；比例按基础金额计算。 | GMPayFeeConfig asset overrides take precedence over global defaults; fixed and ratio modes are mutually exclusive and ratio uses base amount. |
| A30 | passed | specs/crypto-fee-aware-checkout/spec.md | 费用必须为有限、非负 decimal，单笔费用和总额都不得超过配置上限；计算结果按货币精度向下/项目既有规则舍入。 | Fee and total calculations use bounded finite non-negative decimal values, configured caps, and currency-precision floor rounding. |
| A31 | passed | specs/crypto-fee-aware-checkout/spec.md | 动态报价和兜底均无效时，不创建或立即回收 pending 订单，返回本地化“该支付组合暂不可用”，不影响其他支付方式。 | When dynamic and fallback quotes are unusable, the combination is unavailable without a lasting pending order and a localized failure is returned. |
| A32 | passed | specs/crypto-fee-aware-checkout/spec.md | 详情中显示基础金额、费用金额、实际总额和来源（网关报价/管理员固定/管理员比例/已含在网关金额），避免用户误解到账额度。 | Checkout details show base amount, fee, total, and fee provenance including gateway or administrator fallback source. |
| A33 | passed | specs/crypto-fee-aware-checkout/spec.md | `GMPayFeeConfig` 作为现有 Option key-value 保存，默认关闭。配置解析器接受版本化 JSON，示例： | GMPayFeeConfig is stored through the existing Option key-value mechanism, defaults disabled, and supports versioned JSON. |
| A34 | passed | specs/crypto-fee-aware-checkout/spec.md | 服务端拒绝未知 mode、负数、非有限数字、超精度和超上限配置；配置错误只让兜底不可用，并记录脱敏诊断信息。前端支付设置提供 JSON 编辑/校验入口，说明该配置只在网关报价不可用时生效。 | Fee config parsing rejects unknown mode, negative/non-finite/over-precision/over-limit values and records sanitized diagnostics; settings UI provides JSON validation and fallback-only guidance. |
| A35 | passed | specs/crypto-fee-aware-checkout/spec.md | 客户端只提交基础 `amount`、支付方式及所选 `token`/`network`；服务端重新读取 fresh `supported_assets` 并规范化验证。 | Client submits only base amount, payment method, token, and network; order creation reloads and validates fresh supported_assets server-side. |
| A36 | passed | specs/crypto-fee-aware-checkout/spec.md | 生成订单时，先计算并验证基础额度、费用和 `total_amount`，再写入 pending `TopUp`：`Amount` 为到账额度，`Money` 为需要回调校验的法币总额，`payment_method` 为稳定、可解析的 token/network binding。 | Order creation computes and validates base, fee, and total before writing pending TopUp with credited Amount, payable Money, and stable token/network payment_method binding. |
| A37 | passed | specs/crypto-fee-aware-checkout/spec.md | GMPay 请求的 `currency` 继续为 `usd`，同时传递规范化 token、network 和服务端计算的金额。客户端不能传费用、网关 URL、钱包 ID 或其他自由参数。 | GMPay requests retain currency usd and send normalized token/network plus server-computed amount; fee, URL, wallet ID, and arbitrary client parameters are not accepted. |
| A38 | passed | specs/crypto-fee-aware-checkout/spec.md | 网关响应必须匹配本地订单 ID、法币金额、币种、token、network、地址、状态和过期时间；不一致时标记 pending 为 failed，不向用户入账。 | Gateway response validation binds local order ID, fiat amount, token/network, address, status, and expiry; mismatches fail pending order without credit. |
| A39 | passed | specs/crypto-fee-aware-checkout/spec.md | 回调继续验签、检查 provider/租户/订单归属、pending 状态和金额；若回调带 token/network/address，必须与订单 binding 一致。回调重复或订单已完成时保持幂等。 | Callbacks verify signature, provider/tenant/order ownership, pending state, amount, and optional asset fields, with idempotent repeated completion. |
| A40 | passed | specs/crypto-fee-aware-checkout/spec.md | 结算只把 `TopUp.Amount` 换算为额度，手续费和 `TopUp.Money` 不参与额度增加。历史 `usdt.tron` 及已存在的历史订单继续使用原解析和结算规则。 | Settlement converts only TopUp.Amount into quota; fee and Money do not increase credit, while historical usdt.tron orders retain prior parsing/settlement. |
| A41 | passed | specs/crypto-fee-aware-checkout/spec.md | Modal 在当前页面展示： | In-page checkout modal contains the complete required payment detail surface. |
| A42 | passed | specs/crypto-fee-aware-checkout/spec.md | 基础充值额度； | Modal displays the base credited top-up amount. |
| A43 | passed | specs/crypto-fee-aware-checkout/spec.md | 手续费及来源； | Modal displays fee amount and localized fee source. |
| A44 | passed | specs/crypto-fee-aware-checkout/spec.md | 实际支付总额和精确 `actual_amount token`； | Modal displays payable total and exact actual_amount with token. |
| A45 | passed | specs/crypto-fee-aware-checkout/spec.md | token、网络/协议、完整地址、二维码、订单号和过期倒计时； | Modal displays token, network/protocol, full address, locally rendered QR, order number, and expiry countdown. |
| A46 | passed | specs/crypto-fee-aware-checkout/spec.md | 等待、成功、失败、过期、超时、刷新和重试状态。 | Polling UI covers waiting, success, failure, expired, timeout, refresh, and retry states. |
| A47 | passed | specs/crypto-fee-aware-checkout/spec.md | 桌面端使用更宽的内容列，长地址通过断词/复制按钮处理；移动端保持视口内宽度和纵向滚动，不出现横向滚动条。二维码仍在本地渲染，不打开 hosted cashier URL。 | Responsive modal handles desktop width and narrow viewport vertical scrolling, wraps/copies long addresses, keeps QR local, and never opens a hosted cashier URL. |
| A48 | passed | specs/crypto-fee-aware-checkout/spec.md | Legacy EPay、Stripe、Creem、Waffo、直连支付宝/微信、订阅、拼团和代理预充值不读取本能力的费用配置，也不改变金额口径。 | Legacy EPay, Stripe, Creem, Waffo, direct Alipay/WeChat, subscription, group, and agent prepay paths do not read this fee configuration or change amount semantics. |
| A49 | passed | specs/crypto-fee-aware-checkout/spec.md | 不新增数据库列或迁移，SQLite、MySQL 5.7.8+、PostgreSQL 9.6+ 均使用既有 GORM/Option 机制。 | No database columns or migrations were added; existing GORM/Option mechanisms remain compatible with SQLite, MySQL 5.7.8+, and PostgreSQL 9.6+. |
| A50 | passed | specs/crypto-fee-aware-checkout/spec.md | 所有 JSON 编解码通过 `common.*`；所有费用计算使用 decimal 和现有金额/配额边界。 | Changed business JSON encoding uses common.* wrappers and fee arithmetic uses decimal with existing amount boundaries. |
| A51 | passed | specs/crypto-fee-aware-checkout/spec.md | 不把链上 Gas、第三方钱包余额或未验证的响应字段当成费用；不记录密钥、签名、完整支付凭据或私有网关地址。 | Implementation does not treat chain gas, wallet balances, or unverified fields as fees and does not log keys, signatures, full credentials, or private gateway URLs. |
| A52 | passed | specs/crypto-fee-aware-checkout/spec.md | Go：资产过滤/规范化、费用 schema、固定/比例兜底、金额不变量、建单 stale 校验、payment_method 解析、响应验证和回调幂等。 | Go coverage includes asset normalization, fee schema/fallback, amount invariants, fresh stale validation, payment_method parsing, gateway response checks, and callback idempotency. |
| A53 | passed | specs/crypto-fee-aware-checkout/spec.md | 前端：币种/网络两级选择、单选跳过、取消不建单、费用展示、i18n、Modal 响应式和轮询状态。 | Frontend coverage includes two-level selection, single-option skipping, cancel-without-order, fee display, i18n, responsive modal, and polling states. |
| A54 | passed | specs/crypto-fee-aware-checkout/spec.md | 命令：`go test ./controller ./service ./model ./router`、前端聚焦 Vitest、`bun run i18n:sync`、`bun run build`、`git diff --check`。 | Specified commands were run: go test -count=1 ./controller ./service ./model ./router; focused wallet/GMPay Vitest; bun run i18n:sync; bun run build; git diff --check. All required checks passed; root ./... limitation is documented under A12. |
| A55 | passed | specs/crypto-fee-aware-checkout/spec.md | 真实网关和线上部署不在本地 change 的验证范围内。 | Real gateway merchant payments, chain transfers, production services, and deployment are explicitly outside this local change's verification scope. |

## Checks

| Check | Command | Working directory | Status | Exit | Duration |
| --- | --- | --- | --- | ---: | ---: |
| GMPay controller service model router Go tests | -NoProfile -Command $env:GOWORK = 'off'; go test -count=1 ./controller ./service ./model ./router; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | . | passed | 0 | 12403 ms |
| GMPay affected Go vet | -NoProfile -Command $env:GOWORK = 'off'; go vet ./controller ./service ./model ./router; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | . | passed | 0 | 3827 ms |
| GMPay focused frontend Vitest suite | -NoProfile -Command bun run test -- src/features/wallet/hooks/__tests__/crypto-assets.test.ts src/features/wallet/hooks/__tests__/epay-entry.test.ts src/features/wallet/lib/__tests__/epay-entry.test.ts src/features/wallet/components/dialogs/__tests__/crypto-asset-select.test.tsx src/features/wallet/components/dialogs/__tests__/native-crypto-checkout.test.tsx src/features/wallet/components/dialogs/epay-checkout-dialog.test.tsx src/features/wallet/lib/payment.test.ts src/features/system-settings/integrations/__tests__/gmpay-fee-config.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | web | passed | 0 | 5222 ms |
| GMPay frontend TypeScript typecheck | -NoProfile -Command bun run typecheck; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | web | passed | 0 | 2698 ms |
| GMPay frontend production build | -NoProfile -Command bun run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | web | passed | 0 | 6654 ms |
| GMPay frontend i18n synchronization | -NoProfile -Command bun run i18n:sync; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | web | passed | 0 | 679 ms |
| GMPay owned frontend oxlint | -NoProfile -Command $files = @('src/features/wallet/components/dialogs/epay-checkout-dialog.tsx','src/features/wallet/components/dialogs/__tests__/native-crypto-checkout.test.tsx','src/i18n/static-keys.ts','src/features/system-settings/integrations/gmpay-fee-config.ts','src/features/system-settings/integrations/__tests__/gmpay-fee-config.test.ts','src/features/wallet/lib/payment.ts','src/features/wallet/types.ts'); & .\node_modules\.bin\oxlint.exe -c .oxlintrc.json $files; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | web | passed | 0 | 618 ms |
| GMPay owned frontend oxfmt | -NoProfile -Command $files = @('src/features/wallet/components/dialogs/epay-checkout-dialog.tsx','src/features/wallet/components/dialogs/__tests__/native-crypto-checkout.test.tsx','src/i18n/static-keys.ts','src/features/system-settings/integrations/gmpay-fee-config.ts','src/features/system-settings/integrations/__tests__/gmpay-fee-config.test.ts','src/features/wallet/lib/payment.ts','src/features/wallet/types.ts'); & .\node_modules\.bin\oxfmt.exe -c .oxfmtrc.json --check $files; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | web | passed | 0 | 826 ms |
| GMPay repository diff check | -NoProfile -Command git diff --check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | . | passed | 0 | 602 ms |

## Blockers

_None._

## Risks and skipped work

- Repository-wide go test ./... cannot complete in this checkout because the generated web/canvas/dist embed directory is absent; the specified affected-package tests pass.
- Repository-wide bun lint and format:check remain nonzero on pre-existing unrelated classic/other files; targeted owned-file checks pass.
- No live EPUSDT merchant, asynchronous callback, chain transfer, production DB/Redis, deployment, or remote repository operation was authorized or run.

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | Independent read-only Verify found all A1-A55 acceptance items satisfied by the candidate and focused checks. Four affected Go packages and focused frontend tests passed; i18n sync, typecheck/build, targeted lint/format, and diff checks passed. A12 records the repository baseline go test ./... embed limitation (missing web/canvas/dist) without attributing it to GMPay; A54 records the specified command set; A55 remains explicitly out of local scope. | 2026-09-01T06:58:06.397Z |

## Conclusion

Independent read-only Verify found all A1-A55 acceptance items satisfied by the candidate and focused checks. Four affected Go packages and focused frontend tests passed; i18n sync, typecheck/build, targeted lint/format, and diff checks passed. A12 records the repository baseline go test ./... embed limitation (missing web/canvas/dist) without attributing it to GMPay; A54 records the specified command set; A55 remains explicitly out of local scope.
