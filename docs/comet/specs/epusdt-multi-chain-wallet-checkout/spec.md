# EPUSDT USDT 多网络站内充值

## 行为

GMPay Native 普通钱包充值只接受 USDT。服务端读取 EPUSDT `/payments/gmpay/v1/config` 的 `supported_assets`，按大小写不敏感方式保留包含 USDT 的已知网络，并为每个规范化网络返回一项 `crypto_assets`：`network`、本地化可显示的 `display_name` 和固定 `token=USDT`。TRX、ETH、SOL、BNB、USDC 和未知网络不进入用户选择器。

支持的网络标签为 TRON/TRC20、Ethereum/ERC20、Solana/SPL 和 BSC/BEP20；网络别名规范化、顺序稳定、重复网络去重。配置超时、无效、超量、空列表或无 USDT 时返回空集合并失败关闭。

只有一个可用网络时直接建单；多个网络时先打开网络选择 Modal，取消不建单。服务端在写入 pending 订单和调用网关前再次验证显式 `network` 与 `token=usdt`，stale 或非 USDT 请求拒绝且不回退到 TRON。

TRON 新订单保留 `usdt.tron`，其他 USDT 网络使用现有可解析的 network/token binding。历史 pending 非 USDT 订单仍按自身 binding 处理回调，新订单不得利用历史兼容绕过 USDT 限制。

成功 checkout 保持站内 Modal，展示精确 USDT 金额、完整地址、网络、二维码、有效期和状态，不打开 hosted page。地址按网络分别校验，轮询和 i18n 遵循现有钱包实现。

## Scenarios

### Scenario: 多 token 响应只展示 USDT 网络

- Given 网关返回 TRON、Ethereum、Solana 并混合 TRX/USDC/SOL/USDT
- When 用户加载 Native 钱包充值
- Then 每个包含 USDT 的已知网络各显示一张 USDT 卡片，非 USDT 不显示

### Scenario: 单网络直接建单

- Given 只有一个可用 USDT 网络
- When 用户点击充值
- Then 不显示选择器，创建该网络和 `token=usdt` 的订单

### Scenario: 多网络取消不建单

- Given 存在多个可用 USDT 网络
- When 用户打开选择器并取消
- Then 不创建本地订单且不调用网关

### Scenario: stale 网络失败关闭

- Given 用户选择的网络在建单前从网关配置中消失
- When 服务端收到 checkout 请求
- Then 拒绝请求、不回退到其他网络且不调用网关建单

### Scenario: 站内 checkout

- Given 网关成功创建 USDT 订单
- When 页面显示支付信息
- Then 当前 Modal 展示地址、二维码、金额、网络、有效期和轮询状态，不发生外部导航
