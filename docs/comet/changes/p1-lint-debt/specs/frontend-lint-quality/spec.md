# 前端全量 Lint 质量门禁规格

## Scenario: 权威范围从历史基线降为零错误

- `web/src/**` 从初始 341 errors / 147 files 降为 0 errors。
- `web/classic/src/**` 从初始 1,059 errors / 236 files 降为 0 errors。
- 总基线 1,400 errors / 383 files 以 `web/node_modules/.bin/oxlint` 1.74.0 和 `web/.oxlintrc.json` 为准。
- `web/classic/.prettierrc.mjs` 只有在当前 error 明确要求时可调整；目标分支保留一个仅针对 `src/features/canvas/index.tsx`、关闭 `react/iframe-missing-sandbox` 的精确 override，并新增一个只匹配四个管理员外部 iframe 文件、关闭同一规则的精确 override；其他 lint 配置、config/package/lock files 不在批准范围。

## Scenario: 语义性与机械性修复保持现有行为

- Hooks dependency 修复保持请求触发、订阅建立/销毁、闭包取值和 render 次数的业务语义，不通过删除依赖或 disable 规则通过。
- Promise 修复明确处理或向调用方返回 rejection，不新增空 catch 或静默吞错。
- Component export 修复可在相同 feature/helper 边界内拆分模块，但保持既有 import/export 契约；高扇出 helper 先合入再处理调用方。
- Array key 使用真实稳定 identity；Type-only import 保留有副作用模块的运行时加载。
- 机械规则修复保持分支、短路、浅拷贝、字符串全局替换和索引语义不变。

## Scenario: Supervisor 按依赖与独占所有权推进

- 首波并行处理四个 default 独占域与 classic foundations，活跃子代理不超过五个。
- default shared 等四个 default 域合入后处理；classic 领域 children 只在 foundations 合入后处理。
- 最终门禁 child 在全部代码 child 合入后复核全量 error、修复批准范围内的交叉残余，并运行完整检查。
- 每个 child 只修改任务声明中的路径；依赖表达真实的高扇出和集成顺序，不以数组顺序代替依赖。

## Scenario: 只允许已批准的 iframe 信任模型例外

- 目标分支 `web/.oxlintrc.json` 的既有批准例外是一个只匹配 `src/features/canvas/index.tsx`、只关闭 `react/iframe-missing-sandbox` 的 override，用于落实已确认的可信同源 Canvas 模型。
- 本 change 新增的唯一配置变化是一个同时匹配 `src/routes/_authenticated/chat/$chatId.tsx`、`classic/src/pages/Chat/index.jsx`、`classic/src/pages/About/index.jsx`、`classic/src/pages/Home/index.jsx`，且只关闭 `react/iframe-missing-sandbox` 的 override，用于落实已确认的管理员受信任外部集成模型。
- 四处外部 iframe 保持现有脚本、同源存储、Cookie、OAuth、表单、弹窗和媒体能力；不添加会破坏现有集成契约的限制性 sandbox。管理员账户或配置失陷可能暴露 URL 注入的 API key 或滥用 iframe 权限，该残余风险必须留档。
- 未使用的通用 `WebPreviewBody` 必须从 sandbox 删除 `allow-same-origin`，同时保留 scripts/forms/popups/presentation，使任意 URL preview 使用 opaque origin。
- 除上述四文件单规则 override 外，本 change 不修改 oxlint rules、severity、plugins、overrides 或 ignore patterns，也不得扩大两个精确 iframe 例外。
- 不增加 `eslint-disable`、`oxlint-disable` 或等价行内/文件级豁免。
- 不使用 `--fix`、`lint:fix` 或其他未审阅的批量自动改写。
- 不升级依赖、不修改 package scripts/lockfile、不排除目录，也不扩张到 warning 专项、UI 重设计、功能开发、classic 迁移、后端或微信登录。

## Scenario: 完整发布前门禁通过并留档

- 从 `web` 运行 `npx --yes bun run lint`、`npx --yes bun test`、`npx --yes bun run typecheck`、`npx --yes bun run build` 全部通过，且 lint 为 0 errors；warnings 数量如实记录。
- 从 `web/classic` 运行 `npx --yes bun run build` 通过。
- 验证前确认 lint config diff 只有已批准的四文件单规则 override，既有 Canvas override 未变，package/lock files 与依赖未变；A1-A6 及本规格场景由独立 Verifier 验收。
- Verify 接受后同步维护状态文档；真实商户支付继续标记线上验收，微信登录新增开发继续搁置。
