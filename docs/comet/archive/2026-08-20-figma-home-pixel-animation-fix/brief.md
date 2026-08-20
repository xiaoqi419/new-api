# Outcome

将 Torch AI 默认 `classic-landing` 首页按用户提供的图七至图十二与 Figma 文件 `SnTAn1XXoaAvEQgG61mm38` 做逐图、可测量的像素级修复，并恢复原版 New API 首页的动态行为。图一至图六作为当前缺陷证据，不以“视觉相似”代替几何、层级、裁切和交互验收。

# Scope

- 修复 Hero API response demo 面板的固定边界、内容布局和 Gemini 示例裁切；四种 demo（Chat、Responses、Claude、Gemini）均需完整可读且切换时 bounding box 稳定。
- 按新增正确图一与缺陷图二修复 `01` 核心功能：章节编号、eyebrow、两行标题的 x/y 对齐，以及 1196x470 内容区、四张 598x235 卡片和卡内视觉元素的高度/间距；保持 utility cards 后续节奏。
- 按图八重做支持应用 pills：高度、宽度、左右 padding、图标尺寸、文字字号/字重、边框、背景和 pill 间距逐项对齐。
- 按图九修复 CTA 文案、按钮、渐变卡片、渐变条、星星和背景资产的尺寸、位置、旋转角度、裁切和层级；同时对齐 utility cards 与 `02` 区域起始位置。
- 按图十修复 `02` 工作流程区域的章节编号、eyebrow、标题、三张卡片的尺寸/间距/圆角/阴影/强调态和垂直节奏。
- 按图十一修复 `03` 统计区域的 stacking context，确保背景编号不遮挡 eyebrow/title，并对齐标题换行和统计卡片几何。
- 按图十二修复统计区到 footer 的整体节奏、footer 高度、内容位置、版权/链接、背景装饰和浅/深色资源。
- 逐项核对图七整体首页在 1920px light/dark 下的首屏层级与章节连接，并在 1440、768、390 视口保持既定响应式折叠和无横向溢出。
- 恢复并核对原版 New API 的入场 reveal、Hero/CTA 装饰动效、API demo 自动循环、手动切换、统计数字递增和 `prefers-reduced-motion` 行为；不新增未经批准的动画依赖。
- 公共顶部导航隐藏外部“文档/Docs”入口，只保留站内“接入文档”入口并继续指向 `/docs`；Hero 内独立的文档按钮不在本项移除范围。
- 首页 footer CTA 保留既有站点名称和视觉样式，未登录时进入 `/sign-in`，已登录时进入 `/dashboard`。
- 所有用户可见变更更新 `web/src/features/changelog/data.ts`，验收完成后同步 `docs/torch-ai-maintenance-status.md`。

# Non-goals

- 不改变后端 API、数据库、支付、登录、管理员自定义首页分支、模板 ID、section 开关或现有二开业务功能。
- 不开发微信登录、无限画布、素材库或代理公开入口；这些功能按现有产品决策继续屏蔽/搁置。
- 不升级 React、Tailwind、Base UI、构建工具或其他依赖，不引入第二套 UI/动画框架。
- 不删除、替换或弱化受保护的 `new-api`、`QuantumNous`、版权和许可证信息。
- 不把 Figma 临时 asset URL 作为运行时资源；继续使用仓库内 `web/public/assets/home-figma/` 资源。

# Acceptance examples

- 图一缺陷：切换到 Gemini 后 endpoint、headers、request、response 和 footer metrics 均在面板内部完整显示，不被固定高度或 overflow 截断；自动循环和手动 tab 切换不改变面板外框尺寸。
- 新增图一/图二：以新增图一和 Figma `38:63` / `6:94` 为正确基准；`01`、核心功能 eyebrow、两行标题严格对齐，内容区为 1196x470，四张卡片为 598x235，不能出现缺陷图二中的标题整体上移、内容区变矮或内部留白错位。
- 图二/图八：三个支持应用 pill 的高度、内容宽度、icon/text 间距和整体 x/y 位置与 Figma 截图一致；More pill 的圆点样式正确，窄屏换行不重叠。
- 图三/图九：CTA 文字、按钮、两块渐变装饰、星星、背景线与 utility cards 的相对位置和裁切边界与 Figma 一致；不出现装饰遮住文案或超出容器。
- 图四/图十：`02` 标题和三张 workflow cards 的相对位置、尺寸、强调卡片样式与基准一致；章节编号位于装饰层，不挤压内容。
- 图五/图十一：`03` 编号不遮挡 eyebrow 或标题，标题换行与统计卡片起始位置正确；四张统计卡片和 footer 之间留白符合基准。
- 图六/图十二：footer 的高度、顶部圆角、logo/name、文案、协议链接、居中版权和背景资产位置一致；light/dark 均无多余旧版列布局。
- 顶部导航：桌面与移动端均不再输出由 `status.docs_link` 生成的外部“文档/Docs”，站内“接入文档”仍存在且指向 `/docs`；Hero 内独立文档按钮保持原行为。
- Footer CTA：保留配置的站点名称和既有视觉；`auth.user` 存在时 href 为 `/dashboard`，否则为 `/sign-in`，未登录点击能够进入登录页。
- 动画：初次进入页面有分段 reveal；Hero 装饰和 API panel 保留动态切换；滚动 reveal 只按既有 `AnimateInView` 语义触发；Stats counter 递增；手动切换重置 demo 定时器；`prefers-reduced-motion: reduce` 时关闭自动循环和 CSS 动画并立即显示内容。
- 浏览器矩阵：1920/1440/768/390 的 light/dark 截图、DOM geometry、无横向溢出、无 console error；管理员自定义 URL/HTML/Markdown/template 分支保持原行为。

# Constraints and invariants

- Figma 为 file key `SnTAn1XXoaAvEQgG61mm38`；已定位节点：light `6:2`、dark `44:2`、hero `44:3`、feature section `38:63`、feature grid `6:94`。实现前需继续使用 `get_design_context`，再用 `get_metadata`/`get_screenshot` 定点复核 feature、CTA、workflow、stats、footer。
- 代码探索必须先 Fast Context，再用 `rg` 和完整文件阅读；即将修改的 TSX/CSS 必须由执行代理完整阅读。
- 复用现有 React/Tailwind/`AnimateInView`/terminal demo 结构和本地 tokens；稳定尺寸使用响应式约束，避免内容变化引起布局跳动。
- 新增文案使用 i18next flat locale 体系；不得在 JSX 中硬编码只支持单语言的文案。
- 主代理负责 Git、审批、代码审查、Figma/浏览器验收和维护文档；Build 实现由不派生子代理的执行子代理完成。

# Decisions

- 继续在现有 `classic-landing` 和共享 footer/theme 中修复，不创建第二个首页实现。
- 图七至图十二是本轮视觉验收基准；图一至图六只记录缺陷，不覆盖 Figma 几何证据。
- 动画迁移采用原版 New API 已存在的 CSS/React 行为和现有 `AnimateInView`，优先修复遗漏与参数，不引入第三方 motion 库。
- 允许按响应式规则在 768/390 改变排列，但不允许改变信息层级、层叠关系、可读性和交互契约。
- 公共导航只移除外部 Docs 项，不修改 `/docs` 页面、管理员自定义首页分支或 Hero 内独立文档按钮。
- Footer CTA 的认证后目标采用既有控制台路由 `/dashboard`；连接模型 CTA 的 `/workbench` 行为属于另一处已确认修复，保持不变。

# Open questions

- [blocking] CONFIRM: 用户确认以上图一至图十二像素级修复、原版动画迁移、顶部只保留站内接入文档、footer CTA 登录态路由、非目标和验收矩阵，并允许进入 Build。

# Verification expectations

- Build 后运行受影响 oxlint/oxfmt、`bun run typecheck`、必要的首页定向测试、`bun run build` 和 `web/classic` build。
- 使用 Playwright/浏览器完成 8 个视口/主题截图，检查关键 DOM bounding boxes、API 四种 demo、自动/手动切换、reduced-motion、键盘可达性、scrollWidth 和 console error。
- Verify 接受后先更新维护状态文档，再由 Comet Native 自动 Archive；未部署、未推送和线上支付不写成已完成。
