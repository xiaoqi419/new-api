# Outcome

修复测试部署中已知的中国大陆官网访问 HTTP 451 前缀碰撞绕过，并为现有认证动画和页面补齐当前候选的本机浏览器验收证据，不改变其他用户可见行为。

# Scope

- 将 `/api`、`/v1`、`/assets` 的大陆访问策略豁免收紧为精确路径或斜杠分段子路径；`/api-login`、`/v1-docs`、`/assets-page` 等官网 HTML 路由继续走 HTTP 451。
- 覆盖 `FRONTEND_BASE_URL` 的 NoRoute 重定向路径，确保可信 CN 请求不能通过前缀碰撞获得重定向。
- 通过本机 Chrome/Edge 的 `--force-prefers-reduced-motion=reduce` 或等价 CDP 真实渲染，补充当前登录和忘记密码页面的桌面、320px、中文、英文和 reduced-motion 验证证据。
- 添加确定性的 Go HTTP/middleware 回归测试，覆盖前缀碰撞、可信 CN、服务/静态/健康路径，以及 `FRONTEND_BASE_URL` NoRoute 边界。

# Non-goals

- 不修改认证 UI、动画样式、SMTP、导航、部署、生产或测试数据。
- 不改变可信代理、地区信号、API、中转、静态资源或健康检查的既有业务契约。
- 不新增浏览器、测试框架或运行时依赖。

# Acceptance examples

- A11/A21：当前候选在真实 reduced-motion 渲染时，认证叙事区保持静态连接且信息与操作完整。
- A12/A22：可信 CN 对所有官网 HTML 路由均直接收到主题化 HTTP 451；前缀碰撞与 `FRONTEND_BASE_URL` NoRoute 不能绕过。
- A17：当前登录和忘记密码页面的桌面/320px、中文/英文、reduced-motion 浏览器验收，以及 CN、非 CN、未知与伪造头 HTTP 验收均有可复现证据。
- A25：区域访问回归测试断言精确豁免分段、前缀碰撞 HTML 路由与保留的 API/静态/健康边界。

# Constraints and invariants

- 路径边界只能以 `path == root || strings.HasPrefix(path, root+"/")` 表达，不能使用宽泛的 `HasPrefix(path, root)`。
- 可信 CN 判断继续只依赖已配置的可信直接代理和配置的国家头；未知和不可信信号继续 fail-open。
- 测试必须是确定性的，不依赖公网、生产服务、真实账号或新增浏览器依赖。

# Decisions

- 此 child 是父 change 唯一 repair child，覆盖 A11、A12、A17、A21、A22、A25。
- 代码修复限定为大陆官网访问路径分段边界及其 HTTP 回归；A11、A17、A21 只补当前实现的真实浏览器验证，不新增用户可见行为。
- 本机浏览器验收使用已安装 Chrome/Edge 和 `--force-prefers-reduced-motion=reduce` 或等价 CDP，不修改认证页面源码。

# Open questions

- 无。

# Verification expectations

- `gofmt`、聚焦 `go test ./middleware`、`go vet ./middleware` 和目标 diff whitespace 检查必须通过。
- 本机浏览器真实渲染必须覆盖当前登录与忘记密码页面的桌面、320px、中文、英文和 reduced-motion 状态；不能以旧截图或仅静态 CSS 检查替代。
- Builder 仅提交本 child 的代码、测试和正式 Comet 产物；四个既有 mode-only 文件不得进入提交。
