---
generated_from_state_version: 17
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 2
- Verifier attempt: 4
- Completed: 2026-08-30T19:42:59.272Z
- Summary: Independent second-round Verify confirms all A1-A26 acceptance items pass. The Legacy EPay regression was fixed with Array.isArray-based Native detection. No production payment, deployment, database migration, or production data changes were performed.

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1：`supported_assets` 返回一个 TRON/USDT 时，点击充值按钮直接创建 `network=tron, token=usdt` 的订单并打开 checkout Modal，不出现资产选择步骤。 | A single Native asset is sent directly to the in-site checkout without opening the selector. |
| A2 | passed | brief.md | A2：返回 TRON/USDT、Ethereum/USDT、Solana/USDC 等多个资产时，首次点击只打开资产选择 Modal；未选择前不创建订单、不调用创建订单接口。 | Multiple Native assets open the selector and do not create an order before selection. |
| A3 | passed | brief.md | A3：选择任一资产后，创建请求同时携带该 network/token；Modal 展示网关返回的实际金额、地址、网络和代币，且没有新窗口或外部导航。 | The selected network/token pair is sent and the returned payment data stays in the checkout modal. |
| A4 | passed | brief.md | A4：前端刷新充值信息或网关配置失败时，显示本地化错误并阻止创建订单；旧 TRON 配置仍可正常充值。 | Native configuration failures, invalid responses, and empty assets return an empty capability list and block order creation; Legacy mode remains available. |
| A5 | passed | brief.md | A5：后端拒绝不在当前 `supported_assets` 中的组合、缺失 network/token、非法地址或与订单资产不一致的 checkout/回调数据。 | Selected assets, checkout responses, and callbacks are validated against supported assets, network-specific addresses, and the original order binding. |
| A6 | passed | brief.md | A6：Native 回调仍按订单类型、金额、签名、商户和租户归属完成正确结算，重复回调至多入账一次；Legacy 回调路径行为不变。 | Callback signature, PID, status, amount, ownership, and idempotent settlement checks remain in place for wallet, subscription, group-buy, and agent flows. |
| A7 | passed | brief.md | A7：EPUSDT 配置接口响应受超时、大小和短时缓存保护；不会在每次轮询或状态查询时重复读取配置。 | Supported assets use timeout, response-size limits, and short-lived process caching; status polling does not refetch gateway configuration. |
| A8 | passed | brief.md | A8：定向后端测试、前端测试、类型检查和生产构建通过；不产生数据库迁移或生产环境变更。 | Backend tests, five focused wallet test files (35 tests), typecheck, production build, gofmt, and git diff checks passed. |
| A9 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 在 GMPay Native 模式下，钱包充值页面根据 EPUSDT 当前公开配置提供可用的网络/代币选择，并始终在 New API 站内展示支付信息。 | The wallet displays current Native network/token capabilities and completes payment information in the New API site. |
| A10 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 服务端通过 EPUSDT `/payments/gmpay/v1/config` 读取 `supported_assets`。每个资产至少包含规范化的 `network`、`tokens` 和可选 `display_name`。只保留网关返回且同时满足格式、网络支持和代币支持的组合；空列表、超时、无效响应或网关错误都视为暂不可用。该结果短时间缓存，并受响应大小和请求超时限制。 | The EPUSDT config endpoint is parsed, normalized, constrained, invalid data is rejected, and valid results are cached. |
| A11 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 用户端 `/api/user/topup/info` 在 GMPay Native 且配置可用时返回 `crypto_assets`，元素包含 `network`、`token`、`display_name`。Legacy 模式不返回该列表，国内原有支付方式保持不变。 | Native mode returns crypto_assets and Legacy mode omits it, preserving domestic payment behavior. |
| A12 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 钱包支付按钮触发以下流程： | Native and Legacy payment flows are separated while all other payment methods retain their existing confirmation paths. |
| A13 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 如果 `crypto_assets` 只有一个元素，直接使用该元素创建 Native 订单。 | One crypto asset skips the selector and immediately starts checkout. |
| A14 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 如果有多个元素，打开资产选择 Modal；Modal 关闭或取消不创建订单。 | A multi-asset selector can be cancelled without creating an order. |
| A15 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 用户选择资产后，客户端发送金额、`payment_method`、`network` 和 `token`。服务端重新确认该组合存在于当前缓存配置中，然后直接调用 EPUSDT `order/create-transaction` 创建 concrete order。 | The selected amount, payment method, network, and token are sent and revalidated server-side before EPUSDT order creation. |
| A16 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 服务端返回结构化 checkout 数据，不返回或打开 hosted cashier URL。金额使用 USD，实际加密货币金额由 EPUSDT 响应提供。 | Native checkout returns structured USD payment data and does not expose or navigate to the hosted cashier URL. |
| A17 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | Modal 展示二维码、完整收款地址、精确实际金额、网络、代币、复制操作、过期倒计时及支付状态。状态轮询、成功刷新余额、失败/过期提示和定时器清理沿用现有钱包支付逻辑。任何网络错误都停留在当前页面并提供本地化重试，不触发新窗口或外部导航。 | The modal renders QR, address, exact amount, network, token, expiry, status, copy, retry, failure, and timer cleanup behavior. |
| A18 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | network/token 必须成对出现，服务端拒绝未知组合、空值和大小写绕过。 | Explicit Native network/token pairs are required, normalized, and matched exactly against supported assets; historical non-wallet TRON defaults remain compatible. |
| A19 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | checkout 响应的 network/token 必须与请求资产一致；地址按网络使用对应校验器，TRON、Ethereum、Solana 不共用 TRON 校验规则。 | Checkout network/token responses must match the request and addresses use network-specific validation for TRON, EVM, Solana, Aptos, and fallback networks. |
| A20 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 回调继续校验签名、PID、成功状态、金额、订单类型、商户/租户归属和幂等性，并使用回调中的资产字段与订单资产匹配。 | Callbacks bind to the order payment_method asset; networkless official callbacks derive the network from that binding and network-bearing callbacks must match it. |
| A21 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 单资产 TRON/USDT 继续兼容既有 `usdt.tron` 支付方式、订单和回调；Legacy EPay 不受 Native 代码路径影响。 | Legacy EPay does not return crypto_assets. Native detection uses Array.isArray, so Legacy usdt.tron continues through the original EPay flow; the regression test passes. |
| A22 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 不增加数据库对象或迁移；资产配置来自网关实时公开配置和短 TTL 缓存。 | The existing payment_method column stores the canonical asset binding; no schema field or migration was added. |
| A23 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 单资产跳过选择，多资产必须先选择且选择前不建单。 | Single-asset checkout is direct and multi-asset checkout requires selection before order creation. |
| A24 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 选择的 network/token 被准确传入网关，Modal 展示实际返回数据。 | The selected pair is transmitted end-to-end and the modal renders the gateway's actual payment data. |
| A25 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 配置失败、组合非法、响应不一致、过期和回调重复均安全失败且有本地化反馈。 | Configuration errors, unavailable assets, invalid combinations, address mismatches, expiry, and duplicate callbacks fail safely with localized UI states or retry paths. |
| A26 | passed | specs/epusdt-multi-chain-wallet-checkout/spec.md | 钱包余额刷新和原有 TRON 流程回归通过。 | Native success refreshes the wallet, while existing TRON and Legacy checkout/callback paths retain regression coverage and pass. |

## Checks

| Check | Command | Working directory | Status | Exit | Duration |
| --- | --- | --- | --- | ---: | ---: |
| EPUSDT repaired backend/controller tests | test ./service ./controller ./router -count=1 | . | passed | 0 | 4824 ms |
| Wallet multi-chain repaired frontend tests | run test -- src/features/wallet/components/dialogs/__tests__/crypto-asset-select.test.tsx src/features/wallet/components/dialogs/__tests__/native-crypto-checkout.test.tsx src/features/wallet/hooks/__tests__/epay-entry.test.ts src/features/wallet/lib/__tests__/epay-entry.test.ts | web | passed | 0 | 4710 ms |
| Frontend TypeScript typecheck | run typecheck | web | passed | 0 | 2467 ms |
| Frontend production build | run build | web | passed | 0 | 6306 ms |
| Candidate whitespace check | diff --check | . | passed | 0 | 177 ms |

## Blockers

_None._

## Risks and skipped work

- Medium: historical non-wallet calls that omit network/token retain the default usdt/tron behavior; the wallet Native path always sends an explicit pair.
- Medium: the unrelated sign-in-layout test can fail with RangeError: Array buffer allocation failed; focused wallet tests pass.
- Low: repository-wide formatting still reports existing classic/legacy issues; changed files and git diff --check pass.
- Low: no real EPUSDT payment, production deployment, database migration, production data, or payment gateway configuration was changed.
- Low: fast-context failed after retry and code facts were verified with rg as required by project instructions.

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | fail | A4, A5, A6, A9, A11, A20, A25 | Focused checks pass, but independent review found blocking configuration fallback and callback asset-binding/protocol issues. Return to Build before Archive. | 2026-08-30T18:56:06.009Z |
| 1 | 2 | 1 | execution-error | — | Native Verifier response was invalid: Native Verifier response fields are invalid | 2026-08-30T19:35:44.281Z |
| 1 | 2 | 2 | execution-error | — | Native Verifier response was invalid: Native Verifier verdict is invalid | 2026-08-30T19:40:52.876Z |
| 1 | 2 | 3 | execution-error | — | Native Verifier response was invalid: Native Verifier risks must be text entries | 2026-08-30T19:41:45.464Z |
| 1 | 2 | 4 | pass | — | Independent second-round Verify confirms all A1-A26 acceptance items pass. The Legacy EPay regression was fixed with Array.isArray-based Native detection. No production payment, deployment, database migration, or production data changes were performed. | 2026-08-30T19:42:59.272Z |

## Conclusion

Independent second-round Verify confirms all A1-A26 acceptance items pass. The Legacy EPay regression was fixed with Array.isArray-based Native detection. No production payment, deployment, database migration, or production data changes were performed.
