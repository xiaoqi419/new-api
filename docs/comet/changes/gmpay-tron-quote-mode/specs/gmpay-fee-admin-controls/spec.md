# GMPay 手续费管理员控件

## TRON 动态报价策略

`GMPayFeeConfig.tron_quote_mode` 控制内置 TRON USDT 估算器：

| 值 | 行为 |
| --- | --- |
| `simulate` | 仅链上模拟。`estimateenergy`/`triggerconstantcontract` 失败（含 REVERT）则动态报价失败。 |
| `empirical` | 跳过合约模拟。读取链参数后按 64285 energy + 345 bandwidth × 实时单价报价。 |
| `simulate_then_empirical` | 先模拟；全部允许 RPC 均模拟失败但已拿到单价时，改用经验能量。 |

缺省、空字符串或旧配置没有该字段时视为 `simulate_then_empirical`。非法值拒绝保存。

经验路径不得在缺少 `getEnergyFee`/`getTransactionFee` 时编造单价。经验能量固定为现有持仓档 64285，不使用新地址 130285。

ETH、BSC、Solana 估算不受该字段影响。

动态报价失败后，现有 `fallback_enabled` 管理员固定/比例规则仍按原语义生效。

## 管理员兜底展示

规则类型选项值为 `fixed` / `percent`。界面必须显示翻译文案：

- `fixed` → `Fixed amount`
- `percent` → `Percentage of top-up`（覆盖规则可用 `Percentage`）

选中后触发器显示同一套翻译，不得回显枚举值。

`percent` 时数值输入：

- 标签表示百分比；
- 可见 `%` 后缀；
- 说明写 0–100，相对充值本金；
- 不得再写「以 USD 表示」。

`fixed` 时输入仍为 USD 金额。存储仍是规则 `value` 字符串；百分比后端计算保持 `base * value / 100`。
