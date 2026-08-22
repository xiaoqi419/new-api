# Outcome

将普通用户侧的彩虹易支付（Epay 聚合支付）从 `/submit.php` 表单和外部新标签页流程改为站点内扫码支付：覆盖钱包充值、订阅购买和拼团支付。服务器通过彩虹易支付 `mapi.php` 创建订单，当前业务页面展示二维码或显式拉起支付 App 的操作，异步回调验签成功后刷新对应余额、订阅或拼团状态。

# Scope

- 钱包、订阅购买和拼团创建/参团中由彩虹易支付提供的聚合支付方式（当前至少包括 `alipay` 与 `wxpay`）改用站点内 checkout；`alipay_direct`、`wechatpay` 等官方商户直连保持原行为。
- 新增经过登录与关键操作限流保护的 MAPI checkout 接口或等价的 Epay 分支响应；保留现有 `POST /api/user/pay` 及旧客户端 `/submit.php` 响应契约，避免破坏外部客户端。
- 服务端复用现有管理员 Epay 地址、商户 ID、密钥、金额/套餐/拼团校验、代理钱包预检、钱包 `TopUp`、订阅 `SubscriptionOrder`、拼团名额预占和各自回调地址，向 `<PayAddress>/mapi.php` 发送服务端表单请求。
- MAPI 成功响应规范化为站内 checkout 数据：站内订单号、网关订单号、支付方式、应付金额、`qrcode|payurl|urlscheme` 类型及其非空值。
- 先创建 pending 订单再请求网关；网关请求、响应解析或 checkout 数据校验失败时，将该订单从 pending 原子更新为 failed，不能留下可被误轮询的孤立 pending 订单。
- 钱包、订阅和拼团确认付款后分别切换为当前业务页面内的全尺寸支付步骤，展示二维码、金额、支付方式、订单号、等待状态、返回业务页、手动刷新，以及安全条件满足时的“打开支付宝/微信”按钮。
- 钱包和拼团复用 `GET /api/user/topup/status` 按本人订单轮询；订阅新增只返回当前用户订单的状态接口。支付成功后刷新用户余额、订阅列表/用户组或拼团详情，并自动回到发起支付的业务页面。
- 增加后端 MAPI 契约与失败状态测试、前端 checkout 数据分支与交互测试、七语言 i18n、更新日志和维护进度记录。

# Non-goals

- 不修改或删除支付宝/微信官方商户直连功能及其配置、回调和二维码流程。
- 不改造代理控制台 Epay 预充值、Stripe、Creem、Waffo 或官方直连等非本期 Epay 聚合入口。
- 不删除 `POST /api/user/pay`，不改变其现有外部表单兼容行为。
- 不新增数据库表、列或迁移；不把 checkout payload 持久化到数据库、Redis 或服务端内存。
- 本期不保证刷新浏览器后恢复同一二维码；刷新后 pending 钱包/拼团订单仍可在充值记录或拼团详情中查看，订阅订单仍保留在服务端但用户可重新发起支付。
- 不使用 iframe 嵌入彩虹易支付页面，不自动打开外站或支付 App，不把商户密钥发送到浏览器。
- 不升级 `github.com/Calcium-Ion/go-epay`，不新增支付 SDK 或大型前端依赖。
- 不在缺少真实商户凭据、公网 HTTPS 回调和实际资金流时宣称线上支付验收通过。

# Acceptance examples

- A1：钱包、订阅购买和拼团选择彩虹易支付 `alipay` 或 `wxpay` 并确认后，不创建目标为外站的新标签页或自动提交 `/submit.php` 表单，而是在当前业务页面内显示支付步骤。
- A2：钱包 checkout、订阅 checkout 和拼团 Epay 分支均调用配置网关的 `/mapi.php`，请求包含官方要求的 `pid`、`type`、`out_trade_no`、`notify_url`、`return_url`、`name`、`money`、`clientip`、`device`、`sign`、`sign_type=MD5`，商户密钥不出现在响应或日志中。
- A3：MAPI 分别只返回 `qrcode`、`payurl` 或 `urlscheme` 时，后端均返回唯一、可判别且非空的 `checkout_type`/`checkout_value`；`code != 1`、无可用 checkout 字段、非法响应或网络错误均返回失败。
- A4：checkout 创建沿用现有金额上下限、套餐启用/购买上限、拼团名额、额度溢出、支付方式、Epay 配置和代理钱包预检；失败不会绕过这些守卫，也不会产生负额度、订阅或拼团结算。
- A5：钱包与拼团订单在请求网关前以 `PaymentProviderEpay` 和 pending 状态创建，订阅订单以 `SubscriptionOrder` pending 状态创建；MAPI 下单失败时只将匹配 provider 的 pending 订单原子标记 failed/expired，并释放拼团预占名额。
- A6：只有通过现有 Epay 签名、订单归属、订单类型、provider、payment method 和 pending 状态校验的异步回调可以完成钱包入账、订阅开通或拼团结算；前端 checkout 响应和状态轮询都不能直接改成 success。
- A7：站内支付步骤使用现有 `qrcode.react` 将 checkout 值编码为二维码，不把任意字符串当成图片地址或 HTML；外部 URL/App scheme 只有通过允许规则且由用户明确点击时才能打开。
- A8：桌面二维码视觉尺寸约 240px、窄屏约 208px；支付步骤在 390px 移动视口和常用桌面视口无横向溢出、无控件重叠，并支持浅色/深色主题、键盘操作和可访问名称。
- A9：支付步骤显示应付金额、聚合支付方式、站内订单号及 waiting/success/failed/expired 状态；提供返回当前业务页面和手动刷新，存在安全的移动端唤起目标时显示“打开支付宝/微信”按钮。
- A10：前端每 3 秒调用对应本人订单状态接口，最多持续 5 分钟；临时网络错误保持等待，success 时停止轮询、刷新余额/订阅/拼团详情并回到发起页，failed/expired 时停止轮询并保留明确的返回或重试操作。
- A11：`POST /api/user/pay` 的旧 `/submit.php` 表单响应继续可用，官方直连支付与其他支付处理器的行为和测试不回退。
- A12：用户可见新增文案通过 `useTranslation()` 接入 en、zh、zh-TW、fr、ru、ja、vi，七语言键集合一致，变更在 `web/src/features/changelog/data.ts` 顶部记录。
- A13：后端定向测试覆盖 MAPI 签名请求、三种成功字段、错误/畸形响应、钱包/订阅/拼团 failed 回收和三类回调结算边界；前端定向 Vitest/Testing Library 覆盖无外部表单、二维码、轮询成功/失败/超时、返回业务页和安全唤起，default 与 classic 用户入口均不回退。
- A14：受影响 Go 测试、前端定向测试、typecheck、受影响文件 lint 与生产构建通过；真实商户二维码、扫码到账、异步通知和结算明确保持“待线上验收”。
- A15：维护文档记录本 change 的实现状态、实际检查、未覆盖的线上商户验收、浏览器刷新不恢复二维码的限制，以及未推送/未发布/未部署状态。
- A16：订阅提供只允许当前用户查询的 Epay 订单状态接口；拼团继续使用本人 `TopUp` 状态并在关闭 checkout 时释放未支付名额。
- A17：钱包、订阅、拼团的成功回调分别保持既有钱包入账、订阅开通/用户组刷新和拼团结算/返利语义，重复回调保持幂等。

# Constraints and invariants

- 数据库继续兼容 SQLite、MySQL 5.7.8+ 与 PostgreSQL 9.6+；本 change 无 schema 变化。
- JSON 解码使用 `common.DecodeJson`/`common.Unmarshal`，不在业务代码直接调用 `encoding/json` 编解码。
- Epay 请求必须由服务端签名；日志可记录站内订单号、支付方式、状态码和脱敏错误，但不得记录商户密钥、完整签名或敏感 checkout token。
- MAPI URL 由现有 `PayAddress` 规范化拼接 `/mapi.php`，请求使用带超时的 HTTP client，并限制响应体大小；不能信任网关返回的类型、URL、scheme 或 JSON。
- 聚合支付与官方直连支付类型保持区分：`alipay`/`wxpay` 属于 Epay，`alipay_direct`/`wechatpay` 不进入本链路。
- 状态接口继续只允许当前登录用户查询自己的订单；轮询是观察机制，不是结算授权。
- 成功、失败、超时和主动返回均必须清理前端轮询定时器；组件卸载后不得继续更新状态。
- 站内支付页面保持当前 Base UI/Tailwind 的安静工作型视觉语言，不新增卡片嵌套、营销式大标题或自绘 SVG。

# Decisions

- D1：采用当前业务页面内的全尺寸支付步骤：钱包回到钱包，订阅回到订阅购买上下文，拼团回到拼团详情；不新增支付路由和数据库持久化。
- D2：新增钱包/订阅专用 MAPI checkout 接口，并让拼团 Epay 分支返回规范化 checkout 数据；保留旧 `POST /api/user/pay` `/submit.php` 兼容契约，避免公开 API 破坏。
- D3：`qrcode`、`payurl`、`urlscheme` 都作为不可信 checkout 内容返回；站内统一生成二维码，只有安全允许且用户点击时才打开外部目标。
- D4：先落 pending 订单再调用 MAPI，避免极速异步回调早于本地订单；网关失败通过现有 provider-aware 条件更新标记 failed。
- D5：现有验签异步回调是唯一结算入口；不接受前端“支付成功”声明，也不从 MAPI 下单响应直接入账。
- D6：沿用现有 3 秒轮询和 5 分钟前端观察窗口；观察超时不擅自把仍 pending 的订单改成 failed/expired。
- D7：本期覆盖普通用户钱包、订阅和拼团的 Epay 聚合支付；代理控制台预充值及非 Epay 入口保持排除。
- D8：本地 `go-epay v0.0.4` 仅提供 `/submit.php` 与回调验签；项目内实现小型 MAPI 调用层，复用其 `epay.GenerateParams`，不升级依赖。
- D9：官方文档 `https://pay.lstart.cc/doc.html` 的已知页面由 Fathom、Exa、Tavily 三路提取交叉一致；Firecrawl 本轮无可调用工具，作为资料核验缺口留档。

# Open questions



# Verification expectations

- 后端优先运行新 MAPI client/controller 测试及现有 Epay provider、金额/额度安全、状态条件更新相关测试；只有共享契约受影响时才扩大 Go 测试范围。
- 前端运行新增 checkout 状态/组件测试、现有 wallet/subscription/groupbuy payment/QR 测试、`bun run typecheck`、受影响文件 oxlint；用户可见整合完成后运行一次生产 build。
- 使用桌面与 390px 移动视口做浏览器验收，覆盖二维码、loading、success、failed/expired、手动返回、深色模式及“没有外部新标签页/自动表单”的行为。
- 无真实商户凭据时用受控 HTTP 测试服务器验证请求/响应契约；真实二维码扫码、回调公网可达、平台验签、到账和结算保留到线上验收。
