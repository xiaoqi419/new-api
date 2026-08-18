# Outcome

在不改变认证、布局、首页、Playground、看板与其余 common pages 行为的前提下，清零 classic 剩余公共表面当前 217 项 oxlint errors。

# Scope

- 独占修改 `web/classic/src/App.jsx`、`constants/**`、`services/**`。
- 独占修改 `web/classic/src/components/{auth,common,dashboard,groupbuy,layout,playground,setup}/**`。
- 独占修改 `web/classic/src/hooks/{chat,common,dashboard,playground}/**`。
- 独占修改 `web/classic/src/pages/{About,AssetLibrary,Chat,Chat2Link,Dashboard,Docs,Forbidden,GroupBuy,GroupBuyAdmin,GroupBuyHall,GroupMonitor,Home,Invitation,InviteRanking,NotFound,Playground,PrivacyPolicy,Rebate,Setup,UserAgreement,VideoGeneration}/**`。
- 允许修改上述目录内直接相关的既有测试；当前 classic 未发现 test script 或直接测试文件时如实报告。

# Non-goals

- 不修改 foundation、table、settings、topup、渠道/模型 child、default 前端、后端、lint 配置、package/lock、依赖、i18n、changelog或受保护品牌。
- 不新增功能或视觉改版；不处理 warnings 专项，不使用 `--fix`、disable 注释、规则降级或新增 ignore。

# Acceptance examples

- A1：权威 oxlint 对全部 owned paths 返回 0 errors。
- A2：Hooks、Promise、array key、component export、iframe 与机械性修复保持认证、导航、响应式布局、首页数据、Playground 请求/流式状态、看板与 setup 行为；相关既有测试通过，或明确报告无测试。
- A3：Git diff 只包含批准目录与本 child 正式产物，不含配置、package/lock、依赖、disable、受保护品牌或其他 child 领域变化。

# Constraints and invariants

- 先用 Fast Context 定位调用链，再用 `rg` 精确查找并完整阅读修改文件。
- 保留认证/session、请求/订阅、postMessage origin、导航与 provider side effects；React key 使用真实稳定 identity。
- 禁止派生子代理或执行 Git/Comet 写操作；需要跨 ownership 修改时停止并报告。
- 测试只保护真实行为，不添加 smoke、随机、sleep、性能或覆盖率测试。

# Decisions

- 本 child 严格继承已确认的 `p1-lint-debt` A2/A3 范围，无需重复用户确认。
- foundations、tables、settings 和 topup 已由其他 child 独占；本 child 只处理列出的公共表面。

# Open questions

- 无。

# Verification expectations

- 从 `web` 对全部 owned paths 运行权威定向 oxlint，并记录 error/warning 数量。
- 运行可用的邻近既有测试；没有测试时明确记录并由最终 classic production build 覆盖。
- 新的只读 Verifier 核对 A1-A3、完整 diff 与实际检查结果。
