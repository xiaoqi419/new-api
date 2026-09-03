# Outcome

管理员可以在 GMPay 手续费设置里选择 TRON 动态报价策略：只走链上模拟、只走经验能量兜底、或模拟失败后再走经验能量（默认，与当前生产行为一致）。管理员固定/比例兜底仍是动态报价全部失败后的最后一层。管理员兜底下拉选中项显示翻译后的中文，百分比规则使用带 `%` 的百分比输入，不再把百分比当成 USD 金额。

# Scope

- 在 GMPay 手续费配置中新增 `tron_quote_mode`：`simulate` | `empirical` | `simulate_then_empirical`（缺省/旧配置视为 `simulate_then_empirical`）。
- 设置页提供三选一控件，默认选中「模拟失败后经验兜底」。
- `simulate`：只用 `estimateenergy`/`triggerconstantcontract`；模拟失败则动态报价失败，再按现有管理员兜底开关处理。
- `empirical`：跳过合约模拟，只用链上单价 × 64285 energy + 345 bandwidth。
- `simulate_then_empirical`：保持现有行为（模拟失败且拿到单价后走经验能量）。
- 管理员兜底规则类型下拉：触发器显示已翻译文案，而不是 `fixed`/`percent`。
- 规则类型为百分比时，右侧输入改为 0–100 的百分比控件（标签、后缀 `%`、说明）；固定金额仍为 USD 数字。覆盖规则同样处理。

# Non-goals

- 不按收款地址是否首次持有 USDT 自动切换 1x/2x 能量。
- 不改 ETH/BSC/Solana 估算策略。
- 不改管理员兜底的计费公式（百分比仍是本金 × value / 100）。
- 不改数据库 schema。
- 不在本 change 热更生产。

# Acceptance examples

- A1: 未写 `tron_quote_mode` 的已有配置加载后策略为模拟失败再经验兜底，TRON 模拟失败且已有单价时仍报出约 64285 energy。
- A2: 管理员选择「只走链上模拟」并保存后，TRON 模拟失败不再使用 64285；若管理员兜底关闭则拒绝创建充值。
- A3: 管理员选择「只走经验能量」并保存后，TRON 报价跳过 `estimateenergy`，用 64285 × 实时 energy 单价 + 345 带宽。
- A4: 管理员选择「模拟失败后经验兜底」时行为与当前生产一致。
- A5: 中文界面下，兜底规则类型选中「固定金额」或「充值金额百分比」后，触发器显示对应中文而不是 `fixed`/`percent`。
- A6: 规则类型为百分比时，右侧输入标签为百分比、带 `%` 后缀、说明不再写成 USD；切回固定金额后恢复 USD 输入。

# Constraints and invariants

- 经验能量只用于已有 USDT 持仓地址档（64285），不引入 130285。
- 经验路径仍必须能读到 `getEnergyFee`/`getTransactionFee`；链参数失败时不得伪造单价。
- 管理员兜底（`fallback_enabled` + fixed/percent）仍只在动态报价不可用时生效。
- 百分比存储值仍是 0–100 的字符串，不改后端语义。
- origin/main 为唯一生产基线；本 change 只改应用配置与 UI。

# Decisions

- TRON 动态报价与管理员 USD 兜底是两层：前者估链上成本，后者是动态层全部失败后的政策费。
- 默认 `simulate_then_empirical`，兼容已上线行为。
- 三选一只作用于 TRON 内置估算器。
- 选中项文案走 i18n，不把枚举值直接展示给管理员。
- 百分比输入只改展示与说明，不改 `value / 100` 公式。

# Open questions

# Verification expectations

- Go：`tron_quote_mode` 解析/默认、三种策略下内置 TRON 估算器行为。
- 前端：手续费设置页策略选择、兜底下拉选中文案、百分比输入标签/后缀。
- 不要求本机连真实 TronGrid。
