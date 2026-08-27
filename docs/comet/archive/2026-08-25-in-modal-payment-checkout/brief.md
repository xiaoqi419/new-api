# Outcome

修复普通用户发起彩虹易支付后仍跳转新页面的问题。钱包充值、订阅购买、拼团创建和参团必须留在当前业务页面，并直接在 Modal 中展示可扫码的支付二维码和订单状态。

# Scope

- default 与 classic 前端的普通用户 Epay 支付入口。
- 统一识别标准 checkout 数据和仍可能出现的旧式 `pay_url`/二维码响应。
- 移除发起 Epay 支付时的自动 `window.open`、`window.location`、外部表单提交和锚点导航。
- 保留 Modal 内二维码、状态轮询、刷新、关闭、重试以及拼团名额释放行为。
- 增加防外跳回归测试，并更新用户可见变更记录。

# Non-goals

- 不改变 Stripe、Creem、Waffo、微信/支付宝官方直连等非 Epay 渠道既有产品行为。
- 不改变支付网关签名、异步通知、结算、退款或数据库结构。
- 不在本次修改中迁移或接入真实生产数据。

# Acceptance examples

- A1：钱包选择任一 Epay 聚合支付方式并确认后，当前页面打开支付 Modal，Modal 内展示二维码，浏览器不打开新标签页也不离开当前页面。
- A2：订阅选择 Epay 并确认后，当前订阅购买上下文切换到支付 Modal，浏览器不发生外部导航。
- A3：拼团创建或参团选择 Epay 后，当前页面打开支付 Modal；即使响应为兼容的 `pay_url` 形态，也只将其编码为 Modal 二维码，不自动外跳。
- A4：default 与 classic 两套仍发布的用户界面在 A1-A3 行为上保持一致，相关 Epay 发起分支不存在 `window.open`、`window.location` 或自动表单提交。
- A5：支付成功、失败、过期、轮询超时、手动刷新、重试和关闭行为保持可用；关闭未支付拼团仍释放预占名额。
- A6：无可安全展示的 checkout 值时，界面显示本地化错误并停留当前页面，不以外部导航作为降级方案。
- A7：受影响的定向前端测试、类型检查、涉及文件 lint 和生产构建通过；后端契约若有改动，其定向 Go 测试通过。

# Constraints and invariants

- 唯一结算依据仍是已验签的服务端异步通知；前端二维码和轮询不得直接入账。
- 只接受既有安全规则允许的 Epay checkout 值；禁止 `javascript:`、`data:`、未知 scheme 和空值。
- 保留当前工作区已有的支付实现与用户改动，不进行无关重构。
- SQLite、MySQL 与 PostgreSQL 兼容性不得退化。

# Decisions

- Epay 发起支付采用“当前页 Modal 优先且无自动外跳”的唯一行为。
- `payurl` 是二维码内容来源，不再作为自动导航回退；无法规范化时直接报错。
- 非 Epay 渠道不纳入本次行为变更，避免扩大支付兼容风险。

# Open questions

- 无。用户已明确要求发起付款留在 Modal 展示二维码、避免新页面被插件拦截，并授权按推荐方案持续实现和验收。

# Verification expectations

- 以用户交互测试证明点击发起 Epay 后打开 Modal，且 `window.open`、`window.location.assign`/`href` 和自动表单提交均未被调用。
- 覆盖钱包、订阅、拼团创建/参团及 default/classic 入口。
- 运行受影响测试、`bun run typecheck`、涉及文件 lint、`bun run build`，并以桌面与 390px 视口检查 Modal。
