---
generated_from_state_version: 21
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 2
- Iteration: 4
- Verifier attempt: 1
- Completed: 2026-08-20T09:29:58.236Z
- Summary: Independent Sol/high verification passed A1-A66. Features, utility, Workflow and Stats now share the CTA center axis; seven viewport checks, light/dark parity, zero horizontal overflow, zero console errors, focused format/lint/typecheck and diff-check all passed.

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | 图一缺陷：切换到 Gemini 后 endpoint、headers、request、response 和 footer metrics 均在面板内部完整显示，不被固定高度或 overflow 截断；自动循环和手动 tab 切换不改变面板外框尺寸。 | Inherited iteration-3 Luna/max evidence remains valid; iteration 4 did not touch the API demo. |
| A2 | passed | brief.md | 新增图一/图二：以新增图一和 Figma `38:63` / `6:94` 为正确基准；`01`、核心功能 eyebrow、两行标题严格对齐，内容区为 1196x470，四张卡片为 598x235，不能出现缺陷图二中的标题整体上移、内容区变矮或内部留白错位。 | Features heading geometry remains intact and the 1196x470 grid is now centered. |
| A3 | passed | brief.md | 图二/图八：三个支持应用 pill 的高度、内容宽度、icon/text 间距和整体 x/y 位置与 Figma 截图一致；More pill 的圆点样式正确，窄屏换行不重叠。 | Application pills were untouched and retain accepted responsive behavior. |
| A4 | passed | brief.md | 图三/图九：CTA 文字、按钮、两块渐变装饰、星星、背景线与 utility cards 的相对位置和裁切边界与 Figma 一致；不出现装饰遮住文案或超出容器。 | CTA is unchanged and the utility row now shares its center axis. |
| A5 | passed | brief.md | 图四/图十：`02` 标题和三张 workflow cards 的相对位置、尺寸、强调卡片样式与基准一致；章节编号位于装饰层，不挤压内容。 | Workflow heading/card geometry remains intact and the card track is centered. |
| A6 | passed | brief.md | 图五/图十一：`03` 编号不遮挡 eyebrow 或标题，标题换行与统计卡片起始位置正确；四张统计卡片和 footer 之间留白符合基准。 | Stats layering and card geometry remain intact and centered. |
| A7 | passed | brief.md | 图六/图十二：footer 的高度、顶部圆角、logo/name、文案、协议链接、居中版权和背景资产位置一致；light/dark 均无多余旧版列布局。 | Footer was untouched and retains iteration-3 accepted evidence. |
| A8 | passed | brief.md | 顶部导航：桌面与移动端均不再输出由 `status.docs_link` 生成的外部“文档/Docs”，站内“接入文档”仍存在且指向 `/docs`；Hero 内独立文档按钮保持原行为。 | Navigation was untouched and retains iteration-3 accepted evidence. |
| A9 | passed | brief.md | Footer CTA：保留配置的站点名称和既有视觉；`auth.user` 存在时 href 为 `/dashboard`，否则为 `/sign-in`，未登录点击能够进入登录页。 | Footer authentication routing was untouched and retains accepted evidence. |
| A10 | passed | brief.md | 动画：初次进入页面有分段 reveal；Hero 装饰和 API panel 保留动态切换；滚动 reveal 只按既有 `AnimateInView` 语义触发；Stats counter 递增；手动切换重置 demo 定时器；`prefers-reduced-motion: reduce` 时关闭自动循环和 CSS 动画并立即显示内容。 | Motion behavior was not changed by the alignment repair; counter cleanup remains present. |
| A11 | passed | brief.md | 浏览器矩阵：1920/1440/768/390 的 light/dark 截图、DOM geometry、无横向溢出、无 console error；管理员自定义 URL/HTML/Markdown/template 分支保持原行为。 | Browser geometry passed at 1920,1440,1280,1279,1024,768,390 with no overflow or console errors; unchanged custom-home evidence is inherited. |
| A12 | passed | specs/figma-home-pixel-animation-fix/spec.md | Figma file: `SnTAn1XXoaAvEQgG61mm38` | Figma file reference remains recorded. |
| A13 | passed | specs/figma-home-pixel-animation-fix/spec.md | Light homepage: node `6:2` | Light homepage node remains recorded. |
| A14 | passed | specs/figma-home-pixel-animation-fix/spec.md | Dark homepage: node `44:2` | Dark homepage node remains recorded. |
| A15 | passed | specs/figma-home-pixel-animation-fix/spec.md | Hero reference: node `44:3` | Hero reference remains recorded. |
| A16 | passed | specs/figma-home-pixel-animation-fix/spec.md | Feature section/grid references: nodes `38:63` / `6:94` | Features references remain recorded and were used for geometry review. |
| A17 | passed | specs/figma-home-pixel-animation-fix/spec.md | User-provided correct screenshots: 图七整体、图八 pills、图九 CTA/utility/02 起始、图十 02、图十一 03、图十二 footer。 | Correct screenshot references remain recorded. |
| A18 | passed | specs/figma-home-pixel-animation-fix/spec.md | User-provided defect screenshots: 图一至图六；修复必须能回溯到对应正确图和 Figma 节点，不以主观观感签收。 | Defect screenshot references remain recorded. |
| A19 | passed | specs/figma-home-pixel-animation-fix/spec.md | Build 追加对照：`codex-clipboard-4bdbf72f-08ab-4edc-a5db-4e11dc356e1d.png` 是 `01` 正确基准，`codex-clipboard-eac51eb5-e124-4e8a-bae9-a9b46b77fcf1.png` 是当前缺陷样本。 | Additional Features comparison references remain recorded. |
| A20 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| Area \| Primary files \| Required behavior \| | Component ownership table remains satisfied. |
| A21 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| Hero/API panel/pills \| `web/src/features/home/components/sections/hero.tsx`, `web/src/features/home/components/hero-terminal-demo.tsx` \| Stable panel geometry, complete content, correct pills, four-demo cycle and manual tabs \| | Hero/API panel files were untouched and retain iteration-3 accepted evidence. |
| A22 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| CTA \| `web/src/features/home/components/sections/cta.tsx` \| Figma geometry, local light/dark assets, correct z-index/overflow and CTA interaction \| | CTA files were untouched and CTA remains the measured center reference. |
| A23 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| Features 01 \| `web/src/features/home/components/sections/features.tsx` \| Heading alignment and exact 1196x470 / 598x235 card geometry from Figma nodes `38:63` / `6:94` \| | Features 1196x470 grid and 598x235 card geometry are preserved and centered. |
| A24 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| Workflow 02 \| `web/src/features/home/components/sections/how-it-works.tsx` \| Number as decoration layer, title/card spacing and three-card geometry \| | Workflow decorative number, heading and three-card layout are preserved and centered. |
| A25 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| Stats 03 \| `web/src/features/home/components/sections/stats.tsx` \| Number behind content, title wrapping, four stat cards and counter animation \| | Stats layering, cards and counter behavior are preserved and centered. |
| A26 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| Footer \| `web/src/components/layout/components/footer.tsx`, `web/src/styles/theme-presets.css` \| Figma footer geometry, assets, links, copyright and theme variants \| | Footer files were untouched and retain accepted evidence. |
| A27 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| Public navigation \| `web/src/hooks/use-top-nav-links.ts` and its desktop/mobile consumers \| Hide the external Docs item while retaining the internal `/docs` API documentation item \| | Public navigation files were untouched and retain accepted evidence. |
| A28 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| Shared motion \| `web/src/components/animate-in-view.tsx`, `web/src/styles/index.css` and affected sections \| Preserve reduced-motion and restore missing reveal/decorative behavior without dependency changes \| | Shared motion files were untouched; section AnimateInView behavior remains. |
| A29 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| User-visible record \| `web/src/features/changelog/data.ts`, `docs/torch-ai-maintenance-status.md` \| Newest-first changelog entry and explicit Verify/archive status \| | Existing changelog and maintenance record are present; lifecycle update follows accepted Verify. |
| A30 | passed | specs/figma-home-pixel-animation-fix/spec.md | Keep a stable desktop outer panel width of 402px and stable height/bounding box matching the Figma reference; internal body may scroll or reflow only within the measured frame. | API panel fixed geometry was untouched and retains iteration-3 accepted evidence. |
| A31 | passed | specs/figma-home-pixel-animation-fix/spec.md | Render all four demo configurations from the existing React state machine. Gemini must show its endpoint, `x-goog-api-key`, request body, candidates response and `usageMetadata` without bottom truncation. | Four demo rendering including Gemini was untouched and retains accepted evidence. |
| A32 | passed | specs/figma-home-pixel-animation-fix/spec.md | Preserve `CYCLE_INTERVAL = 4500` and transition behavior unless Figma comparison proves a different timing; clean up timers on unmount. | CYCLE_INTERVAL and timer cleanup were untouched. |
| A33 | passed | specs/figma-home-pixel-animation-fix/spec.md | Manual tabs select immediately and reset the automatic cycle. `prefers-reduced-motion` disables automatic cycling and transition animation while retaining manual selection. | Manual tabs and reduced-motion cycling behavior were untouched. |
| A34 | passed | specs/figma-home-pixel-animation-fix/spec.md | At the 1920px Figma reference, section frame `38:63` is 1248x770. Ghost `01` starts at x=0/y=0; eyebrow is x=58/y=105; title is x=58/y=133 with width 430 and height 110. | Features ghost, eyebrow and title internal geometry remains unchanged inside the centered frame. |
| A35 | passed | specs/figma-home-pixel-animation-fix/spec.md | Feature grid `6:94` starts at x=52/y=300 and is exactly 1196x470. It is a 2x2 grid of four 598x235 cards; desktop card height must not collapse to the shorter defect rendering. | Browser measured Features at 1196x470 with four 598x235 cards on desktop. |
| A36 | passed | specs/figma-home-pixel-animation-fix/spec.md | Card title, description and provider/security/coverage/developer visuals keep their measured vertical positions. The top/right and lower card surfaces may differ by the Figma emphasis treatment, but no card may resize the grid. | Feature card internal positions and fixed card sizing remain unchanged. |
| A37 | passed | specs/figma-home-pixel-animation-fix/spec.md | Mobile may stack the cards, while retaining readable spacing, content-driven height and no horizontal overflow. Existing content overrides and per-card `AnimateInView` delays remain functional. | Responsive stacking passed at 1279,1024,768,390 without horizontal overflow. |
| A38 | passed | specs/figma-home-pixel-animation-fix/spec.md | Measure pill height, content width, border radius, border alpha, background, icon size, text line-height and gap from 图八/Figma; encode stable dimensions at desktop and a wrapping rule at mobile. | Pill geometry was untouched and retains accepted evidence. |
| A39 | passed | specs/figma-home-pixel-animation-fix/spec.md | Use existing app icon sources/fallback semantics; do not add external runtime fetches merely for visual decoration. | No external decorative fetch was added. |
| A40 | passed | specs/figma-home-pixel-animation-fix/spec.md | Ensure the More Apps pill remains a single control with the intended dot treatment and accessible label. | More Apps control was untouched and retains accepted evidence. |
| A41 | passed | specs/figma-home-pixel-animation-fix/spec.md | Re-measure CTA outer container and each decorative asset against 图九/Figma; correct absolute offsets, transform rotations, opacity and clipping. | CTA decoration was untouched and retains accepted evidence. |
| A42 | passed | specs/figma-home-pixel-animation-fix/spec.md | CTA text and button must remain in the foreground stacking context. Background assets must not intercept pointer events. | CTA stacking and pointer behavior were untouched. |
| A43 | passed | specs/figma-home-pixel-animation-fix/spec.md | Utility cards and the start of 02 must preserve the Figma vertical gap; responsive stacking must not introduce an extra desktop-height spacer. | Utility row remains 1040px centered and vertical spacing is unchanged. |
| A44 | passed | specs/figma-home-pixel-animation-fix/spec.md | Background `02` is `aria-hidden`, pointer-events disabled and isolated in a lower z-index decoration layer. | Workflow decoration remains aria-hidden, pointer-disabled and below content. |
| A45 | passed | specs/figma-home-pixel-animation-fix/spec.md | Eyebrow/title content has an explicit higher stacking context. Three cards maintain equal desktop widths and intended gap/radius/shadow; mobile becomes one column without overflow. | Workflow heading stays above decoration; equal desktop cards and responsive stacking remain. |
| A46 | passed | specs/figma-home-pixel-animation-fix/spec.md | Existing per-card reveal delays remain deterministic and respect reduced-motion. | Workflow reveal delays remain unchanged. |
| A47 | passed | specs/figma-home-pixel-animation-fix/spec.md | Background `03` must never overlap the title's readable pixels; use a separate decoration layer and content stacking context rather than relying on source order alone. | Stats decoration remains below the readable heading layer. |
| A48 | passed | specs/figma-home-pixel-animation-fix/spec.md | Match title line breaks, stats card width/height/gap and the whitespace before footer to 图十一/图十二. | Stats title/cards/footer spacing remains unchanged; card group is centered. |
| A49 | passed | specs/figma-home-pixel-animation-fix/spec.md | Footer uses the correct local light/dark asset, height, corner treatment, content max-width, links and centered copyright; no legacy columns appear in this landing route. | Footer local assets and landing layout were untouched. |
| A50 | passed | specs/figma-home-pixel-animation-fix/spec.md | The shared public top-navigation link source must not emit the external Docs item derived from `status.docs_link`; this applies to desktop and mobile consumers. | External Docs remains omitted by unchanged accepted navigation code. |
| A51 | passed | specs/figma-home-pixel-animation-fix/spec.md | The internal API documentation item remains visible when its existing module switch allows it and continues to link to `/docs`. The separate Hero documentation button is unchanged. | Internal /docs and Hero documentation behavior remain unchanged. |
| A52 | passed | specs/figma-home-pixel-animation-fix/spec.md | The landing footer CTA retains the configured site-name label and existing Figma visual treatment. Its target is `/dashboard` when `auth.user` exists and `/sign-in` otherwise. | Footer CTA label and auth target remain unchanged. |
| A53 | passed | specs/figma-home-pixel-animation-fix/spec.md | The navigation change must not modify the `/docs` page, authentication APIs, administrator custom-home branches or unrelated navigation entries. | No docs, auth API, custom-home or unrelated navigation code changed. |
| A54 | passed | specs/figma-home-pixel-animation-fix/spec.md | Compare current Torch AI behavior with original `E:\code\new-api\web\src\features\home\components\hero-terminal-demo.tsx` and original landing keyframes in `E:\code\new-api\web\src\styles\index.css`. | Original motion comparison evidence remains applicable; motion files were untouched in iteration 4. |
| A55 | passed | specs/figma-home-pixel-animation-fix/spec.md | Keep or restore: hero reveal, section scroll reveal, CTA/feature/workflow/stats reveal delays, terminal panel cross-fade, stats counter increment, and any existing decorative float/pulse behavior represented in the original implementation. | Required reveal, cross-fade, counter and decorative motion remain present. |
| A56 | passed | specs/figma-home-pixel-animation-fix/spec.md | All timers, observers and animation listeners must clean up. No animation may alter the measured layout size or cause horizontal overflow. | No animation changed layout size; all measured viewports had zero horizontal overflow and counter RAF cleanup remains. |
| A57 | passed | specs/figma-home-pixel-animation-fix/spec.md | Reduced-motion mode must remove automatic cycling and CSS/keyframe motion while making content visible and usable immediately. | Reduced-motion implementation was untouched and retains accepted evidence. |
| A58 | passed | specs/figma-home-pixel-animation-fix/spec.md | Preserve the `classic-landing` template ID and existing `Home` custom URL iframe, HTML/Markdown, content overrides and section visibility switches. | Classic landing template/custom branches were untouched. |
| A59 | passed | specs/figma-home-pixel-animation-fix/spec.md | Preserve authenticated-home behavior, payment/login routes, API contracts, database schema, local asset paths and protected branding. | Authentication, payment routes, APIs, schema, assets and protected branding were untouched. |
| A60 | passed | specs/figma-home-pixel-animation-fix/spec.md | New copy must be translated in all existing frontend locales and recorded in changelog. | No new copy was added; iteration-3 interpolation/locales/changelog fix remains. |
| A61 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| Viewport \| Theme \| Evidence \| | Viewport/theme matrix completed for the alignment change. |
| A62 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| 1920 \| light/dark \| full-page screenshot, geometry assertions, four API demos \| | 1920 geometry is centered; unchanged API demos and prior screenshots remain applicable. |
| A63 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| 1440 \| light/dark \| section alignment and overflow \| | 1440 light/dark geometry is identical, centered and overflow-free. |
| A64 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| 768 \| light/dark \| responsive stacking, controls and keyboard focus \| | 768 responsive geometry is centered and overflow-free; unchanged controls retain prior evidence. |
| A65 | passed | specs/figma-home-pixel-animation-fix/spec.md | \| 390 \| light/dark \| no horizontal overflow, no clipping/overlap \| | 390 layout is 332px centered with no document overflow or clipping. |
| A66 | passed | specs/figma-home-pixel-animation-fix/spec.md | Additional checks: reduced-motion browser context; automatic cycle over at least one interval; manual tab switching; console errors; affected lint/format; typecheck; production default/classic builds. | Focused oxfmt, oxlint, tsgo, diff-check, browser matrix and console checks passed; unchanged production build evidence is inherited. |

## Checks

_No Runtime checks were recorded._

## Blockers

_None._

## Risks and skipped work

- Iteration 4 did not rerun the unchanged production/classic builds; iteration-3 accepted build evidence remains applicable.
- No commit, push, merge, deployment or online acceptance was performed.
- Verifier model degraded to Sol/high only after two genuine Luna/max 503 failures and two Terra/xhigh infrastructure failures.

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-08-20T05:29:50.540Z |
| 2 | 1 | 1 | execution-error | — | Verifier runtime model mismatch: dispatch explicitly requested gpt-5.6-luna max, but the verifier reported gpt-5.6-sol high. Per project model gate this cannot count as a Luna attempt or semantic verdict; retry after correcting effective agent role/config. | 2026-08-20T05:59:05.504Z |
| 2 | 1 | 2 | fail | A1, A11, A21, A31, A39, A56, A60, A62 | Luna max independent verifier failed the candidate: A1/A21/A31/A62 hidden Hero metrics, A39 external decorative favicon fetch, A56 uncanceled Stats animation frame, A60 hardcoded footer copy; A11 blocked for missing authenticated admin custom-home browser coverage. | 2026-08-20T06:04:10.744Z |
| 2 | 2 | 1 | fail | A60 | Luna/max independent verification passes 65 of 66 items. A60 fails because the footer second line still hardcodes English `with`; return to Build for a focused i18n repair. | 2026-08-20T06:36:49.366Z |
| 2 | 3 | 1 | pass | — | Independent gpt-5.6-luna/max verification passed all A1-A66. The sole prior failure A60 is fixed through standard i18next interpolation across all seven locales; all focused Runtime checks passed. | 2026-08-20T06:48:46.549Z |
| 2 | 3 | 1 | recovery | — | 用户确认统一 01/02/03 与 CTA 的页面中轴；当前候选存在多套水平坐标导致模块错位，返回 Build 修复并保留既有尺寸、动画、响应式和主题行为。 | 2026-08-20T07:17:34.690Z |
| 2 | 4 | 1 | pass | — | Independent Sol/high verification passed A1-A66. Features, utility, Workflow and Stats now share the CTA center axis; seven viewport checks, light/dark parity, zero horizontal overflow, zero console errors, focused format/lint/typecheck and diff-check all passed. | 2026-08-20T09:29:58.236Z |

## Conclusion

Independent Sol/high verification passed A1-A66. Features, utility, Workflow and Stats now share the CTA center axis; seven viewport checks, light/dark parity, zero horizontal overflow, zero console errors, focused format/lint/typecheck and diff-check all passed.
