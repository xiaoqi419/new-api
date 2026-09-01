# GMPay 自动费用接线与免配置充值

## 1. 目标与用户可见行为

GMPay/EPUSDT Native 钱包充值无需管理员手工填写链底层参数。系统从已配置的 GMPay 连接和 EPUSDT 运行环境自动同步可用资产，并在建单前估算代表性归集/结算操作的链上网络成本。用户实际支付金额为购买额度加动态网络成本估算，到账额度不因费用增加。该估算不是 GMPay/EPUSDT 平台服务费；官方 EPUSDT 没有 fee/gas quote 或 sweep API，不能据此声称网关实际账单。

示例：用户购买 30.00 美元额度，当前归集估算为 0.80 美元，则支付总额为 30.80 美元，账户只增加 30.00 美元对应额度。

## 2. 自动发现契约

### 2.1 来源优先级

1. GMPay/EPUSDT 已配置的网关地址、商户 ID、密钥和公开 `supported_assets` 能力。公开配置只确认资产是否启用，不提供手续费或 sweep 数据。
2. 若部署提供机器对机器认证的 EPUSDT 私有 context，则读取其受控 RPC、token 合约/mint、归集目标和链参数；该 context 不能从浏览器或用户请求传入，也不是官方公共 API 的既有保证。
3. 私有 context 不存在、不可达、结构不完整或无法产出有效 quote 时，回退到 New API 内置的闭集网络/token 预设。预设拥有固定的公开 RPC/价格源白名单和代表性 transfer context，不要求管理员填写底层参数。
4. 从服务器端白名单 RPC/价格源读取当前 gas、Energy、Bandwidth、lamports 和原生币价格；观察结果必须带时间、TTL 和脱敏来源证据。

若私有 context 和内置预设均不能安全取得有效数据，自动估算必须报告“无法可靠估算”并失败关闭，而不是要求用户填写秘密参数、把 `actual_amount` 当费用或返回固定零费用。只有显式人工 fallback 才能继续建单。

### 2.2 默认策略

自动估算在 GMPay Native 普通钱包充值路径默认开启。管理员界面只提供自动同步状态、最近一次估算、测试估算和可选人工兜底，不显示原始 JSON、RPC URL、价格源、合约、calldata、私钥或完整地址编辑器。固定超时、缓存、重试、价格年龄和费用上限使用代码内安全默认值，并允许部署级环境变量覆盖但不要求后台配置。

## 3. 费用口径与估算

`fee_amount` 严格表示服务器对代表性归集/结算操作的链上网络成本估算。私有 context 可在存在时提高与网关真实操作的相关性，但没有 sweep API 时仍不能宣称是 GMPay 平台服务费或实际结算账单。用户付款交易的发送地址、资源和余额在建单时未知，因此不估算用户钱包自身的转账成本。

当前内置预设的能力边界如下：

| 网络 | 预设处理 | 资产与限制 |
| --- | --- | --- |
| TRON / TRC-20 | 读取 chain parameters，并尝试 Energy 模拟；模拟因合成账户余额/资源失败时使用受控代表性 Energy `65000` 与 Bandwidth `345`，再乘当前 TRX 价格。 | 仅 USDT/USDC 的已登记合约；代表性单位是网络成本 fallback，不是 GMPay 服务费或真实 sweep 金额。 |
| Ethereum / ERC-20 | 优先 `eth_estimateGas`；合成账户被拒时使用受控代表性 gas `65000`，并读取 `eth_gasPrice`/`eth_feeHistory` 与 ETH 价格。 | 仅内置 USDT/USDC 合约；不支持任意 ERC-20。 |
| BSC / BEP-20（规范名 `binance`） | 与 EVM 相同：优先 `eth_estimateGas`，失败时使用代表性 gas `65000`，读取 BNB gas price/fee history 和价格。 | 仅内置 USDT/USDC 合约；不支持任意 BEP-20。 |
| Solana / SPL | 每次先调用 `getLatestBlockhash` 重建代表性 `transferChecked` message，再调用 `getFeeForMessage`；报价证据记录 blockhash 查询方法和 slot。 | 仅内置 USDT/USDC mint；无法取得最新 blockhash 或 fee query 时失败关闭。 |

EVM/TRON 的代表性 gas/Energy/Bandwidth 单位只是在精确模拟不可用时的受控 fallback；它们不构成 GMPay 平台服务费。所有预设都必须同时取得有效链上资源数据和新鲜原生币价格，否则不得生成 quote。

Polygon/Matic、其他未列出的 L1/L2、任意未登记 token、用户个人付款转账，以及任何无法构造代表性交易或取得价格证据的组合均不支持；不支持时没有隐式链或 token 回退。

估算结果包含：`chain_network_estimate` 来源（私有 context 或具体 builtin preset）、原生币数量、结算币种、报价/过期时间、估算器版本、置信度和脱敏 RPC/价格证据。Solana 证据至少包含最新 blockhash 查询与 fee query；EVM/TRON 证据必须说明实际模拟方法或使用了代表性单位。不能从 `actual_amount`、订单汇率或未公开网关字段反推网络费。

## 4. 订单金额与结算

- `base_amount`：站点货币下用户购买的额度费。
- `fee_amount`：自动估算的代表性网关归集/结算网络成本；不等于 GMPay 平台服务费。
- `total_amount`：严格为两者之和，按既有货币精度向下舍入并受上限约束。
- `TopUp.Amount`：保持原额度换算，不能包含手续费。
- `TopUp.Money`、GMPay 建单金额和回调金额校验：使用冻结的 `total_amount`。

报价绑定 `token + network + base_amount + source + quoted_at + expires_at`。报价过期、资产不匹配、金额不一致或回调重复时拒绝入账/保持幂等。私有 context 与内置预设均不可用时，不创建可支付订单；只有人工兜底已显式开启并在订单/界面中标注为人工兜底时才可继续。

## 5. 安全和兼容性

- API key、商户密钥、私钥、完整钱包地址和交易原文只留在服务端；日志仅记录脱敏 endpoint 标识、RPC 方法、耗时、区块/slot 和错误分类。
- 所有外部请求有连接/读取超时、响应体上限、有限重试、短期缓存和主机白名单；价格时间戳、精度、范围及跨源偏差必须校验。私有 discovery 失败后只允许回退到内置白名单预设。
- 所有金额用 decimal 和现有安全边界，禁止负费、NaN、Inf、溢出和重复加费。
- 不新增数据库列或迁移；SQLite、MySQL 5.7.8+、PostgreSQL 9.6+ 继续兼容。
- Legacy EPay、订阅、拼团、代理预充值、历史 GMPay 订单和其他网关维持原协议。

## 6. 管理员与用户界面

设置页展示：

- 自动费用估算：已启用/不可用及原因；
- EPUSDT 同步状态、支持的币种/网络和最近估算时间；
- “立即测试估算”按钮及脱敏结果；
- “估算失败时允许人工兜底”开关（默认关闭）与固定/比例输入框；
- 明确提示“链上网络费估算不等于 GMPay 平台服务费”。

充值 Modal 展示基础额度、动态网络费（含原生币数量）、应付总额、报价有效期、资产/网络和二维码。动态报价不可用时显示可重试错误，不打开无效支付页面。

## 7. 验收标准

- A1–A8 以 change brief 为准，且每项均需有自动化检查或可复现的本地手工证据。
- 不修改生产服务器、生产数据库、Redis 或 EPUSDT 数据；只验证本地工作区。

## 8. 已确认的产品决定

本规格中的“手续费”固定指代表性归集/结算操作的链上网络成本估算，不是 GMPay/EPUSDT 平台服务费。官方 EPUSDT 不提供 fee/gas quote 或 sweep API；私有 context 可选且优先，缺失时使用内置 TRON、Ethereum、BSC、Solana 预设，预设不可用则失败关闭（仅显式人工 fallback 可继续）。用户个人钱包转入时的未知 gas/resource 成本不作为本系统的收费依据。
