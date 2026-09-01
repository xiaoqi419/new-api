---
generated_from_state_version: 19
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 4
- Verifier attempt: 1
- Completed: 2026-09-01T16:47:52.460Z
- Summary: 独立只读 Verifier 确认 A1-A86 全部通过。A54 已修复：RPC 远端错误文本不再传播到错误或日志，采用固定错误分类与安全方法标签；Runtime 仅执行了本轮受影响的聚焦 Go 回归测试、gofmt 和 diff check，未重复已通过检查，也未运行全量测试。未修改文件或外部系统。

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1：对已配置的 TRON/EVM/Solana 资产，服务端在订单创建前调用相应官方 RPC 与受信任价格源，返回带 `source=chain_network_estimate`、原生币费用、结算币种费用、`quoted_at`、`expires_at` 的报价，并把报价冻结到订单。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A2 | passed | brief.md | A2：TRON 估算包含账户可用 Bandwidth/Energy、链参数燃烧价格及代表性交易上下文；EVM 估算包含 `eth_estimateGas` 与实时 gas/base fee；Solana 估算包含 `getFeeForMessage` 与优先费。缺少必要交易上下文时不得伪造精确值，转入失败/兜底流程。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A3 | passed | brief.md | A3：动态费用成功时 `total_amount = base_amount + fee_amount`，GMPay 建单使用总金额，`TopUp.Amount` 仍只代表到账额度；Modal 和订单日志标明“动态网络费用估算”，不显示“网关服务费”。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A4 | passed | brief.md | A4：RPC/价格源超时、响应无效、报价过期、金额/币种/网络不一致、价格偏差或费用超过上限时，未开启兜底的订单 fail-closed，绝不以 `fee_amount=0` 静默成功；开启兜底时才切换为 `admin_fallback` 并可审计。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A5 | passed | brief.md | A5：人工兜底只在管理员明确启用时生效，支持默认规则及 `TOKEN:network` 覆盖，Modal、后台和日志均显示“人工兜底”，且固定/比例值受最大费用与总额限制。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A6 | passed | brief.md | A6：网关返回当前官方字段（如 `amount`、`actual_amount`、`expiration_time`）但没有 fee/quote 时，系统不会读取或推断手续费；动态模式按 A4 处理。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A7 | passed | brief.md | A7：管理员页面不出现原始 JSON 编辑器；结构化控件可新增/删除资产网络覆盖、配置 RPC/价格源/超时/TTL/上限和兜底规则，保存后仍生成兼容的版本化 Option JSON。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A8 | passed | brief.md | A8：设置页在桌面、390px 窄屏及带安全区的移动视口中，最后一个表单项与底部 footer 不重叠、不贴底、无横向滚动。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A9 | passed | brief.md | A9：Legacy EPay、Stripe、订阅、拼团、代理预付和历史 GMPay 订单不读取本能力的动态费用配置。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A10 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `base_amount`：用户购买的充值额度对应的站点结算金额，决定最终到账额度。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A11 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `fee_amount`：为了覆盖网络资源而向用户加收的金额，必须带来源和有效期。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A12 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `total_amount`：用户实际支付的法币金额，严格等于 `base_amount + fee_amount`。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A13 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `native_fee`：链上实际计费的原生币数量（TRX、ETH/BNB/MATIC、SOL 等）。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A14 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `chain_network_estimate`：依据官方 RPC、实时链参数和价格源得到的网络费用估算，不代表 GMPay 的平台服务费。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A15 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `admin_fallback`：管理员显式启用的固定金额或百分比兜底；它不是动态报价，必须在用户界面和日志中明确标记。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A16 | passed | specs/gmpay-dynamic-fee-settings/spec.md | EPUSDT/GMPay 当前公开 API 没有独立 `fee`、`service_fee`、`network_fee` 或 quote endpoint。`actual_amount` 只是按网关汇率换算后的加密货币支付数量，不能用于反推手续费。系统不得等待、猜测或兼容一个不存在的网关手续费字段。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A17 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 订单费用解析顺序固定为： | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A18 | passed | specs/gmpay-dynamic-fee-settings/spec.md | **链上动态估算**：按 `token + network` 选择估算器，查询实时链上数据并返回 `chain_network_estimate`； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A19 | passed | specs/gmpay-dynamic-fee-settings/spec.md | **管理员人工兜底**：仅当管理员开关明确启用且动态估算失败/缺少交易上下文时，应用 `admin_fallback` 规则； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A20 | passed | specs/gmpay-dynamic-fee-settings/spec.md | **拒绝建单**：以上均不可用时 fail-closed，不生成手续费为 0 的“成功”订单。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A21 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 估算器可以报告经验证的零费用（例如账户拥有足够的免费 Bandwidth 或资源委托），但必须带有 RPC 证据、时间戳和 `subsidized=true` 标记；空响应、超时或未知状态不能被当作零费用。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A22 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 服务端定义内部统一接口（名称可在实现中按项目风格调整）： | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A23 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `EstimateInput` 至少包含： | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A24 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 资产：`token`、`network`、结算币种、基础金额； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A25 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 代表性归集交易上下文：发送方/付款方、收款方、token 合约或 mint、调用 data/message、是否批量； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A26 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 当前站点配置的 RPC 和价格源引用（用户请求不可覆盖）。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A27 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `NetworkFeeQuote` 至少包含： | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A28 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `source = chain_network_estimate`； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A29 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `native_asset`、`native_amount`、`fee_amount`、`settlement_currency`； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A30 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `quoted_at`、`expires_at`、估算器版本和置信度/`subsidized` 标记； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A31 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 受控的证据摘要（RPC 方法、区块/slot、gas/energy/lamports 数量），不包含密钥。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A32 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 所有数值用 decimal 解析和计算；费用必须非负且不超过 `max_fee`、`max_total` 和系统绝对上限。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A33 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 针对 TRC-20 USDT/USDC 或 TRX： | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A34 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 查询代表性发送账户的 Bandwidth/Energy（`wallet/getaccountresource` 或等价官方 RPC）； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A35 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 查询链参数（`wallet/getchainparameters`）中的 Energy/Bandwidth 燃烧价格； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A36 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 对智能合约转账，在提供真实合约、发送方、收款方和 calldata 时调用 `wallet/estimateenergy` 或 `triggerconstantcontract`； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A37 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 计算资源缺口对应的 TRX，再使用白名单价格源换算结算币种。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A38 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `fee_limit` 仅是交易上限，不能当作实际手续费。缺少代表性交易上下文或网关资源委托信息时，返回“无法可靠估算”，交给兜底/拒绝流程，不用固定常数冒充动态结果。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A39 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 针对 ERC-20 转账： | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A40 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 构造受控的 `transfer`/归集交易（真实 `from`、token 合约、`to` 和 calldata）； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A41 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 调用网络 JSON-RPC `eth_estimateGas`； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A42 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 读取 `eth_feeHistory`/最新区块 base fee、`eth_gasPrice` 和可用 priority fee，按网络规则计算 gas 单价； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A43 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 以原生币价格换算为结算币种。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A44 | passed | specs/gmpay-dynamic-fee-settings/spec.md | BSC 与 Ethereum 使用同一 EVM 适配器，但 RPC endpoint、原生币和价格源分别配置。不能把文档示例中的固定低费率当作实时结果。若交易 `from`、合约或 calldata 未配置，估算失败并进入兜底/拒绝流程。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A45 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 针对 SPL USDT/USDC： | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A46 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 构造与实际归集相同的受控 transaction message（payer、账户、mint、transfer 指令）； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A47 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 调用 `getFeeForMessage` 获取基础签名费用； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A48 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 若启用优先费，读取/计算 prioritization fee 并叠加； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A49 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 费用以 SOL 表示，再通过白名单价格源换算为结算币种。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A50 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 只知道收款地址而没有 payer/message 时不得用固定 lamports 值宣称精确动态费用。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A51 | passed | specs/gmpay-dynamic-fee-settings/spec.md | RPC endpoint 和价格源只能来自服务器环境或管理员保存的白名单配置；充值请求不得传入 URL。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A52 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 每次请求必须有连接/读取超时、响应体大小上限、最大重试次数和缓存 TTL；缓存键至少包含网络、方法和交易上下文摘要。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A53 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 价格源响应必须校验 HTTPS/主机白名单、时间戳、精度、数量范围和相对偏差；多源不一致超过阈值时失败，不取任意一条静默继续。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A54 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 日志只记录脱敏的 endpoint 名称、请求方法、耗时、区块/slot 和错误分类，不记录 token、密钥或完整 calldata。 | 通过：远端 JSON-RPC error.message 被完全忽略，数值错误码映射为固定分类，方法标签受安全标识符约束；正常 checkout 日志使用通用错误，未暴露 token、凭据、URL、地址或 calldata。 |
| A55 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 充值请求只提交基础额度和已启用的资产/网络 selector；服务端解析并校验金额边界。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A56 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 服务端调用动态估算器，或在失败且开关开启时计算人工兜底。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A57 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 生成服务端 quote，绑定 `token + network + base_amount + source + quoted_at + expires_at`，并保存到现有受控订单扩展字段或短期服务端缓存；不能把未签名的 quote 元数据放入客户端可控字段。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A58 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 写入订单：`TopUp.Amount` 仍为到账额度，`TopUp.Money` 为冻结后的 `total_amount`。GMPay 建单请求的 `amount` 使用 `total_amount`，但不改变网关的 `actual_amount` 语义。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A59 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 回调按订单中冻结的金额、资产、网络和 quote binding 做一致性/幂等校验；回调不能重新接受客户端费用，也不能把动态估算当作实际链上扣款证明。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A60 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 报价过期、校验失败或建单异常时，不留下可支付的 pending 订单；已创建的占位订单按既有回收逻辑处理。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A61 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `GMPayFeeConfig` 继续以版本化 Option JSON 存储，结构化 schema 包含： | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A62 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `dynamic_enabled`、估算器模式、RPC/价格源引用、超时和缓存 TTL； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A63 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `fallback_enabled`、`fallback_mode`（`fixed`/`percent`）、默认值； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A64 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `overrides`：规范化的 `TOKEN:network` 到规则映射； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A65 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `max_fee`、`max_total`、价格偏差与报价有效期上限。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A66 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 旧版 `enabled/default/overrides/max_fee/max_total` 读取保持兼容；迁移时不得覆盖已有配置。兜底默认关闭，只有 Root 管理员显式保存后才可使用。所有兜底报价的 `source` 必须是 `admin_fallback`，并在 Modal、后台、订单日志显示“人工兜底”。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A67 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 支付设置页禁止原始 JSON 编辑器，提供： | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A68 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 动态估算开关和估算模式说明； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A69 | passed | specs/gmpay-dynamic-fee-settings/spec.md | RPC/价格源的受信任配置选择、超时、缓存/有效期和上限输入框； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A70 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 代表性归集交易上下文（按网络显示必要字段）的输入框； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A71 | passed | specs/gmpay-dynamic-fee-settings/spec.md | “估算失败时启用人工兜底”开关、固定/百分比输入框； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A72 | passed | specs/gmpay-dynamic-fee-settings/spec.md | USDT/USDC 与网络覆盖规则的新增、编辑、删除控件； | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A73 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 保存前的字段校验、敏感字段掩码和“网络费用估算 ≠ 网关服务费”提示。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A74 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 表单提交时由前端生成受控版本化 JSON，后端再次严格解析；保存失败不得影响其他支付设置。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A75 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 当动态报价可用时显示： | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A76 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 当使用兜底时，将同一行标为“人工兜底”；当两者均不可用时显示可重试错误，不打开支付二维码或跳转到网关页面。二维码/地址仍使用网关返回的 `actual_amount`、`receive_address`，不得把它们解释为费用。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A77 | passed | specs/gmpay-dynamic-fee-settings/spec.md | `SectionPageLayout` 的滚动容器保持 `overflow-auto`，底部 padding 使用 `calc(env(safe-area-inset-bottom, 0px) + <minimum spacing>)`；footer 额外保留同等安全区。验证 390px 窄屏、桌面和带刘海/手势条视口，确保最后一项可完整滚动、footer 不覆盖内容且无横向滚动。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A78 | passed | specs/gmpay-dynamic-fee-settings/spec.md | Legacy EPay、Stripe、Creem、Waffo、订阅、拼团、代理预付和历史 GMPay 订单维持原协议与结算。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A79 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 不新增数据库列或迁移，不重启/修改线上数据库、Redis 或支付网关。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A80 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 不修改用户到账额度和历史订单的实际结算值。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A81 | passed | specs/gmpay-dynamic-fee-settings/spec.md | 不把未公开的 GMPay 平台加价当成可观测的链上费用；若将来需要精确覆盖该加价，必须增加网关端受鉴权的报价契约，再另行变更规格。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A82 | passed | specs/gmpay-dynamic-fee-settings/spec.md | GMPay/EPUSDT：<https://github.com/GMWalletApp/epusdt>、<https://github.com/GMWalletApp/epusdt/blob/master/wiki/API.md>。公开建单接口仅定义金额、币种、网络、`actual_amount`、地址、状态和过期时间，没有手续费字段或费用报价接口。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A83 | passed | specs/gmpay-dynamic-fee-settings/spec.md | TRON：<https://developers.tron.network/docs/resource-model>、<https://developers.tron.network/docs/bandwidth-and-energy>、<https://developers.tron.network/reference/estimateenergy>。资源消耗由 Bandwidth/Energy、账户资源与链参数决定。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A84 | passed | specs/gmpay-dynamic-fee-settings/spec.md | Ethereum：<https://ethereum.org/developers/docs/gas>、<https://ethereum.org/developers/docs/transactions>、<https://eips.ethereum.org/EIPS/eip-1559>。动态 gas/base/priority fee 与估算 gas 共同决定成本。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A85 | passed | specs/gmpay-dynamic-fee-settings/spec.md | BSC：<https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint>、<https://docs.bnbchain.org/bnb-smart-chain/overview>。兼容 EVM JSON-RPC，需使用实时估算并遵守 endpoint 限制。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |
| A86 | passed | specs/gmpay-dynamic-fee-settings/spec.md | Solana：<https://solana.com/docs/core/fees>、<https://solana.com/docs/rpc/http/getfeeformessage>。基础签名费和 prioritization fee 以 SOL 计，具体 message 通过 `getFeeForMessage` 查询。 | 通过：独立只读验收结合当前实现与 Runtime 已通过的增量检查确认符合该验收项。 |

## Checks

| Check | Command | Working directory | Status | Exit | Duration |
| --- | --- | --- | --- | ---: | ---: |
| A54 JSON-RPC sanitization and adjacent EVM regression tests | test -count=1 ./service -run ^(TestConfiguredNetworkFeeEstimatorSanitizesJSONRPCErrorMessage\|TestConfiguredNetworkFeeEstimatorEVMGasAndPrice)$ | . | passed | 0 | 3527 ms |
| A54 changed Go files formatting | -NoProfile -Command $files = @('service/gmpay_network_fee.go','service/gmpay_network_fee_estimator_test.go'); $output = gofmt -d $files; if ($LASTEXITCODE -ne 0) { $output; exit $LASTEXITCODE }; if ($output) { $output; exit 1 } | . | passed | 0 | 184 ms |
| A54 repository diff check | diff --check | . | passed | 0 | 87 ms |

## Blockers

_None._

## Risks and skipped work

- 完整 go test ./... 仍受既有 web/classic/dist embed 前置缺失阻塞，未重复执行。
- 完整前端 format:check 仍受既有 web/classic/node_modules/tailwindcss/theme.css 前置缺失阻塞，未重复执行。
- 未来若新增直接记录底层 HTTP transport error 的调用方，应沿用现有脱敏错误边界。

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | fail | A3, A5, A36, A46, A53, A70, A73 | Independent read-only verification passes the focused backend/frontend checks and most acceptance items, but fails A3, A5, A36, A46, A53, A70, and A73 for order-log provenance, complete TRON/Solana context handling, multi-source price validation, and sensitive-field masking. No files or external systems were modified. | 2026-09-01T13:10:49.000Z |
| 1 | 2 | 1 | fail | A1, A3, A40, A53, A75 | 独立只读验收完成。大部分功能和聚焦检查通过，但多源报价在前端解析处存在端到端回归，且 EVM ERC-20 calldata 未充分绑定，故本轮不通过；无 blocked acceptance。未修改文件、Git 状态或外部系统。 | 2026-09-01T14:29:59.760Z |
| 1 | 3 | 1 | execution-error | — | Native Verifier response was invalid: Native verification cannot pass before every required check succeeds | 2026-09-01T15:18:46.627Z |
| 1 | 3 | 2 | fail | A54 | 独立只读复核：A1-A53、A55-A86 通过；A54 因 RPC error.message 未脱敏日志路径失败。未重复执行已通过检查，未运行全量测试。 | 2026-09-01T16:27:12.823Z |
| 1 | 4 | 1 | pass | — | 独立只读 Verifier 确认 A1-A86 全部通过。A54 已修复：RPC 远端错误文本不再传播到错误或日志，采用固定错误分类与安全方法标签；Runtime 仅执行了本轮受影响的聚焦 Go 回归测试、gofmt 和 diff check，未重复已通过检查，也未运行全量测试。未修改文件或外部系统。 | 2026-09-01T16:47:52.460Z |

## Conclusion

独立只读 Verifier 确认 A1-A86 全部通过。A54 已修复：RPC 远端错误文本不再传播到错误或日志，采用固定错误分类与安全方法标签；Runtime 仅执行了本轮受影响的聚焦 Go 回归测试、gofmt 和 diff check，未重复已通过检查，也未运行全量测试。未修改文件或外部系统。
