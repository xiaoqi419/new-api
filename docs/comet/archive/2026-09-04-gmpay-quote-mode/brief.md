# Outcome

管理员用一个全局开关为全部 GMPay Native 动态网络（TRON、Ethereum、BSC、Solana）选择：只模拟、只经验用量、或模拟失败后再经验用量。默认仍是模拟失败再经验。界面不再写成「仅 TRON」。已保存的 `tron_quote_mode` 继续可读。

# Scope

- 配置字段 `quote_mode`：`simulate` | `empirical` | `simulate_then_empirical`。缺省与旧 `tron_quote_mode` 映射到同一套值。
- 设置页标题为「报价策略」，三种选项作用于全部支持网络。
- TRON：模拟 = estimateenergy/triggerconstantcontract；经验 = 64285 energy + 345 bandwidth × 实时单价。
- Ethereum/BSC：模拟 = eth_estimateGas；经验 = 65000 gas × 实时 gas price。
- Solana：模拟 = getFeeForMessage；经验 = 5000 lamports。
- 管理员固定/比例 USD 兜底仍是动态层全部失败后的最后一层。

# Non-goals

- 不按地址是否首次持有代币自动切 1x/2x。
- 不改管理员 USD 兜底公式。
- 不改数据库 schema。

# Acceptance examples

- A1: 旧配置只有 `tron_quote_mode=empirical` 时，ETH/BSC/Solana/TRON 都按经验用量报价。
- A2: `quote_mode=simulate` 时，各链模拟失败不再用经验用量；管理员兜底关闭则拒绝充值。
- A3: `quote_mode=empirical` 时，TRON 不调 estimateenergy，EVM 不调 eth_estimateGas，Solana 不调 getFeeForMessage。
- A4: 缺省或 `simulate_then_empirical` 保持当前各链「先模拟后经验」行为。
- A5: 管理界面显示「报价策略」，不再写「TRON 报价策略」。

# Constraints and invariants

- 经验用量固定：TRON 64285、EVM 65000、Solana 5000 lamports。
- 经验路径仍要有实时单价（TRON chain params / EVM gas price）；没有单价不得编造。
- origin/main 为生产基线。

# Decisions

- 一个全局开关，不按网络拆三个下拉。
- `quote_mode` 为规范字段；`tron_quote_mode` 仅兼容读取。
- 用户已要求规划后直接实现并合并部署。

# Open questions

# Verification expectations

- Go：解析别名、三种模式在 TRON/EVM/Solana 的调用路径。
- 前端：标签与序列化使用 `quote_mode`。
