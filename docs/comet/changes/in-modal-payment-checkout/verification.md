---
generated_from_state_version: 15
---

# Verification

## Current result

- Result: **Blocked**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 4
- Verifier attempt: 1
- Completed: 2026-08-21T09:38:22.118Z
- Summary: A1-A22 通过，未发现新的代码缺陷；A23 因缺少真实商户端到端证据而 blocked。

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1：钱包选择任一 Epay 聚合支付方式并确认后，当前页面打开支付 Modal，Modal 内展示二维码，浏览器不打开新标签页也不离开当前页面。 | default/classic 钱包 Epay 入口将安全 checkout 写入当前页 Modal 状态，入口测试断言无新窗口、页面替换或表单提交。 |
| A2 | passed | brief.md | A2：订阅选择 Epay 并确认后，当前订阅购买上下文切换到支付 Modal，浏览器不发生外部导航。 | default 订阅真实组件交互及 classic 生产 handler 均进入 Epay Modal，不发生外部导航。 |
| A3 | passed | brief.md | A3：拼团创建或参团选择 Epay 后，当前页面打开支付 Modal；即使响应为兼容的 `pay_url` 形态，也只将其编码为 Modal 二维码，不自动外跳。 | default/classic 拼团创建与参团均将标准或兼容 checkout 规范化到 Modal，未保留 Epay 外跳降级。 |
| A4 | passed | brief.md | A4：default 与 classic 两套仍发布的用户界面在 A1-A3 行为上保持一致，相关 Epay 发起分支不存在 `window.open`、`window.location` 或自动表单提交。 | 两套前端 Epay 分支一致；剩余外跳仅属于规格明确排除的 Stripe、Creem、Waffo、官方直连或充值链接流程。 |
| A5 | passed | brief.md | A5：支付成功、失败、过期、轮询超时、手动刷新、重试和关闭行为保持可用；关闭未支付拼团仍释放预占名额。 | 两套 Modal 测试覆盖成功、失败、过期、超时、刷新、重试、返回、清理及拼团取消。 |
| A6 | passed | brief.md | A6：无可安全展示的 checkout 值时，界面显示本地化错误并停留当前页面，不以外部导航作为降级方案。 | 不完整、不一致或不安全 checkout 被本地拒绝并显示错误，不触发导航。 |
| A7 | passed | brief.md | A7：受影响的定向前端测试、类型检查、涉及文件 lint 和生产构建通过；后端契约若有改动，其定向 Go 测试通过。 | 定向测试、类型检查、lint/format、两套生产构建、Go 测试及 diff 检查均通过。 |
| A8 | passed | specs/epay-in-site-checkout/spec.md | 普通用户侧所有由彩虹易支付（Epay）处理的钱包充值、订阅购买、拼团创建和参团入口，发起付款后必须留在当前业务页面，在 Modal 中直接展示二维码、金额、支付方式、站内订单号和支付状态。发起动作不得自动打开新标签页、替换当前页面、提交外部表单或通过链接导航到网关页面。 | 四类生产入口均停留当前业务页并由 Modal 展示支付信息和状态。 |
| A9 | passed | specs/epay-in-site-checkout/spec.md | default 与 classic 两套仍发布的前端必须保持一致。当前至少覆盖 Epay 的 `alipay` 与 `wxpay`；支付宝官方商户直连、微信官方商户直连、Stripe、Creem、Waffo 和代理控制台预充值保持各自既有行为。 | Epay alipay/wxpay 使用站内 checkout；官方直连及其他支付提供商保持原行为。 |
| A10 | passed | specs/epay-in-site-checkout/spec.md | 服务端标准成功响应继续使用 `trade_no`、可选 `gateway_trade_no`、`checkout_type`、`checkout_value`、`payment_method` 和 `money`。`checkout_type` 只允许 `qrcode`、`payurl` 或支付方式白名单允许的 `urlscheme`。 | 后端标准响应字段完整，checkout_type 限定为 qrcode、payurl 或白名单 urlscheme。 |
| A11 | passed | specs/epay-in-site-checkout/spec.md | 前端收到标准 checkout 数据时，将 `checkout_value` 作为二维码内容。为兼容尚未升级或历史路径返回的 Epay `pay_url`/`qr_code`，只在能够确认订单号、支付方式、金额和安全 checkout 值时规范化为同一 Modal 数据；不得把 `pay_url` 当作自动导航回退。缺少必要字段或值不安全时，显示本地化的支付请求失败提示并停留当前页面。 | 标准与安全 legacy checkout 均可规范化，pay_url 不再作为导航回退。 |
| A12 | passed | specs/epay-in-site-checkout/spec.md | Modal 使用现有 `qrcode.react` 生成二维码，不注入原始 HTML。桌面二维码约 240px，390px 窄屏约 208px。Modal 打开后每 3 秒轮询本人订单状态，最长 5 分钟，并提供手动刷新： | 两套 Modal 使用 qrcode.react、响应式尺寸、立即检查、3 秒轮询、5 分钟上限和手动刷新。 |
| A13 | passed | specs/epay-in-site-checkout/spec.md | `pending` 保持等待； | pending 保持等待并继续轮询。 |
| A14 | passed | specs/epay-in-site-checkout/spec.md | `success` 停止轮询并刷新相应余额、订阅或拼团详情； | success 停止轮询并触发对应业务刷新。 |
| A15 | passed | specs/epay-in-site-checkout/spec.md | `failed`/`expired` 停止轮询并允许返回或重试； | failed/expired 停止轮询并提供返回和重试。 |
| A16 | passed | specs/epay-in-site-checkout/spec.md | 临时网络错误继续等待； | 临时状态请求异常不会终止观察。 |
| A17 | passed | specs/epay-in-site-checkout/spec.md | 观察超时仅停止自动轮询，不修改服务端订单状态。 | 超时只停止前端自动轮询，不修改服务端订单。 |
| A18 | passed | specs/epay-in-site-checkout/spec.md | 组件卸载、主动关闭或订单更换时清理旧定时器。关闭未支付拼团 checkout 时调用现有取消接口释放预占名额；取消保持幂等且不能影响已经由异步通知完成的订单。 | 生命周期变化清理定时器，未支付拼团关闭调用幂等取消接口。 |
| A19 | passed | specs/epay-in-site-checkout/spec.md | 唯一结算入口仍是现有钱包、订阅和拼团 Epay 异步通知。前端响应、二维码、轮询结果、MAPI 成功响应和 return URL 均不能自行入账、开通订阅或完成拼团。 | 结算仍只发生在验签后的异步 notify 路径。 |
| A20 | passed | specs/epay-in-site-checkout/spec.md | `payurl` 仅允许带有效主机名的绝对 `http/https` URL；`urlscheme` 只允许与支付方式匹配的明确白名单。禁止 `javascript:`、`data:`、相对 URL、未知 scheme、空值和自动拉起 App。密钥、签名和敏感 checkout token 不得进入浏览器响应或日志。 | payurl 与 urlscheme 按协议白名单校验，前端只渲染二维码。 |
| A21 | passed | specs/epay-in-site-checkout/spec.md | 本能力不新增数据库表、列或迁移，并保持 SQLite、MySQL 5.7.8+ 与 PostgreSQL 9.6+ 兼容。 | 未新增数据库表、列或迁移，相关测试通过。 |
| A22 | passed | specs/epay-in-site-checkout/spec.md | 前端定向测试必须覆盖钱包、订阅、拼团创建和参团在 default/classic 中打开 Modal，并断言发起 Epay 的代码路径没有调用 `window.open`、`window.location.assign`/`href` 或自动表单提交。继续覆盖二维码、轮询成功/失败/过期/超时、手动刷新、重试、返回、定时器清理与拼团取消。 | modern 真实 wallet hook、subscription 组件、group-buy create/join hook 及 classic 四个生产 API-to-checkout handler 均有入口测试，并覆盖 Modal 生命周期与无导航。 |
| A23 | blocked | specs/epay-in-site-checkout/spec.md | 运行受影响测试、TypeScript 类型检查、涉及文件 lint 和生产构建。若服务端兼容响应契约发生变化，补充并运行对应 Go 定向测试。真实商户扫码扣款、异步通知公网可达、验签、到账和退款仍需在测试环境使用真实商户配置验收，不得用模拟结果替代。 | 自动化门禁已满足，但当前没有真实测试商户配置及真实扫码扣款、公网异步回调、验签、到账和退款证据，不能用模拟结果替代。 |

## Checks

| Check | Command | Working directory | Status | Exit | Duration |
| --- | --- | --- | --- | ---: | ---: |
| modern Epay checkout behavior tests | -NoProfile -Command & .\node_modules\.bin\vitest.cmd run src/features/wallet/lib/__tests__/epay-entry.test.ts src/features/wallet/lib/payment.test.ts src/features/wallet/hooks/__tests__/epay-entry.test.ts src/features/wallet/components/dialogs/epay-checkout-dialog.test.tsx src/features/subscriptions/components/dialogs/__tests__/epay-entry.test.tsx src/features/groupbuy/hooks/__tests__/epay-entry.test.ts src/features/groupbuy/hooks/use-group-buy-payment.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | web | passed | 0 | 5666 ms |
| classic Epay checkout behavior tests | -NoProfile -Command & .\node_modules\.bin\vitest.cmd run --config vitest.classic-payment.config.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | web | passed | 0 | 16212 ms |
| default frontend typecheck | -NoProfile -Command & .\node_modules\.bin\tsgo.cmd -b; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | web | passed | 0 | 2610 ms |
| default and classic production builds | -NoProfile -Command & .\node_modules\.bin\rsbuild.cmd build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; Set-Location classic; & ..\node_modules\.bin\rsbuild.cmd build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | web | passed | 0 | 13784 ms |
| affected frontend lint and format | -NoProfile -Command & .\node_modules\.bin\oxlint.cmd -c .oxlintrc.json src/features/wallet/lib/payment.ts src/features/wallet/lib/__tests__/epay-entry.test.ts src/features/wallet/components/dialogs/epay-checkout-dialog.tsx src/features/wallet/components/dialogs/epay-checkout-dialog.test.tsx src/features/wallet/hooks/use-payment.ts src/features/wallet/hooks/__tests__/epay-entry.test.ts src/features/subscriptions/components/dialogs/subscription-purchase-dialog.tsx src/features/subscriptions/components/dialogs/__tests__/epay-entry.test.tsx src/features/groupbuy/hooks/use-group-buy-payment.ts src/features/groupbuy/hooks/__tests__/epay-entry.test.ts src/features/groupbuy/hooks/use-group-buy-payment.test.ts src/features/groupbuy/detail.tsx src/features/groupbuy/components/group-buy-launch-card.tsx classic/src/components/topup/modals/EpayCheckoutModal.jsx classic/src/components/topup/modals/EpayCheckoutModal.test.jsx classic/src/components/topup/lib/epay-checkout.js classic/src/components/topup/__tests__/epay-entry.test.jsx vitest.classic-payment.config.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & .\node_modules\.bin\oxfmt.cmd --check classic/src/components/topup/index.jsx classic/src/components/topup/SubscriptionPlansCard.jsx classic/src/components/topup/GroupBuyCard.jsx classic/src/pages/GroupBuy/index.jsx classic/src/components/topup/modals/EpayCheckoutModal.jsx classic/src/components/topup/modals/EpayCheckoutModal.test.jsx classic/src/components/topup/lib/epay-checkout.js classic/src/components/topup/__tests__/epay-entry.test.jsx vitest.classic-payment.config.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | web | passed | 0 | 1062 ms |
| affected backend tests | -NoProfile -Command go test ./controller ./model ./service; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | . | passed | 0 | 2442 ms |
| ordinary-user Epay external navigation scan | -NoProfile -Command $files = @('web/src/features/wallet/index.tsx','web/src/features/wallet/hooks/use-payment.ts','web/src/features/wallet/components/dialogs/epay-checkout-dialog.tsx','web/src/features/subscriptions/components/dialogs/subscription-purchase-dialog.tsx','web/src/features/groupbuy/hooks/use-group-buy-payment.ts','web/classic/src/components/topup/index.jsx','web/classic/src/components/topup/SubscriptionPlansCard.jsx','web/classic/src/components/topup/GroupBuyCard.jsx','web/classic/src/pages/GroupBuy/index.jsx','web/classic/src/components/topup/modals/EpayCheckoutModal.jsx'); $matches = @(rg -n 'window\.open\|window\.location\.assign\|form\.submit\|target\s*=\s*["'']_blank\|data\.pay_url' $files 2>$null); $forbidden = @($matches \| Where-Object { $_ -notmatch 'h5_url\|window\.location\.origin' }); if ($forbidden.Count -gt 0) { $forbidden \| Write-Error; exit 1 }; exit 0 | . | failed | 1 | 449 ms |
| repository diff whitespace check | -NoProfile -Command git diff --check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } | . | passed | 0 | 391 ms |

## Blockers

- **user**: A1-A22 通过，未发现新的代码缺陷；A23 因缺少真实商户端到端证据而 blocked。 (acceptance: A23) — next: `resolve-verifier-blocker`

## Risks and skipped work

- Runtime 的整文件导航扫描误报了规格明确排除的非 Epay 流程，真实入口测试未发现 Epay 外跳。
- 真实商户端到端验收必须在隔离测试环境完成，完成前不得宣称支付链路已全面验收。

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | recovery | — | 独立核对发现经典阶梯拼团兼容 pay_url 的金额上下文应使用页面计算后的套餐价格；已修正实现，当前候选需失效并返回 Build 后重新提交。 | 2026-08-21T07:37:48.384Z |
| 1 | 2 | 1 | fail | A5, A7, A15, A22, A23 | 核心站内 checkout 正确，但需补 classic 重试、入口级测试和 lint 修复后重新验收。 | 2026-08-21T07:44:25.483Z |
| 1 | 3 | 1 | fail | A22, A23 | Code behavior and automated gates are coherent, but production-entry tests are incomplete and real-merchant validation remains pending. Return to Build for actual entry tests before deployment acceptance. | 2026-08-21T08:51:13.258Z |
| 1 | 4 | 1 | blocked | A23 | A1-A22 通过，未发现新的代码缺陷；A23 因缺少真实商户端到端证据而 blocked。 | 2026-08-21T09:38:22.118Z |

## Conclusion

A1-A22 通过，未发现新的代码缺陷；A23 因缺少真实商户端到端证据而 blocked。
