# Outcome

恢复现代 React 主站认证用户侧边栏中的“AI 媒体”分组及“无限画布”入口。用户登录后可以从侧边栏进入 `/canvas`，页面继续加载现有同源 `/canvas-app` 的 CanvasStudio 集成。

# Scope

- 在 `web/src/hooks/use-sidebar-data.ts` 的根导航中恢复 `media` 分组。
- 在该分组中提供一个名为 `Infinite Canvas`、路径为 `/canvas`、图标为 `Palette` 的导航项。
- 将 `media` 放置在 `chat` 之后、`general` 之前，保持既有 Canvas 集成说明和历史导航结构的一致性。
- 更新现代主站侧边栏数据测试，使普通认证用户和 Agent 用户都验证该分组、链接、顺序和图标。
- 更新主站 changelog，记录入口恢复。
- 保持现有 `/canvas` 路由、CanvasStudio、`/canvas-app` 同源资源、认证桥接和独立隔离部署行为不变。

# Non-goals

- 不修改 Classic 前端、Classic 路由或 Classic 侧边栏。
- 不修改 Canvas 页面本身、Canvas vendored 源码、Host Bridge、API、认证或生图逻辑。
- 不新增侧边栏管理开关；`/canvas` 继续按未映射路径默认可见。
- 不改变其他导航分组、隐藏入口规则、角色权限或用户可见功能。
- 不复制或写入生产凭据，不调整生产容器、数据库、Redis、CPA 或生产网关。

# Acceptance examples

1. 普通认证用户渲染根侧边栏时，导航分组顺序包含 `chat`、`media`、`general`，且 `media` 下唯一链接的标题为 `Infinite Canvas`、URL 为 `/canvas`、图标为 `Palette`。
2. Agent 用户保留最前面的 `agent` 分组，同时仍按 `chat`、`media`、`general` 的顺序显示普通分组；不再因 Agent 身份移除 Canvas 入口。
3. 点击或直接访问 `/canvas` 仍命中现有 `CanvasStudio` 路由，并通过同源 `/canvas-app` 加载应用。
4. Asset Library、Agent Apply 等已退役或隐藏的入口仍不可见；Classic 前端不新增入口。
5. 受影响的单元测试、类型检查、lint、生产构建和格式检查通过。

# Constraints and invariants

- 导航项必须使用现有 `SidebarData`/`NavGroup` 类型和 lucide-react 图标，不引入新的状态或运行时依赖。
- 复用已存在的 `AI Media` 与 `Infinite Canvas` i18n 键，不新增重复翻译键；所有用户可见文案仍通过 `t(...)` 获取。
- `use-sidebar-config.ts` 未映射路径的默认可见行为保持不变，不把 `/canvas` 错误地加入管理模块开关。
- 修改必须局限在本次 change 的现代主站导航、对应测试、changelog 和 Comet 产物；保留工作区中其他代理及用户已有修改。
- 不在任何产物、日志或提交信息中写入 token、密码、私钥、连接串或其他凭据。

# Decisions

- 入口归入现有 `AI Media` 分组，位置为 Chat 之后、General 之前；这是已归档 Canvas 集成中确认过的用户可见结构。
- 入口默认对认证用户可见，不增加额外的管理员配置项或 feature gate，因为当前 `/canvas` 路径在侧边栏配置中属于未映射且默认可见的入口。
- 本 change 只修复“没有入口”的主站导航问题；Canvas 路由和线上隔离环境已经验证可达，不重复改动其实现。

# Open questions

无。实现边界、分组、名称、路径和非目标均已由当前需求及仓库事实确定。

# Verification expectations

- 使用 Vitest 运行 `web/src/hooks/__tests__/use-sidebar-data.test.tsx` 及相关导航可见性测试。
- 在 `web/` 中运行 `bun run typecheck`、`bun run lint`、`bun run build`，并运行格式检查。
- 执行 `git diff --check` 和 `rg`，确认新入口、翻译键和旧的“media 不存在”断言均正确。
- 进入 Verify 后由独立只读检查逐项核对普通用户、Agent 用户、隐藏入口、路由保持和构建证据。
