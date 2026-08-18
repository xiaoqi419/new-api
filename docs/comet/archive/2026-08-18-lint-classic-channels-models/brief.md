# Outcome

在不改变渠道、模型、模型部署和模型价格行为的前提下，清零 classic 对应领域当前 259 项 oxlint errors。

# Scope

- 独占修改 `web/classic/src/components/table/{channels,models,model-deployments,model-pricing}/**`、`components/model-deployments/**`。
- 独占修改 `web/classic/src/hooks/{channels,models,model-deployments,model-pricing}/**`。
- 独占修改 `web/classic/src/pages/{Channel,Model,ModelDeployment,Pricing}/**`。
- 允许修改上述目录内直接相关的既有测试；当前 classic 未发现 test script 或直接测试文件时如实报告。

# Non-goals

- 不修改其他 classic 领域、foundation、default 前端、后端、lint 配置、package/lock、依赖、i18n、changelog或受保护品牌。
- 不处理 warnings 专项，不使用 `--fix`、disable 注释、规则降级或新增 ignore。

# Acceptance examples

- A1：权威 oxlint 对全部 owned paths 返回 0 errors。
- A2：Hooks、Promise、array key、component export 与机械性修复保持渠道请求、测试/余额/模型同步、模型保存、部署操作、价格筛选与列表 identity；相关既有测试通过，或明确报告无测试。
- A3：Git diff 只包含批准目录与本 child 正式产物，不含配置、package/lock、依赖、disable 或范围外领域变化。

# Constraints and invariants

- 先用 Fast Context 定位调用链，再用 `rg` 精确查找并完整阅读修改文件。
- 保留请求触发、错误传播、loading/finally 清理、表格选择和 modal 生命周期；不能为了 lint 改变业务条件。
- 禁止派生子代理或执行 Git/Comet 写操作；需要跨 ownership 修改时停止并报告。
- 测试只保护真实行为，不添加 smoke、随机、sleep、性能或覆盖率测试。

# Decisions

- 本 child 严格继承已确认的 `p1-lint-debt` A2/A3 范围，无需重复用户确认。
- classic foundations 已先合入目标分支；本 child 可依赖其 provider/helper 拆分结果。

# Open questions

- 无。

# Verification expectations

- 从 `web` 对全部 owned paths 运行权威定向 oxlint，并记录 error/warning 数量。
- 运行可用的邻近既有测试；没有测试时运行 classic production build 由最终门禁统一覆盖。
- 新的只读 Verifier 核对 A1-A3、完整 diff 与实际检查结果。
