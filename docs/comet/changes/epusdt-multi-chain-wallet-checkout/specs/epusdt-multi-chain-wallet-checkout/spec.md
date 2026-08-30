# EPUSDT 多链站内充值

## 目标

在 GMPay Native 模式下，钱包充值页面根据 EPUSDT 当前公开配置提供可用的网络/代币选择，并始终在 New API 站内展示支付信息。

## 可用资产

服务端通过 EPUSDT `/payments/gmpay/v1/config` 读取 `supported_assets`。每个资产至少包含规范化的 `network`、`tokens` 和可选 `display_name`。只保留网关返回且同时满足格式、网络支持和代币支持的组合；空列表、超时、无效响应或网关错误都视为暂不可用。该结果短时间缓存，并受响应大小和请求超时限制。

用户端 `/api/user/topup/info` 在 GMPay Native 且配置可用时返回 `crypto_assets`，元素包含 `network`、`token`、`display_name`。Legacy 模式不返回该列表，国内原有支付方式保持不变。

## 建单

钱包支付按钮触发以下流程：

1. 如果 `crypto_assets` 只有一个元素，直接使用该元素创建 Native 订单。
2. 如果有多个元素，打开资产选择 Modal；Modal 关闭或取消不创建订单。
3. 用户选择资产后，客户端发送金额、`payment_method`、`network` 和 `token`。服务端重新确认该组合存在于当前缓存配置中，然后直接调用 EPUSDT `order/create-transaction` 创建 concrete order。
4. 服务端返回结构化 checkout 数据，不返回或打开 hosted cashier URL。金额使用 USD，实际加密货币金额由 EPUSDT 响应提供。

## Checkout Modal

Modal 展示二维码、完整收款地址、精确实际金额、网络、代币、复制操作、过期倒计时及支付状态。状态轮询、成功刷新余额、失败/过期提示和定时器清理沿用现有钱包支付逻辑。任何网络错误都停留在当前页面并提供本地化重试，不触发新窗口或外部导航。

## 安全与兼容

- network/token 必须成对出现，服务端拒绝未知组合、空值和大小写绕过。
- checkout 响应的 network/token 必须与请求资产一致；地址按网络使用对应校验器，TRON、Ethereum、Solana 不共用 TRON 校验规则。
- 回调继续校验签名、PID、成功状态、金额、订单类型、商户/租户归属和幂等性，并使用回调中的资产字段与订单资产匹配。
- 单资产 TRON/USDT 继续兼容既有 `usdt.tron` 支付方式、订单和回调；Legacy EPay 不受 Native 代码路径影响。
- 不增加数据库对象或迁移；资产配置来自网关实时公开配置和短 TTL 缓存。

## 可观察验收

- 单资产跳过选择，多资产必须先选择且选择前不建单。
- 选择的 network/token 被准确传入网关，Modal 展示实际返回数据。
- 配置失败、组合非法、响应不一致、过期和回调重复均安全失败且有本地化反馈。
- 钱包余额刷新和原有 TRON 流程回归通过。
