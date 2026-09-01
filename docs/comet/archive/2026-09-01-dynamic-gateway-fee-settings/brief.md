# Outcome

在不修改数据库结构、不依赖 GMPay 返回不存在的手续费字段的前提下，为 GMPay 充值建立可审计的动态链上网络费用估算流程。订单创建前按资产和网络读取受信任的实时链上数据，估算网关后续收款/归集操作可能产生的原生币网络成本，将其换算为站点结算币种并由用户承担；管理员固定金额/比例规则只作为明确开启的第二层兜底。后台用结构化表单维护估算器和兜底策略，结算页清楚区分“动态网络费用估算”和“人工兜底”，设置页底部在窄屏及安全区环境下保持可见。

# Scope

- 新增服务端链上费用估算抽象及按网络适配器：
  - TRON：读取账户 Bandwidth/Energy、链参数，并在具备真实交易上下文时使用 `estimateenergy`/`triggerconstantcontract` 等官方 RPC 估算资源消耗；资源不足部分按当前燃烧价格换算 TRX。
  - Ethereum/BSC（及项目已支持的 EVM 网络）：使用 `eth_estimateGas`、当前 base fee/gas price 与 priority fee 计算原生币成本；ERC-20 转账使用配置的代表性归集交易上下文。
  - Solana：构造代表性 message，使用 `getFeeForMessage` 并叠加已启用的 prioritization fee；费用以 SOL 计，再换算为站点结算币种。
- 估算器只接受服务器/管理员配置的受信任 RPC 与价格源；请求设置超时、响应体上限、缓存 TTL、价格时间戳/偏差校验和单笔费用/总额上限，拒绝用户提交的任意 URL，避免 SSRF。
- 将报价冻结到订单的服务端状态（优先使用现有受控订单扩展字段或短期服务端缓存，具体字段在 Build 阶段按现有模型确定），绑定 `token + network + base_amount + quoted_at + expires_at + source`；回调和结算只使用冻结后的基础到账额度与应付金额，不从客户端重新计算。
- 动态估算不可用、过期、上下文不足或校验失败时：管理员明确开启兜底则使用人工固定/比例规则并标注来源；否则 fail-closed，不创建“手续费为 0”的成功订单。
- 充值 Modal 展示基础金额、动态网络费用估算（含原生币金额、换算币种、估算时间和有效期）、必要时的人工兜底、总支付金额、实际 token 数量和网络；禁止把链上估算文案写成网关服务费，也不从 `actual_amount` 反推费用。
- 将 `GMPayFeeConfig` 保持为版本化 Option JSON 以兼容 SQLite/MySQL/PostgreSQL，但后台改用开关、输入框、下拉框和按资产/网络增删规则的结构化编辑器，不让管理员直接编辑 JSON。
- 设置页滚动区域和 footer 增加 `env(safe-area-inset-bottom, 0px)` 与最小视觉留白，确保 390px 窄屏及移动手势条下最后一项可滚动到完全可见且不横向溢出。
- 补充中英文及项目支持 locale 的 i18n、费用来源/失败状态/表单校验与布局回归测试，并更新前端 changelog。

# Non-goals

- 不声称能从 EPUSDT/GMPay 当前公开接口得到网关平台服务费；其 API 没有费用字段或 quote endpoint，`actual_amount` 仅是汇率换算后的加密货币数量。
- 不把 TRON Energy/Bandwidth、EVM gas 或 Solana lamports 冒充网关服务费；动态结果统一称为“动态网络费用估算”。若网关另有未公开的服务加价，必须由网关提供契约或由管理员兜底规则显式承担，不能凭空推断。
- 不修改生产服务器、支付网关、数据库结构、Redis、Legacy EPay、订阅/拼团/代理等其他支付路径。
- 不改变用户到账额度、历史订单结算语义或受保护的项目身份与归属信息。

# Acceptance examples

- A1：对已配置的 TRON/EVM/Solana 资产，服务端在订单创建前调用相应官方 RPC 与受信任价格源，返回带 `source=chain_network_estimate`、原生币费用、结算币种费用、`quoted_at`、`expires_at` 的报价，并把报价冻结到订单。
- A2：TRON 估算包含账户可用 Bandwidth/Energy、链参数燃烧价格及代表性交易上下文；EVM 估算包含 `eth_estimateGas` 与实时 gas/base fee；Solana 估算包含 `getFeeForMessage` 与优先费。缺少必要交易上下文时不得伪造精确值，转入失败/兜底流程。
- A3：动态费用成功时 `total_amount = base_amount + fee_amount`，GMPay 建单使用总金额，`TopUp.Amount` 仍只代表到账额度；Modal 和订单日志标明“动态网络费用估算”，不显示“网关服务费”。
- A4：RPC/价格源超时、响应无效、报价过期、金额/币种/网络不一致、价格偏差或费用超过上限时，未开启兜底的订单 fail-closed，绝不以 `fee_amount=0` 静默成功；开启兜底时才切换为 `admin_fallback` 并可审计。
- A5：人工兜底只在管理员明确启用时生效，支持默认规则及 `TOKEN:network` 覆盖，Modal、后台和日志均显示“人工兜底”，且固定/比例值受最大费用与总额限制。
- A6：网关返回当前官方字段（如 `amount`、`actual_amount`、`expiration_time`）但没有 fee/quote 时，系统不会读取或推断手续费；动态模式按 A4 处理。
- A7：管理员页面不出现原始 JSON 编辑器；结构化控件可新增/删除资产网络覆盖、配置 RPC/价格源/超时/TTL/上限和兜底规则，保存后仍生成兼容的版本化 Option JSON。
- A8：设置页在桌面、390px 窄屏及带安全区的移动视口中，最后一个表单项与底部 footer 不重叠、不贴底、无横向滚动。
- A9：Legacy EPay、Stripe、订阅、拼团、代理预付和历史 GMPay 订单不读取本能力的动态费用配置。

# Constraints and invariants

- 生产基线为创建 change 时的 `origin/main@85b70c869`；实现只在绑定 worktree 中进行，不修改 `secondary-dev` 的 `admin-mobile-h5` 改动。
- 官方资料显示 GMPay 当前没有独立手续费报价契约；动态来源必须是链上估算，网关服务费只能通过未来显式契约或第二层人工兜底表达。
- RPC URL、价格源和代表性交易上下文均为服务器端配置，不能由充值请求覆盖；所有网络调用有限时、有限响应体并经过缓存和重试上限控制。
- 价格源必须白名单化并校验时间戳、精度、最大偏差和异常值；估算结果必须带来源、时间和有效期，不能将过期数据当作新报价。
- 费用和金额使用 `shopspring/decimal` 及既有金额边界；不得产生负数、溢出或因 NaN/Inf 形成负扣款。
- `TopUp.Amount` 表示到账额度，`TopUp.Money` 表示冻结后的总应付金额；回调、幂等和结算不得接受客户端再次提交的费用。
- 所有业务 JSON 使用 `common.Marshal`/`common.Unmarshal`；前端可见文案使用 i18next；不新增数据库列或迁移。

# Decisions

- D1：动态费用来源改为官方链上网络成本估算，不依赖也不等待 GMPay 返回 `fee`、`service_fee` 或 `network_fee`。
- D2：TRON/EVM/Solana 估算器输出的是可审计的网络费用估算，不得命名或展示为网关平台服务费；无法获得真实交易上下文时明确降级。
- D3：管理员固定/比例规则是显式开启的第二优先级兜底，默认关闭；动态估算失败且未开启兜底时 fail-closed。
- D4：费用报价在服务端冻结并绑定资产、网络、基础金额和有效期，订单总额与到账额度分离。
- D5：Option 存储格式保持兼容，管理界面改为结构化表单；布局层统一处理 safe-area。

# Open questions

- [blocking] CONFIRM：请确认以上修订后的最终 Shape：以 TRON/EVM/Solana 官方 RPC + 实时原生币价格计算“动态网络费用估算”为主，不假设 GMPay 有手续费字段；网关未公开的服务加价不伪造，只有管理员显式开启的固定/比例规则作为第二层兜底；估算无法验证且未开启兜底时拒绝建单；同时交付结构化管理表单和设置页底部安全区修复。确认后才进入 Build。

# Verification expectations

- Go：各网络估算器的 RPC 请求/响应校验、超时/缓存/价格偏差、交易上下文缺失、过期/上限、fail-closed 与人工兜底来源；金额冻结、回调、幂等和 Legacy 隔离回归。
- Frontend：结构化表单到版本化 Option JSON 的序列化与校验、费用来源/失败状态 i18n、checkout Modal 金额拆分、safe-area/滚动布局回归。
- 运行受影响 Go 测试、前端聚焦 Vitest、`bun run i18n:sync`、`bun run typecheck`、`bun run build`、目标格式化/lint 和 `git diff --check`；Build 后由独立只读 Verifier 按 A1-A9 逐项验收。

# Official research sources

资料于 2026-09-01 通过 Fathom Search 发现并以 Jina Reader 阅读原文；关键结论均以官方一手文档/源码为准：

- EPUSDT/GM Pay 官方仓库与 API：<https://github.com/GMWalletApp/epusdt>、<https://github.com/GMWalletApp/epusdt/blob/master/wiki/API.md>。当前建单响应包含 `amount`、`actual_amount`、`token`、`network`、`expiration_time` 等，没有独立 fee/quote 字段；源码按 `pay amount × rate` 计算代币数量。
- TRON 官方资源模型与估算接口：<https://developers.tron.network/docs/resource-model>、<https://developers.tron.network/reference/estimateenergy>、<https://developers.tron.network/docs/bandwidth-and-energy>。费用取决于 Bandwidth、Energy、账户资源和链参数，`fee_limit` 只是上限。
- Ethereum 官方 Gas 与交易文档：<https://ethereum.org/developers/docs/gas>、<https://ethereum.org/developers/docs/transactions>、<https://eips.ethereum.org/EIPS/eip-1559>。Gas 成本由 gas used 与动态 gas/base/priority fee 构成，可用 `eth_estimateGas` 配合实时费率。
- BNB Smart Chain 官方 JSON-RPC/概览：<https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint>、<https://docs.bnbchain.org/bnb-smart-chain/overview>。BSC 兼容 EVM JSON-RPC，需使用 `eth_estimateGas` 等实时方法并遵守 RPC 速率限制。
- Solana 官方费用与 RPC：<https://solana.com/docs/core/fees>、<https://solana.com/docs/rpc/http/getfeeformessage>。基础签名费和 prioritization fee 以 SOL 支付，特定 message 的费用应通过 `getFeeForMessage` 获取。
