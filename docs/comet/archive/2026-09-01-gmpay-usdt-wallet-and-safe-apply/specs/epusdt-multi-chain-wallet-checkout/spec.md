# EPUSDT USDT 多网络站内充值

## 目标与边界

GMPay Native 模式下，普通钱包充值只接受 USDT。TRON、Ethereum、Solana 和 BSC 是可选择的收款网络；TRX、ETH、SOL、BNB、USDC 及其他代币不得作为新订单资产提供给用户。

本能力只改变普通钱包的 GMPay Native 网络选择。Legacy EPay、订阅、拼团、代理预付及其他独立支付 Provider 保持各自既有路径。

## 可用 USDT 网络

1. 服务端通过 EPUSDT `/payments/gmpay/v1/config` 读取 `supported_assets`，继续执行现有请求超时、响应体大小、元素数量、格式清洗、短 TTL 缓存和错误处理。
2. 服务端按大小写不敏感方式检查每个网络的 token 列表，只保留包含 `USDT` 的网络。
3. 只保留 New API 已支持地址验证和标签展示的网络：
   - `tron`: `TRON`, `USDT · TRC20`；
   - `ethereum`: `Ethereum`, `USDT · ERC20`；
   - `solana`: `Solana`, `USDT · SPL`；
   - `binance`/网关既有 BSC 规范名：`BSC`, `USDT · BEP20`。
4. 网络别名必须由服务端规范化为一个稳定标识；同一规范化网络无论 USDT 重复出现多少次，最多返回一个选择项。
5. 结果顺序稳定，优先保持网关顺序；显示名为空时使用本地化的规范网络名称。
6. `GET /api/user/topup/info` 在 Native 模式下返回一项/网络的 `crypto_assets`；每项的 token 固定为 `USDT`。Legacy 模式不返回 Native 网络列表。
7. 配置请求失败、响应无效、列表为空、没有 USDT 或只有未知网络时返回空的可用网络集合，不回退到静态 TRON。

## 用户选择与建单

1. 可用网络只有一个时，用户点击支付直接使用该网络创建订单，不显示选择 Modal。
2. 可用网络有两个或更多时，用户点击支付先打开网络选择 Modal；关闭、取消或未选择不创建本地订单，也不调用 EPUSDT。
3. Modal 一张卡片代表一个网络，不按 token 展开；标题显示网络名称，副标题显示固定 USDT 和链协议标签。
4. 客户端创建 Native 钱包订单时必须同时发送规范化 `network` 和 `token=usdt`。缺少任一字段、token 不是 USDT、网络未知或组合无效时客户端不发送请求，服务端也必须拒绝直接构造的请求。
5. 服务端在写入本地 pending 订单和调用 EPUSDT 建单前重新读取/验证当前可用 USDT 网络。所选网络已消失或配置不可验证时失败关闭，不自动换链，不回退 TRON。
6. 网关建单请求只携带所选 network 和 `usdt` token；checkout 响应的网络和 token 必须与本地订单 binding 一致。

## 订单绑定与兼容

1. TRON/USDT 新订单继续使用历史 `usdt.tron` payment method 编码。
2. 其他网络的新 USDT 订单沿用现有可解析的网络/token payment method 编码，保证网络绑定在回调和日志中可恢复，不增加数据库列。
3. 新订单创建策略只允许 USDT，但解析器和回调必须继续识别部署前已存在的历史非 USDT pending 订单，并按订单自身 binding、签名、PID、金额、状态和归属完成或拒绝结算。
4. 历史兼容不得成为新建单绕过：任何新普通钱包 Native 请求中的非 USDT token 都必须在本地订单创建和网关调用前拒绝。
5. 回调中的 network/token 必须与订单 binding 一致；大小写只在明确的规范化边界处理，不能通过大小写规避匹配。

## 站内 Checkout

1. 成功建单返回现有结构化 crypto checkout 数据，不返回、打开、嵌入或编码 hosted cashier URL。
2. Checkout Modal 展示本地订单号、网关订单号、原始充值金额、网关返回的精确 USDT 应付金额、完整收款地址、网络名称和协议、USDT、二维码、复制操作、过期倒计时及支付状态。
3. 地址必须使用所选网络的对应校验器验证；TRON、EVM 和 Solana 地址不得共用错误校验规则。
4. 支付轮询成功后刷新用户余额；失败、过期、网络错误和关闭均清理定时器并避免重叠请求。
5. 配置或建单错误停留在当前页面，以本地化文案说明没有可用 USDT 网络或网络暂不可用，并允许用户重新加载；不得导航到外部页面。

## 安全与隔离

1. 浏览器返回的 network/token 只是一项请求输入，服务端网关配置、受支持网络 allowlist、地址验证和订单 binding 才是安全边界。
2. 网络配置变化导致的 stale 选择必须在建单边界再次拒绝；不能把一次选择永久视为授权。
3. 不直接读取或修改 EPUSDT 钱包数据库，不向用户暴露钱包 ID、密钥、PID 或网关内部状态。
4. Legacy EPay 模式不调用 Native 配置或建单路径；现有 Legacy 支付方式和回调保持不变。
5. 普通钱包的动态网络选择不隐式扩展到订阅、拼团或代理预付；这些流程继续使用各自完整规格允许的支付方式。

## 国际化与界面

1. 网络选择标题、USDT 协议标签、取消、重试、无可用网络、网络已失效、支付状态和复制反馈都通过 `i18next` 提供。
2. Modal 在移动端和桌面端不溢出；长网络名称不遮挡选中态、金额或操作按钮。
3. 中文和英文至少覆盖完整路径，其余受支持语言通过项目 i18n 同步规则保持键完整。

## 验证

- 后端测试覆盖任意 token 输入只筛出 USDT、网络规范化/去重、未知网络、空列表、配置错误、单/多网络响应、显式 pair、stale pair、网关不一致和地址校验。
- Controller 测试证明非 USDT 或缺 pair 的新请求不会创建本地订单、不会调用网关；有效请求的 API、订单 binding、网关请求、checkout 响应和回调全链一致。
- 回归测试证明历史非 USDT pending 订单仍可依据原 binding 处理，Legacy EPay 及非普通钱包支付路径未被收紧。
- 前端测试覆盖单网络直达、多网络选择、取消不建单、一网络一卡、没有 TRX/SOL/USDC、空状态和移动端可操作性。
- i18n 同步、前端生产构建、受影响 Go package 测试和独立 Verifier 验收通过。
