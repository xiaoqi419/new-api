# Outcome

国际站使用 EPUSDT 时，用户可以在站内完成多链加密货币充值：网关公开配置中只有一个可用资产时直接创建该资产的订单并展示二维码；存在多个可用资产时先在支付 Modal 中选择网络和代币，再创建对应订单并展示精确金额、地址、二维码和状态。现有 TRON/USDT 流程保持兼容，国内 Legacy EPay、其他支付 Provider 和数据库不受影响。

# Scope

- 后端读取 EPUSDT `/payments/gmpay/v1/config` 的 `supported_assets`，只暴露当前网关实际启用且有钱包的 network/token 组合。
- 扩展现有充值信息与 Native checkout API，传递资产展示名、网络、代币，并在建单前校验组合来自网关配置。
- 前端钱包充值在点击支付按钮后使用站内 Modal：单资产直达 checkout，多资产先选择资产；选择完成后才创建订单。
- 现有二维码、复制、倒计时、状态轮询和充值成功刷新流程继续使用，并展示返回的实际 token/network。
- 为新增行为补充 Go、React/Vitest 和必要的类型/i18n 测试；同步用户可见文案到前端语言包。

# Non-goals

- 不新增数据库表、字段或迁移，不修改生产数据库、Redis、网关配置或线上部署。
- 不改变国内站 Legacy EPay、Stripe、Creem、Waffo、直连微信/支付宝等独立支付 Provider。
- 不打开或嵌入 EPUSDT hosted cashier 页面，不把网关托管 URL 暴露给浏览器。
- 不根据域名、Host、请求参数或语言自动切换支付模式，不实现不同倍率/供应商的渠道调度。
- 不允许用户选择网关配置之外的网络或代币；不伪造网关未返回的资产。

# Acceptance examples

- A1：`supported_assets` 返回一个 TRON/USDT 时，点击充值按钮直接创建 `network=tron, token=usdt` 的订单并打开 checkout Modal，不出现资产选择步骤。
- A2：返回 TRON/USDT、Ethereum/USDT、Solana/USDC 等多个资产时，首次点击只打开资产选择 Modal；未选择前不创建订单、不调用创建订单接口。
- A3：选择任一资产后，创建请求同时携带该 network/token；Modal 展示网关返回的实际金额、地址、网络和代币，且没有新窗口或外部导航。
- A4：前端刷新充值信息或网关配置失败时，显示本地化错误并阻止创建订单；旧 TRON 配置仍可正常充值。
- A5：后端拒绝不在当前 `supported_assets` 中的组合、缺失 network/token、非法地址或与订单资产不一致的 checkout/回调数据。
- A6：Native 回调仍按订单类型、金额、签名、商户和租户归属完成正确结算，重复回调至多入账一次；Legacy 回调路径行为不变。
- A7：EPUSDT 配置接口响应受超时、大小和短时缓存保护；不会在每次轮询或状态查询时重复读取配置。
- A8：定向后端测试、前端测试、类型检查和生产构建通过；不产生数据库迁移或生产环境变更。

# Constraints and invariants

- 资产真相来源是 EPUSDT 的公开 `supported_assets`；New API 只能过滤、规范化和缓存，不能扩大可用范围。
- network/token 必须成对处理，订单金额仍以 USD 传给网关，实际加密货币金额以网关响应为准。
- 现有 `usdt.tron` 兼容值继续支持；所有订单仍使用本地订单号、签名校验、归属校验和幂等结算。
- 地址校验按网络选择对应规则，禁止把 TRON Base58 校验错误复用于 Ethereum/Solana。
- 所有用户可见文字使用 `useTranslation()` 和语言包；错误状态、加载状态、关闭/重试行为完整可用。
- 代码基于当前 `main` 的新 worktree 实现；不得覆盖根工作区或其他 dirty worktree 的未提交修改。

# Decisions

- 采用直接创建 concrete order：选择资产后一次调用 EPUSDT `order/create-transaction`，同时传 network/token；不创建状态 4 的占位订单，也不依赖后续 `switch-network`。
- 通过现有 `/api/user/topup/info` 返回可用资产列表，避免新增用户端入口；仅在 GMPay Native 模式且网关配置可读时返回。
- 配置读取使用进程内短 TTL 缓存和请求超时；创建订单前再次验证缓存中的资产组合，网关拒绝时返回可重试的本地化错误。
- 资产选择作为钱包充值流程内部的独立 Modal，复用现有 Native checkout Modal；单资产跳过选择，多资产不提前建单。
- 同步 default 钱包 UI 的实际支付行为；classic 仅在共享 API/类型受影响时保持兼容，不引入第二套支付协议。

# Open questions

- [blocking] CONFIRM: 按以上目标、范围、非目标、验收标准和决定进入 Build；本次只在本地实现与验证，不部署线上、不修改数据库。

# Verification expectations

- 使用 Go 单元/控制器测试覆盖 config 解析、资产过滤、network/token 传递、网络地址校验、错误和回调幂等。
- 使用 React/Vitest 覆盖单资产直达、多资产先选、取消/重试、无外部导航、i18n 和旧 TRON 回归。
- 执行 `gofmt`、定向 `go test`、前端测试、`bun run typecheck`、`bun run build`、`git diff --check`；独立只读 Verifier 按 A1-A8 给出结论。
