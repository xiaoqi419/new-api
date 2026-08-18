# 前端全量 Lint 质量门禁规格

## Scenario: 权威范围从历史基线降为零错误

- `web/src/**` 从初始 341 errors / 147 files 降为 0 errors。
- `web/classic/src/**` 从初始 1,059 errors / 236 files 降为 0 errors。
- 总基线 1,400 errors / 383 files 以 `web/node_modules/.bin/oxlint` 1.74.0 和 `web/.oxlintrc.json` 为准。
- `web/classic/.prettierrc.mjs` 只有在当前 error 明确要求时可调整；其他 config/package/lock files 不在批准范围。

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

## Scenario: 禁止通过配置、依赖或豁免制造绿色结果

- 不修改 oxlint rules、severity、plugins、overrides 或 ignore patterns。
- 不增加 `eslint-disable`、`oxlint-disable` 或等价行内/文件级豁免。
- 不使用 `--fix`、`lint:fix` 或其他未审阅的批量自动改写。
- 不升级依赖、不修改 package scripts/lockfile、不排除目录，也不扩张到 warning 专项、UI 重设计、功能开发、classic 迁移、后端或微信登录。

## Scenario: 完整发布前门禁通过并留档

- 从 `web` 运行 `npx --yes bun run lint`、`npx --yes bun test`、`npx --yes bun run typecheck`、`npx --yes bun run build` 全部通过，且 lint 为 0 errors；warnings 数量如实记录。
- 从 `web/classic` 运行 `npx --yes bun run build` 通过。
- 验证前确认 lint config、package/lock files 与依赖未变；A1-A6 及本规格场景由独立 Verifier 验收。
- Verify 接受后同步维护状态文档；真实商户支付继续标记线上验收，微信登录新增开发继续搁置。
