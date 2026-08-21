# Figma 首页像素级与动画修复规格

## 1. Source of truth

- Figma file: `SnTAn1XXoaAvEQgG61mm38`
- Light homepage: node `6:2`
- Dark homepage: node `44:2`
- Hero reference: node `44:3`
- Feature section/grid references: nodes `38:63` / `6:94`
- User-provided correct screenshots: 图七整体、图八 pills、图九 CTA/utility/02 起始、图十 02、图十一 03、图十二 footer。
- User-provided defect screenshots: 图一至图六；修复必须能回溯到对应正确图和 Figma 节点，不以主观观感签收。
- Build 追加对照：`codex-clipboard-4bdbf72f-08ab-4edc-a5db-4e11dc356e1d.png` 是 `01` 正确基准，`codex-clipboard-eac51eb5-e124-4e8a-bae9-a9b46b77fcf1.png` 是当前缺陷样本。

## 2. Component ownership

| Area | Primary files | Required behavior |
| --- | --- | --- |
| Hero/API panel/pills | `web/src/features/home/components/sections/hero.tsx`, `web/src/features/home/components/hero-terminal-demo.tsx` | Stable panel geometry, complete content, correct pills, four-demo cycle and manual tabs |
| CTA | `web/src/features/home/components/sections/cta.tsx` | Figma geometry, local light/dark assets, correct z-index/overflow and CTA interaction |
| Features 01 | `web/src/features/home/components/sections/features.tsx` | Heading alignment and exact 1196x470 / 598x235 card geometry from Figma nodes `38:63` / `6:94` |
| Workflow 02 | `web/src/features/home/components/sections/how-it-works.tsx` | Number as decoration layer, title/card spacing and three-card geometry |
| Stats 03 | `web/src/features/home/components/sections/stats.tsx` | Number behind content, title wrapping, four stat cards and counter animation |
| Footer | `web/src/components/layout/components/footer.tsx`, `web/src/styles/theme-presets.css` | Figma footer geometry, assets, links, copyright and theme variants |
| Public navigation | `web/src/hooks/use-top-nav-links.ts` and its desktop/mobile consumers | Hide the external Docs item while retaining the internal `/docs` API documentation item |
| Shared motion | `web/src/components/animate-in-view.tsx`, `web/src/styles/index.css` and affected sections | Preserve reduced-motion and restore missing reveal/decorative behavior without dependency changes |
| User-visible record | `web/src/features/changelog/data.ts`, `docs/torch-ai-maintenance-status.md` | Newest-first changelog entry and explicit Verify/archive status |

## 3. Pixel acceptance requirements

### 3.1 Hero/API response panel

- Keep a stable desktop outer panel width of 402px and stable height/bounding box matching the Figma reference; internal body may scroll or reflow only within the measured frame.
- Render all four demo configurations from the existing React state machine. Gemini must show its endpoint, `x-goog-api-key`, request body, candidates response and `usageMetadata` without bottom truncation.
- Preserve `CYCLE_INTERVAL = 4500` and transition behavior unless Figma comparison proves a different timing; clean up timers on unmount.
- Manual tabs select immediately and reset the automatic cycle. `prefers-reduced-motion` disables automatic cycling and transition animation while retaining manual selection.

### 3.1a Core features 01

- At the 1920px Figma reference, section frame `38:63` is 1248x770. Ghost `01` starts at x=0/y=0; eyebrow is x=58/y=105; title is x=58/y=133 with width 430 and height 110.
- Feature grid `6:94` starts at x=52/y=300 and is exactly 1196x470. It is a 2x2 grid of four 598x235 cards; desktop card height must not collapse to the shorter defect rendering.
- Card title, description and provider/security/coverage/developer visuals keep their measured vertical positions. The top/right and lower card surfaces may differ by the Figma emphasis treatment, but no card may resize the grid.
- Mobile may stack the cards, while retaining readable spacing, content-driven height and no horizontal overflow. Existing content overrides and per-card `AnimateInView` delays remain functional.

### 3.2 Supported application pills

- Measure pill height, content width, border radius, border alpha, background, icon size, text line-height and gap from 图八/Figma; encode stable dimensions at desktop and a wrapping rule at mobile.
- Use existing app icon sources/fallback semantics; do not add external runtime fetches merely for visual decoration.
- Ensure the More Apps pill remains a single control with the intended dot treatment and accessible label.

### 3.3 CTA and 02 boundary

- Re-measure CTA outer container and each decorative asset against 图九/Figma; correct absolute offsets, transform rotations, opacity and clipping.
- CTA text and button must remain in the foreground stacking context. Background assets must not intercept pointer events.
- Utility cards and the start of 02 must preserve the Figma vertical gap; responsive stacking must not introduce an extra desktop-height spacer.

### 3.4 Workflow 02

- Background `02` is `aria-hidden`, pointer-events disabled and isolated in a lower z-index decoration layer.
- Eyebrow/title content has an explicit higher stacking context. Three cards maintain equal desktop widths and intended gap/radius/shadow; mobile becomes one column without overflow.
- Existing per-card reveal delays remain deterministic and respect reduced-motion.

### 3.5 Stats 03 and footer

- Background `03` must never overlap the title's readable pixels; use a separate decoration layer and content stacking context rather than relying on source order alone.
- Match title line breaks, stats card width/height/gap and the whitespace before footer to 图十一/图十二.
- Footer uses the correct local light/dark asset, height, corner treatment, content max-width, links and centered copyright; no legacy columns appear in this landing route.

### 3.6 Public navigation and footer CTA

- The shared public top-navigation link source must not emit the external Docs item derived from `status.docs_link`; this applies to desktop and mobile consumers.
- The internal API documentation item remains visible when its existing module switch allows it and continues to link to `/docs`. The separate Hero documentation button is unchanged.
- The landing footer CTA retains the configured site-name label and existing Figma visual treatment. Its target is `/dashboard` when `auth.user` exists and `/sign-in` otherwise.
- The navigation change must not modify the `/docs` page, authentication APIs, administrator custom-home branches or unrelated navigation entries.

## 4. Animation acceptance requirements

- Compare current Torch AI behavior with original `E:\code\new-api\web\src\features\home\components\hero-terminal-demo.tsx` and original landing keyframes in `E:\code\new-api\web\src\styles\index.css`.
- Keep or restore: hero reveal, section scroll reveal, CTA/feature/workflow/stats reveal delays, terminal panel cross-fade, stats counter increment, and any existing decorative float/pulse behavior represented in the original implementation.
- All timers, observers and animation listeners must clean up. No animation may alter the measured layout size or cause horizontal overflow.
- Reduced-motion mode must remove automatic cycling and CSS/keyframe motion while making content visible and usable immediately.

## 5. Compatibility and non-regression

- Preserve the `classic-landing` template ID and existing `Home` custom URL iframe, HTML/Markdown, content overrides and section visibility switches.
- Preserve authenticated-home behavior, payment/login routes, API contracts, database schema, local asset paths and protected branding.
- New copy must be translated in all existing frontend locales and recorded in changelog.

## 6. Verification matrix

| Viewport | Theme | Evidence |
| --- | --- | --- |
| 1920 | light/dark | full-page screenshot, geometry assertions, four API demos |
| 1440 | light/dark | section alignment and overflow |
| 768 | light/dark | responsive stacking, controls and keyboard focus |
| 390 | light/dark | no horizontal overflow, no clipping/overlap |

Additional checks: reduced-motion browser context; automatic cycle over at least one interval; manual tab switching; console errors; affected lint/format; typecheck; production default/classic builds.
