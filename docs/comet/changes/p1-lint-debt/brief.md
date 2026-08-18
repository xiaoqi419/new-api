# Outcome

在不改变依赖或用户可见功能的前提下，清零 `web/src` 与 `web/classic/src` 的 1,400 项历史 oxlint errors，恢复可发布的前端全量 lint 门禁，并保留 typecheck、测试和两套前端构建通过。目标分支唯一允许的 lint 规则例外是已批准的同源可信 Canvas iframe 文件级豁免，本 change 不再修改 lint 配置。

# Scope

- 修复 `web/src/**` 当前 341 errors / 147 files。
- 修复 `web/classic/src/**` 当前 1,059 errors / 236 files。
- 仅在清除当前 error 必需时修改 `web/classic/.prettierrc.mjs`；允许修改与语义性修复直接相关的既有测试。
- 同步独立 change `p1-canvas-trusted-iframe-policy` 已合入目标分支的 Canvas 信任模型；该目标基线只允许一个匹配 `src/features/canvas/index.tsx`、只关闭 `react/iframe-missing-sandbox` 的 override。
- 以 Supervisor Change 拆成文件所有权不重叠的 child waves；高扇出 classic foundations 先完成，再并行领域修复，共享 default 表面在 feature children 后处理。
- 最终 child 负责复跑权威全量 lint、测试、typecheck 与两套 build，并只修复合并后仍在批准范围内的残余错误。

# Non-goals

- 不在本 change 修改 `web/.oxlintrc.json`；目标分支的单文件单规则 Canvas override 由独立已批准 change 负责。不修改 package 文件、lockfile、依赖、框架版本或构建工具版本。
- 不降低 rule severity、不扩大 ignore、不增加 lint-disable 注释、不运行 `lint:fix` / `--fix`。
- 不专项清理 warning；本 change 的 lint 完成门槛是 0 errors，warnings 如实记录。
- 不新增用户可见功能、文案、changelog 条目或 i18n 范围，不进行 classic → default 迁移。
- 不修改后端、数据库、迁移、公开 API、支付、微信登录或受保护品牌信息。

# Acceptance examples

- A1：从 `web` 运行权威 oxlint 配置后，`web/src/**` 为 0 errors；所有 default child 的 owned paths 在各自提交前已定向 lint 为 0 errors。
- A2：同一权威 oxlint 运行中，`web/classic/src/**` 为 0 errors；classic foundations 先通过，随后各领域 child 的 owned paths 定向 lint 为 0 errors。
- A3：`react-hooks/exhaustive-deps`、`promise/catch-or-return`、`react/only-export-components`、`react/no-array-index-key` 与 `typescript/no-import-type-side-effects` 等语义性修复保持现有请求、订阅、错误传播、渲染 identity 与模块副作用；有邻近既有测试时通过对应测试，无测试时由 child 明确报告并由最终门禁覆盖。
- A4：相对已包含 Canvas 策略的目标分支，最终 diff 不修改 `web/.oxlintrc.json`；同时核对目标基线中的唯一例外仍是 `src/features/canvas/index.tsx` 的 `react/iframe-missing-sandbox: off` 精确 override。package/lock 与依赖不变，不新增 disable 注释，不扩大 ignore，不降低其他规则等级，也不包含批准范围外的产品或后端变更。
- A5：`web` 的全量 lint 为 0 errors，`bun test`、`bun run typecheck`、`bun run build` 通过；`web/classic` 的 `bun run build` 通过。warnings 数量单独记录，不作为本 change 的完成阻塞。
- A6：维护状态文档记录原始基线、实际修复范围、最终检查结果、剩余 warnings/风险、合并与部署状态，并继续区分本地通过、线上待验收和微信登录搁置。

# Constraints and invariants

- 权威 lint 是 `web/package.json` 的 `oxlint -c .oxlintrc.json .`；当前安装二进制为 oxlint 1.74.0，初始基线为 1,400 errors / 383 files。
- 使用 Bun 运行前端脚本；当前 Windows 无全局 Bun 时使用 `npx --yes bun`，不得因此更改 package manager 或依赖。
- child 只能修改分配的精确所有权范围，不得修改其他 child、共享 lint 配置、package/lock 文件或用户已有 `.agents/skills/comet-any/`；`lint-default-user-features` 在目标基线更新后同步 Canvas 策略，但不得产生自己的 lint config diff。
- 修复保持行为不变；出现产品行为、公开契约、依赖或框架选择时停止并返回 Supervisor Shape，不得自行扩大。
- 测试只保护真实行为或回归；不为覆盖率添加 smoke、随机、sleep、性能或实现细节测试。
- 子代理最多五个，固定不派生子代理；探索使用 Fast Context 定位，再用 `rg` 精确阅读；需要外部版本资料时按 Fathom、Exa、Firecrawl、Tavily 交叉核验。

# Decisions

- 用户已确认把全量 lint debt 作为 `p1-lint-debt` Supervisor Change 立即进入 Build，不再重复请求相同范围审批。
- child 模型按 Luna max → Terra xhigh → Sol high 降级；每档最多尝试两次，必须核对运行时模型与推理强度，配置不匹配不算模型失败并先调查配置。
- default 与 classic 使用独立 ownership；classic `helpers/context/i18n/root` 是高扇出 foundation，必须先于 classic 领域 children 合入。
- default feature children 可与 classic foundations 并行；default shared child 等其四个前置 child 完成后执行；最终门禁 child 等所有代码 child 合入后执行。
- warning-only 清理不进入范围；若修 error 自然消除 warning 可以保留，但不得扩张成 warning 专项。
- 2026-08-18 用户确认同源 `/canvas-app` 是可信应用：iframe 移除整个 `sandbox` 属性，并为 `web/src/features/canvas/index.tsx` 增加唯一的 `react/iframe-missing-sandbox` 文件级 override。该策略由独立 `p1-canvas-trusted-iframe-policy` 先合入目标分支，本 Supervisor 只同步基线；独立 origin 与通信桥重设计留给后续架构 change。

# Open questions

- 无。范围、非目标、拆分、基线、模型策略和验收方式均已由用户确认。

# Verification expectations

- 每个 child 在 owned paths 上运行权威定向 oxlint；语义性修复运行邻近既有测试或明确报告测试缺口。
- 每波合入后由主代理复核 full lint error 计数、文件所有权和共享门禁；并行 children 不同时运行会写相同缓存产物的宽 build/typecheck。
- 最终 child 与 Supervisor Verify 运行 A5 的完整命令，核对本 change 没有 lint config diff，并确认目标基线 Canvas override 的文件匹配和规则内容均精确唯一；新的只读 Verifier 独立逐项验收 A1-A6。
- Verify 接受后、Archive 前更新 `docs/torch-ai-maintenance-status.md`，记录真实结果，不把 warning、线上支付或微信登录状态写成已完成。
