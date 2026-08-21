# Outcome

首页 Hero 的“文档”按钮始终通过站内路由进入 `/docs` 接入文档页，不再读取后台外部文档地址，也不再打开新标签页。

# Scope

- 将首页 Hero 的“文档”按钮改为 TanStack Router 类型安全 `Link`，目标固定为 `/docs`。
- 删除该按钮对 `status.docs_link`、外部地址判断和新窗口行为的依赖。
- 增加真实 Router 点击回归，验证从首页点击后 URL 到达 `/docs`，且不会渲染外部 `href` 或 `target="_blank"`。
- 更新现有最新版本 changelog。

# Non-goals

- 不改变顶部导航已有的站内“接入文档”入口。
- 不修改后台 `docs_link` 配置本身，也不改变其它明确指向项目介绍、安装指南或第三方资料的外部链接。
- 不重构 `/docs` 页面内容、权限、布局或数据来源。
- 不修改后端 API、数据库或认证行为。

# Acceptance examples

- 访客在首页点击 Hero 的“文档”按钮后，当前单页应用导航到 `/docs`。
- 已登录用户点击同一按钮也进入 `/docs`，不受登录态影响。
- 即使后台 `docs_link` 配置为外部 URL，Hero 按钮仍进入站内 `/docs`，且不打开新标签页。
- 顶部导航的站内文档入口和其它明确的外部资料链接保持原行为。

# Constraints and invariants

- 内部导航必须使用 TanStack Router `Link`，不得使用 `window.location`、裸内部 `href` 或新窗口。
- 用户可见行为需有组件回归和浏览器点击验收。
- 保留 worktree 中用户与其它 change 的未提交修改。
- 继续保护 new-api 与 QuantumNous 标识。

# Decisions

- 将用户所指“文档按钮”按仓库调查确定为首页 Hero 的 BookOpen 按钮；它是唯一仍读取 `docs_link` 并默认跳外部站点的主按钮。
- 站内接入文档是产品当前的唯一主文档入口，因此 Hero 按钮固定到 `/docs`，不再让管理员外部链接覆盖。
- 页脚 demo 模式下的项目介绍、安装指南和 API 外部资料属于具体参考链接，不在本 change 中统一改写。

# Open questions

- 无。用户已明确要求文档按钮进入 `/docs`，并授权按推荐方案连续实现与验收。

# Verification expectations

- Vitest 使用真实 TanStack Router memory history 点击 Hero 文档按钮，并断言 pathname 为 `/docs`。
- 静态回归断言按钮不包含外部 `href`、`target="_blank"` 或 `docs_link` 分支。
- 运行 affected Vitest、TypeScript、oxfmt、oxlint、生产构建、浏览器点击检查与 `git diff --check`。
- 独立只读 Verifier 逐项核对正式 acceptance 后再归档。
