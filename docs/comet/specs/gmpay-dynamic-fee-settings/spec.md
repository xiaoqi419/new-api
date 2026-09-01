# GMPay 动态链上网络费用与结构化设置

## 1. 术语与边界

- `base_amount`：用户购买的充值额度对应的站点结算金额，决定最终到账额度。
- `fee_amount`：为了覆盖网络资源而向用户加收的金额，必须带来源和有效期。
- `total_amount`：用户实际支付的法币金额，严格等于 `base_amount + fee_amount`。
- `native_fee`：链上实际计费的原生币数量（TRX、ETH/BNB/MATIC、SOL 等）。
- `chain_network_estimate`：依据官方 RPC、实时链参数和价格源得到的网络费用估算，不代表 GMPay 的平台服务费。
- `admin_fallback`：管理员显式启用的固定金额或百分比兜底；它不是动态报价，必须在用户界面和日志中明确标记。

EPUSDT/GMPay 当前公开 API 没有独立 `fee`、`service_fee`、`network_fee` 或 quote endpoint。`actual_amount` 只是按网关汇率换算后的加密货币支付数量，不能用于反推手续费。系统不得等待、猜测或兼容一个不存在的网关手续费字段。

## 2. 费用来源优先级

订单费用解析顺序固定为：

1. **链上动态估算**：按 `token + network` 选择估算器，查询实时链上数据并返回 `chain_network_estimate`；
2. **管理员人工兜底**：仅当管理员开关明确启用且动态估算失败/缺少交易上下文时，应用 `admin_fallback` 规则；
3. **拒绝建单**：以上均不可用时 fail-closed，不生成手续费为 0 的“成功”订单。

估算器可以报告经验证的零费用（例如账户拥有足够的免费 Bandwidth 或资源委托），但必须带有 RPC 证据、时间戳和 `subsidized=true` 标记；空响应、超时或未知状态不能被当作零费用。

## 3. 动态估算器契约

服务端定义内部统一接口（名称可在实现中按项目风格调整）：

```text
Estimate(ctx, EstimateInput) -> (NetworkFeeQuote, error)
```

`EstimateInput` 至少包含：

- 资产：`token`、`network`、结算币种、基础金额；
- 代表性归集交易上下文：发送方/付款方、收款方、token 合约或 mint、调用 data/message、是否批量；
- 当前站点配置的 RPC 和价格源引用（用户请求不可覆盖）。

`NetworkFeeQuote` 至少包含：

- `source = chain_network_estimate`；
- `native_asset`、`native_amount`、`fee_amount`、`settlement_currency`；
- `quoted_at`、`expires_at`、估算器版本和置信度/`subsidized` 标记；
- 受控的证据摘要（RPC 方法、区块/slot、gas/energy/lamports 数量），不包含密钥。

所有数值用 decimal 解析和计算；费用必须非负且不超过 `max_fee`、`max_total` 和系统绝对上限。

### 3.1 TRON

针对 TRC-20 USDT/USDC 或 TRX：

1. 查询代表性发送账户的 Bandwidth/Energy（`wallet/getaccountresource` 或等价官方 RPC）；
2. 查询链参数（`wallet/getchainparameters`）中的 Energy/Bandwidth 燃烧价格；
3. 对智能合约转账，在提供真实合约、发送方、收款方和 calldata 时调用 `wallet/estimateenergy` 或 `triggerconstantcontract`；
4. 计算资源缺口对应的 TRX，再使用白名单价格源换算结算币种。

`fee_limit` 仅是交易上限，不能当作实际手续费。缺少代表性交易上下文或网关资源委托信息时，返回“无法可靠估算”，交给兜底/拒绝流程，不用固定常数冒充动态结果。

### 3.2 Ethereum、BSC 及其他 EVM 网络

针对 ERC-20 转账：

1. 构造受控的 `transfer`/归集交易（真实 `from`、token 合约、`to` 和 calldata）；
2. 调用网络 JSON-RPC `eth_estimateGas`；
3. 读取 `eth_feeHistory`/最新区块 base fee、`eth_gasPrice` 和可用 priority fee，按网络规则计算 gas 单价；
4. 以原生币价格换算为结算币种。

BSC 与 Ethereum 使用同一 EVM 适配器，但 RPC endpoint、原生币和价格源分别配置。不能把文档示例中的固定低费率当作实时结果。若交易 `from`、合约或 calldata 未配置，估算失败并进入兜底/拒绝流程。

### 3.3 Solana

针对 SPL USDT/USDC：

1. 构造与实际归集相同的受控 transaction message（payer、账户、mint、transfer 指令）；
2. 调用 `getFeeForMessage` 获取基础签名费用；
3. 若启用优先费，读取/计算 prioritization fee 并叠加；
4. 费用以 SOL 表示，再通过白名单价格源换算为结算币种。

只知道收款地址而没有 payer/message 时不得用固定 lamports 值宣称精确动态费用。

## 4. RPC 与价格源安全

- RPC endpoint 和价格源只能来自服务器环境或管理员保存的白名单配置；充值请求不得传入 URL。
- 每次请求必须有连接/读取超时、响应体大小上限、最大重试次数和缓存 TTL；缓存键至少包含网络、方法和交易上下文摘要。
- 价格源响应必须校验 HTTPS/主机白名单、时间戳、精度、数量范围和相对偏差；多源不一致超过阈值时失败，不取任意一条静默继续。
- 日志只记录脱敏的 endpoint 名称、请求方法、耗时、区块/slot 和错误分类，不记录 token、密钥或完整 calldata。

## 5. 报价冻结与订单流程

1. 充值请求只提交基础额度和已启用的资产/网络 selector；服务端解析并校验金额边界。
2. 服务端调用动态估算器，或在失败且开关开启时计算人工兜底。
3. 生成服务端 quote，绑定 `token + network + base_amount + source + quoted_at + expires_at`，并保存到现有受控订单扩展字段或短期服务端缓存；不能把未签名的 quote 元数据放入客户端可控字段。
4. 写入订单：`TopUp.Amount` 仍为到账额度，`TopUp.Money` 为冻结后的 `total_amount`。GMPay 建单请求的 `amount` 使用 `total_amount`，但不改变网关的 `actual_amount` 语义。
5. 回调按订单中冻结的金额、资产、网络和 quote binding 做一致性/幂等校验；回调不能重新接受客户端费用，也不能把动态估算当作实际链上扣款证明。
6. 报价过期、校验失败或建单异常时，不留下可支付的 pending 订单；已创建的占位订单按既有回收逻辑处理。

## 6. 人工兜底规则

`GMPayFeeConfig` 继续以版本化 Option JSON 存储，结构化 schema 包含：

- `dynamic_enabled`、估算器模式、RPC/价格源引用、超时和缓存 TTL；
- `fallback_enabled`、`fallback_mode`（`fixed`/`percent`）、默认值；
- `overrides`：规范化的 `TOKEN:network` 到规则映射；
- `max_fee`、`max_total`、价格偏差与报价有效期上限。

旧版 `enabled/default/overrides/max_fee/max_total` 读取保持兼容；迁移时不得覆盖已有配置。兜底默认关闭，只有 Root 管理员显式保存后才可使用。所有兜底报价的 `source` 必须是 `admin_fallback`，并在 Modal、后台、订单日志显示“人工兜底”。

## 7. 管理员 UI

支付设置页禁止原始 JSON 编辑器，提供：

- 动态估算开关和估算模式说明；
- RPC/价格源的受信任配置选择、超时、缓存/有效期和上限输入框；
- 代表性归集交易上下文（按网络显示必要字段）的输入框；
- “估算失败时启用人工兜底”开关、固定/百分比输入框；
- USDT/USDC 与网络覆盖规则的新增、编辑、删除控件；
- 保存前的字段校验、敏感字段掩码和“网络费用估算 ≠ 网关服务费”提示。

表单提交时由前端生成受控版本化 JSON，后端再次严格解析；保存失败不得影响其他支付设置。

## 8. 充值 Modal

当动态报价可用时显示：

```text
充值额度             base_amount
动态网络费用估算     fee_amount（native_amount native_asset）
应付总额              total_amount
报价有效期            expires_at
资产/网络              token / network
```

当使用兜底时，将同一行标为“人工兜底”；当两者均不可用时显示可重试错误，不打开支付二维码或跳转到网关页面。二维码/地址仍使用网关返回的 `actual_amount`、`receive_address`，不得把它们解释为费用。

## 9. 设置页安全区

`SectionPageLayout` 的滚动容器保持 `overflow-auto`，底部 padding 使用 `calc(env(safe-area-inset-bottom, 0px) + <minimum spacing>)`；footer 额外保留同等安全区。验证 390px 窄屏、桌面和带刘海/手势条视口，确保最后一项可完整滚动、footer 不覆盖内容且无横向滚动。

## 10. 兼容性与非目标

- Legacy EPay、Stripe、Creem、Waffo、订阅、拼团、代理预付和历史 GMPay 订单维持原协议与结算。
- 不新增数据库列或迁移，不重启/修改线上数据库、Redis 或支付网关。
- 不修改用户到账额度和历史订单的实际结算值。
- 不把未公开的 GMPay 平台加价当成可观测的链上费用；若将来需要精确覆盖该加价，必须增加网关端受鉴权的报价契约，再另行变更规格。

## 11. 官方依据（2026-09-01 核对）

- GMPay/EPUSDT：<https://github.com/GMWalletApp/epusdt>、<https://github.com/GMWalletApp/epusdt/blob/master/wiki/API.md>。公开建单接口仅定义金额、币种、网络、`actual_amount`、地址、状态和过期时间，没有手续费字段或费用报价接口。
- TRON：<https://developers.tron.network/docs/resource-model>、<https://developers.tron.network/docs/bandwidth-and-energy>、<https://developers.tron.network/reference/estimateenergy>。资源消耗由 Bandwidth/Energy、账户资源与链参数决定。
- Ethereum：<https://ethereum.org/developers/docs/gas>、<https://ethereum.org/developers/docs/transactions>、<https://eips.ethereum.org/EIPS/eip-1559>。动态 gas/base/priority fee 与估算 gas 共同决定成本。
- BSC：<https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint>、<https://docs.bnbchain.org/bnb-smart-chain/overview>。兼容 EVM JSON-RPC，需使用实时估算并遵守 endpoint 限制。
- Solana：<https://solana.com/docs/core/fees>、<https://solana.com/docs/rpc/http/getfeeformessage>。基础签名费和 prioritization fee 以 SOL 计，具体 message 通过 `getFeeForMessage` 查询。
