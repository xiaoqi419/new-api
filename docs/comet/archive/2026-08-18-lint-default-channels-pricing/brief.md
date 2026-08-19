# Outcome

在不改变用户可见行为的前提下，清零 default 前端 channels 与 pricing 两个 feature 的全部 oxlint errors。

# Scope

- 独占修改 `web/src/features/channels/**` 与 `web/src/features/pricing/**`。
- 允许修改上述目录内直接相关的既有测试；不修改任何共享目录或其他 feature。
- 完整阅读即将修改的文件与相关调用链，修复 correctness errors，保留请求、表单、弹窗、列表与 pricing 展示行为。

# Non-goals

- 不修改 lint config、package/lock 文件、依赖、i18n 文案、changelog、后端或产品功能。
- 不处理 warnings 专项，不使用 `--fix`、disable 注释、规则降级或新增 ignore。

# Acceptance examples

- A1：权威 oxlint 对 `web/src/features/channels` 与 `web/src/features/pricing` 返回 0 errors。
- A2：Hooks、Promise、array key、component export 与 import-type 修复保持现有请求触发、错误传播、列表 identity 和模块副作用；相关既有测试通过，或明确报告该路径没有测试。
- A3：Git diff 只包含批准目录与本 child 正式产物，不含 lint 配置、package/lock、依赖或 disable 变化。

# Constraints and invariants

- 先用 Fast Context 定位调用链，再用 `rg` 精确查找并完整阅读修改文件。
- 禁止派生子代理、执行 Git 写操作或修改其他 child 文件；语义不确定时停止并报告。
- 只添加保护真实行为的测试，不添加 smoke、随机、sleep、性能或覆盖率测试。

# Decisions

- 本 child 严格继承 `p1-lint-debt` 已确认的 A1/A3 范围；无需重复用户确认。
- 宽 typecheck/build 由 Supervisor 波次与最终门禁串行执行；Builder 至少运行 owned-path lint 与邻近既有测试。

# Open questions

- 无。

# Verification expectations

- 从 `web` 使用 `.\\node_modules\\.bin\\oxlint.exe -c .oxlintrc.json src/features/channels src/features/pricing`。
- 新的只读 Verifier 核对 A1-A3、实际 diff 与最新定向检查结果。
