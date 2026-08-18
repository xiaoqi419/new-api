# Outcome

在不改变布局交互或品牌资产的前提下，清零 default 前端 layout components 与 brand-icons 的全部 oxlint errors。

# Scope

- 独占修改 `web/src/components/layout/**` 与 `web/src/assets/brand-icons/**`。
- 允许修改 owned layout 目录内直接相关的既有测试；保持导航、响应式布局、焦点与图标导出契约。

# Non-goals

- 不改视觉设计、文案、受保护品牌内容、lint config、package/lock、依赖、后端或其他组件。
- 不处理 warnings 专项，不使用 `--fix`、disable 注释、规则降级或新增 ignore。

# Acceptance examples

- A1：权威 oxlint 对 `web/src/components/layout` 与 `web/src/assets/brand-icons` 返回 0 errors。
- A2：Hooks、component export、array key 与 import-type 修复保持导航、焦点、响应式布局、图标 identity 和模块副作用；相关既有测试通过，或明确报告无测试。
- A3：Git diff 只包含批准目录与本 child 正式产物，不含品牌替换、lint 配置、package/lock、依赖或 disable 变化。

# Constraints and invariants

- 先用 Fast Context 定位调用链，再用 `rg` 精确查找并完整阅读修改文件。
- 禁止派生子代理、执行 Git 写操作或修改其他 child 文件；布局行为需要改变时停止并报告。
- 不修改或移除 `new-api`、`QuantumNous` 相关标识、元数据或归属。

# Decisions

- 本 child 严格继承 `p1-lint-debt` 已确认的 A1/A3 范围；无需重复用户确认。
- 宽 typecheck/build 由 Supervisor 波次与最终门禁串行执行；Builder 至少运行 owned-path lint 与邻近既有测试。

# Open questions

- 无。

# Verification expectations

- 从 `web` 对 `src/components/layout` 与 `src/assets/brand-icons` 运行权威定向 oxlint。
- 新的只读 Verifier 核对 A1-A3、实际 diff、受保护品牌不变量与最新定向检查结果。
