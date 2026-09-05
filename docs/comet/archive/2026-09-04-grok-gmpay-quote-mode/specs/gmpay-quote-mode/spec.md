# GMPay 全局动态报价策略

`GMPayFeeConfig.quote_mode` 控制内置估算器在全部支持网络上的行为：

| 值 | TRON | Ethereum / BSC | Solana |
| --- | --- | --- | --- |
| `simulate` | 仅合约模拟 | 仅 `eth_estimateGas` | 仅 `getFeeForMessage` |
| `empirical` | 64285 energy + 345 bandwidth × 链上单价 | 65000 gas × 实时 gas price | 5000 lamports |
| `simulate_then_empirical` | 模拟失败后经验 | `eth_estimateGas` 失败后 65000 gas | `getFeeForMessage` 失败后 5000 lamports |

缺省、空字符串视为 `simulate_then_empirical`。若没有 `quote_mode` 但存在 `tron_quote_mode`，使用后者。非法值拒绝保存。

经验路径不得在缺少实时单价时编造费用。管理员 `fallback_enabled` 仍只在动态报价失败后生效。

管理界面使用「报价策略」文案，选项适用于全部 GMPay Native USDT 网络。
