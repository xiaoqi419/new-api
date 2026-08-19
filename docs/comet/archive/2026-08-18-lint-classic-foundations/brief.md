# Outcome

清零 classic 高扇出 helpers、context、i18n 与入口文件的全部 oxlint errors，为后续 classic 领域 children 建立稳定基线，同时保持既有 import/export 和运行时行为。

# Scope

- 独占修改 `web/classic/src/helpers/**`、`context/**`、`contexts/**`、`i18n/**`、`index.jsx`。
- 仅在清除当前 error 必需时修改 `web/classic/.prettierrc.mjs`。
- 为保留 helpers 的公开 import/export 契约，允许在 `web/classic/src/**` 做必要且仅限 import 路径/符号的调用方调整；不得顺带修复调用方其他 lint errors。
- 允许修改上述 foundation 范围内直接相关的既有测试。

# Non-goals

- 不修改 classic 领域组件的业务逻辑、UI、文案或功能，不进行 classic → default 迁移。
- 不修改 root lint config、package/lock、依赖或后端；不处理 warnings 专项，不使用 `--fix`、disable、规则降级或新增 ignore。

# Acceptance examples

- A1：权威 oxlint 对 foundation owned paths 返回 0 errors；helpers 拆分后所有现有 importers 可解析。
- A2：`react/only-export-components`、Hooks、Promise 与其他修复保持 Theme/context 初始化、i18n、entrypoint、helper 输出和模块副作用；相关既有测试通过，或明确报告无测试。
- A3：Git diff 除 foundation 文件与必要 import-only 调整外不含 classic 领域逻辑变化，也不含 lint 配置、package/lock、依赖或 disable 变化。

# Constraints and invariants

- 先用 Fast Context 定位 helper/context/import 扇出，再用 `rg` 精确列出全部 importers，并完整阅读修改文件。
- 禁止派生子代理、执行 Git 写操作；需要改变 import/export 公共契约或业务行为时停止并报告。
- 必须保持后续 classic child 能基于本分支继续工作，不做 warning 专项或无关格式化。

# Decisions

- 本 child 严格继承 `p1-lint-debt` 已确认的 A2/A3 范围，并先于所有 classic 领域 child 合入。
- 宽 classic build 由 Supervisor 波次与最终门禁串行执行；Builder 至少运行 foundation 定向 lint、解析检查与邻近既有测试。

# Open questions

- 无。

# Verification expectations

- 从 `web` 使用 root `.oxlintrc.json` 对 classic foundation owned paths 运行权威定向 oxlint，并用 `rg`/构建解析确认 importer 未断裂。
- 新的只读 Verifier 核对 A1-A3、实际 diff、import-only 例外和最新检查结果。
