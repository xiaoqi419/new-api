# 彩虹易支付站内 Checkout 完整规格

## 1. 用户可见行为

普通用户侧所有由彩虹易支付（Epay）处理的钱包充值、订阅购买、拼团创建和参团入口，发起付款后必须留在当前业务页面，在 Modal 中直接展示二维码、金额、支付方式、站内订单号和支付状态。发起动作不得自动打开新标签页、替换当前页面、提交外部表单或通过链接导航到网关页面。

default 与 classic 两套仍发布的前端必须保持一致。当前至少覆盖 Epay 的 `alipay` 与 `wxpay`；支付宝官方商户直连、微信官方商户直连、Stripe、Creem、Waffo 和代理控制台预充值保持各自既有行为。

## 2. Checkout 数据规范化

服务端标准成功响应继续使用 `trade_no`、可选 `gateway_trade_no`、`checkout_type`、`checkout_value`、`payment_method` 和 `money`。`checkout_type` 只允许 `qrcode`、`payurl` 或支付方式白名单允许的 `urlscheme`。

前端收到标准 checkout 数据时，将 `checkout_value` 作为二维码内容。为兼容尚未升级或历史路径返回的 Epay `pay_url`/`qr_code`，只在能够确认订单号、支付方式、金额和安全 checkout 值时规范化为同一 Modal 数据；不得把 `pay_url` 当作自动导航回退。缺少必要字段或值不安全时，显示本地化的支付请求失败提示并停留当前页面。

## 3. Modal 与状态观察

Modal 使用现有 `qrcode.react` 生成二维码，不注入原始 HTML。桌面二维码约 240px，390px 窄屏约 208px。Modal 打开后每 3 秒轮询本人订单状态，最长 5 分钟，并提供手动刷新：

- `pending` 保持等待；
- `success` 停止轮询并刷新相应余额、订阅或拼团详情；
- `failed`/`expired` 停止轮询并允许返回或重试；
- 临时网络错误继续等待；
- 观察超时仅停止自动轮询，不修改服务端订单状态。

组件卸载、主动关闭或订单更换时清理旧定时器。关闭未支付拼团 checkout 时调用现有取消接口释放预占名额；取消保持幂等且不能影响已经由异步通知完成的订单。

## 4. 安全与结算不变量

唯一结算入口仍是现有钱包、订阅和拼团 Epay 异步通知。前端响应、二维码、轮询结果、MAPI 成功响应和 return URL 均不能自行入账、开通订阅或完成拼团。

`payurl` 仅允许带有效主机名的绝对 `http/https` URL；`urlscheme` 只允许与支付方式匹配的明确白名单。禁止 `javascript:`、`data:`、相对 URL、未知 scheme、空值和自动拉起 App。密钥、签名和敏感 checkout token 不得进入浏览器响应或日志。

本能力不新增数据库表、列或迁移，并保持 SQLite、MySQL 5.7.8+ 与 PostgreSQL 9.6+ 兼容。

## 5. 验证要求

前端定向测试必须覆盖钱包、订阅、拼团创建和参团在 default/classic 中打开 Modal，并断言发起 Epay 的代码路径没有调用 `window.open`、`window.location.assign`/`href` 或自动表单提交。继续覆盖二维码、轮询成功/失败/过期/超时、手动刷新、重试、返回、定时器清理与拼团取消。

运行受影响测试、TypeScript 类型检查、涉及文件 lint 和生产构建。若服务端兼容响应契约发生变化，补充并运行对应 Go 定向测试。真实商户扫码扣款、异步通知公网可达、验签、到账和退款仍需在测试环境使用真实商户配置验收，不得用模拟结果替代。
