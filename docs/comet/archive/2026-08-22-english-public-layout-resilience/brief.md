# Outcome

英文模式下，首页 Hero 和模型广场在桌面、平板与手机尺寸均保持清晰、无重叠、无横向溢出；中文模式维持当前视觉层级和版式观感。

# Scope

- 修复首页 Hero 中英文长文案导致“Supported Applications”应用区脱离预期背景的问题。
- 修复模型广场 Hero 搜索区与下方筛选/结果工作区在英文长文案下重叠的问题。
- 为两个区域补充稳定的布局回归测试标识和测试。
- 修复当前基线中 `SearchProvider` 向无 props 的 `CommandMenu` 传递冗余属性所导致的 TypeScript 全量检查失败。
- 更新用户可见 changelog。

# Non-goals

- 不改页面路由、导航、业务逻辑、API、认证或支付行为。
- 不重新设计首页或模型广场，不更换主题、字体、色彩、文案或动画语言。
- 不通过全局缩小英文文字或无限增高 Hero 掩盖布局问题。
- 本轮不提交、不推送、不合并、不部署，仅提供本地预览等待用户验收。

# Acceptance examples

- A1：英文模式的模型广场在 1910x740、1280x720、1440x900、1920x1080 下，Hero 搜索区与筛选/结果工作区至少保留 12px 可见间距，不发生遮挡。
- A2：模型广场在 768x1024 与 390x844 下，侧栏、工具栏和结果面板均无横向溢出，搜索、筛选和结果仍可用。
- A3：首页英文模式在上述桌面、平板和手机尺寸下，“Supported Applications”及应用入口完整位于预期 Hero 背景区域内，无文字或控件重叠。
- A4：中文模式在同一尺寸矩阵下无新增重叠、裁切或横向溢出，现有视觉层级保持一致。
- A5：首页与模型广场在明暗主题下均通过浏览器渲染检查，无控制台页面错误；动效在 reduced-motion 下不妨碍内容访问。
- A6：相关布局测试、TypeScript 类型检查、涉及文件 lint/format、生产构建和 `git diff --check` 通过。

# Constraints and invariants

- 保留现有 Figma 衍生的强排版、几何背景、主题色和动效。
- 英文文本允许自然换行，但不得与相邻区域碰撞或逃出所属视觉区域。
- 使用内容驱动的间距与尺寸约束，避免只针对单一截图写脆弱像素补丁。
- 用户现有改动和其他 worktree 均不得覆盖或回退。
- 所有操作限定在本地隔离 worktree。

# Decisions

- 模型广场移除桌面结果区对 Hero 的深度负边距，使工作区跟随真实内容流。
- 首页优先优化桌面标题行高和纵向节奏，并为应用入口增加宽度收缩约束；只有浏览器证据证明必要时才调整 Hero 高度。
- 不全局缩小字体，不改变中文/英文文案内容。
- 使用现有测试框架与 Edge 浏览器，不引入新依赖。
- 用户已确认采用推荐实现并要求只在本地展示结果。

# Open questions

- 无。

# Verification expectations

- 定向运行首页 Hero 与模型广场 Hero 的 Vitest 测试。
- 对涉及文件运行 oxlint 和 oxfmt check。
- 运行 `bun run typecheck`、`bun run build` 与 `git diff --check`。
- 使用本机 Edge 检查 en/zh、light/dark、1910x740、1280x720、1440x900、1920x1080、768x1024、390x844。
- 浏览器断言模型广场 `search.bottom + 12 <= results.top`，关键容器 `scrollWidth <= clientWidth`，首页应用区位于 Hero 背景范围内。
