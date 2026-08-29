# Outcome

让国际站 `codezip.io` 的钱包充值能够兼容 EPUSDT v2.0.0：现有站内 MAPI 请求遇到网关明确返回 HTTP 404 时，回退到 EPUSDT 已实现的 EPay `/submit.php` 兼容接口，并将安全的支付页地址交给现有前端 checkout 流程。

发布通过正式主线、Pull Request、CI、不可变镜像和可回滚部署完成。本次按用户确认对国内站 `aierxin.cc` 与国际站 `codezip.io` 分别执行应用热更新；两站的数据库、Redis、站点配置、支付配置和用户数据继续保持隔离，不跨站复制。

# Scope

- 在 `service/epay_mapi.go` 中增加仅由 MAPI HTTP 404 触发的 `/submit.php` 回退。
- 使用项目已有 `go-epay v0.0.4` 生成 EPay MD5 签名字段，保留支付方式、站内订单号、金额、逐单 `notify_url`、`return_url`、商品名和设备类型。
- 回退结果使用现有 `checkout_type=payurl` 契约，并继续执行绝对 HTTP/HTTPS URL 校验。
- 清除配置支付基址中原有的 query、fragment 和 raw fragment，避免未参与签名的参数被带到 EPUSDT。
- 以 `usdt.tron` 覆盖国际站实际计划使用的 GMPay/USDT-TRON 选择器。
- 更新国际站维护文档和用户可见 changelog。
- 通过 PR、CI 和精确提交镜像发布，分别更新国内站与 `/opt/new-api-international` 的应用服务。
- 发布后追加国际站 `GMPay` 支付方式，并做不付款的下单/跳转/回调地址验证。
- 为站内 `EpayCheckoutDialog` 补齐 `Return` 的多语言资源；简体中文显示 `返回`，英文和其它支持的界面语言显示对应的自然译文。

# Non-goals

- 不跨站复制用户表、会话、余额、消费记录、数据库或支付密钥；国内站与国际站仍使用各自的数据和配置。
- 不实现 EPUSDT 原生 GMPay HMAC API；本 change 使用 EPUSDT 官方保留的 EPay MD5 兼容接口。
- 不把 EPUSDT API Key 页面里未启用的 key 级 `notify_url` 当作 New API 回调配置；New API 继续逐单提交 `notify_url`。
- 不进行真实付款，不伪造支付成功、到账、回调或结算。
- 不生成、猜测或代用户填写 TRON USDT 收款地址。
- 不改变 MAPI 成功响应、非 404 错误、现有回调结算、官方直连或其他支付提供商行为。

# Acceptance examples

- A1: 当 MAPI 返回成功响应时，仍按现有优先级解析 `qrcode`、`payurl` 或受允许的 `urlscheme`，不进入兼容回退。
- A2: 当 MAPI 返回 HTTP 404 时，返回绝对 HTTP/HTTPS `payurl`，路径为规范化支付基址下的 `/submit.php`，并包含由已有库生成的有效 MD5 签名字段。
- A3: 回退请求完整保留 `type=usdt.tron`、`out_trade_no`、金额、逐单 `notify_url`、`return_url`、商品名和设备类型；商户密钥本身不进入浏览器响应或日志。
- A4: MAPI 的非 404 非 2xx、网络错误、超时、取消和无效响应仍失败，不静默降级到 `/submit.php`。
- A5: 配置支付基址已有 query 或 fragment 时，生成的 MAPI 和 `/submit.php` 地址不携带这些未签名输入，只包含本单已签名的 EPay 参数。
- A6: `service` 和 `controller` 的相关 Go 测试通过，新增回归测试明确覆盖 `usdt.tron`、query/fragment 清理、404 回退和非 404 不回退。
- A7: 维护文档记录国际/国内站边界、EPUSDT 路由和逐单回调语义；changelog 使用实际发布镜像标签对应的版本标识。
- A8: 候选通过精确提交的 Docker 构建与 CI 后才允许发布；部署前分别备份国内站和国际站 Compose、数据库及支付 Options，并为两站保留旧镜像回滚路径。
- A9: 国际站最终暴露名为 `GMPay`、类型为 `usdt.tron`、图标为 `SiTether`、最小充值额为字符串 `"10"` 的支付方式。
- A10: 发布后只创建不付款的测试订单，验证 `/submit.php`、收银台跳转和逐单 `https://codezip.io/api/user/epay/notify`；若缺少真实 TRON 收款地址，则在下单前或明确失败处停止并报告，不伪造地址。
- A11: 发布前后分别记录国内站和国际站应用容器 ID、启动时间、镜像、健康状态和关键 Options；两站都只更新应用服务且保持数据、Redis 与站点配置隔离。
- A12: 站内支付弹窗的返回按钮通过 `t('Return')` 渲染；简体中文界面显示 `返回`，英文界面保持 `Return`，其它支持的语言包均提供对应翻译且不回退为英文。

# Constraints and invariants

- 数据库、充值订单和回调结算语义不得改变；MAPI 或兼容接口创建 checkout 不能直接入账。
- 只有 EPUSDT 已签名异步通知通过现有验签、订单归属、支付方式、金额和 pending 状态检查后才能结算。
- `PayAddress` 保持 `https://pay.codezip.io/payments/epay/v1/order/create-transaction`，配置值不手工追加 `/submit.php`。
- 国际站站点名保持 `Zip API`；国内站站点名、数据和配置保持原值，本 change 只对两站发布相同代码镜像。
- 支付弹窗新增或修正的用户可见文案必须通过现有前端 i18n 资源和同步脚本维护，不改变支付、订单或结算行为。
- 任何凭据、密钥、密码、Cookie、完整数据库备份内容不得写入 Git、测试输出或维护文档。
- 工作区中用户和其他 change 的已有修改必须保留。

# Decisions

- 使用“仅 HTTP 404 回退”策略：它精确表达 EPUSDT 缺少 MAPI 路由，同时避免掩盖网关 401、429、5xx、超时和网络故障。
- 复用 `go-epay v0.0.4` 的 `/submit.php` 与 MD5 签名实现，不增加新的支付 SDK 或自定义签名实现。
- 支付展示名和协议选择器分离：展示名使用 `GMPay`，协议 `type` 使用 EPUSDT v2.0.0 接受的 `usdt.tron`。
- API Key 页面中的 key 级 `notify_url` 不参与 New API 集成；有效回调来自每笔 EPay 订单的 `notify_url`。
- 浏览器可见的回退 URL 会包含协议要求的单笔订单签名，但不会包含商户密钥；签名只绑定当前不可变订单参数。
- 代码进入 `main` 后构建精确提交镜像，分别热更新两站应用服务；两站旧镜像均保留为回滚目标。
- `Return` 是支付弹窗返回操作的独立翻译键；中文使用简洁的按钮文案 `返回`，不复用语义不同的其它 `Return ...` 长文案键。

# Open questions

无。真实 TRON USDT 收款地址属于部署后的外部前置条件；缺失时按 A10 停止验单，不改变本 change 的代码行为。

# Verification expectations

- 运行 `go test ./service ./controller -count=1` 和聚焦 EPay 回归测试。
- 运行 `git diff --check`，并检查旧注释、旧名称和未清理 query/fragment 的残留。
- 使用正式 Dockerfile 从精确提交构建镜像，覆盖本地缺少 `web/canvas/dist` 时根包 `go test ./...` 无法单独编译的构建路径。
- 由独立只读 Verifier 逐项核对 A1-A11；Builder 的测试说明仅作线索。
- 发布前后通过只读服务器检查分别记录两站容器、镜像、启动时间、Options 与健康状态，并确认两站依赖服务和数据边界未串用。
- 线上只做不付款验单；不把收银台打开、return URL 或轮询结果当作支付成功证据。
- 运行支付弹窗的聚焦前端测试，确认中文返回按钮显示 `返回` 且不显示英文 `Return`；运行 i18n 同步检查和前端构建/类型检查（环境可用时）。
