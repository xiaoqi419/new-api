# 国内站与国际站发布边界及 EPUSDT 对接定义

> 本文用于固定运维和发布上下文，避免在会话压缩、人员交接或版本升级后混淆两个站点。密码、API 密钥、Cookie 和其他敏感凭据不写入仓库；它们只保存在服务器或密码管理器中。
>
> 快照日期：2026-08-28。服务器配置、镜像标签和支付状态在每次发布前都必须重新核对。

## 1. 站点与实例边界

国内站和国际站是两个独立部署实例，共享产品代码基线，但不共享生产数据库、Redis、容器或站点配置。

| 用途 | 域名 | 服务器实例 | 数据边界 | 操作规则 |
| --- | --- | --- | --- | --- |
| 国内站生产 | `aierxin.cc` | 国内站对应容器和数据库 | 国内用户、国内配置和国内号池 | 国际站变更不得触碰 |
| 国际站生产 | `codezip.io` | `new-api-international` | 国际用户、国际配置和国际号池 | 本文的支付变更只允许在此执行 |
| 国际站支付网关 | `pay.codezip.io` | EPUSDT/GMPay 服务 | 支付订单、收款地址、支付密钥 | 只作为国际站的 EPay/GMPay 网关 |

服务器上还可能存在测试实例或其他历史服务。除非用户明确授权，不得根据相似名称推断目标；执行变更前必须同时核对容器名、域名和数据库名。

## 2. 代码与部署版本的定义

当前不是两套完全独立的产品代码。正确的定义是：

1. **代码基线**：国内站和国际站原则上从同一产品代码线构建。
2. **部署实例**：两个站点有独立容器、数据库、Redis、域名和配置，因此可以独立发布。
3. **配置差异**：站点名称、支付网关、号池、用户协议、渠道和用户数据属于实例配置或数据库数据，不应通过复制用户数据的方式同步。
4. **版本差异**：测试环境可以先升级；国际站或国内站生产发布必须明确指定目标实例和镜像标签。

### 是否需要长期维护两个分支

目前不建立永久的“国内版分支”和“国际版分支”。推荐策略如下：

- 通用功能或兼容性修复进入共同代码基线，两站按各自窗口发布。
- 只有当国际站必须长期保留、且无法合并回共同基线的差异时，才创建明确命名的国际分支，并在本文追加差异清单、负责人、回合并计划和删除条件。
- 一次性的国际站部署修复不能自动升级为永久分支；必须先证明存在稳定的产品行为差异。
- 任何分支或镜像都要记录其源提交、构建时间、目标实例和回滚镜像。

本次国际站故障复现的线上镜像提交是 `35de40fb2c8e247f9565a819ef7ad8fe54536361`；发布候选已迁移到该提交之后的最新 `origin/main`。线上提交是故障基准，不是永久国际分支，也不代表候选已部署。

## 3. EPUSDT 回调的三个概念

教程中的“回调地址”容易和 EPUSDT 管理后台 API Key 页面里的字段混淆。实际有三个不同层次：

### 3.1 New API 的回调基地址

New API 的支付设置中：

- `ServerAddress` 是站点公开地址。
- `CustomCallbackAddress` 是可选的回调基地址覆盖。
- 当 `CustomCallbackAddress` 留空时，New API 使用 `ServerAddress`。

国际站当前应生成：

```text
https://codezip.io/api/user/epay/notify
```

### 3.2 每笔订单的 `notify_url`

New API 创建充值订单时，会把上面的完整 URL 作为本笔订单的 `notify_url` 发送给 EPUSDT。EPUSDT 创建订单时校验并保存这个订单级地址，支付成功后由回调 worker 请求该地址。

因此，真正影响 New API 对接的是每笔订单里的 `notify_url`，而不是 API Key 页面上的固定字段。

### 3.3 EPUSDT API Key 页面中的 `notify_url`

EPUSDT v2.0.0 的 API Key 编辑界面将 `notify_url` 显示为“即将推出”。该字段虽然存在于数据库和管理 API，但当前版本没有把它作为订单回调默认值使用；它不是 New API 这套 EPay 对接的必填项。

结论：教程写“New API 回调地址留空”是正确的，意思是让 New API 回退到 `ServerAddress`。这不等于支付不需要回调，也不等于 EPUSDT 不接收回调；回调仍由订单级 `notify_url` 提供。

## 4. 教程要求与当前版本的兼容点

教程页面：<https://epusdt.cc/newapi>

教程要求的 New API 易支付设置为：

```text
支付地址：https://你的epusdt域名/payments/epay/v1/order/create-transaction
商户 ID：EPUSDT 支付管理中的 PID
API 密钥：同一条记录中的 Secret
```

必须遵守以下规则：

- `PayAddress` 只填到 `/payments/epay/v1/order/create-transaction`。
- 不要在 New API 设置中手工追加 `/submit.php`。
- New API 使用 `go-epay` 客户端时会自动把标准 EPay 请求发送到 `/submit.php`。
- 当前 EPUSDT v2.0.0 的兼容 EPay 路由是：

  ```text
  /payments/epay/v1/order/create-transaction/submit.php
  ```

- `notify_url` 必须是 New API 公网 HTTPS 地址：

  ```text
  https://codezip.io/api/user/epay/notify
  ```

当前线上国际站镜像的普通钱包流程曾切换到 `/mapi.php`。EPUSDT v2.0.0 没有对应的 MAPI 路由，因此会出现 `mapi checkout returned http status 404`。这属于国际站 New API 版本与 EPUSDT 路由的兼容问题，不是教程的支付地址写错，也不是回调地址缺失。

## 5. EPay-family 运行模式

国内站与国际站使用同一份产品代码，通过各自数据库中的 Root 配置选择互斥的 EPay-family 协议：

| 实例 | `PaymentGatewayMode` | 协议行为 |
| --- | --- | --- |
| 国内站 | `epay_legacy` | 使用原版 Legacy EPay MAPI、明确 404 时的 `/submit.php` 兼容路径和 MD5 回调 |
| 国际站 | `gmpay_native` | 只允许已配置的 `usdt.tron` 使用 GMPay Native HMAC-SHA256 下单与回调 |

Root 管理员在“系统设置 -> 支付设置 -> Epay”中修改目标模式。应用只在数据库和 Options 初始化完成后读取一次并冻结当前生效模式；保存目标模式不会热切换正在运行的支付协议。页面显示“当前生效模式”和“已保存的目标模式”，两者不一致时必须重启对应应用实例后才生效。

模式只控制 EPay-family 协议，不改变语言、币种、品牌、价格、分组或倍率，也不根据域名、Host、转发头或支付方式显示名称自动推断。国内和国际实例必须继续隔离数据库、Redis、支付凭据、用户、渠道和订单数据。

### 5.1 GMPay 名称、类型和协议定义

New API 支付方式记录有两个容易混淆的字段：

- `name`：只负责前台显示，例如 `GMPay`。
- `type`：实际发送给网关的 EPay `type` 参数，并且必须原样出现在回调中。

Legacy EPay 客户端使用 **MD5** 签名；GMPay Native 使用 **HMAC-SHA256**。当前代码已分别实现并按启动时冻结的模式隔离两套客户端与回调处理器。因此：

- 不能仅把显示名称改成 `GMPay` 来切换协议；实际行为只由启动时冻结的 `PaymentGatewayMode` 决定。
- Legacy 模式使用已配置的原版 EPay 方法。即使方法名为 `usdt.tron`，也不会触发 GMPay Native。
- Native 模式只接受已配置且类型精确为 `usdt.tron` 的 EPay-family 方法；其他 EPay-family 方法会在创建本地订单或调用网关之前拒绝。
- 自定义类型必须在 EPUSDT 创建订单和回调中保持完全一致，否则 New API 会因订单支付方式不匹配而拒绝回调。
- GMPay Native 为钱包、订阅、拼团和代理向平台预付返回结构化 `crypto` 数据；前端只展示精确 USDT 金额、TRON 地址、地址二维码、倒计时和本地订单状态，不打开、嵌入或编码网关托管收银页。
- GMPay Native 回调按本地订单类型分别进入钱包、订阅、拼团或代理预付事务；无法唯一识别类型时拒绝，不回退为普通钱包充值。

## 6. 国际站 EPUSDT 运行前检查

在国际站启用充值前，逐项确认：

1. `pay.codezip.io` DNS 指向国际站服务器，并且 HTTPS 证书有效。
2. EPUSDT `app_uri` 为 `https://pay.codezip.io`，不是内网地址或 `127.0.0.1`。
3. 至少有一个启用的 TRON 收款地址。
4. `tron` 链和 `USDT` 代币均为启用状态。
5. `api_rate_url` 已配置为可靠的汇率源；不能留空。若使用固定汇率，必须记录来源、更新时间和人工复核人。
6. New API 的 `EpayId` 使用 EPUSDT API Key 的 `PID`，`EpayKey` 使用同一条记录的 `Secret`。
7. Root 支付设置中的目标模式为 `gmpay_native`，重启国际站应用后“当前生效模式”也显示 `gmpay_native`。
8. Native 模式的 `PayMethods` 包含且只对 EPay-family 暴露 `type=usdt.tron`；Stripe、Creem、Waffo、支付宝和微信等独立 Provider 可按各自配置继续使用。
9. New API 的 `CustomCallbackAddress` 为空或明确为 `https://codezip.io`，Native 订单的 `notify_url` 必须是 `https://codezip.io/api/user/gmpay/notify`。
10. API Key 的 IP 白名单按实际请求来源配置；留空表示允许所有来源，不应在不了解代理链的情况下随意填写。
11. 不用真实资金测试；只验证创建订单、站内结构化收银台、回调地址和待支付状态，不伪造支付成功。

## 7. 发布和回滚流程

### 发布前

- 明确目标是国际站还是国内站，并记录域名、容器名、数据库名。
- 记录源提交和镜像标签；国际站不能直接使用当前工作树的未提交内容构建。
- 备份目标实例的 Options、支付方式、支付地址和相关数据库。
- 在隔离工作区完成代码修改和测试。
- 先在测试环境验证，再得到明确授权发布到目标生产实例。

### 发布时

- 只重建或重启目标实例。
- 不修改国内站容器 `torch-ai-test-app` 或国内站数据库。
- 不复制用户表、登录凭据、会话、余额和消费记录。
- 发布后检查容器健康状态、重启次数和错误日志。

### 发布后

- 请求国际站 `/api/user/topup/info`，确认支付方式和最小充值金额。
- 创建一笔不实际支付的 `usdt.tron` 订单，确认请求到 GMPay Native 创建订单接口。
- 确认响应只包含结构化 Crypto 收银字段，不包含或打开托管支付页 URL。
- 确认订单携带 `notify_url=https://codezip.io/api/user/gmpay/notify`，站内状态轮询保持待支付。
- 确认国内站 Options、容器时间戳和配置哈希未变化。
- 若支付创建、回调或签名验证失败，立即恢复上一镜像和配置备份，不要通过手工改支付成功状态绕过问题。

## 8. 当前状态快照

以下内容是本次调查时的状态，不是永久事实：

- 国际站容器名：`new-api-international`。
- 调查时的国际站镜像提交：`35de40fb2c8e247f9565a819ef7ad8fe54536361`。
- EPUSDT 数据库中 TRON、USDT 和多条链配置存在且处于启用状态；钱包地址、汇率源和支付设置仍需在每次上线前按第 6 节复核。
- 国际站当前 `PayMethods` 中已有支付宝；新增支付方式前必须确认其 `type` 是 EPUSDT EPay 分支支持的协议值，而不是只改显示名称。
- 本文记录的双模式实现仍需经过独立 Verify、合并和明确发布授权；在这些步骤完成前，不得描述为已发布或线上已生效。

## 9. 变更记录模板

以后每次国际站或支付相关变更，至少记录：

```text
日期：YYYY-MM-DD
目标实例：国内站 / 国际站 / 测试环境
域名：
容器：
源提交：
镜像标签：
数据库备份位置：
变更内容：
回调地址：
支付地址：
实际验证：
国内站未受影响的证据：
回滚方式：
执行人：
```
