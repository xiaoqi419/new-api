# Outcome

主 React 钱包充值页正确接入后端已存在的微信官方商户直连支付 processor。用户选择 `wechatpay` 时，前端根据浏览器环境和后端能力字段选择 JSAPI、H5 或 Native 二维码链路；支付成功后复用现有订单状态轮询刷新余额。

# Scope

- 修改 `web/src/features/wallet` 的支付类型、API 类型和请求封装。
- 将直接微信支付从普通易支付表单 processor 中分离出来；`wxpay` 聚合支付继续走 `/api/user/pay`。
- 新增微信支付场景选择、响应解析、安全跳转和 Native 二维码订单状态管理。
- 在主钱包页接入 processor、确认弹窗 loading 状态和现有 `PaymentQrDialog`。
- 为分派、场景降级、响应解析和不安全跳转补充行为测试。
- 更新主前端 changelog。

# Non-goals

- 不修改后端、数据库、公开 API、支付 SDK 或依赖版本。
- 不开发、修改或接入微信登录；微信登录明确排除。
- 不改变 `wxpay` 聚合支付行为，不改变支付宝、Stripe、Waffo 或其他支付方式。
- 不进行真实微信商户收款联调；真实凭据、公网回调和商户配置另行验收。

# Acceptance examples

- A1: `wechatpay` 进入专用微信 processor；`wxpay` 仍进入 generic 易支付 processor。
- A2: 微信内浏览器且 JSAPI 开启时调用 `/api/user/wechatpay/jsapi/prepare` 并安全跳转 `authorize_url`。
- A3: 外部移动浏览器且 H5 开启时调用 `/api/user/wechatpay/pay`，`scene=h5`，并安全跳转 `h5_url`。
- A4: 桌面浏览器或可用降级场景且 Native 开启时调用 `/api/user/wechatpay/pay`，`scene=native`，展示二维码并保留 `trade_no`。
- A5: 当前环境没有可用微信支付场景时，不创建订单，显示失败提示。
- A6: Native 二维码复用现有 `PaymentQrDialog`，通过 `/api/user/topup/status?trade_no=...` 轮询并在成功后刷新余额。
- A7: 非 `http`/`https` 的 H5 或 JSAPI 地址被拒绝，不发生浏览器跳转。
- A8: 微信能力字段参与充值入口可用性和最小充值金额判断，空值和错误响应可见地失败。
- A9: 受影响测试、TypeScript 类型检查、lint 和生产构建通过。
- A10: changelog 有最新中文用户可读条目，版本格式与本轮提交短 SHA 一致。

# Constraints and invariants

- 复用现有 API 实例、i18n key、`PaymentQrDialog`、安全 URL helper 和订单状态接口。
- 用户输入金额沿用充值表单的整数金额约束；后端仍是最终校验方。
- 前端不信任后端跳转地址，只有绝对 `http`/`https` URL 才允许跳转。
- 不引入新的前端依赖；不修改受保护的 `new-api` 或 `QuantumNous` 标识。

# Decisions

- 直接微信支付标识为 `wechatpay`，聚合支付标识 `wxpay` 保持独立。
- 场景优先级固定为：微信内 JSAPI → 外部移动端 H5 → Native；只有对应能力开关为真时才可选择。
- 微信内没有 JSAPI 且 Native 可用时降级 Native；外部移动端没有 H5 且 Native 可用时降级 Native；没有可用场景则失败。
- JSAPI/H5 使用后端返回的授权/收银台 URL；Native 使用二维码和交易号，不在前端自行生成订单。

# Open questions

- 无阻塞问题。真实微信商户凭据、公网回调和微信客户端联调属于非目标，保留为发布前环境验收事项。

# Verification expectations

- 运行受影响的支付分派和微信 hook 测试。
- 在 `web/` 运行 `bun run typecheck`、`bun run lint`、`bun run build`。
- 运行根模块 `GOWORK=off go build ./...`，确认前端 embed 产物链路未回归。
- 检查 Git diff 只包含本 change 的批准文件和 Comet 产物；不推送、不创建 PR、不部署。
