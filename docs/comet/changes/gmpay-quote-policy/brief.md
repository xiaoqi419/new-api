# Outcome

报价策略三种：只链上模拟、只管理员固定/百分比、模拟失败再走管理员固定/百分比。适用于 TRON/ETH/BSC/Solana。64285 等经验用量不再作为管理员可选兜底。

# Scope

- `quote_mode`：`simulate` | `admin` | `simulate_then_admin`。
- 旧值 `empirical` 读成 `admin`；`simulate_then_empirical` 读成 `simulate_then_admin`。
- `simulate`：只跑链上模拟，失败则拒绝，不用管理员规则。
- `admin`：不跑链上估算，只用管理员固定/百分比；未配置规则则拒绝。
- `simulate_then_admin`：先模拟，失败再用管理员规则。
- 界面文案改为上述三种，不再出现「经验能量/经验用量」。
- 内置估算器在这三种策略下都不把 64285/65000/5000 当作用户策略兜底。

# Non-goals

- 不删除内置估算器里可测的经验用量实现（测试仍可直接指定）。
- 不改管理员规则的 `base * percent / 100` 公式。

# Acceptance examples

- A1: `simulate` 且模拟失败时，即使开了管理员兜底也不用固定/百分比。
- A2: `admin` 时不调用链上估算，直接用管理员规则。
- A3: `simulate_then_admin` 在模拟失败且已配置管理员规则时使用固定/百分比。
- A4: 界面三个选项对应只链上估算、只管理员固定/百分比、估算失败再走管理员。
- A5: 旧 `empirical` / `simulate_then_empirical` 文档仍能加载为 `admin` / `simulate_then_admin`。

# Constraints and invariants

- 管理员规则未就绪时，`admin` 与 `simulate_then_admin` 的失败路径拒绝创建充值。
- origin/main 为生产基线。

# Decisions

- 用户确认兜底是管理员固定/百分比，不是链上经验用量。
- 默认 `simulate_then_admin`。

# Open questions

# Verification expectations

- 解析别名、checkout 三路径、前端选项文案。
