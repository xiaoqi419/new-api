# EPUSDT 国际站兼容完整规格

## 1. 能力边界

New API 的通用 EPay 钱包 checkout 优先调用配置支付基址对应的 `mapi.php`。当且仅当网关明确返回 HTTP 404，服务端必须兼容 EPUSDT v2.0.0 的 EPay `/submit.php` 路由，并将安全的绝对支付页 URL 返回给既有站内 checkout。

该代码能力保持通用，但当前发布和配置范围仅为国际站 `codezip.io`。国内站 `aierxin.cc` 不随此能力发布、重启或改配。

## 2. MAPI 优先与回退条件

- MAPI 请求、签名、超时、响应体限制和成功响应解析保持现有行为。
- MAPI HTTP 404 进入 `/submit.php` 兼容路径。
- 任何其他非 2xx 状态、网络错误、上下文取消、超时、无效 JSON、业务拒绝或无 checkout 目标都继续按现有错误路径返回，不进入兼容回退。
- MAPI 成功响应仍按现有顺序选择 `qrcode`、`payurl` 或支付方式允许的 `urlscheme`。

## 3. `/submit.php` 兼容请求

兼容路径复用 `github.com/Calcium-Ion/go-epay v0.0.4`。生成的 checkout 至少包含：

```text
pid, type, out_trade_no, notify_url, return_url, name, money,
device, sign, sign_type=MD5
```

`type`、订单号、金额、逐单回调、浏览器返回地址、商品名和设备类型必须从当前 `EpayMAPIRequest` 原样传递。国际站使用的选择器为 `usdt.tron`。

支付基址在生成 MAPI 或兼容 URL 前必须移除 `RawQuery`、`ForceQuery`、`Fragment` 和 `RawFragment`。兼容 URL 最终只能包含本单参与签名的 EPay 参数，不能混入配置基址原有但未参与签名的 query。

返回值使用：

```json
{
  "checkout_type": "payurl",
  "checkout_value": "https://pay.example.com/.../submit.php?..."
}
```

`checkout_value` 必须是带主机名的绝对 HTTP 或 HTTPS URL。商户密钥不得出现在响应或日志。EPay 兼容协议要求的单笔订单 `sign` 可以出现在支付 URL 中；它必须由现有库基于当前订单参数生成。

## 4. 回调与结算

国际站每笔钱包充值订单使用：

```text
https://codezip.io/api/user/epay/notify
```

作为订单级 `notify_url`。EPUSDT API Key 页面中的 key 级 `notify_url` 不作为默认值，也不替代逐单回调。

MAPI 成功、`/submit.php` URL 生成成功、收银台打开、return URL 返回和状态轮询都不能直接结算。只有现有 EPay 异步通知通过 MD5 验签、订单归属、provider、支付方式、金额和 pending 状态检查后才能入账。

## 5. 国际站配置

国际站支付基址保持：

```text
https://pay.codezip.io/payments/epay/v1/order/create-transaction
```

配置值不追加 `/submit.php`；客户端库负责拼接该路由。

国际站支付方式包含一个展示名为 `GMPay` 的条目：

```json
{
  "name": "GMPay",
  "type": "usdt.tron",
  "icon": "SiTether",
  "min_topup": "10"
}
```

`name` 只用于展示，`type` 是发给 EPUSDT 并在回调中核对的协议标识。`min_topup` 按现有 `PayMethods` 契约保存为字符串。

## 6. 发布与回滚

- 代码通过 Pull Request 合入 `main`，并等待所需 CI 成功。
- 镜像从最终合并提交构建并使用可追溯、不可变标签；changelog 版本与发布标签一致。
- 发布前备份 `/opt/new-api-international/docker-compose.yml`、国际站 PostgreSQL 和支付 Options。
- 只重建 `new-api-international` 应用服务，保留旧镜像作为回滚目标。
- 发布前后记录国内站应用容器 ID、启动时间、镜像和关键 Options，证明国内站没有被重启或改配。

## 7. 线上验收边界

线上验收只允许创建不付款的测试订单，确认请求落到 `/submit.php`、能够进入 EPUSDT 收银台，并且订单级回调地址为 `https://codezip.io/api/user/epay/notify`。

EPUSDT 必须存在用户提供的真实 TRON USDT 收款地址才能完成正常收款订单创建。地址缺失时应停止并报告，不生成地址、不代填地址，也不伪造支付成功、异步通知或到账证据。

## 8. 验证

- Go 回归测试覆盖 MAPI 成功、MAPI 404 回退、`usdt.tron` 参数、有效签名、query/fragment 清理、非 404 不回退、非法 URL 和上下文取消。
- `service` 与 `controller` 测试、差异检查和正式 Docker 镜像构建必须通过。
- 独立只读 Verifier 逐项核对正式验收清单。
- 服务器验收记录国际站发布前后状态，并对比国内站保持不变。
