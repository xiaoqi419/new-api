# Outcome

把主站内嵌的同源 `/canvas-app` 明确作为可信应用运行：移除 iframe 的整个 `sandbox` 属性，同时用一个精确的 oxlint 文件级 override 记录该信任模型，避免通过无效的 `allow-scripts` + `allow-same-origin` 组合制造隔离假象。

# Scope

- 修改 `web/src/features/canvas/index.tsx`，移除 `/canvas-app` iframe 的整个 `sandbox` 属性及只描述旧 sandbox 组合的相邻注释。
- 修改 `web/.oxlintrc.json`，新增一个仅匹配 `src/features/canvas/index.tsx`、仅关闭 `react/iframe-missing-sandbox` 的 override。
- 保持 Canvas 的 `src`、`ref`、`onLoad`、clipboard allow、严格同源 `postMessage` 目标/来源校验、主题和令牌桥不变。

# Non-goals

- 不把 Canvas 迁移到独立 origin，不重设计存储、认证或消息桥。
- 不修改其他 oxlint rule、severity、plugin、override 或 ignore pattern，不新增 disable 注释。
- 不修改 package/lock、依赖、后端、数据库、公开 API、支付、微信登录、i18n、changelog 或其他前端功能。

# Acceptance examples

- A1：`web/src/features/canvas/index.tsx` 的 `/canvas-app` iframe 不再包含 `sandbox` 属性，其他 iframe 属性与同源消息桥行为保持不变。
- A2：`web/.oxlintrc.json` 的唯一变化是新增一个 files 仅为 `src/features/canvas/index.tsx`、rules 仅为 `react/iframe-missing-sandbox: off` 的 override。
- A3：Canvas 定向 oxlint 返回 0 errors，`bun run typecheck` 通过，相关既有测试通过或明确报告没有直接 Canvas 测试。
- A4：Git diff 只包含本 change 正式产物、Canvas iframe 文件和精确 lint override；package/lock、依赖、其他配置和微信登录均不变，`git diff --check` 通过。

# Constraints and invariants

- 未知代码与调用链先使用 Fast Context，再以 `rg` 精确核对并完整阅读修改文件。
- 不得使用动态 JSX、`createElement`、延迟删除属性、disable 注释或其他方式规避 lint。
- 当前信任取舍允许同源 Canvas 获得普通同源页面能力；更强隔离只能通过后续独立 origin 架构 change 实现。
- 测试只保护真实行为，不新增 smoke、随机、sleep、性能或覆盖率测试。

# Decisions

- 2026-08-18 用户确认接受两项：移除同源 Canvas iframe 的整个 `sandbox` 属性；增加唯一的单文件单规则 oxlint override，并同步修订 P1 lint A4/A10 文档边界。
- 本策略作为独立 Native change 先合入 `codex/p0-wallet-wechatpay`，随后由 `p1-lint-debt` 及 `lint-default-user-features` 同步该目标分支，使原 lint change 的冻结验收仍能按“change 内不修改 lint config”如实验证。

# Open questions

- 无。信任模型、精确 override、非目标和验收边界均已由用户确认。

# Verification expectations

- 从 `web` 运行 Canvas 定向 oxlint：`npx --yes bun x oxlint -c .oxlintrc.json src/features/canvas/index.tsx`。
- 从 `web` 运行 `npx --yes bun run typecheck`；搜索并运行直接相关的既有 Canvas 测试，若不存在则明确记录。
- 核对相对目标分支的完整 diff、配置精确性、禁用/ignore/package/lock/依赖零变化和 `git diff --check`。
- 新的只读 Verifier 独立逐项验收 A1-A4，并明确记录可信同源 iframe 的剩余安全风险。
