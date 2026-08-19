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
| 素材库 / 视频引用素材 | 已实现 | 本地代码验收通过，未部署 | `web/src/features/video-generation/components/reference-media-editor.tsx` 及素材 API/模型实现 |
| 渠道监控 | 已实现 | 本地代码验收通过，未部署 | `model/channel_monitor.go`、`controller/channel_monitor.go`、`web/src/features/channel-monitor/` |
| 应用内接入文档 | 已实现 | 本地代码验收通过，未部署 | `web/src/routes/docs/`、`web/src/features/docs/` |
| 用户 Token 排行与用量日志下钻 | 已实现 | 本地代码验收通过，未部署 | `controller/user_ranking.go`、`web/src/features/usage-logs/components/user-token-ranking-panel.tsx`、`web/classic/src/components/table/usage-logs/components/UserTokenRankingPanel.jsx` |
| API Key / Token 实时并发统计 | 已实现 | 本地代码验收通过；Redis 可显示实时值，内存模式只显示上限 | `service/concurrency_limiter.go`、`controller/token.go`、`router/api-router.go`、`web/src/features/keys/api.ts`、`web/classic/src/hooks/tokens/useTokensData.jsx` |
| 渠道兜底渠道与渠道自带兜底转发 | 已实现 | 本地代码验收通过，未部署 | `model/channel_cache.go`、`controller/relay.go`、`controller/channel-test.go`、`web/classic/src/components/table/channels/modals/EditChannelModal.jsx` |
| 发票申请、管理员开票和 PDF 下载 | 已实现 | 本地代码验收通过，未部署 | `model/invoice.go`、`controller/invoice.go`、`router/api-router.go`、`web/src/features/invoices/` |

### 四项功能的实现范围

1. **排行**：管理员用量记录页提供用户 Token 排行，点击用户可写入日志筛选条件并下钻查看该用户明细；后端复用 `GET /api/user_ranking/?dimension=tokens`。
2. **并发**：`GET /api/token/concurrency` 返回当前用户令牌的 `in_use`、`max` 和 `supported`。Redis 模式通过 ZSET 清理过期项后读取实时占用；内存信号量无法提供实时读数，因此前端明确降级为只显示上限。
3. **兜底**：渠道编辑页可配置备用 Base URL、Key 和模型。渠道选择把兜底渠道放在独立的最低重试档位；本渠道可重试错误还可以触发一次渠道自带兜底转发，并避免递归兜底。
4. **发票**：用户只能选择已支付且尚未被有效发票占用的订单提交申请；管理员按权限分页查看、上传 PDF 开票或驳回；下载接口校验用户归属并使用安全文件名拼接。

## 3. 本地验收与上线状态

### 已完成的本地工程门禁

- `web` lint：0 errors、1,682 warnings；warnings 是历史 warning-only 债务。
- `web` 测试：281 pass、0 fail，45 个文件。
- `web` typecheck、`web` build、`web/classic` build：均通过。
- root 与独立 `relaykit` 的 Go vet、build 和全量测试：均有通过记录。
- `p1-quality-regression`、`p1-http2-test-stability`、`p1-lint-debt`：均完成独立 Verify、Archive，并在本地合入 `codex/p0-wallet-wechatpay`。

### 仍待线上验收的已实现能力

- 微信和支付宝真实商户凭据是否能保存并用于真实下单。
- 公网 HTTPS 回调可达、回调验签、重复回调幂等、余额到账和结算日志。
- 真实微信 Native / H5 / JSAPI 及支付宝生产或沙箱支付。
- 正式服务器、域名、数据库/Redis、镜像或二进制交付、回滚路径和部署后的监控。

这些事项不是“功能没有开发”，而是当前环境没有真实商户配置和线上条件，不能在本地伪造完成结论。

## 4. 待拓展或尚未实现的功能

### 4.1 设计中，尚未写业务代码

| 模块 | 当前状态 | 设计文档 | 进入开发前提 |
| --- | --- | --- | --- |
| 代理商 / 白标分销系统 | 设计中，未实现 | `design/agent-reseller-spec.md` | 重新确认分销结算、租户边界、域名/证书、代理支付和多租户安全范围后再拆分 Build 任务 |
| QQ 群机器人 | 方案设计，待评审，未实现 | `qq-bot/DESIGN.md` | 先确认 QQ 账号、NapCat/OneBot 部署、后台配置归属、积分规则和机器人权限，再决定是否实现中转站 Part A 与机器人 Part B |

### 4.2 明确搁置

- **微信订阅号验证码登录扩展**：用户已明确暂时排除微信登录功能开发。仓库中的既有微信登录能力继续保留，但早期方案中的订阅号验证码登录没有实现，也不应列入当前开发完成项。

### 4.3 已实现能力的后续增强候选

这些不是当前已批准的 Build 任务，只是后续可选方向：

- 并发统计在内存模式下增加可观测计数，或统一要求 Redis 部署后再提供实时值。
- 兜底渠道增加失败原因、命中次数、耗时和计费关联的管理端观测。
- 发票增加邮件通知、对象存储和更细的订单/金额对账；任何扩展都要保持下载鉴权和三数据库兼容。
- 支付增加线上回调告警、对账和人工补偿工具；这些属于上线运营能力，不替代当前真实商户验收。

## 5. 当前推荐顺序

1. 先完成微信/支付宝线上商户支付验收，形成订单号、回调日志、验签结果和到账日志证据。
2. 完成发布前的 GitHub 推送、PR、部署和回滚路径确认；当前仓库仍未推送、未创建 PR、未发布、未部署。
3. 若继续二开，优先评审代理商/白标分销和 QQ 机器人两个设计模块，先冻结产品边界，再分别进入 Comet Native Build。
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
