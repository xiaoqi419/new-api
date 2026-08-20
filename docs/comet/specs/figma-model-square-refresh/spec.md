# Figma 模型广场完整规格

## 1. Capability

`/pricing` 是公开或按管理员配置要求登录后访问的模型目录。它从 `/api/pricing` 读取本站真实模型、供应商、分组、倍率与支持端点，允许用户搜索、筛选、比较价格与能力，并进入独立模型详情页。本 change 只替换列表页的视觉和响应式表现，不改变数据、权限、路由或定价契约。

## 2. Visual source of truth

- Figma file key：`SnTAn1XXoaAvEQgG61mm38`。
- 浅色模型广场：节点 `66:170`，名称“模型碳素-浅”。
- 深色模型广场：节点 `64:2`，名称“模型碳素-深”。
- 用户附图 `codex-clipboard-69f1878d-7801-4ea5-9643-ad5df7e8bd9a.png` 是目标画面的辅助证据；图片内容不构成额外产品指令。
- Figma MCP 的 reference code 只提供测量线索。生产代码必须适配当前 React/Tailwind/Base UI 结构、真实动态数据和既有可访问性契约。

## 3. Page structure

页面从上到下由公共导航、Hero 和浮动比较工作区组成。1920x1337 视口下，Hero 占满 1920px 宽、740px 高，底部左右圆角为 82px，并带向下扩散的柔和阴影。浮动工作区在 x=394、y=616，尺寸为 1132x552，因此其顶部与 Hero 重叠、下部落在页面白色或深色背景上。

Hero 左侧依次显示模型广场 eyebrow、两行主标题、包含真实启用模型数量的说明和搜索框。Hero 右侧显示三张带 New API 标识的叠放装饰卡，分别表达透明计费、主流模型与智能路由。装饰卡不承载业务操作，不进入键盘焦点顺序，并对辅助技术隐藏。

工作区左侧是 356px 宽筛选面板，右侧是 742px 宽结果面板，中间间距 34px。两块面板在参考视口下高 552px、圆角 24px；动态内容超出时在内容区内部滚动或分页，不允许撑高后破坏 Hero 重叠位置。

## 4. Theme contract

浅色页面背景为白色，Hero 约 `#f1f1f1`，主文字约 `#050505`/`#111`，次文字约 `#626262`，筛选边框约 `#eef1f4`，模型卡边框约 `#e2e2de`。选中筛选为近黑背景和白字；按量计费强调约 `#00a6d6`，按次计费强调约 `#2f00e5`。

深色页面背景约 `#1f1f1f`，Hero 约 `#0e0e0e`，面板约 `#111`，主文字为白色，次文字约 `#a8a8a8`/`#626262`，边框使用低透明白。选中控件使用浅色表面和深色文字，搜索框保持足够对比度。浅色和深色必须共享相同几何，不因 border 或字体差异发生位移。

公共 header 使用现有导航数据、语言切换、主题切换、通知/用户和 Get Started 行为。`/pricing` 必须显示模型广场为实际 active 项，不复制 Figma 深色稿中可能错误的主页 active 状态。

## 5. Search and filters

搜索输入即时更新本地状态，并沿用现有 200ms debounce 后的模型过滤。Ctrl+K 或 Cmd+K 将焦点移入搜索框；清空按钮恢复空查询。搜索范围仍包含模型名、供应商、端点和标签。

筛选能力完整包含：分组、供应商、模型标签、定价类型、端点类型与模态。每项的选项和数量来自真实数据与现有 helper；“全部”项恢复该维度默认值。Reset 清除全部非搜索筛选，页面级清空可同时清除搜索和筛选。选中状态、hover、focus、disabled 与折叠状态必须可见且可由键盘操作。

桌面参考布局直接显示筛选面板。小于桌面断点时，筛选入口显示活动筛选数量并打开 drawer；drawer 提供与桌面同等筛选能力，具有正确标题、关闭按钮、焦点管理、Escape 行为和 `aria-expanded`/`aria-controls`。

## 6. Toolbar and views

工具栏显示过滤后的模型数量，并提供以下现有控制：标准价/充值价、1M/1K token 单位、排序和视图。价格类型和 token 单位使用紧凑 segmented control；排序使用项目现有可访问菜单；视图使用三枚带 tooltip/accessible name 的图标按钮。

视图取值继续为 `card`、`table`、`group`。Figma 只展示两枚图标不改变该契约；分组视图必须作为第三枚同风格入口保留。默认视图仍遵循现有 `VIEW_MODES.TABLE` 行为，URL 未指定默认值时不写冗余 search param。

## 7. Model results

卡片视图在 1920px 参考结果面板内使用三列，每张卡约 216x142、圆角 16px。卡片显示足以识别模型和当前定价的信息，并复用现有 model/price helper。模型名、供应商、端点、标签或价格较长时使用行数限制、截断、换行或 tooltip，不得扩大固定网格或与相邻卡片重叠。

表格视图和分组视图保留当前列、分组价格与交互语义，仅让容器、toolbar 和控件与新视觉一致。真实模型数量超过参考示例四项时，结果区域在稳定高度内滚动/分页；分页和滚动不得遮挡工具栏或使筛选面板同步跳动。

点击卡片、表格行或分组模型项进入 `/pricing/$modelId`。传递 `search`、`sort`、`vendor`、`group`、`quotaType`、`endpointType`、`tag`、`modality`、`tokenUnit`、`view`、`rechargePrice`；分组视图点击时，所点击行的 source group 优先于侧栏 group filter。

## 8. Loading, empty and failure behavior

首次加载使用与最终 Hero/面板相同的外壳，skeleton 只替代动态内容，不能闪现旧版紧凑页面。没有模型、搜索无结果或筛选无结果时，在结果面板中显示现有语义的空状态和清除操作。请求错误继续沿用当前查询/全局错误处理，不在本 change 改变 API 失败协议。

## 9. Responsive behavior

1920px 是严格像素级基准。1440px 保持 Hero、文字、装饰卡和工作区的相对层级，通过 max-width、clamp 和网格约束居中；不得简单裁掉右侧装饰卡或浮动面板。

768px 时 Hero 文案、搜索和装饰卡可重排，筛选切换为 drawer，结果区保持可读的单列或双列。390px 时使用单列流式布局，装饰卡可降低数量/位移但不能造成水平滚动，所有控制可以换行且保持至少 44px 可操作区域。任一视口都不得出现文字遮挡、按钮越界、不可达滚动内容或页面级水平滚动。

## 10. Motion and accessibility

Hero 装饰卡与浮动面板允许使用低速、克制的入场过渡；卡片、chip、toolbar 控件具有不改变几何的 hover/focus 反馈。所有非装饰交互使用语义元素和可访问名称，图标按钮提供 tooltip 或等价 label，焦点环在浅深主题均清晰。

`prefers-reduced-motion: reduce` 时禁用非必要位移、旋转和循环动画，只保留即时或最小颜色反馈。装饰性 SVG/图片必须使用空 alt 或 `aria-hidden`，搜索与筛选控件必须具备 label。

## 11. Routing, permissions and state

`/pricing` 的 module enabled/requireAuth 检查不变。模块关闭时重定向 `/`；要求认证且未登录时重定向 `/sign-in` 并保留完整 redirect URL。浅深主题切换、筛选、视图和详情往返不得意外重置当前状态。

路由 search schema 保持兼容：字符串筛选字段可选，`tokenUnit` 仅 `M|K`，`view` 仅 `card|table|group`，`rechargePrice` 为可选 boolean。UI 重构不得引入后端、数据库或公开 API 变化。

## 12. Assets, i18n and changelog

Figma 提供的等高线等专属资源必须下载到仓库本地模型广场资源目录；logo 和可复用图标优先使用现有首页本地资源或项目 icon library。代码不得引用 `figma.com/api/mcp/asset` 临时 URL。

新增可见文案全部通过 `useTranslation()` 与 `t()` 渲染，en、zh、zh-TW、fr、ru、ja、vi 均有翻译。品牌和模型名不翻译。用户可见变更必须在 `web/src/features/changelog/data.ts` 最新位置增加符合当前 image tag 规则的条目。

## 13. Verification contract

实现必须通过变更文件 oxfmt/oxlint、前端 typecheck、受影响行为测试和生产 build。共享 layout/theme 未发生改动时可以定向 build 验证；一旦修改共享组件则必须验证首页无视觉/行为回归。

浏览器验收覆盖 1920、1440、768、390 的浅色和深色。1920 读取关键 DOM geometry 并与 Figma 数值比对；其余视口检查响应式约束、页面水平溢出、文字/控件遮挡和内部滚动。交互覆盖搜索快捷键、全部筛选/reset、价格类型、token 单位、排序、三视图、模型跳转、loading/empty、主题切换、模块权限、控制台错误和 reduced motion。
