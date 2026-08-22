# 代理商(白标分销)系统 · 实施方案 Spec v1

> 状态:设计中(未写业务代码)。本文档为任务级实施蓝本,基于对现有 new-api 架构的只读调研。
> 语言约定:正文中文;表名/字段名/函数名/路由沿用代码原文。
> 品牌保护:`new-api` / `QuantumNous` 版权标识按项目政策不可移除;白标是「叠加代理品牌」而非替换底层版权。

---

## 0. 已确认的产品决策

| # | 决策 | 取值 |
|---|---|---|
| D1 | 结算模型 | **A 充值联动**(用户每笔充值 → 平台按成本从代理钱包扣、给用户加零售额度) |
| D2 | 第一期范围 | **全都要**(分销内核 + 白标域名/品牌 + 代理自有支付) |
| D3 | 代理自有支付 | **第一期即做**(按租户存网关密钥 + 按域名回调) |
| D4 | 用户归属 | 复用平台 `users` 表 + `agent_id` 归属 + **按代理独立命名空间**;后台可开通、前台可申请(申请即预充) |

### 0.1 已确认的补充决策

| # | 议题 | 结论 | 说明 |
|---|---|---|---|
| S1 | 命名空间粒度 | 终端用户 `users` 复合唯一 `(agent_id, username)`、`(agent_id, email)`;平台用户(含代理 owner)`agent_id=0`,沿用现有全局唯一 | 终端用户按代理隔离(A 的 `john` ≠ B 的 `john`);owner 是平台账号,天然全局唯一 |
| S2 | 代理 owner 身份 | owner = **申请人原有平台账号升级**(保持 `agent_id=0` + 置 `is_agent=1`,由 `agents.owner_user_id` 指向他)。登录:①绑域名前在**总台**用原账号正常登录 → 进代理控制台;②绑定自有域名后在 `agentA.com` 登录被识别为该代理管理员 | ✅ 你确认:原账号升级、不新建;先总台登录 |
| S3 | 首次登录路径 | 新代理开通后,owner 用**原账号在总台正常登录**(因 `is_agent=1` 显示代理控制台)→ 绑定并验证自有域名 → 之后切到自有域名登录 | ✅ 你确认:先总台登录、绑好域名再切过去 |
| S4 | 折扣生效时点 | **结算时打折**:代理预充 `1:1`(充 ¥8000 得 ¥8000 钱包额度);终端用户每笔充值 `$M` 时,平台从代理钱包扣 `M×cost_ratio`。平台可**随时调** `cost_ratio`,仅影响之后结算 | ✅ 你确认:充多少得多少,结算按折扣扣 |
| S5 | 自有支付回调 | 显式路径 `/api/agent/:agentId/<provider>/notify` + `tradeNo` 内嵌 agentId 双校验 | 服务器回调时 Host 可能是平台,显式路径最稳 |
| S6 | 前台申请审批 | 默认**人工审批**,提供 `AgentAutoApprove` 开关(付款即自动激活) | v1 稳妥,后续可放开 |
| S7 | 代理自定义倍率 | 代理可自定义其用户的**分组消费倍率**,但每组**不得低于平台对应分组倍率的 9 折**(`agent_ratio ≥ 0.9 × 平台 GroupRatio[group]`,保存时校验拒绝) | ✅ 你确认:可自定义,下限 9 折,防恶性低价 |
| S8 | 代理层级 | **仅单层**,不做二级代理(代理不能再招代理) | ✅ 你确认:不要二级代理 |
| S9 | 反向代理选型 | **Caddy + on-demand TLS**(按域名自动签证书 + ask 校验端点);Nginx 需逐域名脚本签证、运维更重,不选 | 由我定:多自定义域名场景 Caddy 最省运维 |
| S10 | 退款/对账/发票 | v1 仅留**管理员手动调账**入口(依 `agent_ledgers` 流水);自动退款/对账报表/发票后置 | ✅ 你确认:手动为主,自动化后置 |
| S11 | 额度跨代理迁移 | **不支持**(命名空间隔离,归属固定) | ✅ 你确认:默认不支持 |
| S12 | 代理钱包不足 | **挂单不透支**:用户已付则订单 `hold`、通知代理补钱包、补足后**自动补发**;并**支付前预检**(钱包低于阈值暂停该代理站充值)。钱包**绝不为负** | ✅ 你确认:挂单不透支 + 自动补发 + 预检 |

---

## 1. 现状基线(调研结论摘要,含证据)

- **无任何多租户/代理概念**:全仓 `代理/reseller/tenant` 命中均为 proxy/user-agent 误报。
- **钱包/quota**:`model/user.go:95` `Quota int32`;`common/constants.go:31` `QuotaPerUnit=500000`(=$1);原子增减 `IncreaseUserQuota`(`model/user.go:1265`)、防超扣 `DecreaseUserQuotaIfEnough`(`:1322`)。
- **充值链路**:`controller/topup.go` 建 pending `TopUp`(`model/topup.go:14`)→ 网关 → 匿名 webhook 验签 → 事务+行锁+幂等入账 → `IncreaseUserQuota` + `RecordTopupLog`。
- **支付配置全局**:所有网关密钥是包级 `var` + 单一 `options` 表;回调全绑定唯一 `system_setting.ServerAddress`(`service/epay.go:8`),webhook 路径固定。
- **计费公式**:`quota = (Σ 分项 token × 各自 ratio) × (modelRatio × groupRatio) × Π(otherRatios) + 附加`(`service/text_quota.go` `calculateTextQuotaSummary`;预扣 `relay/helper/price.go:118`)。倍率全局 map(`setting/ratio_setting/`)。
- **用户组**:`user.Group`(`model/user.go:98`)+ `GroupRatio`/`GroupGroupRatio`(`setting/ratio_setting/group_ratio.go`);组白名单 `setting/user_usable_group.go`。**全局配置,无租户维度**。
- **品牌/内容/主题**:`SystemName/Logo/Footer`(`common/constants.go:14`)、`console_setting`(公告/FAQ/首页)、`ui_setting`(主题)均全局 option,经 `GET /api/status`(`controller/misc.go:69`)一次下发,前端单一 Zustand store(`web/src/stores/system-config-store.ts`)。
- **域名/证书**:`ServerAddress` 单值;`router/web-router.go` `NoRoute` 对所有 Host 返回同一 `index.html`;**应用不管理证书**(反代层)。

> 结论:代理商功能=给 new-api 叠加多租户维度,涉及 数据模型 / 定价结算 / 配置下发 / 支付 / 路由 五层。

---

## 2. 目标架构总览

```
                          ┌────────────── 反向代理(Nginx/Caddy) ──────────────┐
   agentA.com  ──────────▶│  Caddy on-demand TLS(按域名签证书)              │
   agentB.io   ──────────▶│  统一转发到 new-api:3000,保留 Host              │
   platform.com ─────────▶└───────────────────────────────────────────────────┘
                                          │ Host 透传
                                          ▼
                         ┌── middleware.ResolveTenant(Host→agent_id,带缓存)──┐
                         │  ctx: agent_id                                       │
                         └──────────────────────────────────────────────────────┘
                                          │
        ┌─────────────────────────────────┼───────────────────────────────────┐
        ▼                                 ▼                                     ▼
  GET /api/status                   充值/支付回调                          中继/计费
 (tenant-aware 品牌下发)     (代理自有网关→A 结算)              (用户 quota 正常扣)
```

- **租户来源**:`agent_domains.domain` ← Host。无匹配=平台(agent_id=0)。
- **证书**:仍在反代,应用零改动;推荐 Caddy `on_demand_tls` + 域名白名单校验回调应用 `/api/agent/domain-check`。

---

## 3. 数据模型(3-DB 兼容:SQLite/MySQL/PG)

> 迁移遵循 `model/main.go` 现有模式:GORM `AutoMigrate` + SQLite 用 `ADD COLUMN`(禁 `ALTER COLUMN`);保留字列用 `commonGroupCol` 等;布尔默认值在代码层规范,勿滥用 `default:true`。

### 3.1 新表 `agents`
| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| owner_user_id | int index | 代理 owner 的 user id(平台账号 `agent_id=0` + `is_agent=1`,原有账号升级) |
| name | varchar(128) | 代理名 |
| status | int default 0 | 0=pending,1=active,2=disabled |
| wallet_quota | int(32) default 0 | **代理钱包(成本额度)**,预充 1:1 入账 |
| cost_ratio | double default 1 | 平台给代理的折扣(0<r≤1),**结算时**生效;平台可随时调 |
| sell_group_ratios | text | 代理自定义分组消费倍率 JSON `{group: ratio}`;每项 `≥ 0.9 × 平台 GroupRatio[group]`(见 S7) |
| remark | text | |
| created_time / updated_time | bigint | |

### 3.2 改表 `users`
- 新增 `agent_id int default 0 index`(0=平台直属/含 owner;>0=某代理的终端用户)。
- 唯一索引调整(**高风险迁移,见 §11**):`username`→`(agent_id, username)`;`email` 相关唯一约束→`(agent_id, email)`。存量数据 `agent_id=0`,平滑兼容(平台用户仍全局唯一)。
- 新增 `is_agent tinyint default 0`(标记「代理 owner」;owner 是平台账号 `agent_id=0` 的升级,由 `agents.owner_user_id` 关联其代理)。

### 3.3 新表 `agent_domains`
`id, agent_id index, domain varchar(255) unique, verified tinyint default 0, created_time`。Host→agent 解析源。

### 3.4 新表 `agent_payment_configs`
`id, agent_id index, provider varchar(32), creds_encrypted text, enabled tinyint, unit_price double, min_topup int, created/updated`。
- `creds_encrypted`:用 `common` 现有加解密(AES,密钥取系统 `SessionSecret`/`CryptoSecret`)对整段 JSON 凭据加密。

### 3.5 新表 `agent_options`
`agent_id index, key varchar(64), value text, PRIMARY KEY(agent_id, key)`。
- 覆盖键白名单:`SystemName/Logo/Footer/HomePageConfig/HomePageContent/LoginPageConfig/About/Notice/ui_setting.appearance/console_setting.*` 等品牌/内容项。

### 3.6 新表 `agent_ledgers`
`id, agent_id index, type varchar(16)(prepay/settle/refund/adjust), quota_delta bigint, balance_after int, ref_trade_no varchar(255) index, user_id int, content text, created_time bigint`。代理钱包流水。

---

## 4. 租户解析(Host → agent_id)

- **新中间件** `middleware/tenant.go: ResolveTenant()`
  - 读 `c.Request.Host`(去端口)→ 查内存缓存 map(`domain→agent_id`)→ 命中写 `c.Set("agent_id", id)`;未命中=0。
  - 缓存来源:启动全量加载 `agent_domains`;增删域名时失效/刷新(仿 `model/option.go` 的 OptionMap 刷新)。
- **注入顺序**:置于全局路由链早期(CORS 之后、业务之前);对 relay 中继链路可跳过(中继按 token 归属用户即可)。
- **辅助**:`GetTenantID(c) int` 统一读取。

---

## 5. 结算模型 A(资金流)

### 5.1 代理预充平台(进货,1:1)
- 复用现有 `TopUp` 全链路,`PaymentMethod=balance`/线下,或平台指定网关。
- **预充 1:1**(充 ¥C 得 ¥C 钱包额度,折扣不在此步生效)。入账目标改为 `agents.wallet_quota`(而非 user.Quota):新增 `IncreaseAgentWallet(agentId, quota)`(单行 `gorm.Expr` 原子)。
- 写 `agent_ledgers(type=prepay)`。

### 5.2 终端用户在代理站充值(A 联动)
终端用户(`agent_id=X`)充值 **$M**,走**代理自有支付**(现金进代理网关)。回调验签成功后,**单个 `DB.Transaction`**:
1. `IncreaseUserQuota(userId, QuotaFromDecimal(M × QuotaPerUnit), db=true)` — 用户得零售额度。
2. `cost := QuotaFromDecimal(M × QuotaPerUnit × agent.cost_ratio)`;`DecreaseAgentWalletIfEnough(agentId, cost)` — 原子条件扣减(仿 `DecreaseUserQuotaIfEnough`,`RowsAffected==0` 则**整事务回滚**并把订单标记 `hold`,通知代理余额不足)。
3. 记账:`agent_ledgers(type=settle, ref_trade_no)` + 现有 `TopUp`/`RecordTopupLog`。
- **折扣在此结算步生效**;`cost_ratio` 取当次结算的最新值(平台可随时调,仅影响之后结算)。
- **代理利润** = 用户现金 $M − 平台成本 `M×cost_ratio`。例:8折(0.8),用户充 ¥100 → 用户 +¥100 额度、代理钱包 −¥80、代理收 ¥100 现金 → **净赚 ¥20**。

### 5.3 两个价格/利润杠杆
- **杠杆一 · 进货折扣 `cost_ratio`(平台设)**:决定用户充值时从代理钱包扣多少成本(见 §5.2),是代理现金毛利主来源。
- **杠杆二 · 分组消费倍率(代理设,S7)**:决定代理用户**消费时**每次调用扣多少额度。计费时对 `agent_id=X` 的用户,用代理 `sell_group_ratios[group]` 覆盖平台 `GroupRatio[group]`;**下限 `0.9 × 平台倍率`**,保存校验拒绝越界。
  - 设=平台倍率 → 不加价(利润只来自杠杆一);设更高 → 用户消费更快、复购更勤;设到 0.9× → 让利抢量(下限防恶性低价)。
- **计费落点**:改 `relay/helper/price.go` 的 `HandleGroupRatio`——先按用户 `agent_id` 取代理自定义倍率,miss 回退平台 `GetGroupRatio`。属计费热路径,需谨慎并加测。
- 代理另可自定义**充值套餐价格**(卖给用户的现金↔额度比例),叠加杠杆一共同决定现金毛利。

### 5.4 计费安全不变量(强约束,遵循 AGENTS.md)
- 所有 quota↔金额换算走 `common.QuotaFromDecimal/QuotaFromFloat`,int32 饱和保护,禁裸 `int()`。
- 代理钱包扣减必须原子条件扣减、失败整体回滚,**永不为负**。
- 用户可控金额(M、套餐数量)入账前上界校验,拒绝越界(400)。

### 5.5 代理钱包不足处理(S12,不透支)
- **支付前预检**:代理站发起充值前检查 `wallet_quota` 是否够本次成本;低于阈值则**暂停该代理站充值**(提示"维护中")并提醒代理补钱包,降低"用户已付但钱包不足"的概率。
- **兜底**:用户是先付款(钱进代理网关)、平台回调才扣钱包;若此刻不足 → 订单置 `hold`(用户额度**先不到账**)+ 通知代理;代理补足钱包后,`hold` 单**自动补发**用户额度并扣钱包(复用 §5.2 事务与幂等)。
- **绝不透支**:代理钱包永不为负,平台零坏账;是否给个别信任代理开透支/信用额度留作后续演进。

---

## 6. 代理自有支付

- **凭据加载**:改造现有网关调用点,凭据来源由「全局 `var`」→「按 `agent_id` 查 `agent_payment_configs` 解密」。为避免大改,封装 `GetPaymentContext(agentId, provider)` 返回该代理的 client 配置;`agent_id=0` 回退全局配置(平台自身)。
- **回调路由**(S3):新增 `/api/agent/:agentId/<provider>/notify|webhook`,复用现有验签逻辑但用该代理密钥;`tradeNo` 内嵌 agentId 双校验。
- **回调地址/return URL**:按代理域名动态拼(`https://<agent_domain>/...`),不再用全局 `ServerAddress`;域名取自 `agent_domains` 主域名。
- **涉及网关**:易支付/Stripe/Creem/微信/支付宝/Waffo —— 逐个把「读全局配置」抽象为「读租户配置」。**工作量集中在此,建议先支持 1-2 个网关(如易支付+Stripe)打通闭环,其余增量接入。**

---

## 7. 白标(品牌 / 域名 / 自定义页)

- **tenant-aware 下发**:改造 `controller/misc.go` `GetStatus` 及 `GetNotice/GetAbout/GetHomePageContent`:先按 `agent_id` 查 `agent_options` 覆盖,miss 回退平台全局。
- **覆盖字段**:`system_name/logo/footer_html/login_page_config/home_page_*/ui_appearance/theme/announcements/faq/about` 等。
- **渲染复用**:前端现成(`footer.tsx` / `html-content.tsx` / 首页模板 registry / `auth-layout.tsx`),无需重写,只是数据源变租户化。
- **前端 store**:浏览器按 origin 隔离 localStorage,多域名天然分离;确认 `/api/status` 按 Host 返回正确品牌即可。
- **域名绑定**:代理后台添加域名 → 写 `agent_domains(verified=0)` → 校验(DNS TXT 或 CNAME 检测)→ `verified=1` → 反代 on-demand TLS 自动签证书(校验回调 `/api/admin/domain-check?domain=` 命中白名单才签)。
- **反向代理(S9)= Caddy + on-demand TLS**:`Caddyfile` 用 `on_demand` + `ask` 指向 `/api/admin/domain-check?domain=`,只有已登记且 `verified=1` 的域名才自动签发 Let's Encrypt 证书,防滥用签证;新域名首请求有一次签证延迟。Nginx 需逐域名 acme.sh/certbot 脚本 + reload,运维更重,不采用。

---

## 8. 开通与前台申请

- **前提**:申请人**先是平台普通注册用户**(总台注册,`agent_id=0`)。
- **前台申请**(S6):
  1. 该用户提交申请(填 name、期望预充金额)→ 建 `agents(status=pending, owner_user_id=他)`。
  2. 生成预充 `TopUp` 订单 → 支付成功入 `agents.wallet_quota`(1:1)。
  3. `AgentAutoApprove` 开:付款即 `status=active` 且置其账号 `is_agent=1`(**原账号升级**);关:管理员审批后再升级激活。
- **后台开通**:平台管理员也可直接选定某平台用户 → 建 `agents` + 设 `cost_ratio` + 置其 `is_agent=1`。
- **首次登录(S3)**:owner 用**原账号在总台正常登录** → 因 `is_agent=1` 显示「代理控制台」→ 绑定并验证自有域名 → 之后可在 `agentA.com` 登录并被识别为该代理管理员。
- 通知:审批结果 站内信/邮件(复用现有邮件与通知设施)。

---

## 9. 权限与隔离

- **角色**:平台管理员(root)/ 代理 owner(平台账号 `agent_id=0` + `is_agent=1`,`agents.owner_user_id` 指向他)/ 终端用户(`agent_id=X`)。
- **登录解析**:
  - 总台(Host→平台):平台账号正常登录;若 `is_agent=1` → 显示「代理控制台」,操作范围锁定其所属 `agents` 行。
  - 自有域名 `agentA.com`(Host→X):优先识别是否为该代理 owner(命中→代理后台);否则在命名空间 X 内按终端用户认证 → 用户台。
- **owner 管理范围**:由 `agents.owner_user_id=自己` 定位其代理 X → 仅能看/管 `agent_id=X` 的用户、流水、订单;所有代理后台接口强制按该 `agent_id` 过滤。
- **平台管理员**:用户管理页新增 `agent_id` 列/筛选;代理管理页(增删改查代理、调 `cost_ratio`、充值、停用、审批)。
- **越权防护**:所有 `/api/agent/...` 校验当前 owner 拥有该 agent;租户数据查询一律带 `agent_id` 条件。

---

## 10. 接口与前端面(增量清单)

### 10.1 后端路由(新增)
```
# 租户公共(经 ResolveTenant)
GET  /api/status                         # 改:tenant-aware
GET  /api/notice|about|home_page_content # 改:tenant-aware

# 代理申请/自助(owner 用原平台账号正常登录,无需专用登录接口)
POST /api/agent/apply                    # 前台申请(建 pending + 预充单)
GET  /api/agent/self                     # 代理后台:我的代理信息/钱包(按 is_agent + owner_user_id 鉴权)
PUT  /api/agent/self/ratios              # 自定义分组消费倍率(校验 ≥0.9×平台)
PUT  /api/agent/self/branding            # 品牌/自定义页覆盖
POST /api/agent/self/domains             # 绑定域名
DELETE /api/agent/self/domains/:id
GET  /api/agent/self/domains
PUT  /api/agent/self/payment/:provider   # 自有支付配置(加密存)
GET  /api/agent/self/users               # 名下用户(命名空间内)
GET  /api/agent/self/ledgers             # 钱包流水
POST /api/agent/self/prepay              # 预充平台

# 代理自有支付回调(匿名 + 显式 agentId)
POST /api/agent/:agentId/epay/notify
POST /api/agent/:agentId/stripe/webhook
... 其余网关同构

# 平台管理员
GET/POST/PUT/DELETE /api/admin/agents    # 代理增删改查
PUT  /api/admin/agents/:id/cost_ratio
POST /api/admin/agents/:id/wallet        # 调账/充值
PUT  /api/admin/agents/:id/status        # 审批/停用
GET  /api/admin/domain-check             # 反代 on-demand TLS 白名单校验
```

### 10.2 前端(web/src/features 新增)
- `features/agent-console/`(代理后台):概览/品牌/域名/支付/套餐/用户/流水/预充。
- `features/agent-apply/`(前台申请页)。
- `features/system-settings/agents/`(平台侧代理管理)。
- 用户管理页扩展:`agent_id` 列 + 筛选。
- i18n:所有新文案走 `i18next` 扁平 JSON 7 语言(用 `i18n-translate` skill)。
- changelog:每个用户可见变更加 `web/src/features/changelog/data.ts` 条目。

---

## 11. 迁移计划(重点:users 唯一索引)

1. **加列阶段**:`users.agent_id/is_agent`、建 `agents/agent_domains/agent_payment_configs/agent_options/agent_ledgers`(AutoMigrate,全部 `agent_id=0/默认`)。低风险。
2. **索引切换阶段**(高风险,需三库分别验证):
   - 删除 `username`/`email` 全局唯一索引 → 建复合唯一 `(agent_id, username)`、`(agent_id, email)`。
   - SQLite 无 `ALTER COLUMN`:走「建新表→拷数据→改名」或新增复合唯一索引 + 保留旧列(参考 `model/main.go` 既有迁移写法)。
   - 存量全为 `agent_id=0`,不产生冲突。
   - **上线前在 SQLite/MySQL/PG 各跑一遍迁移与回滚演练。**
3. **灰度**:先只开平台自身(agent_id=0)路径,功能等价现状;再逐代理放量。

---

## 12. 实施里程碑与任务拆解

> 即便「全都要」,按里程碑推进以控制回归风险。每个任务标注主要触及区域。

### M1 · 分销内核 + A 结算
- [ ] 建 `agents/agent_ledgers` 模型与迁移(`model/`)
- [ ] `users.agent_id/is_agent` 加列 + 迁移
- [ ] `users` 唯一索引改 `(agent_id, username)`/`(agent_id, email)`(三库,见 §11)
- [ ] owner = 原平台账号升级(置 `is_agent=1` + `agents.owner_user_id`);总台正常登录即显代理控制台
- [ ] `IncreaseAgentWallet` / `DecreaseAgentWalletIfEnough`(原子,`model/agent.go`)
- [ ] 代理预充:接现有 `TopUp`,入账目标切钱包(1:1)
- [ ] A 结算函数 `SettleAgentUserTopup(tx, agentId, userId, money)`(单事务,结算时按 `cost_ratio` 扣,含饱和/回滚)
- [ ] 代理自定义分组倍率 `sell_group_ratios`(保存校验 ≥0.9×平台)+ 计费 `HandleGroupRatio` 按 `agent_id` 覆盖 + 加测
- [ ] 平台管理员:代理 CRUD + `cost_ratio` + 调账 + 审批接口/页面
- [ ] 用户管理页 `agent_id` 列/筛选
- [ ] 单测:A 结算的入账/扣减/余额不足回滚/饱和边界(`model` + `service`,testify)

### M2 · 租户解析 + 白标
- [ ] `middleware/tenant.go: ResolveTenant` + 域名缓存
- [ ] 自有域名登录/注册(经 ResolveTenant:优先识别代理 owner→代理后台;否则 X 内终端用户→用户台)
- [ ] `agent_domains` 模型/接口 + 域名校验(DNS)
- [ ] `agent_options` 模型 + 覆盖读取封装 `GetTenantOption(agentId,key)`
- [ ] `GetStatus`/`GetNotice`/`GetAbout`/`GetHomePageContent` tenant-aware
- [ ] 反代文档:Caddy on-demand TLS + `/api/admin/domain-check`
- [ ] 代理后台:品牌/自定义页/域名 页面(`features/agent-console`)
- [ ] i18n + changelog

### M3 · 代理自有支付
- [ ] `agent_payment_configs` 模型 + 凭据加解密
- [ ] `GetPaymentContext(agentId, provider)` 抽象(全局回退)
- [ ] 易支付 + Stripe 按租户改造 + `/api/agent/:agentId/...` 回调 + 按域名回调地址
- [ ] 回调内接 A 结算(用户加额度 + 代理扣成本,单事务)
- [ ] 余额不足处理(S12):支付前预检暂停 + `hold` 挂单 + 代理补足后自动补发(不透支)
- [ ] 代理后台:支付配置 + 套餐定价页
- [ ] 其余网关(Creem/微信/支付宝/Waffo)增量接入
- [ ] 安全:凭据加密、Host/agentId 双校验、幂等、验签用例

### M4 · 前台申请 + 代理控制台完善
- [ ] `/api/agent/apply` + 预充单 + `AgentAutoApprove` 开关
- [ ] 前台申请页 `features/agent-apply`
- [ ] 代理控制台:概览/用户/流水/预充 完整化
- [ ] 端到端联调:新代理 从申请→预充→绑定域名→配支付→用户注册充值→A 结算→消费

---

## 13. 决策已锁定 / 后续演进

**v1 决策已全部锁定**:D1–D4 + S1–S12。含:结算模型 A(S4)、分组倍率下限 9 折(S7)、仅单层代理(S8)、反代 Caddy on-demand TLS(S9)、退款对账手动为主(S10)、额度不跨代理迁移(S11)、钱包不足挂单不透支(S12)。

**后续演进(非 v1)**:
- 自动退款(对接各网关退款 API)/ 自动对账报表 / 发票。
- 对信任代理开"透支 / 信用额度"。
- 如有需要:二级代理、额度跨代理迁移。

---

## 14. 验证与交付约定(沿用项目规范)

- 后端:`gofmt` + `go build ./...` + `go vet` + 关键路径 `testify` 单测(尤其计费/结算不变量)。
- 前端:`bun run typecheck` + `oxfmt` + `bun run build`;i18n 7 语言齐全;changelog 更新。
- 提交:Co-authored-by factory-droid[bot];发布经 `/tmp/deploy.sh`(主 Dockerfile)。
- 三库(SQLite/MySQL/PG)迁移与回滚演练通过后方可上线。
