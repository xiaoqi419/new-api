---
generated_from_state_version: 10
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 2
- Verifier attempt: 1
- Completed: 2026-08-20T17:06:26.045Z
- Summary: Figma 定位外框、卡片几何、响应式缩放、无障碍与非回归检查均通过；1920px 实测间距 202.01px，窄桌面与移动端无重叠、裁切或水平滚动。

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | **A1**：1920px 下搜索框保持 `545x54`，三张卡分别使用 Figma 的 `300x473.067`、`330x523.903`、`285x441.629` 尺寸与 `-8deg`、`9deg`、`13deg` 角度；旋转后的第一张卡可见左边缘约为页面 `x=1092`，与搜索框右边缘约 `x=891` 保持约 201px 间距。 | Playwright 在 1920px 测得搜索框 545x54、右边缘 890.5，桃色卡左边缘 1092.51，间距 202.01px；三卡尺寸与角度由回归测试保护。 |
| A2 | passed | brief.md | **A2**：三张卡使用 Figma 外框坐标关系：桃色外框 `263.02/16/362.919x510.215`，中心外框 `389.79/0/407.894x569.076`，薄荷外框 `603.02/102/377.04x494.422`；中心卡 `z-index` 最高，薄荷卡位于桃色卡之上。 | PricingHero 使用三个未旋转定位外框，坐标/尺寸与 Figma 一致；回归测试验证 z-10/z-30/z-20。 |
| A3 | passed | brief.md | **A3**：三张卡继续使用 Figma 节点 `75:232` 的渐变、24px 圆角、阴影和文案，不新增远程资源；装饰组及其卡片保持 `aria-hidden` 和不可点击。 | 三组 Figma 渐变、24px 圆角、阴影、aria-hidden 和 pointer-events-none 均保留，浏览器截图复核通过。 |
| A4 | passed | brief.md | **A4**：1440、1280 和约 1230px 桌面视口下，卡片组按同一设计坐标整体缩放与锚定，搜索框和任一卡片均不重叠，Hero 与页面不存在水平滚动。 | Playwright 浅深主题矩阵覆盖 1536/1440/1280/1230，均无搜索重叠、右侧裁切或水平溢出。 |
| A5 | passed | brief.md | **A5**：768px 和 390px 下装饰组不遮挡标题、说明或搜索框，不产生横向滚动；搜索输入、清空和 Ctrl/Cmd+K 行为不变。 | Playwright 在 768/390 浅深主题确认装饰组 display:none、页面 scrollWidth 等于 viewport；搜索保持可见。 |
| A6 | passed | brief.md | **A6**：定向 Hero 测试、变更文件 lint/format、前端 typecheck 和生产 build 通过；浏览器验收覆盖 1920、1440、1230、768、390 的浅色与深色关键布局。 | Runtime 重新执行 Vitest、oxlint、tsgo typecheck 和 Rsbuild production build，四项均通过；Playwright 矩阵通过。 |
| A7 | passed | specs/pricing-hero-geometry/spec.md | `/pricing` Hero 在左侧提供模型说明与搜索，在右侧提供三张纯装饰 New API 卡片。装饰卡必须忠实表达 Figma 设计，同时在不同桌面宽度中保持与搜索区域分离；它们不承载业务交互，也不改变模型广场的任何数据与路由行为。 | 改动仅涉及 PricingHero 装饰结构、回归测试和 changelog，未改变模型数据或路由行为。 |
| A8 | passed | specs/pricing-hero-geometry/spec.md | Figma file key：`SnTAn1XXoaAvEQgG61mm38`。 | 实现依据已读取的 Figma file key SnTAn1XXoaAvEQgG61mm38。 |
| A9 | passed | specs/pricing-hero-geometry/spec.md | 搜索框节点：`75:230`，参考尺寸 `545x54`。 | Playwright 在 1920px 测得搜索框 545x54，与节点 75:230 一致。 |
| A10 | passed | specs/pricing-hero-geometry/spec.md | 装饰卡组节点：`75:232`。 | 装饰卡结构与尺寸依据已读取的 Figma 节点 75:232。 |
| A11 | passed | specs/pricing-hero-geometry/spec.md | Figma reference code 仅用于测量和结构解释，生产实现必须使用项目现有 React、Tailwind、i18next 与组件约定。 | 实现复用现有 React、Tailwind、i18next、PricingHero 与 SearchBar，没有新增依赖或粘贴参考代码。 |
| A12 | passed | specs/pricing-hero-geometry/spec.md | 搜索框在 1920px 参考视口下保持 `545x54` 和现有左侧锚点。修复装饰卡不得通过缩窄、移动或覆盖搜索框实现。输入、清空、占位文案、Ctrl/Cmd+K 聚焦、过滤范围和可访问名称保持不变。 | SearchBar 调用、props 和交互代码未修改；1920px 搜索几何仍为 545x54。 |
| A13 | passed | specs/pricing-hero-geometry/spec.md | 卡片组使用一个 980px 宽的设计坐标空间。每张卡由一个未旋转的绝对定位外框和一个在外框中水平、垂直居中的旋转卡片组成；外框承担 Figma 坐标，卡片本体只承担尺寸、旋转、圆角、阴影和内容。 | DOM 新增 980px stage 和三个 data-pricing-decoration-frame 外框，卡片在 flex 外框内居中旋转。 |
| A14 | passed | specs/pricing-hero-geometry/spec.md | 桃色计费卡外框：`left=263.02`、`top=16`、`width=362.919`、`height=510.215`；卡片 `300x473.067`，旋转 `-8deg`。 | 回归测试验证桃色外框 263.02/16/362.919x510.215 与卡片 300x473.067/-8deg。 |
| A15 | passed | specs/pricing-hero-geometry/spec.md | 中心模型卡外框：`left=389.79`、`top=0`、`width=407.894`、`height=569.076`；卡片 `330x523.903`，旋转 `9deg`。 | 回归测试验证中心外框 389.79/0/407.894x569.076 与卡片 330x523.903/9deg。 |
| A16 | passed | specs/pricing-hero-geometry/spec.md | 薄荷路由卡外框：`left=603.02`、`top=102`、`width=377.04`、`height=494.422`；卡片 `285x441.629`，旋转 `13deg`。 | 回归测试验证薄荷外框 603.02/102/377.04x494.422 与卡片 285x441.629/13deg。 |
| A17 | passed | specs/pricing-hero-geometry/spec.md | 中心模型卡层级最高，薄荷路由卡次之，桃色计费卡最低。外框不得裁切旋转卡片。 | 回归测试验证三外框层级 z-10/z-30/z-20；Playwright 确认旋转包围盒未被右侧裁切。 |
| A18 | passed | specs/pricing-hero-geometry/spec.md | 卡片保持 24px 圆角和 `0 20px 38px rgba(0,0,0,0.28)` 阴影。桃色、中心和薄荷卡分别使用 Figma 节点 `75:232` 的既有三组线性渐变。卡片内 New API、芯片、符号和标签使用既有 i18n 文案与固定内边距；装饰组及卡片对辅助技术隐藏，不可点击，不进入焦点顺序。 | Figma 渐变、圆角、阴影、文案和装饰无障碍语义由组件测试与浅深截图共同复核。 |
| A19 | passed | specs/pricing-hero-geometry/spec.md | 1920px 使用 1:1 设计比例和右侧锚点，使桃色卡旋转后的可见左边缘约为页面 `x=1092`，与搜索框右边缘约 `x=891` 保持约 201px 空隙。 | Playwright 1920px 测得 stage x=829.5、桃色卡 x=1092.51、搜索右边缘 x=890.5，实际间距 202.01px。 |
| A20 | passed | specs/pricing-hero-geometry/spec.md | 1440px 与 1280px 对整个 980px 坐标空间统一缩放并以右下为变换原点；约 1230px 使用更小的统一缩放。任何桌面断点都不得逐张改变卡片之间的相对坐标，也不得让卡片与搜索框重叠。小于桌面断点时装饰组可以隐藏，但标题、说明、搜索框和工作区必须保持可读、可操作且无水平滚动。 | 整体 stage 在 1440/1280 使用 0.82 缩放、1230 使用 0.62 缩放；1536 亦保持 0.82，1720px 后才恢复 1:1。 |
| A21 | passed | specs/pricing-hero-geometry/spec.md | 卡片可以保留现有克制的淡入动效；`prefers-reduced-motion: reduce` 时移除非必要动画。动效不得改变外框尺寸、响应式锚点或稳定布局。装饰内容使用 `aria-hidden`，不得产生可聚焦后代。 | 现有 motion-safe 淡入与 motion-reduce:animate-none 保留，回归测试通过，外框尺寸不受动效影响。 |
| A22 | passed | specs/pricing-hero-geometry/spec.md | 修复不得改变模型计数、搜索、筛选、价格、排序、视图、详情跳转、权限、主题或 URL search schema。浅色与深色使用同一几何。页面在 1920、1440、1230、768 和 390px 下不得产生水平滚动、搜索遮挡或不可达内容。 | Git diff 仅包含 Hero、Hero 测试、changelog 和 Comet 产物；浅深响应式矩阵无水平滚动。 |
| A23 | passed | specs/pricing-hero-geometry/spec.md | 回归测试必须直接保护定位外框与卡片本体的分层结构、Figma 外框坐标、卡片尺寸/角度/层级、响应式整体缩放以及 reduced-motion 行为。浏览器验收读取关键 DOM 包围盒并检查搜索框与卡片的间距，而不能只依赖静态 class 快照。实现需通过涉及文件 lint/format、typecheck 和生产 build。 | 定位结构回归测试 5/5 通过；Runtime 的 lint、typecheck、build 均通过，Playwright 读取真实 DOM 几何完成验收。 |

## Checks

| Check | Command | Working directory | Status | Exit | Duration |
| --- | --- | --- | --- | ---: | ---: |
| PricingHero regression tests | run src/features/pricing/components/__tests__/pricing-hero.test.tsx --maxWorkers=1 | web | passed | 0 | 4109 ms |
| Changed frontend files lint | -c .oxlintrc.json src/features/pricing/components/pricing-hero.tsx src/features/pricing/components/__tests__/pricing-hero.test.tsx src/features/changelog/data.ts | web | passed | 0 | 315 ms |
| Frontend typecheck | -b | web | passed | 0 | 2678 ms |
| Frontend production build | build | web | passed | 0 | 12169 ms |

## Blockers

_None._

## Risks and skipped work

_None reported._

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | fail | A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12, A13, A14, A15, A16, A17, A18, A19, A20, A21, A22, A23 | 候选实现缺失，返回 Build 完成代码与回归测试。 | 2026-08-20T16:46:04.928Z |
| 1 | 2 | 1 | pass | — | Figma 定位外框、卡片几何、响应式缩放、无障碍与非回归检查均通过；1920px 实测间距 202.01px，窄桌面与移动端无重叠、裁切或水平滚动。 | 2026-08-20T17:06:26.045Z |

## Conclusion

Figma 定位外框、卡片几何、响应式缩放、无障碍与非回归检查均通过；1920px 实测间距 202.01px，窄桌面与移动端无重叠、裁切或水平滚动。
