# GMPay 多币种与费用感知的站内充值

## 1. 能力边界

国际站处于 GMPay Native 模式时，普通钱包充值从 EPUSDT 公共配置读取可用网络和代币，并只向用户提供 USDT、USDC 两种稳定币。用户在 New API 自有页面内选择币种和网络，随后在同一 checkout Modal 查看收款地址、二维码、费用与状态。Legacy EPay 及其他 Provider 保持既有契约。

## 2. 网关资产与选择器

### 2.1 服务端资产规范化

1. 读取 EPUSDT `/payments/gmpay/v1/config` 的 `supported_assets`，沿用已有超时、响应大小、元素数量和短 TTL 缓存保护。
2. 网络别名大小写不敏感地规范化为稳定标识；仅保留 New API 能做地址校验的网络。
3. 每个网络的 token 列表仅保留 `USDT`、`USDC`；`TRX`、`ETH`、`BNB`、`SOL` 等原生 Gas token、空 token、未知 token 和未知网络被过滤。
4. 以 `token + network` 作为唯一键去重，保持网关顺序（必要时采用稳定的本地排序），返回：

```json
{
  "network": "tron",
  "token": "USDT",
  "display_name": "TRON"
}
```

5. 配置失败、无有效组合或 stale 缓存不可验证时返回空集合/错误；不回退到静态 TRON，也不让浏览器自行补全组合。

### 2.2 前端两级选择

1. `crypto_assets` 映射为 `CryptoAsset[]`，token 类型至少覆盖 `USDT | USDC`。
2. 首层展示当前列表中存在的币种按钮；选中币种后只展示该币种的网络。
3. 只有一个币种时跳过币种层；只有一个网络时跳过网络层；最终只有一个组合时点击支付直接建单。
4. 取消、返回或关闭选择器不会创建本地订单，不调用网关，不改变已选支付方式；选择状态在下一次打开时清理。
5. 所有标签和错误均使用 i18next，不以 token 字符串作为未翻译的长文案。

## 3. 费用与金额模型

### 3.1 不变量

- `base_amount`：依据用户选择的充值额度、分组倍率和站点货币计算出的基础应付金额，同时保持到账额度计算的原口径。
- `fee_amount`：服务端确认的费用（与 quote/配置来源一起返回）；不能由客户端提交或覆盖。
- `total_amount`：用户实际需要支付的法币等值金额；`TopUp.Money` 用于回调应付金额校验，`TopUp.Amount` 仍只记录到账额度。
- `actual_amount`：网关返回的精确 token 数量，作为二维码和复制金额；它可以包含网关费用或汇率差异，不能反推成链上 Gas 费用。

### 3.2 报价优先级

1. 订单创建响应中经过严格 schema 验证的显式 `fee`/`service_fee`/`network_fee` 与 `total_amount` 字段优先；字段缺失时，以有效 `actual_amount` 作为网关支付总额。
2. 若网关未提供可解释的独立费用且需要在请求前加价，读取管理员 `GMPayFeeConfig` 兜底：资产覆盖项优先于全局默认；固定金额与比例只能启用一个；比例按基础金额计算。
3. 费用必须为有限、非负 decimal，单笔费用和总额都不得超过配置上限；计算结果按货币精度向下/项目既有规则舍入。
4. 动态报价和兜底均无效时，不创建或立即回收 pending 订单，返回本地化“该支付组合暂不可用”，不影响其他支付方式。
5. 详情中显示基础金额、费用金额、实际总额和来源（网关报价/管理员固定/管理员比例/已含在网关金额），避免用户误解到账额度。

### 3.3 管理员配置

`GMPayFeeConfig` 作为现有 Option key-value 保存，默认关闭。配置解析器接受版本化 JSON，示例：

```json
{
  "version": 1,
  "enabled": true,
  "default": { "mode": "fixed", "value": "0.00" },
  "overrides": {
    "USDT:tron": { "mode": "fixed", "value": "1.00" },
    "USDC:ethereum": { "mode": "percent", "value": "1.50" }
  },
  "max_fee": "20.00",
  "max_total": "100000.00"
}
```

服务端拒绝未知 mode、负数、非有限数字、超精度和超上限配置；配置错误只让兜底不可用，并记录脱敏诊断信息。前端支付设置提供 JSON 编辑/校验入口，说明该配置只在网关报价不可用时生效。

## 4. 建单、持久化与回调

1. 客户端只提交基础 `amount`、支付方式及所选 `token`/`network`；服务端重新读取 fresh `supported_assets` 并规范化验证。
2. 生成订单时，先计算并验证基础额度、费用和 `total_amount`，再写入 pending `TopUp`：`Amount` 为到账额度，`Money` 为需要回调校验的法币总额，`payment_method` 为稳定、可解析的 token/network binding。
3. GMPay 请求的 `currency` 继续为 `usd`，同时传递规范化 token、network 和服务端计算的金额。客户端不能传费用、网关 URL、钱包 ID 或其他自由参数。
4. 网关响应必须匹配本地订单 ID、法币金额、币种、token、network、地址、状态和过期时间；不一致时标记 pending 为 failed，不向用户入账。
5. 回调继续验签、检查 provider/租户/订单归属、pending 状态和金额；若回调带 token/network/address，必须与订单 binding 一致。回调重复或订单已完成时保持幂等。
6. 结算只把 `TopUp.Amount` 换算为额度，手续费和 `TopUp.Money` 不参与额度增加。历史 `usdt.tron` 及已存在的历史订单继续使用原解析和结算规则。

## 5. Checkout Modal

Modal 在当前页面展示：

- 基础充值额度；
- 手续费及来源；
- 实际支付总额和精确 `actual_amount token`；
- token、网络/协议、完整地址、二维码、订单号和过期倒计时；
- 等待、成功、失败、过期、超时、刷新和重试状态。

桌面端使用更宽的内容列，长地址通过断词/复制按钮处理；移动端保持视口内宽度和纵向滚动，不出现横向滚动条。二维码仍在本地渲染，不打开 hosted cashier URL。

## 6. 兼容与安全

- Legacy EPay、Stripe、Creem、Waffo、直连支付宝/微信、订阅、拼团和代理预充值不读取本能力的费用配置，也不改变金额口径。
- 不新增数据库列或迁移，SQLite、MySQL 5.7.8+、PostgreSQL 9.6+ 均使用既有 GORM/Option 机制。
- 所有 JSON 编解码通过 `common.*`；所有费用计算使用 decimal 和现有金额/配额边界。
- 不把链上 Gas、第三方钱包余额或未验证的响应字段当成费用；不记录密钥、签名、完整支付凭据或私有网关地址。

## 7. 验证

- Go：资产过滤/规范化、费用 schema、固定/比例兜底、金额不变量、建单 stale 校验、payment_method 解析、响应验证和回调幂等。
- 前端：币种/网络两级选择、单选跳过、取消不建单、费用展示、i18n、Modal 响应式和轮询状态。
- 命令：`go test ./controller ./service ./model ./router`、前端聚焦 Vitest、`bun run i18n:sync`、`bun run build`、`git diff --check`。
- 真实网关和线上部署不在本地 change 的验证范围内。
