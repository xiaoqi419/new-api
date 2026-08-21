# Outcome

在不改变用户可见行为的前提下，清零 default 前端 dashboard、home、models 与 system-settings 的全部 oxlint errors。

# Scope

- 独占修改 `web/src/features/dashboard/**`、`web/src/features/home/**`、`web/src/features/models/**`、`web/src/features/system-settings/**`。
- 允许修改上述目录内直接相关的既有测试；不修改共享目录或其他 feature。
- 保留 dashboard 数据请求、home 展示、模型管理和系统设置保存行为。

# Non-goals

- 不修改 lint config、package/lock 文件、依赖、i18n 文案、changelog、后端或产品功能。
- 不处理 warnings 专项，不使用 `--fix`、disable 注释、规则降级或新增 ignore。

# Acceptance examples

- A1：权威 oxlint 对四个 owned feature 目录返回 0 errors。
- A2：Hooks、Promise、array key、component export 与 import-type 修复保持请求/保存时机、错误传播、列表 identity 和模块副作用；相关既有测试通过，或明确报告无测试。
- A3：Git diff 只包含批准目录与本 child 正式产物，不含 lint 配置、package/lock、依赖或 disable 变化。

# Constraints and invariants

- 先用 Fast Context 定位调用链，再用 `rg` 精确查找并完整阅读修改文件。
- 禁止派生子代理、执行 Git 写操作或修改其他 child 文件；语义不确定时停止并报告。
- 测试只保护真实行为，不添加 smoke、随机、sleep、性能或覆盖率测试。

# Decisions

- 本 child 严格继承 `p1-lint-debt` 已确认的 A1/A3 范围；无需重复用户确认。
- 宽 typecheck/build 由 Supervisor 波次与最终门禁串行执行；Builder 至少运行 owned-path lint 与邻近既有测试。

# Open questions

- 无。

# Verification expectations

- 从 `web` 对 `src/features/dashboard`、`src/features/home`、`src/features/models`、`src/features/system-settings` 运行权威定向 oxlint。
- 新的只读 Verifier 核对 A1-A3、实际 diff 与最新定向检查结果。
