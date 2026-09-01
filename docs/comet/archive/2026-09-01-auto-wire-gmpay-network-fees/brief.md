# Outcome

让 GMPay/EPUSDT 原生充值在不要求管理员填写 RPC、价格源、合约、calldata、钱包地址或其他链底层参数的情况下，自动给出“到账额度 + 链上网络成本估算”。用户看到明确的基础金额、估算费用和应付总额；管理员只需启用支付网关，系统即可优先尝试网关私有的、服务器间受控上下文，缺失时改用 New API 内置链网络预设，并从公开白名单 RPC/价格源动态取数。

这里的费用只表示当前链/token 和代表性归集/结算操作的网络成本估算，不是 GMPay/EPUSDT 的平台服务费。官方 EPUSDT 当前没有 fee/gas quote 或 sweep API，因此没有证据时不得把网关 `actual_amount`、汇率差或服务费推导为网络费。

# Scope

- 从当前 GMPay/EPUSDT 连接发现已启用网络/token；若部署提供受控的私有网关 context，则优先使用该上下文，敏感凭据只在服务端使用。
- 私有 context 不可用时，选择内置链网络估算预设，动态读取公开白名单 RPC 和价格源，将结果转换为现有 `NetworkFeeEstimator` 的受控输入。
- 当前内置预设支持 TRON、Ethereum、BSC（规范名 `binance`）和 Solana 的 USDT/USDC 代表性网络成本估算；Ethereum/BSC 的 gas、TRON 的 Energy/Bandwidth 在精确模拟不可用时使用代码内受控的代表性资源单位，并明确标注为预设估算。Solana 每次用最新 blockhash 调用 `getFeeForMessage`。Polygon/Matic、其他链、任意未登记 token 和用户个人转账成本不支持。
- 默认启用自动估算（仅在 GMPay Native 钱包充值路径）；报价绑定有效期、来源、上限和失败策略沿用现有安全模型。私有 context 与内置预设都不可用时必须失败关闭。
- 建单时将 `TopUp.Amount` 保持为用户购买的额度，将 `TopUp.Money` 和 GMPay 请求金额设为基础金额加费用。
- 简化后台设置：隐藏底层 JSON/链参数编辑，展示自动同步状态、最近估算、测试估算和可选的显式兜底开关。
- 保持 Legacy EPay、订阅、拼团、代理预充值、历史订单和数据库结构不变。

# Non-goals

- 不估算用户个人钱包发起转账的费用（付款地址、资源和余额在建单时未知）。
- 不把 GMPay `actual_amount`、服务费、汇率差或平台加价冒充链上网络费用；网关未公开的服务费不在本 change 内推断。
- 不声称内置预设等同于网关真实 sweep 成本；预设只提供有来源、带时间和限制说明的网络成本估算。
- 不要求或暴露私钥、完整密钥、完整钱包地址、原始 calldata 或浏览器端 RPC 凭据。
- 不修改生产环境、生产数据库、Redis、EPUSDT 数据卷或网关进程；不新增数据库列/迁移。

# Acceptance examples

- A1: 仅配置 GMPay/EPUSDT 的现有网关地址、商户 ID 和密钥时，后台自动显示 EPUSDT `supported_assets` 中的可用网络/token 与同步状态；私有 context 不存在时仍尝试内置预设，不出现必须填写 RPC/价格源/交易上下文的输入框。
- A2: 选择受支持的 USDT/USDC 网络并充值 30.00 时，服务端返回 `base_amount=30.00`、有明确来源且非负的网络成本估算和 `total_amount=base_amount+fee`；客户端不能覆盖费用。估算值不代表 GMPay 服务费；没有可用私有 context 或内置预设时不得建单，除非显式人工兜底已开启。
- A3: 动态报价包含来源（私有 context 或具体内置预设）、原生币数量、结算币种、报价时间、过期时间、估算器版本和脱敏 RPC/价格证据，并标注“网络成本估算”。证据至少能区分 EVM `eth_estimateGas`/gas-price、TRON chain-parameter/energy、Solana `getLatestBlockhash`/`getFeeForMessage`；过期、上下文不完整、价格不可信或预设不支持时不会伪造 0 费用。
- A4: 报价有效时，GMPay 建单金额和 `TopUp.Money` 使用冻结的总额，`TopUp.Amount` 仍只用于到账额度；回调按绑定金额/资产/网络幂等校验。
- A5: EPUSDT 暂不可达、私有 discovery 未提供 context，或私有估算器无法产出有效 quote 时，系统按白名单资产尝试内置预设；只有私有 context 与内置预设均不可用、链上数据/价格不可信或链不受支持时才显示可重试的支付不可用提示。只有管理员明确启用的兜底规则才可替代估算，并标注为人工兜底；任何路径都不把网关服务费当作网络费。
- A6: 内置预设的同步周期、缓存、超时、响应大小、重试次数、价格年龄和费用上限有固定安全默认值，无需管理员填写；异常不会导致负数、溢出、静默零费或重复收费，公开 RPC/价格源仅访问服务器端白名单。
- A7: Legacy EPay 与其他支付场景的金额、回调和结算行为保持现状。
- A8: 设置页和充值 Modal 在桌面/移动端可读，费用来源、基础金额和总额均有 i18n 文案，不暴露敏感配置。

# Constraints and invariants

- `base_amount` 是额度费；`fee_amount` 是服务端验证的链上归集/结算网络成本；`total_amount = base_amount + fee_amount`。
- 所有金额使用 decimal 和现有配额/金额边界；费用非负、有限、受单笔/总额上限约束，报价必须带 TTL。
- 自动发现只信任服务器端已配置的 GMPay/EPUSDT 端点和白名单 RPC；请求体不得携带 URL、凭据或自由交易上下文。
- 公共 GMPay 配置接口没有手续费字段，不能依赖 `actual_amount` 反推费用；若无法获得可验证上下文必须安全失败。
- 遵守 `common.*` JSON 包装器、SQLite/MySQL/PostgreSQL 兼容和现有回调/幂等约束。

# Decisions

- 费用口径采用“代表性归集/结算操作的链上网络成本估算”，而不是用户钱包未知的入账转账成本，也不宣称是 GMPay 服务费。只有网关私有 context 能提供可验证真实操作时，才优先使用该上下文；否则明确标注为内置预设估算。EVM/TRON 的代表性 gas/Energy/Bandwidth 单位是受控 fallback，不是网关实际服务费或精确 sweep 账单。
- 自动发现优先读取部署提供的受控私有 context；官方公开 API 只用于可用资产能力。私有 context 缺失或估算失败时使用内置 TRON、Ethereum、BSC、Solana 预设及公开白名单 RPC/价格源；Solana 以最新 blockhash 重建消息后查询网络费。不支持的链没有隐式回退。
- 自动估算默认开启于 GMPay Native 普通钱包充值；动态数据与预设均不可用时默认拒绝建单，管理员兜底仍是明确、可选的第二路径。
- 不新增数据库字段，使用现有 Option、短期报价绑定和订单字段保存必要状态。

# Open questions

- 已确认：费用定义为代表性归集/结算操作的链上网络成本估算，不是 GMPay/EPUSDT 平台服务费；按私有 context 优先、内置预设回退、失败安全（无可靠报价不建单）的规则执行。

# Verification expectations

- Go 聚焦测试：EPUSDT 自动发现/规范化、默认值、链上下文构造、动态报价金额不变量、报价过期/失败安全、回调绑定和旧支付兼容。
- 前端聚焦测试：隐藏底层配置、同步状态/测试估算展示、费用明细与 i18n、响应式布局。
- 运行 `go test ./controller ./service ./model ./router`、相关前端 Vitest、`bun run i18n:sync`、`bun run build` 和 `git diff --check`；不运行线上部署或生产数据操作。
