# Outcome

把 `docs/project-code-summary.md` 修订为本 fork 的二开维护与交接文档。读者应能理解已经合并的二开能力、当前发布基线、待线上验收和明确搁置项、工程/业务风险，以及下一位 Agent 如何从唯一的 `origin/main` 基线继续实现、验证和发布。

# Scope

- 用 GitHub production fork 的 `origin/main`、已归档 Comet change、代表性源码与精确符号核对二开事实；不再把上游 New API 的通用目录介绍当作正文目的。
- 记录邀请返现、拼团、钱包/支付、订阅、发票、排名/并发、渠道兜底/监控、视频、素材库、Canvas、代理/白标、认证、451、公共首页/模型广场/Footer、站内文档和导航的状态与源码入口。
- 区分“已合并”“自动化或本地验证”“待真实线上验收”“保留但隐藏”和“搁置/未实现”。
- 固化后续 Agent 的 Comet、检索、单一 main 分支、验证、PR、精确 SHA 构建、应用部署和清理流程。
- 只修改目标交接文档和本 change 的正式 Comet 产物。

# Non-goals

- 不重新输出上游 New API 的完整架构手册、provider 字段清单或逐文件注释。
- 不修改应用代码、测试、依赖、部署配置、数据库、Redis、生产容器或域名。
- 不因动态业务品牌需求而删除、替换或弱化 `new-api`、QuantumNous、许可证、module path 或其它受保护项目归属。
- 不把真实商户支付、公网回调、生产数据迁移或当前容器状态写成已由本文验证。

# Acceptance

- A1-A4：说明调查快照/方法/边界和唯一生产真源，以明确源码路径、提交或符号支撑二开结论。
- A5-A10：列出商业支付、运营、访问和公共体验能力，说明当前状态与最小维护入口。
- A11-A15：识别待线上验收、保留但隐藏、搁置/未开始的项目，不把历史计划误写为现状。
- A16-A21：说明支付、计费、三数据库、Redis/并发、认证/451、默认/classic/canvas 和 RelayKit 等跨模块边界与风险。
- A22-A27：给出下一位 Agent 的开工、检索、Shape、Build、独立 Verify 和范围检查清单。
- A28-A31：给出 PR、CI、精确 merge SHA 构建、应用部署、线上证据、远端分支清理与本地生产基线同步步骤。
- A32-A34：使用简体中文，内部路径有效，明确历史计划与当前实现的差别；Git diff 只包含本 change 正式产物和目标文档，受保护项目归属不受影响。

# Constraints and invariants

- 以 `origin/main` 为生产事实真源；上游仓库只作为受控更新输入。
- 代码检索先使用 fast-context；不可用时缩小一次重试，再降级 `rg` 并记录原因。
- 每一个业务事实都能由当前 main 的代表性路径、符号、提交或 Comet archive 核对；不以聊天记忆补全事实。
- 文档不创建运行、部署或数据库副作用。

# Decisions

- D1：正文从“完整上游架构摘要”改为“二开维护与交接总览”，仅保留未来 Agent 必须理解的最小基础边界。
- D2：文档事实基线为 `origin/main` 的 `3013240d8c0d4918df32ae0ff88b3fbdd14d656e`，而非历史 worktree 的 `secondary-dev` 快照。
- D3：已合并代码、历史本地/自动化证据和真实线上验收必须分别标识。
- D4：发布只能从合并到 main 的精确 SHA 构建，避免本地、GitHub 和生产分别成为“最新版本”。

# Verification expectations

- 用 `rg` 核对主要业务入口、风险边界、动态品牌、451、支付/发票/拼团、RelayKit 和发布规则。
- 检查文档链接目标、Markdown 结构、受保护标识和 Git diff 范围。
- 运行 `git diff --check`；由独立只读 Verifier 逐项复核 A1-A34。
