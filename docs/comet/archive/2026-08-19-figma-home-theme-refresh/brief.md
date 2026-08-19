# Outcome

将 Torch AI 普通用户首页和公共主题实现为 Figma `newapi` 设计稿的像素级代码复刻。默认 `classic-landing` 模板在浅色节点 `6:2` 与深色节点 `44:2` 下保持相同的信息架构、几何关系、字体层级、圆角、边框、阴影、色值和响应式行为；现有管理员自定义首页能力和受保护的 `new-api` / `QuantumNous` 标识继续有效。

# Scope

- 重做 `web/src/features/home` 的默认 landing sections：Figma 首屏、API response 浮层/模型卡、`01` 核心功能、utility cards、`02` 三步上手、`03` 成本/控制区和深色连接 CTA。
- 对齐公共 header/navigation/footer、语言和主题切换控件的 Figma 位置、尺寸与交互，并保证窄屏折叠不产生横向溢出。
- 建立独立的首页浅/深色 token 与后台业务 token；后台沿用白/浅灰、蓝/cyan/绿/黄/红语义，不把营销页紫黄铺满业务页面。
- 将 Figma 参考资源下载并固化到仓库本地资源目录；代码不得依赖临时 Figma asset URL。
- 所有新文案通过现有 i18next 七语言链路接入，并在 `web/src/features/changelog/data.ts` 记录用户可见改动。
- 保持 `Home` 的管理员 URL、HTML/Markdown、自定义 template config、`classic-landing` 模板 ID、section 开关和内容覆盖行为不变；同步 `web/classic` 仅限必要的公共首页/主题兼容。

# Non-goals

- 不重写 Figma 中控制台、模型广场、游乐场等业务页面的完整布局；节点 `52:2`、`64:2`、`76:2`、`66:170`、`72:2` 只用于主题色、导航密度和组件语义参考。
- 不新增或升级依赖、UI 框架、后端 API、数据库、支付、登录、无限画布、素材库或代理公开入口。
- 不删除、替换或弱化受保护的 `new-api`、`QuantumNous`、版权和许可证信息。
- 不把 Figma MCP 返回的绝对定位示例整页粘贴为生产实现，也不使用 Figma 临时 URL 作为运行时资源。

# Acceptance examples

- 在 1920px 桌面视口，浅色首页首屏容器、导航、hero 文案、右侧 API response 浮层和下方模型卡的 bounding boxes 与节点 `6:2` 对齐；深色页面对应节点 `44:2`，不以“风格相似”代替测量。
- 浅色首页使用白/近白画布、`#0e0e0e` 标题、`#2f00e5` 强调紫和 `#d4ff1f` 荧光黄绿；深色首页使用 `#1f1f1f` 页面、`#0e0e0e` hero/CTA、`#d4ff1f` 强调和低透明边框。
- `01` 功能网格为 1196x470、四项卡片 598x235；utility 区四项卡片约 230x162、40px 间距；`02`/`03` 与 footer CTA 的章节编号、标签和内容节奏保持 Figma 结构。
- 768px 与 390px 视口下内容折叠为单列、按钮和导航仍可操作，`document.documentElement.scrollWidth === viewportWidth`，无控件重叠或文字溢出。
- 主题切换、语言切换、Get Started/登录导航和 footer 链接支持键盘访问并具有可访问名称；管理员设置的 URL/HTML/Markdown 首页仍按原分支渲染。

# Constraints and invariants

- 以 Figma 节点尺寸/截图/metadata 为测量基准；实现使用现有 React 19、Tailwind、Base UI、TanStack Router 和 `PublicLayout`，不引入第二套 design system。
- 首页 token 使用 `--home-*` 命名空间，后台业务 token 使用 `--business-*` 命名空间；暗色规则必须分别覆盖两套语义。
- 运行时资源必须是仓库内稳定路径；外部 URL 仅作为管理员明确配置的自定义首页 iframe，不能混入默认首页。
- 用户可见文字遵循 `useTranslation()` / locale flat JSON 规则；七个 locale 的 key 集合保持一致。
- 任何修改过的 TS/TSX/CSS/JS 文件必须通过受影响 lint/format；完成候选后运行受影响测试、typecheck、生产构建和浏览器截图矩阵。

# Decisions

- 默认实现更新现有 `classic-landing`，不新建会绕过管理员选择器的第二个默认首页；`cli-quickstart` 保持可选且不在本 change 中改写。
- Figma 的英文层级文案作为 i18n source key，保留项目品牌和版权信息；中文等语言提供等义翻译，不硬编码只支持单语言的 JSX 文本。
- 首页浅/深色以 Figma 的强对比黑白、紫色和荧光黄绿为主；后台主题沿用业务蓝/cyan/紫/绿/黄/红语义，避免营销视觉污染后台。
- Figma SVG/位图资源先通过 MCP 下载到 `web/public` 下的 feature 目录，再由组件引用；无法下载的纯几何装饰用 CSS/现有图标复刻并记录原因。
- 像素级验收以桌面 1920、常用桌面 1440、平板 768、移动 390 的截图和 DOM geometry 检查为准；允许响应式折叠改变排列，不允许改变设计层级和视觉关系。

# Open questions

# Verification expectations

- 运行默认首页及 theme 受影响 Vitest/RTL（如存在），`bun run typecheck`，受影响文件 oxlint/oxfmt，`bun run build`；同步验证 `web/classic` build 或明确记录兼容性缺口。
- 使用 Playwright/浏览器在浅色和深色下截图 1920、1440、768、390；检查 `scrollWidth`、关键节点 bounding boxes、键盘 Tab 顺序和控制台错误。
- 在最终 Verify 前更新维护状态文档，区分本地通过、未覆盖、用户线上验收、未提交/未推送/未发布/未部署。
