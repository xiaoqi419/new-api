# Outcome

国内站与国际站继续共享唯一 `main` 代码基线。Root 管理员在支付配置页选择当前实例的 EPay-family 目标协议；默认为国内 Legacy EPay，可改为国际 GMPay Native。应用仅在启动时读取并冻结当前生效模式，管理员保存新选择后必须重启才生效。两套订单创建和回调协议双向隔离，错误模式下必须在创建订单、验签、查单或入账前失败关闭。

# Scope

- 新增可持久化配置 `PaymentGatewayMode=epay_legacy|gmpay_native`，仅 Root 管理员可在支付配置页修改。
- 未配置时默认 `epay_legacy`；保存时拒绝非法值，数据库中存在非法值时在 HTTP 服务启动前失败关闭。
- 应用在数据库和 Options 加载完成后读取一次目标模式，并冻结为进程生命周期内的生效模式。保存新值只形成待生效模式，不热切换；不从域名、Host、品牌名、支付方式名称或客户端参数推断。
- 钱包统一入口同时检查可信实例模式和已配置支付方式；Legacy 模式保留原版 EPay，Native 模式仅允许 `usdt.tron` 使用 GMPay。
- Native 模式完整支持普通钱包充值、订阅购买、拼团付款和代理向平台预付；四类产品共用结构化 `crypto` 收银台数据，回调按本地订单类型进入原有独立事务结算。
- Legacy EPay 与 Native GMPay 的平台、代理回调互斥；错误模式回调在解析、验签、查单和结算前返回协议失败响应。
- 管理后台显示当前生效模式、目标模式与重启提示，并提供“国内站 / Legacy EPay”和“国际站 / GMPay Native”两个可编辑选项。
- 支付方式模板和公开能力按当前模式过滤；Stripe、Creem、Waffo、官方支付宝/微信等独立 Provider 不受影响。
- 更新国际站维护文档、后台配置说明、i18n 和 changelog。
- 补充启动冻结、四类产品的 Legacy/Native 分流、平台/代理回调、后台目标模式编辑与待重启状态、错误模式拒绝的回归测试。

# Non-goals

- 不创建国内版和国际版长期源代码分支。
- 不修改国内站或国际站生产数据库、Redis、容器或在线配置。
- 不根据 HTTP Host 或域名自动选择支付协议。
- 本 change 不把历史 `TopUp.PaymentProvider=epay` 迁移为新数据库值，避免使升级时仍 pending 的国际 GMPay 订单失去回调兼容。
- 不改变 Stripe、Creem、Waffo、Waffo Pancake、微信直连和支付宝直连协议。
- 不在本 change 中发布或部署生产环境。
- 不改变订阅购买上限、套餐权益生成、拼团名额/成团/退款规则、代理预付到账比例或代理白标用户钱包的租户归属规则。
- 支付网关模式选择不自动改变站点语言、币种、品牌、价格、分组或倍率。

# Acceptance examples

- A1: 没有 `PaymentGatewayMode` Option 时应用以 `epay_legacy` 启动；两个合法值可由 Root 保存并在下次启动准确加载；保存非法值被拒绝，数据库非法值拒绝启动，错误不包含支付凭据。
- A2: 生效模式在进程生命周期内不变；后台保存新值后仅目标模式改变，当前下单和回调仍使用原生效模式，直到应用重启；不从 Host、转发头、请求参数或 `PayMethods` 推断。
- A3: Legacy 模式下所有已配置普通 EPay 钱包方式继续走原版 EPay；即使方式名是 `usdt.tron` 也不得实例化 GMPay 客户端。
- A4: Native 模式下只有已配置的 `usdt.tron` 能为普通钱包、订阅、拼团和代理预付创建 GMPay 订单；其他 EPay-family 方式在业务占位、插单和网络调用前拒绝。
- A5: Native 模式下旧 `/api/user/pay` 不能绕过统一 checkout 重新进入原版 EPay。
- A6: Legacy EPay 平台/代理回调只在 Legacy 模式处理；GMPay 平台/代理回调只在 Native 模式处理；错误协议不能查询或结算订单。
- A7: 正确模式下现有金额、签名、PID、支付方式、租户、幂等和敏感信息保护保持有效；订阅、拼团和代理预付分别进入已有的专用事务结算，不得充入普通用户钱包。
- A8: 钱包公开的 EPay-family 支付方式按模式过滤；独立支付 Provider 的可用性不受影响。
- A9: Root 支付配置页默认选中“国内站 / Legacy EPay”，可选“国际站 / GMPay Native”；页面同时显示当前生效与重启后生效值，两者不同时显示明确的待重启状态。
- A10: 国内 Legacy 与国际 Native 的管理员文案、模板和说明支持全部现有前端语言，并在窄屏和桌面不溢出。
- A11: 订阅购买在 Native 模式返回结构化 GMPay `crypto` 收银数据；成功回调仅完成匹配的 `SubscriptionOrder`、创建一次权益并遵守购买上限，重复回调不重复创建权益。
- A12: 文档给出国内 `epay_legacy`、国际 `gmpay_native` 的后台选择和重启流程，并明确两个实例使用同一提交，但数据库、Redis、凭据和支付数据保持隔离。
- A13: 拼团在 Native 模式只公布 `usdt.tron` 作为 EPay-family 方式，返回结构化 `crypto` 收银数据；回调继续通过 `TrySettleGroupBuyOrder` 幂等结算，不跳过名额、成团和阶梯规则。
- A14: 代理向平台预付在 Native 模式使用平台 GMPay 凭据和平台 Native 回调，返回结构化 `crypto` 收银数据；成功回调只通过 `TryCompleteAgentPrepay` 幂等充入目标代理钱包。
- A15: 代理白标终端用户的普通钱包 Native 支付继续使用该代理的地址、PID、密钥和代理回调；平台/代理凭据、路由 ID 或订单归属不匹配时不得结算。
- A16: 四类 Native 收银台在站内显示精确 USDT 金额、TRON 地址、二维码、复制操作、过期倒计时和本地状态轮询，不跳转或嵌入 GMPay 托管页；成功后刷新各自的权益或钱包状态。
- A17: Legacy 模式下订阅、拼团和代理预付继续使用原版 EPay MAPI/回调流程；Stripe、Creem、Waffo、Waffo Pancake、微信直连和支付宝直连回归测试通过。

# Constraints and invariants

- `origin/main` 是唯一生产代码源；本 change 从 `56ce4f0dbbb8ee59918ecf88f37e9f8de7b9e575` 创建。
- 模式必须在主数据库和 Options 加载后、HTTP 路由开始接收请求前完成验证并冻结，启动后不可变。
- 错误模式必须 fail closed，不能静默回退到另一支付协议。
- 现有待支付订单、签名、金额和幂等结算安全不变量必须保持。
- 密钥、签名、商户 PID、网关配置地址和完整网关响应不得新增到浏览器响应或日志；浏览器只接收完成本笔付款所必需的单次 TRON 收款地址和结构化收银字段。
- SQLite、MySQL 和 PostgreSQL 必须继续兼容；本 change 不需要数据库迁移。
- 所有用户可见文案使用 i18n；前端使用 Bun 完成测试、类型、lint 和构建检查。

# Decisions

- 使用一套代码、两个部署实例，不维护国内/国际长期分支。
- 使用当前实例数据库中的 Root 管理配置，不使用域名或请求信息识别模式。
- 国内站模式为 `epay_legacy`，国际站模式为 `gmpay_native`。
- 管理后台可修改目标模式；变更模式必须重启应用，保存本身不得热切换当前协议。
- 第一版保留历史订单的 `PaymentProvider=epay` 数据兼容，由实例模式、支付方式、签名、金额和订单归属共同隔离协议。
- 用户选择在本 change 内完整实现订阅、拼团和代理预付的 GMPay Native 下单、收银、回调分流和幂等结算，不保留国际站对 Legacy EPay 兼容协议的运行时依赖。
- 本需求保持单一 Native change；配置、分流、回调和管理端状态紧密耦合，不拆 Supervisor children。

# Open questions

- None.

# Verification expectations

- 运行支付模式默认值、保存验证、重启生效、运行期不热切换与非法数据库值启动失败测试。
- 运行钱包 Legacy/Native 双向隔离、旧接口防绕过、平台与代理回调测试。
- 运行订阅、拼团、代理预付的 Native 下单、收银、轮询、回调和幂等结算测试，以及 Legacy 和独立 Provider 回归测试。
- 运行管理后台默认值、两个可选模式、当前/待生效状态、重启提示、模板过滤和敏感字段保留测试。
- 运行受影响 Go 包测试、`gofmt`、`git diff --check`。
- 运行受影响 Vitest、`bun run typecheck`、目标 lint、`bun run i18n:sync` 和 `bun run build`。
- 由新的只读 Verifier 逐项检查 A1-A17；Builder 结果不能代替独立验收。
