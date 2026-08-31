# Outcome

在 GMPay Native 普通钱包充值中，只向用户提供实际可用的 USDT 收款网络。单网络直接建单，多网络先选择网络，所有支付信息继续在站内 Modal 展示。

# Scope

- EPUSDT `/payments/gmpay/v1/config` 的 USDT 网络筛选、规范化和缓存结果。
- `/api/user/topup/info` 的 `crypto_assets` 契约及 Native checkout 服务端再验证。
- 钱包充值网络选择 Modal、单网络直达、多网络取消/选择和相关 i18n。
- 新订单的 USDT 网络绑定与历史 pending 非 USDT 订单回调兼容。
- 本 child 拥有 `service/gmpay_native.go`、`controller/topup.go`、`controller/gmpay_native_checkout.go`、钱包选择 UI/types/hooks 及对应测试的实现权。

# Non-goals

- 不实现支付模式安全应用、重启接口、Option 持久化修复或后台设置 UI。
- 不修改 EPUSDT、钱包数据库、支付网关、数据库结构或迁移。
- 不改变 Legacy EPay、订阅、拼团、代理预付及其他独立支付 Provider。
- 不支持 TRX、ETH、SOL、BNB、USDC 或其他非 USDT 新订单。

# Acceptance examples

- A1: 多种 token 的网关响应只生成每个可用网络的一张 USDT 卡片，不显示 TRX、SOL、USDC。
- A2: 只有一个 USDT 网络时跳过选择器并以该网络、`token=usdt` 建单。
- A3: 多个 USDT 网络时先选择；取消不创建本地或网关订单，选择后只提交所选网络。
- A4: 配置失败、没有 USDT、未知网络或 stale 网络失败关闭，不调用网关且不回退 TRON。
- A5: 新 USDT 订单保留网络级 payment_method binding，历史非 USDT pending 订单仍按原 binding 兼容回调，不做迁移。
- A6: 站内 Modal 展示精确 USDT 金额、地址、网络、二维码、有效期和状态，不打开 hosted page。
- A7: Legacy EPay 及订阅、拼团、代理预付既有行为不受普通钱包网络选择影响。
- A8: 中英文、桌面和移动端选择器完整可用，文案全部来自 i18n。

# Constraints and invariants

- 浏览器的 network/token 不是授权边界；服务端必须筛选、规范化、地址校验并在建单边界重新验证。
- token 对用户固定为 USDT；TRON/Ethereum/Solana/BSC 只表示网络。
- 旧订单解析兼容与新订单创建策略分离。
- 不新增数据库表、列或迁移，不触碰线上环境。

# Decisions

- D1: 使用 EPUSDT `/config` 的 `supported_assets`，按大小写不敏感方式筛选 USDT；只接受已有地址校验和标签支持的网络。
- D2: 一网络一卡片；单网络跳过选择，多网络选择后建单，空集合失败关闭。
- D3: TRON 保留 `usdt.tron`，其他网络沿用可解析的现有 network/token binding。
- D4: 服务端拒绝新普通钱包 Native 请求中的缺失 pair 或非 USDT，不保留隐式 TRON 回退。

# Open questions

无。父级 Shape 已确认本 child 的范围和验收项。

# Verification expectations

- Go service/controller 测试覆盖 USDT 筛选、规范化/去重、未知网络、配置错误、显式 pair、stale pair、订单 binding、历史回调和 Legacy 隔离。
- 前端测试覆盖单网络直达、多网络选择/取消、USDT-only 展示、空状态、i18n 和移动端布局。
- 运行相关 Go 测试、前端定向测试、i18n 同步、类型检查和构建；由父级独立 Verifier 做最终整体验收。
