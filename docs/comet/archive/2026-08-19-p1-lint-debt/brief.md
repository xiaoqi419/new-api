# Outcome

在不改变依赖或用户可见功能的前提下，清零 `web/src` 与 `web/classic/src` 的 1,400 项历史 oxlint errors，恢复可发布的前端全量 lint 门禁，并保留 typecheck、测试和两套前端构建通过。iframe 规则只允许已批准的同源可信 Canvas 文件级例外，以及管理员配置的四个受信任外部集成文件共享的精确例外。

# Scope

- 修复 `web/src/**` 当前 341 errors / 147 files。
- 修复 `web/classic/src/**` 当前 1,059 errors / 236 files。
- 仅在清除当前 error 必需时修改 `web/classic/.prettierrc.mjs`；允许修改与语义性修复直接相关的既有测试。
- 同步独立 change `p1-canvas-trusted-iframe-policy` 已合入目标分支的 Canvas 信任模型；保留匹配 `src/features/canvas/index.tsx`、只关闭 `react/iframe-missing-sandbox` 的既有 override。
- 由 `lint-default-shared` 在 `web/.oxlintrc.json` 新增一个只匹配 `src/routes/_authenticated/chat/$chatId.tsx`、`classic/src/pages/Chat/index.jsx`、`classic/src/pages/About/index.jsx`、`classic/src/pages/Home/index.jsx`，且只关闭 `react/iframe-missing-sandbox` 的 override；四处管理员配置的外部 iframe 保持现有完整第三方应用能力。
- 未使用的通用 `WebPreviewBody` 保留 scripts/forms/popups/presentation，但移除 `allow-same-origin`，使任意 URL preview 使用 opaque origin。
- 以 Supervisor Change 拆成文件所有权不重叠的 child waves；高扇出 classic foundations 先完成，再并行领域修复，共享 default 表面在 feature children 后处理。
- 最终 child 负责复跑权威全量 lint、测试、typecheck 与两套 build，并只修复合并后仍在批准范围内的残余错误。

# Non-goals

- 除新增已批准的四文件单规则 iframe override 外，不修改 `web/.oxlintrc.json`；既有 Canvas override 保持不变。不修改 package 文件、lockfile、依赖、框架版本或构建工具版本。
- 不降低 rule severity、不扩大 ignore、不增加 lint-disable 注释、不运行 `lint:fix` / `--fix`。
- 不专项清理 warning；本 change 的 lint 完成门槛是 0 errors，warnings 如实记录。
- 不新增用户可见功能、文案、changelog 条目或 i18n 范围，不进行 classic → default 迁移。
- 不修改后端、数据库、迁移、公开 API、支付、微信登录或受保护品牌信息。

# Acceptance examples

- A1：从 `web` 运行权威 oxlint 配置后，`web/src/**` 为 0 errors；所有 default child 的 owned paths 在各自提交前已定向 lint 为 0 errors。
- A2：同一权威 oxlint 运行中，`web/classic/src/**` 为 0 errors；classic foundations 先通过，随后各领域 child 的 owned paths 定向 lint 为 0 errors。
- A3：`react-hooks/exhaustive-deps`、`promise/catch-or-return`、`react/only-export-components`、`react/no-array-index-key` 与 `typescript/no-import-type-side-effects` 等语义性修复保持现有请求、订阅、错误传播、渲染 identity 与模块副作用；有邻近既有测试时通过对应测试，无测试时由 child 明确报告并由最终门禁覆盖。
- A4：相对已包含 Canvas 策略的目标分支，`web/.oxlintrc.json` 最终 diff 只新增一个匹配四个管理员外部 iframe 文件、只关闭 `react/iframe-missing-sandbox` 的精确 override；既有 Canvas override 不变。package/lock 与依赖不变，不新增 disable 注释，不扩大 ignore，不降低其他规则等级，也不包含批准范围外的产品或后端变更。
- A5：`web` 的全量 lint 为 0 errors，`bun test`、`bun run typecheck`、`bun run build` 通过；`web/classic` 的 `bun run build` 通过。warnings 数量单独记录，不作为本 change 的完成阻塞。
- A6：维护状态文档记录原始基线、实际修复范围、最终检查结果、剩余 warnings/风险、合并与部署状态，并继续区分本地通过、线上待验收和微信登录搁置。

# Constraints and invariants

- 权威 lint 是 `web/package.json` 的 `oxlint -c .oxlintrc.json .`；当前安装二进制为 oxlint 1.74.0，初始基线为 1,400 errors / 383 files。
- 使用 Bun 运行前端脚本；当前 Windows 无全局 Bun 时使用 `npx --yes bun`，不得因此更改 package manager 或依赖。
- child 只能修改分配的精确所有权范围，不得修改其他 child、package/lock 文件或用户已有 `.agents/skills/comet-any/`；共享 lint 配置只由 `lint-default-shared` 按已确认的四文件单规则 override 修改一次，其他 child 不得修改。
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
- 2026-08-19 用户确认管理员配置的外部 Chat、About 与 Home iframe 是受信任集成：保留现有脚本、Cookie、storage、OAuth、表单、弹窗与媒体能力；为四个可达文件新增共享的精确 `react/iframe-missing-sandbox: off` override。残余风险是管理员账户或配置失陷后，恶意外部页面可能利用 URL 中注入的 API key 与 iframe 权限；该风险属于现有信任模型并在维护文档留档。限制性 sandbox 与改为新标签页均不进入本 change。

# Open questions

- 无。范围、非目标、拆分、基线、模型策略和验收方式均已由用户确认。

# Verification expectations

- 每个 child 在 owned paths 上运行权威定向 oxlint；语义性修复运行邻近既有测试或明确报告测试缺口。
- 每波合入后由主代理复核 full lint error 计数、文件所有权和共享门禁；并行 children 不同时运行会写相同缓存产物的宽 build/typecheck。
- 最终 child 与 Supervisor Verify 运行 A5 的完整命令，核对 lint config diff 只有已批准的四文件单规则 override，并确认既有 Canvas override 未变、两个 iframe 例外均不扩张到其他文件或规则；新的只读 Verifier 独立逐项验收 A1-A6。
- Verify 接受后、Archive 前更新 `docs/torch-ai-maintenance-status.md`，记录真实结果，不把 warning、线上支付或微信登录状态写成已完成。
