# 彩虹易支付站内 Checkout 完整规格

## 1. 能力边界

普通用户侧所有由彩虹易支付（Epay）处理的支付入口，都必须在当前业务页面内完成下单、二维码展示和订单状态观察，不再依赖浏览器自动提交 `/submit.php` 表单或自动打开外部新标签页。本期覆盖：

- 钱包充值；
- 订阅购买；
- 拼团创建和参团。

当前至少支持 Epay 的 `alipay` 与 `wxpay`。支付宝官方商户直连 `alipay_direct`、微信官方商户直连 `wechatpay`、Stripe、Creem、Waffo 和代理控制台 Epay 预充值保持现有行为。

## 2. 统一服务端 MAPI 边界

### 2.1 网关请求

服务端向规范化后的 `<PayAddress>/mapi.php` 发起带明确超时和响应体上限的 `application/x-www-form-urlencoded` POST。请求至少包含：

```text
pid, type, out_trade_no, notify_url, return_url, name, money,
clientip, device, param, sign, sign_type=MD5
```

签名使用当前业务所属 Epay 配置和密钥生成，复用本地 `github.com/Calcium-Ion/go-epay v0.0.4` 的 `epay.GenerateParams`。该依赖只负责参数/验签，项目内增加可注入 HTTP client 的小型 MAPI 边界，不升级依赖。密钥、完整签名和敏感 checkout token 不得出现在响应、日志或浏览器。

### 2.2 响应规范化

只有 MAPI `code == 1` 且至少存在一个非空 `qrcode`、`payurl` 或 `urlscheme` 时才算创建支付指引成功。按明确优先规则选择一个值，统一返回：

```json
{
  "message": "success",
  "data": {
    "trade_no": "站内订单号",
    "gateway_trade_no": "网关订单号",
    "checkout_type": "qrcode|payurl|urlscheme",
    "checkout_value": "非空支付值",
    "payment_method": "alipay|wxpay",
    "money": "10.00"
  }
}
```

`gateway_trade_no` 只用于展示或诊断，轮询、归属判断和结算始终使用站内 `trade_no`。

### 2.3 订单时序与失败回收

完成金额、套餐、拼团名额、额度上限、支付方式、租户回调地址和代理钱包预检后，必须先创建本地 pending 订单，再请求 MAPI，以便极速异步通知能够找到订单：

- 钱包和拼团使用现有 `TopUp`/`PaymentProviderEpay` 语义；
- 订阅使用现有 `SubscriptionOrder` pending 语义；
- MAPI 超时、网络失败、畸形 JSON、`code != 1`、缺少 checkout 字段或不合法值时，只能将匹配业务、provider 和 pending 状态的订单原子标记为 failed；
- 拼团下单失败或用户主动关闭未支付 checkout 时，释放已预占的拼团名额并保持现有取消幂等语义；
- 条件更新失败不得覆盖已被异步回调完成的订单。

MAPI 创建成功不能直接改 success、增加额度、开通订阅或完成拼团。

## 3. 钱包充值 API 与流程

### 3.1 API

新增 authenticated Epay checkout POST 接口，沿用现有 `/api/user/pay` 的关键操作限流和输入：

```json
{ "amount": 10, "payment_method": "alipay" }
```

默认前端只在 Epay 聚合支付时调用新接口。现有 `POST /api/user/pay` 继续返回 `/submit.php` 表单地址和签名参数，作为旧客户端兼容接口保留，成功和错误契约不得改变。

钱包订单状态继续使用：

```text
GET /api/user/topup/status?trade_no=...
```

该接口只返回当前登录用户自己的订单状态。

### 3.2 页面行为

用户确认 Epay 聚合支付后，在同一 `/wallet` 页面切换到全尺寸 checkout 步骤，显示金额、支付方式、站内订单号、二维码、等待/成功/失败/过期状态、返回钱包和手动刷新。桌面二维码约 240px，390px 窄屏约 208px，使用现有 `qrcode.react`，不把值作为原始 HTML 或图片 URL 注入。

进入步骤后立即启动唯一轮询任务，每 3 秒查询一次，最长观察 5 分钟：

- `pending` 保持等待；
- `success` 停止轮询、刷新余额并回到钱包；
- `failed`/`expired` 停止轮询并保留返回或重新发起；
- 临时网络错误继续等待，允许手动刷新；
- 观察超时只停止自动轮询，不修改服务端订单状态。

组件卸载、主动返回或订单更换时必须清理旧定时器。刷新浏览器不保证恢复同一二维码。

## 4. 订阅购买 API 与流程

### 4.1 API

订阅 Epay 下单改为站内 checkout，保留现有套餐启用、购买上限、用户组和金额校验。新增 authenticated 接口：

```text
POST /api/subscription/epay/pay
GET  /api/subscription/epay/status?trade_no=...
```

状态接口必须按当前登录用户过滤，只能查询本人 `SubscriptionOrder`；不得通过任意 trade number 读取其他用户订单。现有 `/api/subscription/epay/notify` 异步回调继续作为唯一结算入口；`/api/subscription/epay/return` 只保留兼容返回页语义，不作为支付成功依据。

### 4.2 页面行为

订阅购买确认后，在当前订阅购买上下文内切换到全尺寸 checkout，显示套餐名称、金额、支付方式、站内订单号、二维码和状态。成功回调后停止轮询，刷新订阅列表及当前用户组，再返回订阅页面；失败、过期、临时网络错误、5 分钟观察超时和手动刷新遵循钱包 checkout 的同一规则。

订阅 checkout 关闭或返回不会擅自取消已创建订单，除非服务端已有明确的过期/取消语义；不得重复创建订单或由前端入账。

## 5. 拼团支付 API 与流程

### 5.1 API

拼团创建和参团接口保持现有路由和业务校验：

```text
POST /api/user/groupbuy/create
POST /api/user/groupbuy/join
POST /api/user/groupbuy/cancel
```

当选择 Epay 聚合支付时，`CreateGroupBuyOrder`/`JoinGroupBuyOrder` 原子创建拼团、参与者和 pending `TopUp` 后，直接返回统一 checkout 数据，不生成外部 `/submit.php` 表单。钱包的 `GET /api/user/topup/status` 复用于拼团订单状态，但必须沿用本人订单归属校验。

### 5.2 页面行为

拼团确认后，在当前拼团详情上下文内切换到全尺寸 checkout，显示拼团名称、金额、支付方式、站内订单号、二维码和状态。支付 success 后刷新拼团详情、参与者和返利/结算展示，再回到拼团详情；failed、expired、超时和临时网络错误遵循统一 checkout 规则。

用户主动关闭未支付拼团 checkout 时调用现有取消接口，释放预占名额；取消必须幂等，不得影响已经由异步回调完成的订单。

## 6. 安全、回调与非 Epay 兼容

- 唯一结算入口是现有钱包、订阅和拼团 Epay 异步通知：验签、订单归属、订单类型、provider、支付方式、金额和 pending 状态检查全部保留。
- 前端响应、轮询、MAPI `code == 1` 和 return URL 均不能入账、开通订阅或完成拼团。
- `payurl` 只允许安全校验通过的绝对 `http/https` URL；`urlscheme` 只允许支付方式明确 allowlist；只有用户明确点击时才打开，禁止 `javascript:`、`data:`、相对 URL、未知 scheme 和自动拉起 App。
- 官方直连、其他支付提供商、代理控制台预充值和旧 `/api/user/pay` 外部表单契约不进入本 change。
- SQLite、MySQL 5.7.8+、PostgreSQL 9.6+ 均兼容；不新增表、列、迁移或大型依赖。

## 7. 前端、一致性与变更记录

default 与 classic 用户入口都必须移除 Epay 自动外部 form 提交，统一复用安全 checkout 展示逻辑或等价实现。所有新增文案通过 `useTranslation()` 写入 en、zh、zh-TW、fr、ru、ja、vi，七语言键集合保持一致。用户可见变更写入 `web/src/features/changelog/data.ts` 顶部，维护状态同步记录本地实现、实际检查、待真实商户线上验收、未推送/未发布/未部署状态。

## 8. 验证

后端测试使用受控 HTTP 测试服务器验证 MAPI URL、签名字段、三种 checkout 响应、业务错误、非法/超大响应、超时和 failed 回收，并覆盖钱包、订阅、拼团回调的 provider/归属/pending 幂等边界。前端定向测试验证三类 checkout 不创建外部新标签页、不自动提交表单，二维码、轮询 success/failed/expired/超时、手动刷新、返回业务页、定时器清理和安全唤起按钮；同时运行受影响 Go 测试、typecheck、lint 和生产构建，并在桌面与 390px 视口验收。

真实商户凭据、公网 HTTPS 回调、实际扫码扣款、异步通知可达、验签、到账、代理结算和退款继续标记为待线上验收，不得用模拟结果宣称完成。
