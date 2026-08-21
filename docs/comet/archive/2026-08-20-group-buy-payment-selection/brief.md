# Outcome

修复拼团发起页和参团页无法正确选择支付方式的问题：由拼团后端显式返回当前真正可下单的支付方式，前端自动选择有效首项、允许用户切换并把所选值写入 Create/Join 请求；没有可用方式时展示明确空态，而不是保留虚假的微信默认值。

# Scope

- 在拼团信息接口中增加拼团专用 `payment_methods` 契约，只返回当前已启用且现有拼团 dispatcher 真正支持的官方微信、官方支付宝和 Epay 方法。
- 明确拒绝 Stripe、Creem、Waffo、Waffo Pancake、余额等非 Epay 保留类型被误当作 Epay 拼团方法。
- 前端改为消费拼团专用列表，去除空项和重复项，初始支付方式为空并在数据到达后选择第一个有效方法。
- 发起和参团两个入口支持真实切换；Create/Join 提交前拒绝空支付方式。
- 加载中禁用选择器；零可用方式时显示清晰、已国际化的说明并禁用提交。
- 增加后端支付方法矩阵测试、前端规范化/默认选择/请求 payload/空态交互测试和浏览器回归。

# Non-goals

- 不在本 change 中新增 Stripe、Creem、Waffo 或 Waffo Pancake 的拼团 checkout；它们现有的定价和退款约束不能通过仅展示选项安全解决。
- 不改变现有官方微信、官方支付宝或 Epay 的支付下单、回调、结算、退款语义。
- 不修改钱包普通充值页的支付方法接口和展示。
- 不增加数据库字段或迁移，不重构拼团订单模型。
- 不修改支付合规确认规则；未确认合规时仍不得暴露可用支付方式。

# Acceptance examples

- 仅启用一个有效 Epay 方法时，发起页和参团页都显示该方法并默认选中，提交 payload 包含对应 `payment_method`。
- 同时启用官方微信、官方支付宝和 Epay 时，用户能在真实 Base UI Select 中切换，触发器文本随选择更新，Create/Join 使用最后选择的值。
- 后端方法列表包含空项或重复类型时，前端只保留首个有效唯一项。
- 只有 Stripe、Creem、Waffo、Waffo Pancake 或余额方法时，拼团接口不把它们作为可用方式，页面显示“没有可用的支付方式”并且不能提交。
- 支付合规未确认或没有配置拼团支持的网关时，支付列表为空且 UI 不保留 `wechatpay` 伪选择。
- 客户端伪造保留方法或空方法调用 Create/Join 时，后端在创建拼团订单前拒绝请求。

# Constraints and invariants

- 可用列表必须与 `resolveGroupBuyProvider` 和 `dispatchGroupBuyPayment` 的真实能力保持一致，后端是唯一事实源。
- 不能因为某种方法存在于普通充值 `PayMethods` 中就推断其支持拼团。
- 不得破坏支付合规门控、provider mismatch 校验、回调幂等和现有订单结算。
- 用户可见文案必须使用现有 i18n；前端遵循 Base UI、TanStack Router 与项目测试规范。
- 保留当前 worktree 中用户和其他 change 的未提交修改，changelog 在现有最新版本项内追加说明。

# Decisions

- 扩展既有 `/api/user/groupbuy/info`，返回 `payment_methods`，避免创建重复端点；发起页已有的 info 请求与 payment hook 的同 URL 请求可由统一 HTTP 客户端去重。
- 后端通过显式 allow-capability 生成列表：官方微信、官方支付宝按各自 availability 开关加入；Epay 仅从已配置方法中加入非保留类型。
- `resolveGroupBuyProvider` 对已知非 Epay provider 类型显式报错，避免管理员把保留类型写入 Epay 方法列表后错误落入 default 分支。
- 前端 `payWay` 初始值改为空字符串；列表到达或刷新后，当前值不存在时原子切换到第一项。
- 空态复用已有翻译键 `No payment methods available. Please contact administrator.`，无需新增重复文案。

# Open questions

- 无。用户已授权按推荐方案连续实现、独立验收并归档。

# Verification expectations

- Go 测试覆盖官方直连、Epay、保留 provider、重复/空配置和合规不可用场景。
- Vitest 覆盖支付列表规范化、默认值、切换后的 Create/Join payload、空态与不可提交状态。
- 运行受影响 Go/前端测试、gofmt、oxfmt、oxlint、TypeScript、前端生产构建、完整 Go 测试和 `git diff --check`。
- 使用 Playwright 对发起拼团和参团入口进行真实下拉选择与请求 payload 验收。
- 独立只读 Verifier 逐项核对正式 acceptance 后方可 Archive。
