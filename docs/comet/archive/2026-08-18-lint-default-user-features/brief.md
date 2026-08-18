# Outcome

在不改变用户可见行为的前提下，清零 default 前端账户、钱包、订阅、认证与其余独占 feature 的全部 oxlint errors。

# Scope

- 独占修改 `web/src/features/profile/**`、`wallet/**`、`subscriptions/**`、`users/**`、`keys/**`、`usage-logs/**`、`auth/**`、`rankings/**`、`redemption-codes/**`、`system-info/**`、`setup/**`、`canvas/**`（均位于 `web/src/features/`）。
- 在独立 `p1-canvas-trusted-iframe-policy` 合入目标分支后同步其 Canvas 信任模型；本 child 不产生 `web/.oxlintrc.json` diff。
- 允许修改上述目录内直接相关的既有测试；不修改共享目录或未列出的 feature。
- 保留认证、余额/充值入口、订阅、用户/密钥管理、用量日志、兑换与 setup 行为；微信登录新增开发继续搁置。

# Non-goals

- 不新增或扩展微信登录、支付或其他功能；不修改 lint config、package/lock、依赖、i18n 文案、changelog或后端。
- 不处理 warnings 专项，不使用 `--fix`、disable 注释、规则降级或新增 ignore。

# Acceptance examples

- A1：权威 oxlint 对全部 owned feature 目录返回 0 errors。
- A2：语义性修复保持认证、请求、错误传播、列表 identity、余额/订阅状态和模块副作用；相关既有测试通过，或明确报告无测试。
- A3：Git diff 只包含批准目录与本 child 正式产物，不含共享目录、lint 配置、package/lock、依赖或 disable 变化；目标基线中的 Canvas override 不计入本 child diff。

# Constraints and invariants

- 先用 Fast Context 定位调用链，再用 `rg` 精确查找并完整阅读修改文件。
- 禁止派生子代理、执行 Git 写操作或修改其他 child 文件；出现产品/API 决策或微信登录范围时立即停止。
- 测试只保护真实行为，不添加 smoke、随机、sleep、性能或覆盖率测试。

# Decisions

- 本 child 严格继承 `p1-lint-debt` 已确认的 A1/A3 范围；无需重复用户确认。
- 宽 typecheck/build 由 Supervisor 波次与最终门禁串行执行；Builder 至少运行 owned-path lint 与邻近既有测试。
- 2026-08-18 用户确认将同源 `/canvas-app` 视为可信应用并移除 iframe 的整个 `sandbox` 属性；不得只移除 `allow-same-origin`，因为 Canvas 依赖同源浏览器存储与严格同源 `postMessage`。精确 override 由独立 `p1-canvas-trusted-iframe-policy` 先合入目标分支，本 child 同步后不产生 lint config diff；独立 origin 与通信桥重设计留给后续架构 change。

# Open questions

- 无。

# Verification expectations

- 从 `web` 对所有列出的 `src/features/*` 路径运行权威定向 oxlint。
- 核对本 child 相对更新后目标分支没有 `web/.oxlintrc.json` diff，并确认目标基线 override 只匹配 Canvas 文件、只关闭 iframe sandbox 规则。
- 新的只读 Verifier 核对 A1-A3、实际 diff、微信登录非目标与最新定向检查结果。
