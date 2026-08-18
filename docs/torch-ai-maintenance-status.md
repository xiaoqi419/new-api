# Torch AI 维护状态

> 更新时间：2026-08-18
>
> 本文是当前代码状态的维护记录。详细设计仍以 `secondary-development-plan.md` 和 `web-default-迁移计划.md` 为参考，但这两份计划中的早期“尚未改动”描述已经过时，不能作为当前实现进度的唯一依据。

## 当前结论

- 主要二开功能已经落到 `web/default`：邀请返现、邀请中心、拼团、支付宝商户直连、微信官方支付、视频生成、素材库、渠道监控和应用内接入文档。
- 微信官方支付的代码验收已经完成，Comet change `p0-wallet-wechatpay` 已归档；Native、H5、JSAPI、二维码轮询和跳转安全均已通过本轮验收。
- 微信/支付宝真实商户收款、平台回调、公网 HTTPS、真实支付结算仍未完成。这些属于线上环境验收，不属于当前本地代码缺陷。
- 微信登录相关代码已经存在，但按照当前产品决策，暂不继续扩展微信登录功能。
- Phase 4 已完成质量门禁、跨功能回归、i18n 检查和发布前风险清单整理；A1-A7 已于 2026-08-18 通过独立 Verify，`p1-quality-regression` 已归档并合入 `codex/p0-wallet-wechatpay`（merge commit `4a79c68cd`）。

## Phase 4 当前进度（2026-08-18）

- Comet Native change `p1-quality-regression` 的 A1-A7 已通过独立 Verify并完成归档；change 分支已合入 `codex/p0-wallet-wechatpay`，尚未推送、创建 PR 或部署。
- 已修复 CI 后端构建前置条件：为 `web/dist`、`web/classic/dist` 和 `web/canvas/dist` 创建 embed placeholder，避免干净 checkout 因 ignored 前端产物缺失而无法执行 root `go build`。
- 验收候选的后端检查已通过：root 与独立 `relaykit` 的 `go vet`、build 和全量测试均通过，`service/channel_affinity_usage_cache_test.go` 的时间键碰撞与共享缓存污染已修复。后续 `p1-http2-test-stability` 已稳定 Windows raw HTTP/2 fixture，完成独立 Verify、Archive，并以 merge commit `f734ce67b` 合入 `codex/p0-wallet-wechatpay`；生产 `GetBody` 请求链路未改动。
- 本地前端检查已通过：`npx --yes bun run typecheck`、`bun test`（278 pass / 42 files）、`bun run build` 与 `bun run i18n:sync`。
- 全量前端 oxlint 仍未通过：共 1,400 errors / 383 files，其中 `web/classic` 为 1,059 errors / 236 files，`web/src` 为 341 errors / 147 files。用户已确认将该历史 lint 债务拆为独立后续 change；本轮只验收修改或直接影响的 default 文件定向 lint，不宣称全量 lint 通过。
- 当前仍不能宣称真实商户支付完成：微信/支付宝凭据、公网 HTTPS、回调验签和真实结算继续等待线上验收。
- 微信登录新增开发继续按产品决策暂时搁置，不属于本轮质量修复范围。

## P1 上线收口进度（2026-08-18）

- `p1-http2-test-stability` 的 A1-A8 已通过独立 Verify、由用户接受并完成 Archive；四个 HTTP/2 `GetBody` 用例连续十轮共 40 次执行通过，`relay/channel` 包测试与 root `GOWORK=off go test ./...` 通过。该 change 已以 merge commit `f734ce67b` 合入 `codex/p0-wallet-wechatpay`，只调整测试 fixture 生命周期，没有修改生产 HTTP 请求链路、依赖或 Go 版本。
- `p1-lint-debt` 首波的 `lint-default-layout-assets`、`lint-default-channels-pricing`、`lint-default-dashboard-models-settings`、`lint-classic-foundations` 均已通过独立 Verify、完成 Archive，并已合入 supervisor 分支。
- 已验收 child 的 owned paths 均为 0 lint errors：layout/assets 保留 2 项 warning，channels/pricing 保留 6 项 warning，dashboard/models/settings 保留 34 项 warning，classic foundations 保留 warning-only 债务；warning 专项不在本 change 范围。
- `lint-classic-topup-settings-ratio` 的 A1-A3 已通过独立 Verify、由用户接受并完成 Archive；28 个 owned files 为 0 errors、保留 105 个 warning-only diagnostics，支付轮询、订阅购买和倍率表达式同步语义保持。该 change 已以 merge commit `3c36fb607` 合入 `codex/p1-lint-debt`；真实商户凭据、回调、二维码和跳转继续等待线上验收。
- `lint-classic-users-tables` iteration 3 的 A1-A3 已通过独立 Verify：85 个 owned files 为 0 errors、330 warnings，订阅 page-size 不再额外请求套餐，usage-log tooltip 使用固定字段 identity；当前等待用户接受验收后进入 Archive。
- `lint-classic-settings-pages` iteration 2 的 A1/A3 通过、A2 未通过：`SettingsChannelAffinity` 的 `inputsRef` 未同步当前 inputs，partial options 更新可能把缺失字段回退到挂载默认值；Runtime 已返回 Build iteration 3，当前只修复该回归。
- `lint-classic-channels-models` 已提交 iteration 1 候选并进入独立 Verify；Builder 与主代理定向检查均为 0 errors，Verifier 尚未给出最终结论。
- `lint-default-user-features` 的非 Canvas owned paths 已为 0 errors，102 个相关测试与 typecheck 通过。独立 Verify 发现的 2FA 重复备用码 React key 问题已修复，等待从已归档 Canvas 基线重新同步并 Verify。
- 用户已确认当前同源 Canvas 采用可信应用模型：移除 `/canvas-app` iframe 的整个 `sandbox` 属性，以保留浏览器存储和严格同源 `postMessage` 契约并清除无效隔离配置。`p1-canvas-trusted-iframe-policy` 的 A1-A4 已通过独立 Verify、由用户接受并完成 Archive，已以 merge commit `03ee1599d` 合入 `codex/p0-wallet-wechatpay`。更强隔离需要后续将 Canvas 部署到独立 origin 并重设计通信桥，不在本轮范围。
- Canvas 决策已由 Fathom、Exa、Tavily 及 WHATWG/MDN 官方资料交叉核对；Firecrawl 当前无可用工具或 API key，此检索缺口已明确记录。
- 当前所有结果仍是本地状态；尚未推送、创建 PR 或部署。真实商户支付仍等待线上环境验收，微信登录新增开发继续搁置。

## 状态表

| 模块 | 代码状态 | 当前验收状态 | 备注 |
| --- | --- | --- | --- |
| 邀请返现 / 邀请中心 | 已实现 | 待统一回归 | 包含管理员审核发放、作废、比例和用户侧记录 |
| 拼团 | 已实现 | 待统一回归 | 用户端和管理员端均有 default 路由 |
| 支付宝商户直连 | 已实现 | 待线上商户验收 | 需要真实支付宝应用、公钥、私钥和公网回调 |
| 微信官方支付 | 已实现 | 代码验收通过，待线上商户验收 | 真实商户凭据和支付结算未在本地验证 |
| 微信登录 | 现有代码可用 | 暂不扩展 | 当前开发范围明确排除新增微信登录能力 |
| 视频生成 | 已实现 | 待统一回归 | 需要检查提交、轮询、失败和结果下载 |
| 素材库 | 已实现 | 待统一回归 | 需要检查列表、上传登记、预览和删除 |
| 渠道监控 | 已实现 | 待统一回归 | 需要检查时间范围、概览和详情钻取 |
| 应用内接入文档 | 已实现 | 待统一回归 | 包含中英内容、三级目录、示例复制和 Base URL |

## 线上支付验收待办

以下事项在获得线上环境后执行，不在本地开发阶段伪造“已完成”：

1. 管理员后台保存真实商户配置，并确认敏感字段留空不会覆盖已有值。
2. 微信商户平台配置 `/api/user/wechatpay/notify`，确认公网 HTTPS 回调可达。
3. 分别验证微信 Native、H5、JSAPI 的下单、回调验签、订单幂等和余额到账。
4. 验证支付宝正式/沙箱环境下单、回调验签、重复回调和余额到账。
5. 保留订单号、回调日志和到账日志，作为线上验收证据。

## Phase 4 剩余事项

以下事项不属于本次本地质量候选的通过条件，按已确认边界留给后续 change 或线上环境：

- 已批准建立 `p1-lint-debt` Native Supervisor change，分批清理全量 oxlint 的 1,400 项历史错误；不得关闭规则、降低错误级别、忽略目录、增加 disable 注释或修改依赖来伪造通过。
- 已批准建立 `p1-http2-test-stability` Native change，仅稳定 Windows raw HTTP/2 测试夹具；除非出现新的生产回归证据，否则不修改生产请求链路、HTTP client、依赖或 Go 版本。
- 继续保持真实微信/支付宝商户支付仅为线上验收事项，不把商户凭据、公网 HTTPS、回调或结算缺失当作本地代码缺陷。
- 继续搁置微信登录新增开发；本阶段不新增支付能力、不升级 UI 框架、依赖或数据库。

## 不在当前阶段

- 不开发新的微信登录能力。
- 不要求本地完成真实商户支付结算。
- 不修改受保护的 `new-api`、`QuantumNous` 标识。
- 不推送 GitHub、创建 PR、合并或部署，除非另行明确授权。

## 上线推进目标（2026-08-20 前）

- 本地发布阻塞项：完成 `p1-http2-test-stability`、完成 `p1-lint-debt`、通过 root/relaykit Go 门禁与前端 lint/typecheck/test/build，并形成可追溯的最终 Verify 记录。
- 执行策略：两个 change 使用独立 worktree 并行推进；子代理最多五个，模型按 Luna max → Terra xhigh → Sol high 降级，每档最多验证两次，且禁止子代理派生子代理。
- 检索策略：未知代码先用 Fast Context 定位，再用 `rg` 精确阅读；需要外部资料时使用 Fathom、Exa、Firecrawl、Tavily 交叉核验。
- 上线环境仍需在发布前确认服务器、域名、HTTPS、数据库/Redis、镜像或二进制交付方式及回滚路径。真实微信/支付宝商户凭据仍不是本地 Build 条件；没有凭据时必须保持对应支付入口关闭或明确标记未完成，不能伪造真实结算验收。
- 每次 Native Verify 接受后同步更新本文，记录通过证据、剩余风险、远端/合并/部署状态和下一目标。
