# Outcome

在 New API 后台恢复并使用最新的 Infinite Canvas `v0.18.0`，同时在同源 iframe 内嵌模式中不展示打开 Agent、文档和上游 GitHub 的入口，避免把集成应用的用户带到不适用的本地 Agent、外部文档或上游项目页面。Canvas 独立部署时保留原有入口。配置和版本入口继续可用，版本检查继续运行。

# Scope

- 以现有 `isEmbedded()` 判断作为唯一运行时边界。
- 内嵌模式不渲染以下用户可见入口：
  - 普通顶栏的“打开 Agent”按钮；
  - 画布页顶栏的 Codex 状态入口和 Agent 按钮；
  - 顶栏及画布菜单中的“文档”入口；
  - 顶栏中的 GitHub 图标按钮。
- 内嵌模式不挂载已保存为打开状态的 Agent 面板，并阻止内嵌启动流程自动连接或自动打开 Agent 面板。
- 保留配置、版本更新、快捷键、节点插件、画布导航和生图/视频功能。
- 保留 Agent、插件、API 和数据结构代码，独立部署模式的现有行为不变。
- 更新主站前端 changelog，记录入口可见性调整。
- 将 vendored Canvas 从 `v0.12.1` 升级到上游最新正式版本 `v0.18.0`，并在升级后重放/重写 New API 的子路径、Host Bridge、认证令牌、插件来源和安全补丁。
- 同步升级后的许可证、版本、依赖锁文件和供应商说明，确保升级后的独立构建可复现。
- 恢复此前已归档但尚未合入的 `integrate-infinite-canvas` 主站集成，使认证用户访问 `/canvas` 时实际加载升级后的 CanvasStudio，并保留 `/canvas-app` 静态资源构建与嵌入链路。

# Non-goals

- 不把上游代码未经审查地直接覆盖到生产；所有本地桥接、路径、安全和用户令牌补丁必须在新版本上重放并验证。
- 不删除 Agent 实现、后端接口、快捷键协议或插件中的 GitHub/来源链接。
- 不隐藏提示词内容中的来源链接，不改变配置或版本检查请求。
- 不修改 New API 的计费语义或 API Key 权限模型；仅恢复已审查的 CanvasStudio 嵌入路由及其必要静态资源构建配置。

# Acceptance examples

1. **内嵌首页**：当 `window.parent !== window` 时，渲染结果中不存在可访问名称为“打开 Agent”“收起 Agent”“文档”或“GitHub”的顶栏控件；配置和版本入口仍存在。
2. **内嵌画布项目页**：画布菜单不包含“文档”，左侧标题区域不显示 Codex 状态，右侧不显示 Agent 按钮；即使 localStorage 中曾保存 Agent 面板为打开状态，也不会出现面板或自动连接。
3. **独立部署**：当页面不是 iframe 时，Agent 按钮、Codex 状态、文档链接和 GitHub 链接保持现有行为。
4. **版本事实**：构建使用仓库内 `web/canvas/VERSION` 的 `v0.18.0`，版本弹窗和检查逻辑与新版本一致；版本检查的官方上游结果同样为 `v0.18.0`。
5. **升级兼容性**：已有画布、资产、配置和 Agent 历史在升级后的构建中可以加载或给出可理解的兼容性错误；升级不 silently 改写用户数据。
6. **主站集成**：认证用户访问 New API `/canvas` 时加载 CanvasStudio iframe，而不是 Coming Soon；iframe 从 `/canvas-app` 同源资源加载并完成主题、API Key 和接口地址桥接。

# Constraints and invariants

- 所有可见性分支必须使用同一个 `isEmbedded()` 语义，不能通过 CSS 隐藏代替条件渲染，避免隐藏控件仍出现在可访问性树中。
- 不改变非内嵌模式的 DOM、交互和 Agent 自动连接规则。
- 不将 token、密码或其他凭据写入产物、日志或 changelog。
- 保持 `web/canvas` 的独立构建和 TypeScript 检查可用，并遵循该目录既有 Prettier 风格。
- 混合许可证边界必须清晰：上游 Canvas `v0.18.0` 的 MIT 文本与 New API/QuantumNous 的 AGPL 版权和许可声明分别保留，不得互相替换。

# Decisions

- 入口隐藏范围限定为 New API 内嵌模式；独立运行的 Infinite Canvas 仍是完整应用。
- “隐藏 Agent”包含所有用户可见打开路径及已打开面板的渲染保护，但不删除底层 Agent 能力。
- “隐藏文档”包含普通顶栏链接和画布菜单项；提示词库中的内容来源字段不属于本需求。
- “隐藏 GitHub 按钮”只针对 Canvas 顶栏 GitHubLink，不影响版本检查使用的 GitHub 原始文件或提示词来源数据。
- 用户已明确要求使用最新版；目标 vendored 版本确定为上游正式 release `v0.18.0`。
- 升级必须保留本地 host bridge 的安全边界：内嵌 API 地址锁定主站、消息同源校验、插件来源限制和用户令牌按需传递。
- 用户已确认同时恢复 `/canvas` 的 CanvasStudio 主站集成；实现基线仍从 `origin/main` 创建，并有选择地重放已归档集成中的必要改动。

# Open questions

无。用户已确认升级到最新版并恢复主站 `/canvas` 集成；实现细节由 Agent 按本规格处理。

# Verification expectations

- 对修改后的 Canvas 组件执行 `bun run typecheck`、`bun run build` 和 `bun run format:check`。
- 运行针对内嵌与独立模式可见性的行为验证（若当前 Canvas 包没有测试运行器，则使用可复现的静态检查/构建与浏览器观察，并在 verification.md 中如实记录）。
- 执行 `git diff --check`，并用 `rg` 复查旧入口是否仍在内嵌渲染路径中。
- 运行 Comet Native 内置 check 和 required receipts 后再进入 Verify/Archive。
