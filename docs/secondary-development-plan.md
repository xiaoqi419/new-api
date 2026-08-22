# new-api 二开开发文档与开发计划

> 本文档面向在现有 new-api（QuantumNous）中转站基础上的定制二次开发，覆盖三项业务需求：
> 1. 邀请好友 + 好友充值返现 + 手动返现
> 2. 微信 / 支付宝官方商户直连支付
> 3. 微信订阅号验证码登录
>
> 文档同时给出与 new-api 现有架构结合的落地设计、数据模型、接口、配置项、分阶段开发计划与风险前提。本文是早期设计基线；实际实施进度以 [Torch AI 维护状态](torch-ai-maintenance-status.md)、[Torch AI 二开功能状态与后续拓展](torch-ai-second-development-status.md)、Git 历史和 Comet Archive 为准。

## 当前维护标注（2026-08-19）

- 邀请返现、邀请中心、拼团、支付宝商户直连、微信官方支付、视频生成、素材库、渠道监控和应用内接入文档已经存在于当前代码树，本文中的“代码尚未改动”不再适用。
- 微信官方支付已完成本地代码验收；真实商户凭据、公网回调、微信客户端授权和实际结算必须等待线上环境，当前标记为“待线上验收”。支付宝商户直连同样保留线上商户验收项。
- 微信登录相关代码不作为当前新增开发目标，继续按产品决策暂时搁置。
- 四需求技术方案中的排行、并发、兜底和发票也已经在当前代码树实现，正式纳入 Torch AI 二开清单；详见 [Torch AI 二开功能状态与后续拓展](torch-ai-second-development-status.md)。
- Phase 4 质量门禁、关键路径回归、i18n 检查和发布前风险清单已经完成；当前剩余的是线上支付验收、发布部署和后续设计模块评审。

> 本文第 5 节仍保留原始阶段计划和工作量估算，作为设计历史。不要使用其中“新增”“待实现”字样判断当前代码状态；四项需求的实施状态以 `四需求技术方案.md` 和二开状态总表为准。

---

## 1. 系统与架构基线（现状）

### 1.1 技术栈
- 后端：Go 1.22+ / Gin / GORM v2，数据库需同时兼容 SQLite、MySQL ≥ 5.7.8、PostgreSQL ≥ 9.6（线上为 **PostgreSQL 15**）。
- 缓存：Redis（go-redis）+ 内存缓存。
- 前端：`web/default`（React 19 + Rsbuild + Base UI）与 `web/classic`（React 18 + Vite + Semi），构建产物经 Go `//go:embed` 内嵌进二进制。
- 包管理：前端用 Bun；后端 Go modules，module 路径 `github.com/QuantumNous/new-api`。

### 1.2 分层架构
```
请求 → Router → Middleware → Controller → Service → Model(GORM) → DB
                                   ↓
                                 Relay → relay/channel/<provider> → 上游 AI API
```
- `router/`：路由组装（`SetApiRouter` / `SetRelayRouter` / `SetDashboardRouter` / `SetVideoRouter` / `SetWebRouter`）。
- `controller/`：请求处理器。
- `service/` `setting/` `model/` `common/` `dto/` `constant/` `types/`：业务逻辑、配置、数据访问、共享工具、传输对象、常量、类型。
- `oauth/`：第三方登录 Provider（github / discord / oidc / linuxdo / generic / registry）。

### 1.3 与本次二开相关的现有能力（复用基础）
| 能力 | 现状 | 关键文件 |
| --- | --- | --- |
| 邀请关系 | `User.AffCode/AffCount/AffQuota/AffHistoryQuota/InviterId` 已有；注册时按 `QuotaForInviter/QuotaForInvitee` 送额度；`AffQuota` 可转余额 | `model/user.go`（`inviteUser`、`TransferAffQuotaToQuota`、`Insert`、`FinalizeOAuthUserCreation`） |
| 充值订单 | `model.TopUp` 订单表 + 状态机（pending/success）；管理员补单 | `controller/topup.go`（`RequestEpay`、`EpayNotify`、`AdminCompleteTopUp`、`LockOrder/UnlockOrder`） |
| 易支付（含支付宝/微信聚合） | 已集成 `Calcium-Ion/go-epay`，默认支付方式含 `alipay`/`wxpay` | `controller/topup.go`、`setting/operation_setting/payment_setting_old.go` |
| 其他支付 Provider | Stripe / Creem / Waffo 已有，可参照其 Provider 模式 | `controller/topup_stripe.go`、`controller/topup_creem.go`、`controller/topup_waffo*.go` |
| 微信登录（配套版） | 走外部 `wechat-server`：`WeChatServerAddress` + token，后台开关 `WeChatAuthEnabled`，字段 `User.WeChatId` | `controller/wechat.go`、`common/constants.go`、`model/option.go` |
| 加额度 / 日志 | `model.IncreaseUserQuota`、`model.RecordLog/RecordTopupLog` | `model/` |

> 结论：需求 2、3 在“聚合 / 配套”形态下几乎零代码；但本次按用户决策走 **官方直连** 与 **内置订阅号验证码登录**，需新增代码。需求 1 必须二开。

---

## 2. 二开需求设计

### 2.1 需求一：邀请充值返现 + 手动返现（方案：仅手动发放）

**目标**：好友通过邀请关系充值后，系统生成“待返现”记录；管理员在后台审核后手动发放（入站内余额），全程可追溯、不重复发放。

**数据模型（新增）** `model/rebate_record.go`：
```text
RebateRecord {
  Id           int
  InviterId    int     // 邀请人
  InviteeId    int     // 好友（被邀请人）
  TopUpTradeNo string  // 关联充值订单
  TopUpAmount  int     // 好友充值额度/金额（按展示单位）
  RebateRatio  float64 // 生成时的返现比例快照
  RebateAmount int     // 应返额度（quota 单位）
  Status       string  // pending / paid / canceled
  OperatorId   int     // 发放管理员
  CreatedTime  int64
  PaidTime     int64
}
```
- 索引：`InviterId`、`Status`、唯一索引 `TopUpTradeNo`（防同一订单重复生成）。
- 迁移：GORM AutoMigrate；布尔/默认值在代码层设定，避免 PgSQL 反复 ALTER（遵循 AGENTS.md）。

**生成时机**：在所有充值成功回调成功分支（`EpayNotify` 及新增的微信/支付宝回调）里，若 `topUp.UserId` 对应用户 `InviterId != 0` 且 `RebateEnabled`，按 `RebateRatio` 计算 `RebateAmount`，写一条 `pending` 记录（**不自动入账**）。

**管理员接口（新增 `controller/rebate.go`）**：
- `GET /api/rebate/`：分页列出返现记录（支持按邀请人/状态筛选），并聚合“邀请人 / 好友充值累计 / 待返 / 已返”。
- `POST /api/rebate/pay`：发放一条或一批 `pending` → `paid`：`model.IncreaseUserQuota(inviterId, rebateAmount, true)` + `RecordLog` + 置 `paid/OperatorId/PaidTime`。订单级加锁（复用 `LockOrder`）防并发重复发放。
- `POST /api/rebate/cancel`：作废一条 `pending` 记录。

**配置项**：在**管理员系统设置**中填写（见 §3 配置与前端落点），后端 `model/option.go` + `setting/operation_setting/*` 持久化到 options 表：`RebateEnabled`(bool)、`RebateRatio`(float64，如 0.1)。

**前端（老版 `web/classic`，Semi Design）**：
- 管理端：在「运营设置」Tab 增加返现配置项；新增「邀请返现」管理列表页（管理员查看邀请人/好友充值累计/待返/已返，点按发放）。
- 用户端：**个人中心新增「邀请中心」路由**（见 §3.2），展示邀请码/链接、邀请人数、累计返现与到账状态，复用并扩展现有 `components/topup/InvitationCard.jsx`。

---

### 2.2 需求二：微信 / 支付宝官方商户直连

> ⚠️ **资质前提**：微信支付商户号、支付宝当面付/网站支付均需企业或个体户资质，个人主体通常无法开通官方直连。若无商户资质，应回退到已内置的易支付聚合（零代码）。本设计假定已具备商户号。

**形态选择**（PC 网页充值场景）：
- 微信支付：Native 扫码支付（APIv3）。
- 支付宝：电脑网站支付（`alipay.trade.page.pay`）。

**新增 Provider（参照 `topup_stripe.go` 模式）**：
- `controller/topup_wechatpay.go`：`RequestWechatPay`（下单→返回二维码链接）+ `WechatPayNotify`（APIv3 验签→置成功→加额度→生成返现记录）。
- `controller/topup_alipay.go`：`RequestAlipay`（下单→返回跳转 URL/表单）+ `AlipayNotify`（验签→置成功→加额度→生成返现记录）。
- 复用 `model.TopUp` 表与状态机；新增常量 `PaymentProviderWechatPay` / `PaymentProviderAlipay`。

**依赖（需评估引入）**：
- 微信支付：`github.com/wechatpay-apiv3/wechatpay-go`。
- 支付宝：`github.com/smartwalle/alipay/v3`。

**配置项**（全部在**管理员系统设置 → 支付设置**填写，见 §3.1）：
- 微信：`appid`、`mchid`、APIv3 Key、商户证书序列号、商户私钥（API 证书）。
- 支付宝：`appid`、应用私钥、支付宝公钥、网关地址（沙箱/正式）。
- 统一回调基地址沿用 `service.GetCallbackAddress()`。

**路由**：`router/api-router.go` 注册下单接口（鉴权后）；回调 URL 公开放行（参照现有 `/api/user/epay/notify`）。

**前端（老版 `web/classic`）**：
- 管理端：在「支付设置」Tab（`components/settings/PaymentSetting.jsx`）新增微信、支付宝两个网关配置子页（参照 `pages/Setting/Payment/SettingsPaymentGatewayStripe.jsx`）。
- 用户端：充值页（`components/topup/`，由 `GetTopUpInfo` 返回的 `pay_methods` / `enable_*` 驱动）增加两种支付入口与扫码/跳转弹窗。

---

### 2.3 需求三：微信订阅号验证码登录（内置消息接口，不依赖 wechat-server）

> 适配**个人订阅号**：无网页授权（snsapi）、无客服接口、无带参二维码，但有“服务器配置”可**接收消息**并**被动回复**。因此采用“网站生成验证码 + 用户在订阅号内发送该码 + 网页轮询登录”的模式。

**登录流程**：
1. 网页点击“微信登录” → `POST /api/wechat/mp/code` 生成 6 位随机码，存 Redis：`wxlogin:{code} → {ticket, status}`，TTL 5 分钟；返回订阅号二维码 + 验证码。
2. 用户关注订阅号并发送该 6 位验证码。
3. 微信把消息推送到 `POST /api/wechat/mp`（订阅号“服务器配置”指向此 URL）→ 后端匹配验证码 → 标记会话已登录（写回 Redis），被动回复“登录成功，请返回网页”。
4. 网页轮询 `GET /api/wechat/mp/status?ticket=...` → 命中后调用 `setupLogin` 下发会话（新用户按 `WeChatAuthEnabled` + 注册逻辑建号，复用 `User.WeChatId`）。

**新增 `controller/wechat_mp.go`**：
- `GET /api/wechat/mp`：微信服务器签名校验 `sha1(sort(token,timestamp,nonce))`，原样返回 `echostr`。
- `POST /api/wechat/mp`：解析微信 XML 文本消息，取 `Content`(验证码) 与 `FromUserName`(openid)，匹配 Redis 会话；被动回复 XML。
- `POST /api/wechat/mp/code`、`GET /api/wechat/mp/status`：会话生成与轮询。

**配置项**（在**管理员系统设置 → 系统设置**填写，见 §3.1，与现有微信登录配置同区）：`WeChatMpToken`（服务器配置 Token）、`WeChatMpQrCodeUrl`（订阅号二维码图）、复用 `WeChatAuthEnabled` 总开关。

**前端（老版 `web/classic`）**：
- 管理端：在「系统设置」Tab（`components/settings/SystemSetting.jsx`，现有微信/OAuth 登录开关所在处）新增订阅号登录配置字段。
- 用户端：登录页（`components/auth/LoginForm.jsx`）新增“微信登录”入口（展示二维码 + 验证码 + 轮询状态）。

---

## 3. 配置与前端落点（管理员系统设置 + 个人中心，老版 `web/classic`）

> 原则：**所有可变配置一律由管理员在后台「系统设置」页填写并持久化到 options 表**（不写死、不依赖环境变量）；用户侧入口放在**个人中心**。前端一律改老版 `web/classic`（React 18 + Vite + Semi Design）。

### 3.1 管理员系统设置（`/console/setting`，仅 root 可见）
后台设置页由 `pages/Setting/index.jsx` 以 Tab 组织，对应各 `components/settings/*.jsx`。本次配置落点：

| 配置 | 落在哪个 Tab | 对应组件 / 子页 | 新增字段 |
| --- | --- | --- | --- |
| 返现开关与比例 | 运营设置（operation） | `components/settings/OperationSetting.jsx`（可新增 `pages/Setting/Operation/SettingsRebate.jsx`） | `RebateEnabled`、`RebateRatio` |
| 微信支付（官方直连） | 支付设置（payment） | 新增 `pages/Setting/Payment/SettingsPaymentGatewayWechatPay.jsx`，挂到 `components/settings/PaymentSetting.jsx` | `appid`、`mchid`、APIv3 Key、证书序列号、商户私钥 |
| 支付宝（官方直连） | 支付设置（payment） | 新增 `pages/Setting/Payment/SettingsPaymentGatewayAlipay.jsx` | `appid`、应用私钥、支付宝公钥、网关地址 |
| 微信订阅号登录 | 系统设置（system） | `components/settings/SystemSetting.jsx`（现有微信/OAuth 登录开关所在处） | `WeChatMpToken`、`WeChatMpQrCodeUrl`、复用 `WeChatAuthEnabled` |

落地链路：前端表单保存 → `PUT /api/option/`（现有选项接口）→ 后端 `model/option.go` 写 options 表并热更新到内存 → 各 `setting/operation_setting/*` 读取。新增字段需在 `model/option.go` 的 `OptionMap` 初始化与 `updateOptionMap` 分支登记，与现有 `EpayId/PayAddress/WeChatServerAddress` 等保持同一模式。

### 3.2 用户个人中心（新增「邀请中心」路由）
- 现状：个人中心路由 `/console/personal` → `components/settings/PersonalSetting.jsx`；邀请卡片 `components/topup/InvitationCard.jsx` 目前挂在充值页。
- 改动：在 `web/classic/src/App.jsx` **新增受保护路由**（`PrivateRoute`），例如 `/console/personal/invitation` → 新页面 `pages/Invitation/`（或个人中心内新增 Tab/卡片），并在个人中心/侧边栏加入口。
- 页面内容：邀请码与邀请链接（复用 `aff_code`/`affLink`）、邀请人数（`aff_count`）、累计/待返/已到账返现（调用 §2.1 新接口），复用并扩展现有 `InvitationCard.jsx`。
- i18n：老版用 `web/classic/src/i18n/locales/*.json`（`zh-CN/en/zh-TW/ja/ru/vi/zh`），**key 为中文源串**（如 `t('邀请中心')`），与 `web/default`（英文 key）不同，注意区分。

---

## 4. 部署、镜像与数据库

- **镜像**：`docker-compose.yml` 已改为 `registry.cn-shanghai.aliyuncs.com/gongyong1/torchai:latest`。
- **CI（可选后续）**：`.github/workflows/docker-*.yml` 仍指向 `calciumion/new-api`；若需 CI 自动构建推送到 ACR，需另配 ACR 登录 secret 并改 workflow（不在本期默认范围）。
- **数据库**：线上 PostgreSQL 15（`SQL_DSN` 指向 postgres 服务）。所有新表/字段经 GORM AutoMigrate，须兼容三种数据库；原始 SQL 注意方言差异与保留字（`commonGroupCol/commonKeyCol`、`UsingMainDatabase/UsingLogDatabase`）。
- **回调可达性**：三处回调（微信支付 / 支付宝 / 订阅号消息）需公网可达，且与各平台后台配置一致，注意 `FRONTEND_BASE_URL` 与反向代理。

---

## 5. 开发计划（分阶段）

> 工作量为粗估（含联调，1 人天 = ideal day），实际受商户资质/微信审核影响。前端均改老版 `web/classic`。

### 阶段 0：准备（0.5 天）
- 确认商户资质与公众号；备齐微信支付/支付宝证书密钥、订阅号 Token；准备测试金额与回调域名。
- 拉起本地/测试环境（`make dev` 或 dev compose），确认连 PgSQL。

### 阶段 1：邀请充值返现 + 手动返现（3–4 天）
1. 新增 `RebateRecord` 模型 + AutoMigrate；在「运营设置」加配置项 `RebateEnabled/RebateRatio`（含 `model/option.go` 登记）。
2. 在 `EpayNotify` 成功分支接入返现记录生成（先用易支付验证闭环）。
3. 管理员接口 `controller/rebate.go`（列表/发放/作废）+ 路由 + 订单锁防重。
4. 老版前端：管理端「邀请返现」列表页 + **个人中心新增「邀请中心」路由** + i18n（`web/classic` 中文 key）。
5. 自测：模拟好友充值→生成 pending→手动发放→邀请人余额到账→不可重复发放；个人中心可见返现状态。
- **里程碑 M1**：返现全链路在易支付下跑通，邀请中心可见。

### 阶段 2：微信订阅号验证码登录（2–3 天）
1. `controller/wechat_mp.go`：签名校验 + 消息接收 + 被动回复。
2. Redis 验证码会话（生成/匹配/轮询）+ 路由放行。
3. 登录建号链路复用（`setupLogin` + `WeChatId`）；「系统设置」加 `WeChatMpToken/WeChatMpQrCodeUrl` 字段。
4. 老版前端：登录页入口（二维码 + 验证码 + 轮询）+ i18n。
5. 自测：订阅号“服务器配置”指向接口→发送验证码→网页登录/注册。
- **里程碑 M2**：个人订阅号验证码登录可用。

### 阶段 3：微信 / 支付宝官方直连（3.5–5 天，依赖资质）
1. 引入并评估 SDK（`wechatpay-go`、`smartwalle/alipay`）。
2. `topup_wechatpay.go` / `topup_alipay.go`：下单 + 回调验签 + 入账 + 触发返现记录。
3. 「支付设置」Tab 新增微信、支付宝网关配置子页（含 `model/option.go` 登记）。
4. 老版前端：充值页两种支付入口 + 二维码/跳转。
5. 自测：扫码/跳转支付→回调验签→额度到账→返现记录生成。
- **里程碑 M3**：两种官方支付在生产商户号下成功收款。

### 阶段 4：联调、回归与上线（1–2 天）
- 跨数据库迁移验证（重点 PgSQL）；并发补单/重复回调幂等；前端 build（`bun run build`）内嵌；后端 `go vet` / 单测；灰度发布 + 监控回调日志。
- **里程碑 M4**：三需求合并上线。

**总计**：约 9–14 人天（阶段 3 受资质与平台审核影响波动最大）。

### 建议顺序
资质未定时先做 **阶段 1 + 阶段 2**（不依赖商户号），阶段 3 待商户号到位再启动；若短期拿不到商户号，阶段 3 可临时回退到已内置易支付。

---

## 6. 风险与前提
1. **支付资质**：官方微信/支付宝直连需企业/个体户商户号，个人不可办 → 无资质则回退易支付聚合（已内置、零代码）。
2. **订阅号能力边界**：个人订阅号仅能“接收消息 + 被动回复”，无客服主动推送、无带参二维码、无网页授权；本方案已按此约束设计。
3. **回调安全**：必须严格验签（微信 APIv3、支付宝公钥、订阅号 Token）；回调幂等，复用 `LockOrder` 防重复入账/返现。
4. **跨数据库**：所有迁移与 SQL 必须在 SQLite/MySQL/PgSQL 通过；布尔默认值在代码层设定。
5. **保护性信息**：项目品牌/版权（new-api、QuantumNous）相关标识按项目治理规则不得改动。
6. **JSON 规范**：业务代码 marshal/unmarshal 一律走 `common.*` 包装函数，禁止直接用 `encoding/json`。

---

## 7. 涉及文件清单（预计改动 / 新增）

**后端**
- 新增：`model/rebate_record.go`、`controller/rebate.go`、`controller/topup_wechatpay.go`、`controller/topup_alipay.go`、`controller/wechat_mp.go`。
- 改动：`controller/topup.go`（回调生成返现）、`router/api-router.go`（下单/管理/会话路由）、`router/relay-router.go` 或 web 路由（回调放行）、`model/option.go` + `setting/operation_setting/*`（新增配置项登记与读取）、`go.mod`（支付 SDK）。

**前端（老版 `web/classic`）**
- 管理端系统设置：`pages/Setting/Operation/SettingsRebate.jsx`（新增，返现）、`pages/Setting/Payment/SettingsPaymentGatewayWechatPay.jsx` 与 `SettingsPaymentGatewayAlipay.jsx`（新增，挂到 `components/settings/PaymentSetting.jsx`）、`components/settings/SystemSetting.jsx`（新增订阅号登录字段）。
- 管理端列表：「邀请返现」管理页（新增）。
- 用户端：`App.jsx`（新增 `/console/personal/invitation` 路由）、`pages/Invitation/`（新增邀请中心页）、扩展 `components/topup/InvitationCard.jsx`、`components/auth/LoginForm.jsx`（微信登录入口）、充值页 `components/topup/*`。
- i18n：`web/classic/src/i18n/locales/*.json`（中文 key）。

**已改动**：`docker-compose.yml`（镜像源）。
