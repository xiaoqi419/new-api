# GMPay 报价策略（管理员兜底）

`quote_mode` 对全部 GMPay Native USDT 网络生效：

| 值 | 行为 |
| --- | --- |
| `simulate` | 仅链上模拟。失败则拒绝，不使用管理员规则。 |
| `admin` | 仅管理员固定金额或充值百分比。不调用链上估算。 |
| `simulate_then_admin` | 先链上模拟；失败后使用管理员规则。 |

缺省为 `simulate_then_admin`。兼容读取：`empirical`→`admin`，`simulate_then_empirical`→`simulate_then_admin`，以及旧字段 `tron_quote_mode`。

链上模拟失败不得改用 64285 energy / 65000 gas / 5000 lamports 作为本策略的兜底。管理员规则仍由 `fallback_enabled`、`fallback_mode`、`fallback_value` 配置；策略需要管理员规则但未启用时拒绝报价。
