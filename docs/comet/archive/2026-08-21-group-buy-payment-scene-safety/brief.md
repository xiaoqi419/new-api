# Outcome

修复拼团微信支付的场景能力错配：只有当前浏览器场景真正可执行的微信支付才出现在支付方式列表中，Create/Join 在持久化前再次校验场景；支付网关下单失败时立即释放未支付名额，避免用户被无效订单占位。

# Scope

- 前端根据浏览器环境稳定计算 `native` 或 `h5` 场景，并在获取拼团信息、发起拼团和参团时使用同一场景。
- `/api/user/groupbuy/info` 按请求场景过滤官方微信支付；未提供或非法场景时保守按 `native` 处理。
- Create/Join 对微信支付同时校验官方配置和请求场景，场景不可执行时必须在创建拼团、参与者或充值订单前拒绝。
- Create/Join 已持久化后若支付网关下单失败，立即释放当前用户、当前 trade number 的 pending 名额；清理失败写入后端日志，原始支付错误仍返回客户端。
- 增加 H5-only、Native-only、非法/缺省场景、写库前拒绝和 dispatch 失败释放名额的后端回归测试。
- 增加浏览器场景识别、info 请求场景和 Create/Join payload 一致性的前端回归测试。
- 在现有最新 changelog 条目中追加本次场景安全修复。

# Non-goals

- 不改变微信、支付宝或 Epay 的第三方下单协议、回调、幂等结算和退款语义。
- 不新增支付 provider、数据库字段或迁移。
- 不尝试让 H5-only 配置在桌面端可用，也不让 Native-only 配置在普通移动浏览器中显示为可用。
- 不使用真实商户凭据执行生产支付或部署。

# Acceptance examples

- A1: 仅开启微信 H5 时，普通移动浏览器的 info 返回微信支付，桌面和微信内置浏览器不返回微信支付。
- A2: 仅开启微信 Native 时，桌面和微信内置浏览器的 info 返回微信支付，普通移动浏览器不返回微信支付。
- A3: Create/Join 请求微信支付但请求场景未启用时，在任何拼团、参与者或充值订单持久化之前返回错误。
- A4: 前端获取支付方式、Create 和 Join 使用同一浏览器场景；桌面/微信内置浏览器为 `native`，普通移动浏览器为 `h5`。
- A5: 支付方式有效且订单已创建，但第三方下单失败时，当前 pending 参与者的名额立即释放；用户无需等待十五分钟预占超时。
- A6: 支付下单失败后的清理不会删除充值订单，也不会破坏迟到回调、provider mismatch 和幂等结算不变量。
- A7: 支付宝和 Epay 的方法发布、选择、下单和错误行为保持现状。

# Constraints and invariants

- 后端仍是拼团支付能力的唯一事实源；前端场景参数只是能力选择输入，不能绕过服务端配置。
- 同一 Create/Join 请求的能力校验必须发生在 model 持久化之前。
- dispatch 失败后的释放必须限定为当前用户、当前 trade number、pending 状态，不能释放他人或已支付记录。
- SQLite、MySQL 和 PostgreSQL 行为必须一致；优先复用现有 GORM `ReleaseGroupBuyReservation`。
- 保留当前 worktree 中用户和其他已归档 change 的未提交修改。

# Decisions

- 使用现有 `scene` 字段和 info query 参数表达 `native/h5`，不扩展支付方法 JSON 结构，保持接口简单且向后兼容。
- 缺省或未知场景按 `native` 处理，避免旧客户端在 H5-only 配置下获得可能无法在桌面执行的 H5 checkout。
- 微信内置浏览器沿用现有 `native` 决策，因为当前实现没有 JSAPI dispatcher；普通移动浏览器使用 H5。
- dispatch 失败立即调用现有 `ReleaseGroupBuyReservation`；充值订单保留 pending，保证现有迟到回调契约不被改变。
- 用户已明确授权按推荐方案连续修复、独立验收并归档，因此无需额外用户决策。

# Open questions

- 无。

# Verification expectations

- Go 测试覆盖场景化方法发布、Create/Join 写库前拒绝、dispatch 失败释放和原有 provider 矩阵。
- Vitest 覆盖桌面、普通移动端、微信内置浏览器的场景识别，以及 info/Create/Join 使用相同场景。
- 运行受影响 Go/前端测试、gofmt、oxfmt、oxlint、TypeScript、前端生产构建、完整 Go 测试和 `git diff --check`。
- 浏览器复核桌面与移动端登录、首页、文档页无白屏、异常和横向溢出，并再次点击首页 Docs 进入 `/docs`。
- 由新的只读 Verifier 独立逐项核对 A1-A7 后才能归档。
