# Outcome

以 GitHub 最新 `main` 和当前生产前端版本为基准，恢复此前已经本地验收、但没有推送合并的公共页面动态品牌能力。首页渐变装饰卡、首页 CTA 与大型 Footer CTA 使用后台 `/api/status.system_name`，国内站和国际站共享同一实现；同时修复 Footer CTA 交互态文字不可见的问题。

# Scope

- 从已归档的本地提交 `a10077e3b` 中选择性移植仍缺失的动态品牌和公共导航行为，不直接覆盖后来已经合并的文档国际化、模型广场布局和 Footer 组合实现。
- 首页 Hero 三张渐变装饰卡和首页 CTA 装饰卡显示当前 `systemName`。
- 删除这些动态品牌卡片下方重复的小号 `New API`；每张卡只显示一次解析后的动态站点名称。
- 首页 CTA 标题、Footer CTA 标题、按钮和版权继续使用当前站点名称。
- 修复 Footer CTA 在暗色模式 hover、focus-visible 时文字与荧光背景同色的问题，保留普通法务链接的荧光色交互反馈。
- 恢复站内 `/docs` 作为桌面和移动公共导航的稳定入口，但不改变其它可配置导航开关。
- 补充对应回归测试与用户可见 changelog。

# Non-goals

- 不重新设计首页、模型广场或 Footer 的几何、渐变、动画和布局。
- 不改变后端 API、数据库、Redis、生产配置、域名、容器或网关。
- 不修改 Footer、许可证、仓库元数据和其它项目归属信息；本轮仅移除装饰卡内部与动态主品牌重复的小号 `New API`。
- 本轮只在独立本地 worktree 中开发与验收，不提交、不推送、不合并、不部署。
- 不整体 cherry-pick 旧提交中会覆盖较新实现的 Footer、模型广场或文档代码。

# Acceptance examples

- A1：当 `/api/status.system_name` 为“尔信 API”时，首页 Hero 的三张渐变卡和首页 CTA 装饰卡各只显示一次“尔信 API”，不再显示固定的小号 `New API` 副标题。
- A2：当 `/api/status.system_name` 为“Zip API”或其它合理名称时，同一组件动态显示该名称；代码不检测或硬编码域名，空值和加载状态使用既有 `DEFAULT_SYSTEM_NAME`。
- A3：首页 CTA、Footer CTA 标题、CTA 按钮和版权中的站点名称继续来自同一 `systemName` 数据链，长名称遵守既有截断或换行边界，不覆盖装饰芯片和相邻内容。
- A4：Footer CTA 在 light/dark 的 default、hover 和 focus-visible 状态下文字与背景清晰可读；普通法务链接的 lime hover/focus 行为不变。
- A5：公共桌面导航和移动导航均包含当前标签页内跳转的 `/docs` 入口；现有 i18n 文案和其它导航开关保持不变。
- A6：当前 GitHub `main` 中已合并的文档国际化、模型广场布局/颜色、Footer 品牌与自定义法律区域共存行为不回退。
- A7：动态卡片、首页 CTA、Footer CTA 和公共导航具有针对真实用户行为的回归测试；相关 Vitest、格式化、lint、typecheck、生产 build 和 `git diff --check` 通过。
- A8：本地浏览器在桌面与移动、亮色与暗色下验证品牌文本、CTA default/hover/focus、无页面级水平溢出且无新增控制台错误。
- A9：本轮变更不包含提交、推送、合并、生产部署、后端或数据库修改。

# Constraints and invariants

- 站点业务品牌只来自现有 `useSystemConfig().systemName`，fallback 继续使用 `DEFAULT_SYSTEM_NAME`。
- 装饰卡保持 `aria-hidden` 且不可聚焦；真实 CTA 和导航继续满足键盘访问与可见焦点要求。
- 使用现有 React 19、TypeScript、Tailwind、Base UI、TanStack Router 和 i18next，不新增依赖。
- 保留用户和其它代理已有改动，集成以当前 `origin/main` 为唯一基线。
- 每张装饰卡只显示一次解析后的 `systemName`；页脚项目归属、许可证和仓库元数据保持现状。

# Decisions

- 用户已亲自撤销项目治理规则中对该卡片副标题的保护，并再次确认：动态业务品牌出现后，删除卡片下方固定的 `New API` 小字，避免同一卡片出现两个品牌层级。
- 用户要求以本地已验收效果为依据，但实现必须重新基于 GitHub 最新 `main` 集成，不能用旧 worktree 整体覆盖线上最新代码。
- 当前阶段仅本地开发；后续提交、推送、合并和热更新需要用户验收后另行执行。
- 已确认旧提交 `a10077e3b` 没有进入 GitHub `main`，这是线上仍显示硬编码品牌的直接原因。

# Open questions

- 无。

# Verification expectations

- 先以回归测试保护“每张卡仅有一个动态业务品牌”和 Footer CTA 交互态对比度，再完成最小修复。
- 定向运行首页 Hero/CTA、Footer、公共 Header/导航与系统配置相关 Vitest。
- 对涉及文件执行格式化和 lint，并运行前端 typecheck、生产 build 与 `git diff --check`。
- 启动本地开发服务器，在浏览器验证桌面/移动、light/dark、短/长系统名、CTA hover/focus、水平溢出和控制台错误。
- Build 完成后由新的只读 Verifier 逐项验收 A1-A9。
