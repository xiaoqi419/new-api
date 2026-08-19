# Torch AI 二开功能状态与后续拓展

> 更新时间：2026-08-19
>
> 本文是 Torch AI 当前二次开发的维护总表。它以当前代码树、已归档的 Comet Native change 和本地验收记录为准，专门回答两个问题：哪些二开功能已经开发，哪些仍待拓展或线上验收，以及为什么“排行 / 并发 / 兜底 / 发票”此前没有出现在主二开清单中。
>
> 关联文档：
> - [Torch AI 维护状态](torch-ai-maintenance-status.md)：工程门禁、分支和发布状态。
> - [四需求技术方案](四需求技术方案.md)：四项功能的历史方案与当前实现证据。
> - [new-api 二开开发文档与开发计划](secondary-development-plan.md)：早期三项业务需求的设计基线，历史工作量和阶段描述不再单独作为进度依据。

## 1. 状态口径

| 状态 | 含义 |
| --- | --- |
| 已实现 / 本地验收通过 | 代码、路由、权限和受影响的回归检查已经在当前仓库完成；不代表已部署到线上。 |
| 已实现 / 待线上验收 | 本地代码链路已完成，但真实商户凭据、公网回调、生产服务或真实结算只能在线上环境验证。 |
| 部分实现 / 公开入口暂不开放 | 已有后端或内部管理代码，但普通用户入口按当前产品边界保持屏蔽；即使本地验收通过，也不视为公开功能已交付。 |
| 设计中 / 未实现 | 已有产品或技术方案，但当前代码树没有对应业务实现，下一步需要重新审批后进入 Build。 |
| 明确搁置 | 用户已经决定暂时不开发；现有同名基础能力可能保留，但不能写成该计划已完成。 |
| 工程收口 | 功能代码之外的 lint、测试、构建、发布、部署和证据留档工作。 |

## 2. 已开发的 Torch AI 二开功能

下表是当前应当归入“二开已开发功能”的完整清单。四需求中的排行、并发、兜底、发票也属于这一清单。

| 功能 | 代码状态 | 当前验收状态 | 主要证据 |
| --- | --- | --- | --- |
| 邀请返现 / 邀请中心 | 已实现 | 本地代码验收通过，未部署 | `model/rebate.go`、`controller/rebate.go`、`web/src/features/rebate/`、`web/src/features/invitation/` |
| 拼团 | 已实现 | 本地代码验收通过，未部署 | `model/group_buy.go`、`controller/group_buy.go`、`controller/group_buy_admin.go`、`web/src/features/groupbuy/` |
| 支付宝官方商户直连 | 已实现 | 本地代码验收通过，待线上商户验收 | `controller/topup_alipay.go`、`router/api-router.go`、`web/src/features/wallet/`、`setting/payment_official.go` |
| 微信官方支付（Native / H5 / JSAPI） | 已实现 | 本地代码验收通过，待线上商户验收 | `controller/topup_wechatpay.go`、`router/api-router.go`、`web/src/features/wallet/`、Comet `p0-wallet-wechatpay` Archive |
| 视频生成 | 已实现 | 本地代码验收通过，未部署 | `controller/video_proxy.go`、`router/video-router.go`、`web/src/features/video-generation/` |
| 素材库 / 视频引用素材 | 已实现，公开入口暂不开放 | `p1-feature-gates-native-controls` 已接受；A1-A9 全部通过，迭代 2 独立 Verify 通过并于 2026-08-19 归档 | `web/src/features/video-generation/components/reference-media-editor.tsx` 及素材 API/模型实现；手工 `asset://` 保留 |
| 无限画布 | 已有代码，公开入口暂不开放 | `p1-feature-gates-native-controls` 已接受；A1-A9 全部通过，迭代 2 独立 Verify 通过并于 2026-08-19 归档 | `/canvas` 路由保留并显示 Coming Soon，不删除画布代码或历史数据 |
| 渠道监控 | 已实现 | 本地代码验收通过，未部署 | `model/channel_monitor.go`、`controller/channel_monitor.go`、`web/src/features/channel-monitor/` |
| 应用内接入文档 | 已实现 | 本地代码验收通过，未部署 | `web/src/routes/docs/`、`web/src/features/docs/` |
| 用户 Token 排行与用量日志下钻 | 已实现 | 本地代码验收通过，未部署 | `controller/user_ranking.go`、`web/src/features/usage-logs/components/user-token-ranking-panel.tsx`、`web/classic/src/components/table/usage-logs/components/UserTokenRankingPanel.jsx` |
| API Key / Token 实时并发统计 | 已实现 | 本地代码验收通过；Redis 可显示实时值，内存模式只显示上限 | `service/concurrency_limiter.go`、`controller/token.go`、`router/api-router.go`、`web/src/features/keys/api.ts`、`web/classic/src/hooks/tokens/useTokensData.jsx` |
| 渠道兜底渠道与渠道自带兜底转发 | 已实现 | 本地代码验收通过，未部署 | `model/channel_cache.go`、`controller/relay.go`、`controller/channel-test.go`、`web/classic/src/components/table/channels/modals/EditChannelModal.jsx` |
| 发票申请、管理员开票和 PDF 下载 | 已实现 | 本地代码验收通过，未部署 | `model/invoice.go`、`controller/invoice.go`、`router/api-router.go`、`web/src/features/invoices/` |
| 代理商 / 白标分销 | 部分实现，公开申请入口暂不开放 | `p1-feature-gates-native-controls` 已接受；A1-A9 全部通过，迭代 2 独立 Verify 通过并于 2026-08-19 归档 | `model/agent*.go`、`controller/agent*.go`、`router/agent-router.go`、`web/src/features/agents/`、`web/src/features/agent-console/`；管理员与已激活 owner 入口保留 |

### 四项功能的实现范围

1. **排行**：管理员用量记录页提供用户 Token 排行，点击用户可写入日志筛选条件并下钻查看该用户明细；后端复用 `GET /api/user_ranking/?dimension=tokens`。
2. **并发**：`GET /api/token/concurrency` 返回当前用户令牌的 `in_use`、`max` 和 `supported`。Redis 模式通过 ZSET 清理过期项后读取实时占用；内存信号量无法提供实时读数，因此前端明确降级为只显示上限。
3. **兜底**：渠道编辑页可配置备用 Base URL、Key 和模型。渠道选择把兜底渠道放在独立的最低重试档位；本渠道可重试错误还可以触发一次渠道自带兜底转发，并避免递归兜底。
4. **发票**：用户只能选择已支付且尚未被有效发票占用的订单提交申请；管理员按权限分页查看、上传 PDF 开票或驳回；下载接口校验用户归属并使用安全文件名拼接。

## 3. 本地验收与上线状态

### 已完成的本地工程门禁

- `web` lint：0 errors、1,682 warnings；warnings 是历史 warning-only 债务。
- `web` 测试：rc.25 同步后的 Vitest 为 310 pass、0 fail，53 个文件；其中 API Key Auto Group、CodeMirror lazy 编辑器和旧 `node:test` 迁移回归均已通过。
- `web` typecheck、`web` build、`web/classic` build：均通过。
- root 与独立 `relaykit` 的 Go vet、build 和全量测试：均有通过记录。
- `p1-quality-regression`、`p1-http2-test-stability`、`p1-lint-debt`：均完成独立 Verify、Archive，并在本地合入 `codex/p0-wallet-wechatpay`。
- Comet Native change `p1-feature-gates-native-controls` 已接受：A1-A9 全部通过，迭代 2 独立 Verify 通过；已于 2026-08-19 归档，归档目录为 `docs/comet/archive/2026-08-19-p1-feature-gates-native-controls/`。迭代 1 仅 A7 因维护文档生命周期表述过时退回，已在迭代 2 修正；本条不表示已部署或已完成线上验收。
- QuantumNous/new-api `v1.0.0-rc.25` 已在独立 Comet change `upstream-rc25-sync` 完成三方合并候选；39 个官方提交、207 个文件差异和 27 个冲突路径已审查，当前处于 Build，尚未 Verify/Archive。
- rc.25 同步没有替换或关闭 Torch AI 二开：支付和订单状态、邀请返现/拼团、视频、素材库/无限画布代码、渠道监控、排行/并发/兜底/发票、代理/白标和既定公开入口屏蔽均按原口径保留。
- 本轮 Build 验证已通过 root Go test/vet/build、独立 relaykit build/test、前端 53 files / 310 tests、typecheck、0-error lint 和 default/classic/canvas 三套构建；正式状态仍需等待 Comet 独立 Verify 与 Archive，不能提前写成已发布。
- 本地浏览器抽查已覆盖渠道、API Keys、钱包、用量日志、设置、游乐场、changelog 和三个 Coming Soon 直达路由，并完成 390×844 移动视口无横向溢出检查；该记录仍不替代线上商户支付和生产部署验收。

### 当前本机联调实例（2026-08-19）

- 已从当前分支用 Go 启动本地 API 服务，监听 `0.0.0.0:3000`。
- 当前访问地址：`http://localhost:3000`；同一局域网可用 `http://192.168.1.7:3000`。
- 使用独立 SQLite 数据库 `data/local-acceptance.db`，启动时 `/api/setup` 返回 `root_init=false`；首次访问需要在初始化向导创建本地管理员。
- 现有数据文件 `data/local-acceptance.db` 在 SQLite master `AutoMigrate` 迁移 agents 时失败，错误为 `invalid DDL, unbalanced brackets`；全新 SQLite master 可以启动，因此当前本地验收服务以 `NODE_TYPE=slave` 运行。该部署风险未归因于本次前端 change，也未宣称已修复。
- `web/default` 和 `web/classic` 已重新构建并由 Go `embed` 静态托管；健康检查 `GET /api/status` 返回 HTTP 200。
- 本机没有 Docker 和公网隧道工具，因此这只是本地联调实例，不等同于线上部署；微信/支付宝平台无法访问 `localhost` 回调，真实支付到账仍需公网 HTTPS 地址或线上环境。
- 本轮归档仍保留以下未覆盖风险：完整 `format:check` 受既有 classic Tailwind `theme.css` 依赖缺口阻塞；最终重建后的受保护视频页面尚未在已认证浏览器会话中重新打开复验；隐藏素材选择器的数据加载仍会调用 `loadAssetOptions` 和 `/api/ark_asset`，属于可另行批准的后续清理项。上述事项均未写成已修复或已线上验收。

### 仍待线上验收的已实现能力

- 微信和支付宝真实商户凭据是否能保存并用于真实下单。
- 公网 HTTPS 回调可达、回调验签、重复回调幂等、余额到账和结算日志。
- 真实微信 Native / H5 / JSAPI 及支付宝生产或沙箱支付。
- 正式服务器、域名、数据库/Redis、镜像或二进制交付、回滚路径和部署后的监控。

这些事项不是“功能没有开发”，而是当前环境没有真实商户配置和线上条件，不能在本地伪造完成结论。

## 4. 待拓展、部分实现或尚未实现的功能

### 4.1 部分实现但公开入口暂不开放

| 模块 | 当前状态 | 本轮边界 | 下一步 |
| --- | --- | --- | --- |
| 代理商 / 白标分销系统 | 已有部分代码，公开入口暂不开放 | 保留后端、管理员管理页和已激活 owner 控制台；普通用户 `/agent-apply` 显示 Coming Soon；`p1-feature-gates-native-controls` 已接受、A1-A9 全部通过并于 2026-08-19 归档 | 如需开放公开分销，另行确认租户边界、域名/证书、代理支付和线上结算 |

### 4.2 设计中，尚未写业务代码

| 模块 | 当前状态 | 设计文档 | 进入开发前提 |
| --- | --- | --- | --- |
| QQ 群机器人 | 方案设计，待评审，未实现 | `qq-bot/DESIGN.md` | 先确认 QQ 账号、NapCat/OneBot 部署、后台配置归属、积分规则和机器人权限，再决定是否实现中转站 Part A 与机器人 Part B |

### 4.3 明确搁置

- **微信订阅号验证码登录扩展**：用户已明确暂时排除微信登录功能开发。仓库中的既有微信登录能力继续保留，但早期方案中的订阅号验证码登录没有实现，也不应列入当前开发完成项。

### 4.4 已实现能力的后续增强候选

这些不是当前已批准的 Build 任务，只是后续可选方向：

- 并发统计在内存模式下增加可观测计数，或统一要求 Redis 部署后再提供实时值。
- 兜底渠道增加失败原因、命中次数、耗时和计费关联的管理端观测。
- 发票增加邮件通知、对象存储和更细的订单/金额对账；任何扩展都要保持下载鉴权和三数据库兼容。
- 支付增加线上回调告警、对账和人工补偿工具；这些属于上线运营能力，不替代当前真实商户验收。

## 5. 当前推荐顺序

1. 先完成微信/支付宝线上商户支付验收，形成订单号、回调日志、验签结果和到账日志证据。
2. 完成发布前的 GitHub 推送、PR、部署和回滚路径确认；当前仓库仍未推送、未创建 PR、未发布、未部署。
3. 若继续二开，先评审代理商/白标分销公开入口和 QQ 机器人设计模块；两者都需先冻结产品边界，再分别进入 Comet Native Build。
4. 微信登录扩展继续保持搁置，除非用户重新明确授权并重新确认范围。

## 6. 为什么此前没有把排行 / 并发 / 兜底 / 发票列入二开功能

原因是**文档分组和同步滞后，不是功能没有代码**：

- 早期二开主文档 `secondary-development-plan.md` 只围绕邀请返现、官方支付和微信登录三项原始需求编写。
- 随后“排行 / 并发 / 兜底 / 发票”被单独写入 `四需求技术方案.md`，当时这份文件是一个独立评审稿，所以没有同步回主二开清单。
- 四需求文档的标题和“评审稿，未写代码”“后端零基础”等文字保留了历史时点；后续实现已经进入代码树，但文档没有及时把状态从“设计”改成“已实现”。
- 因此，之前的主清单只反映最初三项二开需求，并不等于当前仓库的完整功能集合。

从本次文档更新起，四项功能正式归入 Torch AI 二开已开发清单；`四需求技术方案.md` 保留为历史方案与实现映射，本文作为当前二开状态总表。

## 7. 继续开发时的入口

开始下一个功能前，先阅读本文第 2、4、5 节和对应设计文档，明确它属于“已实现待线上验收”“设计中”“明确搁置”还是新的产品需求。未知代码按项目约定先用 Fast Context 定位，再用 `rg` 精确阅读；需要业务实现时由主代理先完成 Shape、范围和验收审批，再派发 Comet Native Build 任务。
