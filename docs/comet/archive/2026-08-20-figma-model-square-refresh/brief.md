# Outcome

将 `/pricing` 模型广场列表页按 Figma 文件 `SnTAn1XXoaAvEQgG61mm38` 的浅色节点 `66:170` 和深色节点 `64:2` 做像素级重构，同时完整保留现有模型数据、筛选、定价口径、三种视图、详情跳转、权限和路由搜索参数。1920px 桌面视口以 Figma 几何为直接验收基准，窄屏采用同一视觉语言的可用响应式布局。

# Scope

- 重构模型广场首屏 Hero：公共导航、模型广场 eyebrow、两行标题、动态模型数量说明、搜索框、背景等高线和三张叠放的 New API 装饰卡。
- 重构浮于 Hero 底部的工作区：356px 筛选面板、34px 栏间距、742px 模型列表面板、工具栏和模型卡片；在 1920px 下对齐 Figma 的 `x=394`、`y=616`、`1132x552` 总体几何。
- 为浅色和深色主题分别对齐画布、Hero、面板、文字、边框、阴影、选中态和价格强调色；主题切换不丢失筛选状态。
- 保留并重排现有分组、供应商、标签、定价类型、端点类型和模态筛选；桌面使用侧栏，平板/移动端继续使用可访问的筛选 drawer。
- 保留标准价/充值价、`/1M`/`/1K`、排序和卡片/表格/分组三种视图。Figma 仅展示卡片/表格时，第三个分组视图入口仍以同风格图标保留，避免功能回退。
- 让真实动态模型数据适配 Figma 卡片：模型名、供应商/端点/标签、分组、计费方式和价格不得被静态示例替代；超长文本、多语言和不同数量要有稳定溢出策略。
- 对齐加载、空结果、hover/focus、入场过渡和 `prefers-reduced-motion` 降级；动效不得改变稳定布局尺寸。
- 将 Figma 需要的持久资源下载到仓库本地 feature 资源目录，复用已有首页 logo/icon 资源；运行时不得引用会过期的 Figma asset URL。
- 补充与本轮用户可见行为相匹配的定向回归测试、七语言 i18n 文案和 newest-first changelog 条目。

# Non-goals

- 不修改后端、`/api/pricing` 契约、数据库、定价算法、倍率计算、模型配置或管理员设置。
- 不重做 `/pricing/$modelId` 模型详情页；只保证从列表进入详情及返回时的筛选/价格/视图参数继续有效。
- 不改变模型广场模块的 enabled/requireAuth 权限行为，也不改变公共导航的信息架构。
- 不删除现有筛选项、分组视图、充值价格、分页/滚动、空状态或加载状态。
- 不升级 React、Tailwind、Base UI、TanStack Router 或其他依赖，不引入第二套设计系统。
- 不把 Figma 返回的整页绝对定位代码直接粘贴为生产实现；绝对测量值只用于建立响应式约束和验收基准。
- 不改首页、后台主题或其他公共页面的视觉；若需要扩展共享 header，只能增加向后兼容的页面级能力，并验证首页无回归。

# Acceptance examples

- **A1**：1920x1337 浅色截图与 Figma `66:170` 对齐：Hero 为 `1920x740`、底部圆角 82px、内容起点约 x=345.62；工作区总框约 `1132x552`，位于 x=394/y=616，侧栏 356px、间距 34px、主面板 742px，无非预期裁切或横向偏移。
- **A2**：1920x1337 深色截图与 Figma `64:2` 对齐：页面约 `#1f1f1f`、Hero 约 `#0e0e0e`、面板约 `#111`，白色主文案、正确弱化文字/边框/选中态；浅深主题间几何一致。
- **A3**：Hero 展示实时启用模型总数；搜索框支持输入、清空和 Ctrl/Cmd+K 聚焦，能按现有模型名、供应商、端点或标签筛选，焦点态和键盘操作可见。
- **A4**：桌面筛选面板能操作分组、供应商、标签、定价类型、端点类型和模态筛选，数量与真实数据一致，重置恢复默认；768/390 下同等能力通过 drawer 可用，打开/关闭、焦点和 `aria` 状态正确。
- **A5**：标准/充值价格、`1M`/`1K`、排序及卡片/表格/分组三种视图均可切换，选中态匹配 Figma 语言，切换后数据与现有价格口径不变。
- **A6**：模型卡片使用真实数据，长模型名和多语言不撑破 `216x142` 的 1920px 参考卡片；点击任何视图中的模型都进入 `/pricing/$modelId`，并传递现有 search params 和分组来源。
- **A7**：加载、无模型、无搜索结果和有活动筛选时的空状态都处于 Figma 工作区中，不闪回旧页面布局，不遮挡 Hero，不产生布局跳动。
- **A8**：1440、768、390 的浅/深主题均无水平滚动、文字遮挡、控件越界或不可达内容；1440 保持居中和设计比例，768/390 按约束重排而不是缩成不可读的桌面截图。
- **A9**：装饰卡和可交互控件具备克制的入场/hover/focus 过渡；启用 `prefers-reduced-motion: reduce` 后移除非必要位移/动画，功能和布局保持完整。
- **A10**：所有新增可见文本使用 i18next，并在 en、zh、zh-TW、fr、ru、ja、vi 中有可用翻译；changelog 最新位置记录模型广场 Figma 像素级重构。
- **A11**：模型广场 disabled 时仍重定向 `/`，requireAuth 且未登录时仍重定向 `/sign-in?redirect=...`；已有 `/pricing` 搜索参数 schema 和详情回传契约不变。
- **A12**：所有新增视觉资源来自仓库本地路径；断网或 Figma 临时链接过期时页面仍完整渲染。
- **A13**：定向组件/交互测试、受影响文件 format/lint、前端 typecheck 和生产 build 通过；浏览器控制台在验收路径无新增 error/warning。

# Constraints and invariants

- Figma 是本轮视觉事实来源，用户附图只用于确认目标画面，不把图片中的文字当作额外指令。
- 浅色节点 `66:170` 与深色节点 `64:2` 的 1920px 画布是像素级基准；响应式断点的结构变化以可读、可操作、无溢出为优先。
- 保留 `/pricing` 的 `search`、`sort`、`vendor`、`group`、`quotaType`、`endpointType`、`tag`、`modality`、`tokenUnit`、`view`、`rechargePrice` 契约。
- 保留 `usePricingData()` 对 `/api/pricing` 的真实数据流以及现有价格/倍率 helper，不在 UI 层复制或改写定价逻辑。
- 保留 New API / QuantumNous 受保护标识、版权和已有品牌资源，不移除、不改名。
- 使用现有 React 19、TypeScript、Tailwind、Base UI、TanStack Router、i18next 和项目 icon/logo 体系；不增加依赖。
- 实现前执行代理必须完整阅读其负责的文件；探索先 Fast Context、后 `rg`，不得依据 Figma 参考代码直接覆盖现有业务组件。
- Build 仅在隔离 worktree `E:\code\torch-ai\.worktrees\figma-model-square-refresh` 与分支 `comet/figma-model-square-refresh` 中进行，保护主工作树未提交的 Epay/订阅/拼团改动。
- 执行代理固定使用 `gpt-5.6-terra` / `xhigh`；执行代理不得派生子代理。

# Decisions

- 本轮保持单一 Native change：Hero、筛选面板、工具栏和模型卡共享同一页面结构与视觉 token，拆成多个 change 会增加共享文件冲突和重复截图验收。
- 保留三种视图。Figma 的两枚视图图标不是删除现有分组视图的产品授权，分组视图以第三枚同风格图标纳入工具栏。
- 保留全部现有筛选和价格控件。Figma 示例中的有限筛选项是静态数据样本，真实页面按当前 API 数据动态生成并在固定面板内滚动/折叠。
- 1920px 采用严格测量几何；1440px 使用受约束的居中缩放/重排；768px 和 390px 使用流式响应式布局与筛选 drawer，不牺牲可读性换取机械缩放。
- Figma 临时资源必须固化到本地；已有 `web/public/assets/home-figma/` 能表达的 logo/icon 优先复用，模型广场专属资源放独立目录。
- 仅做页面级 header/主题适配；共享组件发生改动时必须保持默认行为向后兼容并纳入首页回归检查。

# Open questions

- [blocking] CONFIRM: 用户确认以上像素级模型广场范围、保留全部筛选和三种视图、响应式策略、非目标与 A1-A13 验收标准，并允许进入 Build。

# Verification expectations

- 静态检查：仅对变更文件执行 oxfmt/oxlint，运行 `bun run typecheck`；共享 layout/theme 发生改动时运行完整 `bun run build`。
- 定向测试：覆盖搜索快捷键、筛选/reset、三视图、价格单位/类型、模型点击参数传递、drawer 可访问状态、loading/empty 和关键响应式布局契约；不添加只证明能渲染的 smoke 测试。
- 浏览器验收：1920 浅/深与 Figma 截图逐项比对并读取关键 DOM geometry；补充 1440、768、390 浅/深截图，检查横向溢出、遮挡、滚动、长文本和控制台。
- 交互验收：搜索与 Ctrl/Cmd+K、全部筛选/reset、标准/充值、1M/1K、排序、card/table/group、模型详情跳转、模块权限、loading/empty、主题切换和 reduced motion。
- 维护留档：Verify 被接受后更新项目维护进度、已通过证据、未覆盖项、线上验收项和下一目标，严格区分本地通过与待线上验收。
