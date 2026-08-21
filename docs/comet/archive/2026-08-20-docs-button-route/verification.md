---
generated_from_state_version: 7
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 1
- Verifier attempt: 1
- Completed: 2026-08-20T23:04:41.950Z
- Summary: 独立只读验证通过候选 b1fcf40c-90b7-47f0-91d9-d50bdfe9b760 的 A1-A12。Verifier 先用 fast-context 定位并以 rg、完整文件和 diff 复核；独立重跑 Hero Router Vitest 与 git diff --check 均通过，并确认 /docs route/feature 无任何变更。

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | 访客在首页点击 Hero 的“文档”按钮后，当前单页应用导航到 `/docs`。 | 真实 Memory Router 参数化测试覆盖未登录场景；点击 Docs 后 pathname 为 /docs，独立重跑通过。 |
| A2 | passed | brief.md | 已登录用户点击同一按钮也进入 `/docs`，不受登录态影响。 | 同一真实 Router 测试覆盖已登录场景；Docs 按钮不依赖登录态，点击后 pathname 为 /docs。 |
| A3 | passed | brief.md | 即使后台 `docs_link` 配置为外部 URL，Hero 按钮仍进入站内 `/docs`，且不打开新标签页。 | 测试注入外部 docs_link，断言 CTA href=/docs、无 target、不是外部 href 且 useStatus 未调用；Playwright 在相同配置下也通过。 |
| A4 | passed | brief.md | 顶部导航的站内文档入口和其它明确的外部资料链接保持原行为。 | 顶部导航仍生成 href=/docs；AppChip、Cherry Studio 和 footer 的明确外部资料链接保持原 URL、新窗口与安全 rel 语义。 |
| A5 | passed | specs/home-docs-navigation/spec.md | Hero documentation button uses the in-app docs route - **WHEN** 访客或已登录用户在首页点击 Hero 的“文档”按钮 - **THEN** 应用 MUST 通过 TanStack Router 在当前标签页导航到 `/docs` - **AND** 导航 MUST 保持单页应用行为。 | Hero 通过 Button render={<Link to='/docs' />} 渲染 CTA；真实 Router 点击证明 SPA 状态从 / 变为 /docs。 |
| A6 | passed | specs/home-docs-navigation/spec.md | External documentation configuration is present - **WHEN** 后台 `docs_link` 配置为外部 URL - **THEN** 首页 Hero 的“文档”按钮 MUST 仍导航到站内 `/docs` - **AND** 该按钮 MUST NOT 打开外部地址或新标签页。 | 外部 docs_link 配置不会覆盖 Hero CTA；单测与浏览器均确认内部 href、无 target 并导航到 /docs。 |
| A7 | passed | specs/home-docs-navigation/spec.md | Other documentation links remain scoped - **WHEN** 页面包含顶部站内接入文档入口或明确的项目介绍、安装指南、第三方参考链接 - **THEN** 顶部站内入口 MUST 继续导航到 `/docs` - **AND** 其它具体外部参考链接 MUST 保持原有目标和外部链接语义。 | 静态复核确认顶部站内入口继续为 /docs，Hero 与 footer 的具体外链保持原有外链语义。 |
| A8 | passed | specs/home-docs-navigation/spec.md | 首页 Hero 文档按钮 MUST 使用类型安全的 TanStack Router `Link`。 | Hero 从 @tanstack/react-router 导入 Link，并使用字面量类型安全目标 <Link to='/docs' />。 |
| A9 | passed | specs/home-docs-navigation/spec.md | 首页 Hero 文档按钮 MUST NOT 依赖 `status.docs_link`。 | 候选删除 useStatus 导入、status 解构、docsUrl 与 docsButton 分支；Hero 中无 docs_link 残留，测试还断言 hook 未调用。 |
| A10 | passed | specs/home-docs-navigation/spec.md | 首页 Hero 文档按钮 MUST NOT 使用 `window.location`、裸内部 `href`、`target="_blank"` 或其它强制整页跳转。 | Hero Docs CTA 未使用 window.location、document.location、裸内部 href 或 target=_blank；保留的 target 仅属于明确外链。 |
| A11 | passed | specs/home-docs-navigation/spec.md | 该导航行为 MUST 有真实 Router 点击回归和浏览器验收。 | 独立重跑真实 TanStack Memory Router Vitest：1 file、2 tests passed；主代理 Playwright 点击验收 href、target、pathname 与无页面/控制台错误均通过。 |
| A12 | passed | specs/home-docs-navigation/spec.md | `/docs` 页面内容、权限和后端契约 MUST 保持不变。 | /docs route 仍为 createFileRoute('/docs/')({ component: Docs })；git diff 与未跟踪文件检查证明 routes/docs 和 features/docs 未被修改。 |

## Checks

| Check | Command | Working directory | Status | Exit | Duration |
| --- | --- | --- | --- | ---: | ---: |
| Hero documentation navigation tests | /d /s /c node_modules\.bin\vitest.cmd run src/features/home/components/sections/__tests__/hero.test.tsx | web | passed | 0 | 3680 ms |
| frontend TypeScript typecheck | /d /s /c node_modules\.bin\tsgo.cmd -b | web | passed | 0 | 2515 ms |
| changed file formatting | /d /s /c node_modules\.bin\oxfmt.cmd --check src/features/home/components/sections/hero.tsx src/features/home/components/sections/__tests__/hero.test.tsx src/features/changelog/data.ts | web | passed | 0 | 369 ms |
| changed file lint | /d /s /c node_modules\.bin\oxlint.cmd -c .oxlintrc.json src/features/home/components/sections/hero.tsx src/features/home/components/sections/__tests__/hero.test.tsx src/features/changelog/data.ts | web | passed | 0 | 255 ms |
| frontend production build | /d /s /c node_modules\.bin\rsbuild.cmd build | web | passed | 0 | 5800 ms |
| repository diff whitespace check | diff --check | . | passed | 0 | 130 ms |

## Blockers

_None._

## Risks and skipped work

- 工作区有其它 change 的未提交文件，但独立 diff 和路径检查已将本候选范围与其隔离。
- 未发现 docs-button-route 自身剩余的功能、兼容性或验证阻塞。

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | 独立只读验证通过候选 b1fcf40c-90b7-47f0-91d9-d50bdfe9b760 的 A1-A12。Verifier 先用 fast-context 定位并以 rg、完整文件和 diff 复核；独立重跑 Hero Router Vitest 与 git diff --check 均通过，并确认 /docs route/feature 无任何变更。 | 2026-08-20T23:04:41.950Z |

## Conclusion

独立只读验证通过候选 b1fcf40c-90b7-47f0-91d9-d50bdfe9b760 的 A1-A12。Verifier 先用 fast-context 定位并以 rg、完整文件和 diff 复核；独立重跑 Hero Router Vitest 与 git diff --check 均通过，并确认 /docs route/feature 无任何变更。
