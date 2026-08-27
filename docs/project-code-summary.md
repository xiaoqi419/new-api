# Torch AI 二开维护与交接总览

> 更新日期：2026-08-25
> 事实基线：生产 fork 的 `origin/main`，已核对提交 `3013240d8c0d4918df32ae0ff88b3fbdd14d656e`。
> 本文用途：为维护者和后续 Agent 说明本仓库的二开现状和继续开发方式；它不是 New API 上游的全仓架构手册、API 文档或逐文件注释。

## 先读这段

本仓库是 QuantumNous 的 `new-api` fork。二开产品能力、工程约束和生产版本只以本 fork 的 `origin/main` 为准。上游 New API 是受控更新输入，不能直接替代本 fork，也不能直接构建或部署到生产。

当前产品在基础模型 Relay 之外，已经包含用户账户、充值/订阅、拼团、邀请返现、发票、渠道可观测性、视频生成、模型广场、站内接入文档和公共页面体验。不要把这些功能误认为仍只是早期设计；也不要把“已合并代码”写成“真实支付、生产回调或数据迁移已经验收”。

最小技术底座是 Go + Gin + GORM v2 的服务端，SQLite/MySQL/PostgreSQL 主数据库与可选日志数据库，Redis/进程内缓存，React 19 默认前端、classic 前端和 Canvas 前端。模型 Relay 覆盖 OpenAI Chat/Responses、Anthropic、Gemini、Embedding、Rerank、图片、音频、视频、Realtime 和异步任务；二开通常只需沿实际请求格式、渠道 adapter 和任务 adapter 继续定位，不需要在交接文档复制 40 多种上游的字段表。

### 状态口径

| 状态 | 含义 |
| --- | --- |
| 已合并 | 已进入 `origin/main`，可由下文的提交或源码入口核验。 |
| 本地/自动化验证 | 有测试、构建或已归档 Comet 验证记录；不等于生产实测。 |
| 待线上验收 | 依赖真实商户、公网回调、生产流量、真实数据或部署拓扑，不能在本地伪造结论。 |
| 保留但隐藏 | 代码/数据模型保留，普通用户入口按产品决策隐藏；不要以删除代码的方式“修复”。 |
| 搁置/未开始 | 只有历史方案或讨论，未获得新的 Build 授权。 |

### 调查边界

- 结论来自当前 `origin/main` 提交历史、已归档 Comet change、Git 跟踪文件、`rg` 精确符号检索和代表性源码核对。
- 本机 `fast-context` 命令不可用，缩小范围重试后仍不可用，已按项目约定降级到 `rg` 与 Git；本文不把此过程表述为逐行读完所有文件。
- 生成前端产物、依赖目录、翻译全量数据、图片/二进制资产，以及 `web/canvas/` 的 vendored 上游源码没有逐行审阅。Canvas 仅按宿主集成和本地补丁边界核对。
- 本文不修改或重新验证生产数据库、Redis、商户平台、服务器容器和 DNS。历史本机地址、测试账号和镜像 tag 都不是当前生产配置的替代品。

## 当前发布基线

| 项目 | 当前结论 | 证据 |
| --- | --- | --- |
| 唯一生产源码 | `origin/main`；`secondary-dev`、任何本地 worktree、运行中容器和 `codex/production-source` 都不是独立真源。 | [AGENTS.md](../AGENTS.md) 的 `Production source and branch discipline` |
| 当前远端基线 | `3013240d8c0d4918df32ae0ff88b3fbdd14d656e`，包含单一 main 发布流程治理。 | `git log origin/main -1` |
| 动态公共品牌 | 首页渐变卡、首页 CTA、Footer CTA 使用后台 `systemName`；卡片不再重复显示小号固定品牌；公共导航保留 `/docs`。 | `d044a3d0a`、[web/src/features/home/](../web/src/features/home)、[web/src/components/layout/](../web/src/components/layout) |
| 最近公共体验修复 | 接入文档中英文内容切换、模型广场布局/对比度和英文布局、Footer 业务品牌与法律区域共存。 | `9a2a270c7`、`d460ec4b2`、`6cb7bf1c`、`eaad94a51` |
| 本文不触发的动作 | 不提交、不推送、不部署、不迁移数据、不改生产配置。 | 本 change 的约束 |

当本地、GitHub 和生产看起来不一致时，先停止部署并比较本地 `HEAD`、`origin/main`、容器镜像 tag/digest 和公开页面版本。只有 GitHub main 的精确 SHA 可以成为修复基线。修复后遵循“main -> 一条实现分支 -> 验证 -> PR/CI -> merge SHA 构建 -> 仅应用部署”的顺序。

## 已完成的二开能力

下面按维护入口而不是上游目录树列出已纳入本 fork 的重点能力。

### 商业、支付与运营

| 能力 | 当前状态 | 主要入口 | 维护注意事项 |
| --- | --- | --- | --- |
| 邀请返现和邀请中心 | 已合并；资金链待线上验收 | [model/rebate.go](../model/rebate.go)、[controller/rebate.go](../controller/rebate.go)、[web/src/features/rebate/](../web/src/features/rebate) | 追踪 `CreateInviterRebate`、订单锁、额度变更和审计日志。 |
| 拼团大厅、创建、参与与退款管理 | 已合并 | [model/group_buy.go](../model/group_buy.go)、[controller/group_buy.go](../controller/group_buy.go)、[web/src/features/groupbuy/](../web/src/features/groupbuy) | 支付完成不总是立刻发额度；改动前阅读 `TrySettleGroupBuyOrder`，取消支付不得算作参团成功。 |
| 钱包、易支付站内收银台、订阅支付 | 已合并 | [web/src/features/wallet/](../web/src/features/wallet)、[web/src/features/subscriptions/](../web/src/features/subscriptions)、[controller/topup.go](../controller/topup.go) | Epay 流程应留在 Modal 内展示二维码/状态，避免新页面被广告拦截；同时检查 classic 路径。 |
| 微信官方支付与支付宝商户直连 | 代码已合并，待真实商户验收 | [controller/topup_wechatpay.go](../controller/topup_wechatpay.go)、[controller/topup_alipay.go](../controller/topup_alipay.go)、[router/api-router.go](../router/api-router.go) | 必须验证签名、回调可达、幂等、额度到账和日志。 |
| 发票申请、管理员开票、PDF 下载 | 已合并 | [model/invoice.go](../model/invoice.go)、[controller/invoice.go](../controller/invoice.go)、[web/src/features/invoices/](../web/src/features/invoices) | 保持订单资格、归属和下载鉴权；文件路径和文件名必须受控。 |
| Token 排行、用量下钻和实时并发 | 已合并 | [controller/user_ranking.go](../controller/user_ranking.go)、[controller/token.go](../controller/token.go)、[service/concurrency_limiter.go](../service/concurrency_limiter.go) | Redis 可读取实时占用；内存限流只能可靠展示上限/降级信息，不能伪造实时值。 |
| 渠道兜底和自带兜底转发 | 已合并 | [model/channel_cache.go](../model/channel_cache.go)、[controller/relay.go](../controller/relay.go) | 兜底防递归，并保持原渠道的计费与分组语义；覆盖 retry、错误分类和日志。 |
| 渠道监控 | 已合并 | [controller/channel_monitor.go](../controller/channel_monitor.go)、[web/src/features/channel-monitor/](../web/src/features/channel-monitor) | 仅统计启用渠道；缓存统计和时间窗口参数应共同回归。 |

### 身份、访问与公共体验

| 能力 | 当前状态 | 主要入口 | 维护注意事项 |
| --- | --- | --- | --- |
| 登录/注册/找回密码体验 | 已合并 | [web/src/features/auth/](../web/src/features/auth)、`web/src/routes/(auth)/` | 登录、注册、找回和重置共用认证体验壳；不要只改一页造成主题、i18n 或 320px 布局分叉。 |
| OAuth、Passkey、2FA、验证码 | 既有能力已适配当前界面 | [oauth/](../oauth)、[controller/](../controller)、[web/src/features/auth/](../web/src/features/auth) | 视觉改动也要回归 OAuth bind、重定向、验证码和认证 API 契约。 |
| SMTP 测试邮件超时保护 | 已合并 | [common/email.go](../common/email.go)、[common/email_test.go](../common/email_test.go)、[controller/option.go](../controller/option.go) | deadline 必须覆盖连接、TLS 和 SMTP I/O；错误不能泄露账号、token、收件人或正文。 |
| 大陆官网 HTML 451 | 已合并，依赖部署端可信国家头 | `middleware/mainland_web_access.go`、`middleware/mainland_web_access_test.go` | 只信任显式可信代理的直接 TCP 对端；未知地区 fail-open；API、`/v1`、静态和健康检查不能被误拦；`/api-login` 等前缀碰撞不可绕过。 |
| 首页、模型广场、Footer 和动态品牌 | 已合并 | [web/src/features/home/](../web/src/features/home)、[web/src/features/pricing/](../web/src/features/pricing)、[web/src/components/layout/](../web/src/components/layout) | 站名来自 `useSystemConfig().systemName` 和 `DEFAULT_SYSTEM_NAME` fallback；业务站名不能被用来删改受保护项目归属。 |
| 接入文档与语言切换 | 已合并 | [web/src/features/docs/](../web/src/features/docs)、[web/src/i18n/](../web/src/i18n) | 中文族显示中文，非中文语言使用完整英文 fallback；协议字段、原始代码示例和动态 server address 不应被翻译破坏。 |
| 导航重排、开源图标和入口屏蔽 | 已合并 | [web/src/components/layout/](../web/src/components/layout)、[web/src/lib/nav-modules.ts](../web/src/lib/nav-modules.ts) | 隐藏普通入口，不删除后端或既有数据；验证桌面、移动、角色与直接 URL 行为。 |

### 模型、生成与扩展

| 能力 | 当前状态 | 主要入口 | 维护注意事项 |
| --- | --- | --- | --- |
| 视频生成、Seedance/Seedream 接入 | 已合并 | [controller/video_proxy.go](../controller/video_proxy.go)、[router/video-router.go](../router/video-router.go)、[web/src/features/video-generation/](../web/src/features/video-generation) | 数量、时长、分辨率和倍率是计费输入，使用既有上界与 quota 饱和保护。 |
| 素材库与视频引用素材 | 代码保留，普通入口暂不开放 | [web/src/features/video-generation/](../web/src/features/video-generation)、`/api/ark_asset` 相关路由和模型 | 不删除 `asset://` 支持；若要清理后台加载或数据路径，先获单独授权。 |
| 无限画布 | 代码保留，普通入口暂不开放 | [web/canvas/](../web/canvas)、[router/web-router.go](../router/web-router.go) | Canvas 是 vendored 应用，宿主通过 `/canvas-app` 资源、same-origin API 和 bridge/iframe 集成；本地补丁与 vendor 边界必须分开记录。 |
| 代理/白标分销 | 管理员和已激活 owner 路径保留；公开申请暂不开放 | [model/agent.go](../model/agent.go)、[controller/agent.go](../controller/agent.go)、[router/agent-router.go](../router/agent-router.go)、[web/src/features/agents/](../web/src/features/agents) | 公开前先明确多租户隔离、申请/预充/审批、支付结算、域名/证书和支持流程；不能只移除一个前端隐藏条件。 |

## 未完成、搁置与风险

### 待线上验收

1. 微信/支付宝真实商户参数、下单、验签、公网回调、重复回调幂等、额度到账、返现/拼团结算和审计日志。
2. 正式服务器、域名、HTTPS、数据库/Redis、健康检查、回滚、监控以及部署后可观测性。生产应用只能从 main 的精确 merge SHA 构建。
3. 大陆官网 451 的可信国家头与 `TRUSTED_PROXIES` 配置。代码 fail-open，错误代理配置会造成规则不生效或边界不符。
4. 生产数据升级前的备份、SQLite/MySQL/PostgreSQL 迁移路径和真实量级回归。本文没有批准或执行数据操作。

### 搁置或需要重新 Shape 的方向

| 方向 | 当前状态 | 重新进入 Build 前要确认 |
| --- | --- | --- |
| QQ 群机器人 | 有设计讨论，未实现 | QQ 账号、NapCat/OneBot 部署、配置归属、积分/权限和运行边界。 |
| 微信登录继续扩展 | 当前搁置 | 重新确认用户流、公众号能力边界、风控和回归范围。 |
| 公开代理/白标申请 | 入口隐藏，功能未删除 | 数据隔离、预充/审核、结算、域名/证书和运营流程。 |
| 素材库彻底隐藏或清理 | 仅隐藏普通入口 | 历史数据、`asset://`、管理员/API 路径以及迁移/回滚策略。 |

### 常见风险

- **来源漂移**：只认 `origin/main` SHA；发布前同时比对 SHA、镜像 digest 和公开版本。
- **支付与账务**：沿“输入校验 -> 锁/幂等 -> 额度变更 -> 日志 -> 回调响应”检查，不能只点击页面按钮。
- **三数据库**：迁移、索引、锁和 raw SQL 必须同时适配 SQLite、MySQL、PostgreSQL，遵循 [model/main.go](../model/main.go) 的方言/锁帮助函数。
- **计费溢出**：用户可控乘数先限界；quota 转换只能使用 [common/quota_math.go](../common/quota_math.go) 的饱和函数，并写入可审计标记。
- **三套前端**：默认 [web/](../web)、[web/classic/](../web/classic) 和 [web/canvas/](../web/canvas) 不共享框架或命令。改支付、登录、导航或公开入口前先确定受影响前端。
- **国际化与布局**：所有新增 UI 文案进入 i18n；至少检查英文长文本和 320px，不能只靠中文短文本验收。
- **上游整合**：上游更新用独立 change 审查冲突，确认二开支付、权限、导航和主题没有被覆盖后才进入本 fork main。

## 后续 Agent 的实施方式

```text
origin/main 的精确 SHA
  -> 一个用户需求 / 一个短期实现 worktree
  -> Comet Shape 确认范围和验收
  -> Build + 定向验证
  -> 独立只读 Verify
  -> scoped commit -> GitHub PR -> CI
  -> 从 merge main 的精确 SHA 构建镜像
  -> 仅应用部署 -> 删除远端功能分支
  -> 同步本地 production-source
```

### 开工检查表

1. `git fetch origin --prune` 后记录 `origin/main` SHA；确认根目录和其它 worktree 的脏改动归属，绝不顺手重置或删除。
2. 运行 `comet resume-probe . --stdin --json`。Runtime 若选中 active change，就从其 `nextCommand` 恢复；无关任务不能挂到该 change。
3. 先用 `fast-context` 语义定位行为、调用链、测试和文档。不可用时缩小一次重试，再降级到 `rg` 并在交付中说明。
4. 明确本需求属于哪个二开模块、哪套前端受影响、数据库/支付/鉴权/Relay 是否在范围内，以及非目标。
5. 只有用户可见需求和验收被确认、Comet 允许 Build 后才改代码。

### 实现和验证检查表

- 默认前端新增 UI 文案用 `useTranslation()` / `t()`，并在 [web/src/features/changelog/data.ts](../web/src/features/changelog/data.ts) 增加用户可见 changelog。
- 改支付、返现、拼团、订阅、发票、代理结算或 Relay 计费时，先读对应模型/服务和 [pkg/billingexpr/expr.md](../pkg/billingexpr/expr.md)，追踪输入校验、预扣、结算/退款和日志。
- 改 [relaykit/](../relaykit) 时禁止引入 root module 依赖，必须执行 `GOWORK=off go build ./...`；请求、非流式响应和流转换都要覆盖。
- 默认前端使用 Bun 执行受影响 Vitest、`bun run typecheck`、目标 lint/format 和 `bun run build`；classic/canvas 分别使用自己的 `package.json`。
- 后端按影响范围运行 Go tests；路由、鉴权、数据库或计费改动添加真实合同回归。root 的 `go:embed` 需要三套前端产物或 CI 的准备方式。
- 提交前运行 `git diff --check`、`rg` 残留检查、`git status --short`，不带入生成物、密钥、依赖目录或其它 Agent 改动。

### 发布和线上验收检查表

1. Builder 只提交事实和检查；独立只读 Verifier 必须逐项输出 `passed`、`failed` 或 `blocked`。
2. 全部验收通过后，只提交本需求的代码、测试、正式 Comet 产物和必要文档。
3. 推送分支、创建 PR、等待 CI，合并后记录 GitHub main 的精确 merge SHA。
4. 从该 SHA 构建不可变镜像；部署时仅更新应用，未授权时不动数据库/Redis。
5. 部署后记录镜像 tag/digest、运行容器、公开版本、健康检查和线上证据；支付/回调还记录去敏订单号、签名结果、幂等重放和到账日志。
6. 删除远端功能分支；只有本地生产参考没有独有提交时才同步到 main。脏 worktree 保留到人类确认处理。

## 二开 Agent 必须理解的基础边界

本文不重述上游全仓架构，但常见二开会跨越下列边界。

| 边界 | 最小入口 | 何时深入 |
| --- | --- | --- |
| HTTP 与业务 | [main.go](../main.go) 启动 Gin；[router/main.go](../router/main.go) 组装路由；默认方向是 `router -> controller -> service -> model`。 | API、权限、支付、后台任务或模型变更。 |
| Relay 与计费 | [controller/relay.go](../controller/relay.go)、[relay/](../relay)、[service/](../service) 负责格式解析、`RelayInfo`、渠道选择、转换、上游调用、重试、结算与日志。 | provider、模型映射、错误/重试、请求字段或计费变更。 |
| RelayKit | [relaykit/README.md](../relaykit/README.md)、[relaykit/relayconvert/convmeta/meta.go](../relaykit/relayconvert/convmeta/meta.go) 定义 OpenAI Chat/Responses、Anthropic Messages、Gemini 的 DTO、request/response/stream registry 与宿主 `Meta` 合同。 | 协议转换或流事件变更。 |
| 数据与缓存 | [model/](../model)、[common/](../common)、[setting/](../setting) 管理主/日志数据库、配置、Redis 和内存缓存。 | 迁移、锁、跨节点、额度、缓存一致性。 |
| 三套前端/桌面 | [web/](../web)、[web/classic/](../web/classic)、[web/canvas/](../web/canvas)、[electron/](../electron) | 用户入口、支付、认证、导航、embed 或包构建。 |

Relay 的不可跳过方向是：

```text
客户端协议请求
  -> Router / Controller 识别格式
  -> 请求校验和 RelayInfo
  -> 渠道选择、分组/模型映射、预扣
  -> provider 或 task adapter 转换并调用上游
  -> 流式/非流式响应、可重试错误与兜底边界
  -> usage 归一化、结算/退款、消费日志与审计信息
```

`relaykit/` 只负责四种协议的 DTO 和转换合同，不能反向依赖 Gin、数据库、渠道调度、HTTP 发送、鉴权或计费。支付、钱包、拼团和发票继续走业务 Router/Controller/Service/Model 链路，不能塞进 RelayKit。

`common/` 集中放置配置、JSON 包装、缓存和 quota 算术等共享契约；`constant/`、`dto/`、`types/` 维护跨层常量和请求/响应类型；`setting/` 负责可配置项；`i18n/`、`oauth/`、`pkg/` 分别承载后端文案、第三方认证和内部包。涉及渠道/任务 provider 时，从 [relay/channel/](../relay/channel) 与对应 task adapter 的注册链继续检索；涉及计费时先确认价格、预扣、资金来源、usage 归一化、结算/退款和消费日志全部仍是同一条可审计链。

## 常用命令

以下是入口，不表示本文已重新运行完整构建。执行前确认 worktree、依赖、生成资源和变更范围。

```powershell
git fetch origin --prune
git rev-parse origin/main

# 后端按影响范围缩小；完整 root build 可能需要前端 embed 产物
GOWORK=off go test ./common ./middleware
GOWORK=off go vet ./...

# RelayKit 独立验证
Set-Location relaykit
$env:GOWORK = 'off'
go test ./...
go build ./...

# 默认前端
Set-Location web
bun run typecheck
bun run lint
bun run format:check
bun run i18n:sync
bun run build

git diff --check
git status --short
```

镜像、Compose、CI 和桌面端入口分别在 [Dockerfile](../Dockerfile)、[docker-compose.yml](../docker-compose.yml)、[.github/workflows/](../.github/workflows)、[build-push.sh](../build-push.sh) 与 [electron/](../electron)。推送镜像、重启容器、迁移数据库和改 DNS 都是外部状态变更，必须获得当次明确授权。

## 文档与实现的关系

- 历史计划、设计稿和旧 worktree 只能说明当时决策，不能单独证明“已完成”或“未实现”。优先级是当前 main 源码/测试，其次是归档 Comet 验证和提交历史。
- `docs/secondary-development-plan.md`、`docs/四需求技术方案.md` 等历史文档仍有参考价值，但其中的阶段、工作量、旧技术栈或“待开发”措辞可能已过时；开始工作前重新读当前代码。
- `new-api`、QuantumNous、许可证、module path、包名、镜像名和 attribution 受治理规则保护。动态业务站名不构成删除或替换这些项目标识的授权。

## 交接完成标准

下一位 Agent 应能仅凭本文回答：当前生产源码是什么、哪些二开能力已经存在、哪些必须在线上验证、哪些功能只是隐藏/搁置、下一次改动从何开始，以及如何把验证过的变更安全送入 main。没有源码、Git 历史、测试或 Comet 证据的结论必须标为未知/待验，不能补写成事实。
