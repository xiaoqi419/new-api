# Outcome

在已合入全部代码 child 的 `codex/p1-lint-debt` 集成分支上完成发布前最终门禁，确认前端 lint、测试、类型检查和两套前端构建结果，并将真实结果同步到 Torch AI 维护状态文档。只处理合并后仍属于本 Supervisor 批准范围的交叉 lint 残余；不扩展产品功能或依赖范围。

# Scope

- 从 `web` 运行权威 `npx --yes bun run lint`，确认 `web/src/**` 与 `web/classic/src/**` 均为 0 errors，并记录 warnings 数量。
- 从 `web` 运行 `npx --yes bun test`、`npx --yes bun run typecheck`、`npx --yes bun run build`。
- 从 `web/classic` 运行 `npx --yes bun run build`。
- 核对相对 `codex/p0-wallet-wechatpay` 的 diff：`web/.oxlintrc.json` 仅包含已批准的 Canvas override 与四个管理员受信任 iframe 文件的精确 override；package、lock、依赖和脚本未变化。
- 核对无新增 lint-disable、ignore 扩大、规则降级或批准范围外的后端、数据库、支付、微信登录和 UI 变更。
- 必要时只修复上述检查发现且属于已确认前端 lint 质量范围的交叉残余，并复跑受影响检查。
- 更新 `docs/torch-ai-maintenance-status.md`，如缺失则补充最终门禁记录、线上真实商户支付待验收、微信登录新增开发搁置及 iframe 信任模型 residual risk。

# Non-goals

- 不专项清理 warnings，不升级依赖，不修改 package/lock 文件、脚本、框架版本或构建工具。
- 不新增用户可见功能、API、数据库迁移、支付实现、微信登录或 UI 重设计。
- 不扩大 `web/.oxlintrc.json` 的既有 Canvas 和已批准四文件 override，不添加任何通用 iframe 例外。
- 不使用 `--fix`、`lint:fix`、未审阅的批量改写或新增 disable 注释。

# Acceptance examples

- A4：lint 配置和依赖 diff 满足父 Supervisor 的精确范围，Canvas override 未变。
- A5：`web` lint/test/typecheck/build 与 `web/classic` build 全部通过；lint error 为 0，warnings 如实记录。
- A6：维护状态文档记录实际命令、结果、风险、合并和部署状态，并区分本地通过、线上待验收和微信登录搁置。
- A7-A10：全量基线、语义行为、Supervisor 所有权和 iframe 信任模型与父规格一致。
- A11：独立 Verifier 可复核完整发布前门禁和文档留档。

# Constraints and invariants

- 继承父 Supervisor `p1-lint-debt` 的已确认 brief/spec、目标分支和受保护项目标识。
- 使用仓库现有 Bun 运行方式；Windows 无全局 Bun 时使用 `npx --yes bun`。
- 修改仅限最终门禁允许的交叉 lint 残余和维护文档；不覆盖其他用户改动。
- 真实商户支付凭据只能由管理员配置，线上回调仍需真实环境验收；微信登录新增开发继续搁置。

# Decisions

- 父 Supervisor 已完成 Shape 并授权严格派生本 child，不重复请求相同范围确认。
- 最终门禁必须在所有代码 child 合入 `codex/p1-lint-debt` 后运行；验证结果由独立只读 Verifier 判断。

# Open questions

- 无。所有范围、非目标、检查命令和验收边界已由父 Supervisor 与用户确认。

# Verification expectations

- 记录每个命令的退出结果和 lint error/warning 计数。
- 由独立只读 Verifier 逐项验收 child acceptance 与父 Supervisor A4-A11，不把 Builder handoff 当作验收结论。
- Verify 通过后同步维护文档，再按 Runtime continuation 请求 Archive。
