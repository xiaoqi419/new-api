# Outcome

修复 SQLite 环境创建或更新订阅套餐时因 `subscription_plans.scope_group` 缺列而失败的问题，确保新数据库和从旧版本升级的数据库都具备与 `SubscriptionPlan` 模型一致的作用域分组列。

# Scope

- 在 SQLite 专用 `subscription_plans` 建表 DDL 中加入 `scope_group`。
- 在 SQLite 历史表缺列补齐清单中加入同一列定义。
- 增加真实 SQLite 回归测试，覆盖全新建表和旧表升级两条分支。
- 验证迁移后可以创建包含显式 `ScopeGroup` 的订阅套餐。

# Non-goals

- 不修改订阅套餐创建/更新 API 的业务校验。
- 不改变 `ScopeGroup` 的计费、分组匹配或钱包回退语义。
- 不重构全部迁移框架，不顺带调整其他已有列的类型或默认值。
- 不新增数据库方言专用依赖。

# Acceptance examples

- 全新 SQLite 数据库启动迁移后，`subscription_plans` 包含 `scope_group varchar(64) DEFAULT ''`，创建 `ScopeGroup="codex"` 的套餐成功并可读回。
- 历史 SQLite 表缺少 `scope_group` 且已有套餐数据时，启动迁移会补列，既有行保持不变并读取为空作用域。
- 对同一数据库重复执行迁移不会报错或重复修改 schema。
- MySQL 和 PostgreSQL 继续通过既有 GORM `AutoMigrate(&SubscriptionPlan{})` 维护该列，不引入 SQLite 语法。

# Constraints and invariants

- SQLite、MySQL >= 5.7.8、PostgreSQL >= 9.6 必须同时受支持。
- 空 `scope_group` 必须继续表示订阅适用于所有分组，以保持历史数据兼容。
- SQLite 使用 `ALTER TABLE ... ADD COLUMN`，不得使用其不支持的 `ALTER COLUMN`。
- 保留当前 worktree 的用户和其他代理改动；变更仅限订阅套餐 schema helper、针对性测试和必要 changelog。
- 新 Go 测试使用 `testify/require` 和 `testify/assert`，不得依赖共享的已迁移测试数据库复现旧表。

# Decisions

- 修复 `ensureSubscriptionPlanTableSQLite()` 的两条独立路径：新表 CREATE DDL 与旧表 `required` 列清单都增加 `scope_group`。
- 列定义使用可空字符串默认值 `''`，避免旧行迁移失败并保持 legacy 全分组语义。
- 回归测试使用隔离内存 SQLite，并保存/恢复全局 `DB`、`LOG_DB` 与数据库类型；不并行运行。
- 非 SQLite 路径保持现状，由 GORM AutoMigrate 添加模型字段。

# Open questions

- 无。用户已授权按推荐方案连续修复并完成验收。

# Verification expectations

- 运行新的 `model` 迁移回归测试，覆盖 fresh、legacy、显式写入和幂等。
- 运行相关订阅模型测试。
- 运行 `gofmt`、`go test` 和 `git diff --check`。
- 独立 Verifier 对照新旧 SQLite schema 与跨数据库分支逐项验收。
