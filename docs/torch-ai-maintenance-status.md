# Torch AI 维护状态

> 更新时间：2026-08-19
>
> 本文是当前代码状态的维护记录。详细设计仍以 `secondary-development-plan.md` 和 `web-default-迁移计划.md` 为参考，但这两份计划中的早期“尚未改动”描述已经过时，不能作为当前实现进度的唯一依据。

## 当前结论

- 主要二开功能已经落到 `web/default`：邀请返现、邀请中心、拼团、支付宝商户直连、微信官方支付、视频生成、素材库、渠道监控和应用内接入文档；这些功能已通过 `p1-quality-regression` 的本地关键路径、路由权限和相关测试验收，不再标记为“待统一回归”。
- 微信官方支付的代码验收已经完成，Comet change `p0-wallet-wechatpay` 已归档；Native、H5、JSAPI、二维码轮询和跳转安全均已通过本轮验收。
- 微信/支付宝真实商户收款、平台回调、公网 HTTPS、真实支付结算仍未完成。这些属于线上环境验收，不属于当前本地代码缺陷。
- 微信登录相关代码已经存在，但按照当前产品决策，暂不继续扩展微信登录功能。
- Phase 4 已完成质量门禁、跨功能回归、i18n 检查和发布前风险清单整理；A1-A7 已于 2026-08-18 通过独立 Verify，`p1-quality-regression` 已归档并合入 `codex/p0-wallet-wechatpay`（merge commit `4a79c68cd`）。
- 当前本地前端发布门禁已在 `lint-final-gates` child 分支完成：全量 lint、测试、类型检查和两套前端构建均通过；结果仍需由 `p1-lint-debt` Supervisor 独立 Verify 并合入后续目标。

## 最终前端门禁记录（2026-08-19）

- `web`：`npx --yes bun run lint` 退出码 0，0 errors、1,682 warnings。warnings 为历史 warning-only 债务，本 child 未专项清理。
- `web`：`npx --yes bun test` 退出码 0，281 pass、0 fail，45 个文件。
- `web`：`npx --yes bun run typecheck` 退出码 0。
- `web`：`npx --yes bun run build` 退出码 0。
- `web/classic`：`npx --yes bun run build` 退出码 0。
- 为清除全量 oxlint 唯一残余 error，`web/classic/.prettierrc.mjs` 将等价的 CommonJS `require` 配置改为 ESM default import/export；该文件属于规格允许的“当前 error 明确要求”范围。未修改 package、lock、依赖、脚本或框架版本。
- 相对 `codex/p0-wallet-wechatpay` 的 `web/.oxlintrc.json` diff 仅保留已批准的四个管理员受信任 iframe 文件级 `react/iframe-missing-sandbox: off` override；既有 Canvas override 未变，未扩大 ignore、降低规则级别或新增 lint-disable。
- 以上结果来自本地 `codex/lint-final-gates` child worktree；尚未推送、创建 PR、合并到 `codex/p1-lint-debt`、合入发布目标或部署。下一步由 Supervisor 完成独立 Verify、Archive 与本地合并流程。
- 微信/支付宝真实商户凭据、公网 HTTPS 回调、真实下单与结算仍待线上环境验收；微信登录新增开发继续按产品决策搁置。
- 四个管理员可配置外部 iframe 继续采用已确认的受信任集成模型，以保留脚本、同源存储、Cookie、OAuth、表单、弹窗和媒体能力；管理员配置或账户失陷时仍存在 URL 注入 API key 暴露和 iframe 权限滥用的 residual risk。通用 `WebPreviewBody` 仍保留 scripts/forms/popups/presentation，并移除 `allow-same-origin` 以使用 opaque origin。

## Phase 4 当前进度（2026-08-18）

- Comet Native change `p1-quality-regression` 的 A1-A7 已通过独立 Verify并完成归档；change 分支已合入 `codex/p0-wallet-wechatpay`，尚未推送、创建 PR 或部署。
- 已修复 CI 后端构建前置条件：为 `web/dist`、`web/classic/dist` 和 `web/canvas/dist` 创建 embed placeholder，避免干净 checkout 因 ignored 前端产物缺失而无法执行 root `go build`。
- 验收候选的后端检查已通过：root 与独立 `relaykit` 的 `go vet`、build 和全量测试均通过，`service/channel_affinity_usage_cache_test.go` 的时间键碰撞与共享缓存污染已修复。后续 `p1-http2-test-stability` 已稳定 Windows raw HTTP/2 fixture，完成独立 Verify、Archive，并以 merge commit `f734ce67b` 合入 `codex/p0-wallet-wechatpay`；生产 `GetBody` 请求链路未改动。
- 本地前端检查已通过：最终 child 的 `npx --yes bun run typecheck`、`npx --yes bun test`（281 pass / 45 files）、`npx --yes bun run build` 与 `web/classic` build 均通过。
- 全量前端 oxlint 已在最终 child 收口：`npx --yes bun run lint` 为 0 errors、1,682 warnings；warnings 仍是历史 warning-only 债务，本阶段不专项清理。
- 当前仍不能宣称真实商户支付完成：微信/支付宝凭据、公网 HTTPS、回调验签和真实结算继续等待线上验收。
- 微信登录新增开发继续按产品决策暂时搁置，不属于本轮质量修复范围。

## P1 上线收口进度（2026-08-18）

- `p1-http2-test-stability` 的 A1-A8 已通过独立 Verify、由用户接受并完成 Archive；四个 HTTP/2 `GetBody` 用例连续十轮共 40 次执行通过，`relay/channel` 包测试与 root `GOWORK=off go test ./...` 通过。该 change 已以 merge commit `f734ce67b` 合入 `codex/p0-wallet-wechatpay`，只调整测试 fixture 生命周期，没有修改生产 HTTP 请求链路、依赖或 Go 版本。
- `p1-lint-debt` 首波的 `lint-default-layout-assets`、`lint-default-channels-pricing`、`lint-default-dashboard-models-settings`、`lint-classic-foundations` 均已通过独立 Verify、完成 Archive，并已合入 supervisor 分支。
- 已验收 child 的 owned paths 均为 0 lint errors：layout/assets 保留 2 项 warning，channels/pricing 保留 6 项 warning，dashboard/models/settings 保留 34 项 warning，classic foundations 保留 warning-only 债务；warning 专项不在本 change 范围。
- `lint-classic-topup-settings-ratio` 的 A1-A3 已通过独立 Verify、由用户接受并完成 Archive；28 个 owned files 为 0 errors、保留 105 个 warning-only diagnostics，支付轮询、订阅购买和倍率表达式同步语义保持。该 change 已以 merge commit `3c36fb607` 合入 `codex/p1-lint-debt`；真实商户凭据、回调、二维码和跳转继续等待线上验收。
- `lint-classic-users-tables` iteration 3 的 A1-A3 已通过独立 Verify、由用户接受并完成 Archive；85 个 owned files 为 0 errors、330 warnings，订阅 page-size 不再额外请求套餐，usage-log tooltip 使用固定字段 identity。该 change 已以 merge commit `c3f088c2c` 合入 `codex/p1-lint-debt`。
- `lint-classic-settings-pages` iteration 3 的 A1-A3 已通过独立 Verify、由用户接受并完成 Archive；62 个 owned files 为 0 errors、399 warnings，`SettingsChannelAffinity` 已在 render 时同步当前 inputs，partial options 不再把缺失字段回退到挂载默认值，前两轮的预览、重复项和 localStorage 时序修复保持。该 change 已以 merge commit `901aea5ff` 合入 `codex/p1-lint-debt`。
- `lint-classic-channels-models` iteration 1 的 A1-A3 已通过独立 Verify、由用户接受并完成 Archive；98 个 owned files 为 0 errors、298 warnings，日志 modal、API 刷新 identity、单次错误提示与 Promise 传播、模型保存、部署操作和价格筛选语义保持。该 change 已以 merge commit `964c306bd` 合入 `codex/p1-lint-debt`。
- `lint-default-user-features` 的 A1-A3 已通过独立 Verify并完成 Archive：12 个 owned feature 目录为 0 errors、保留 9 项 warning-only diagnostics，18 个测试文件共 102/102 tests 通过，frontend typecheck 通过。2FA 重复备用码使用“值 + 出现次数”的稳定 identity，Canvas 保持已批准的可信同源基线；Archive commit 为 `2040c8c878f3f5d26b2624f3e8e78566532ede15`，随后以 merge commit `b3cac10e62156d003a3049f0ab2928565d8b8416` 合入 `codex/p1-lint-debt`。
- 用户已确认当前同源 Canvas 采用可信应用模型：移除 `/canvas-app` iframe 的整个 `sandbox` 属性，以保留浏览器存储和严格同源 `postMessage` 契约并清除无效隔离配置。`p1-canvas-trusted-iframe-policy` 的 A1-A4 已通过独立 Verify、由用户接受并完成 Archive，已以 merge commit `03ee1599d` 合入 `codex/p0-wallet-wechatpay`。更强隔离需要后续将 Canvas 部署到独立 origin 并重设计通信桥，不在本轮范围。
- Canvas 决策已由 Fathom、Exa、Tavily 及 WHATWG/MDN 官方资料交叉核对；Firecrawl 当前无可用工具或 API key，此检索缺口已明确记录。
- `p1-lint-debt` 当前共有 12 个 child：代码 child 已完成，`lint-final-gates` 已完成本地 Build 门禁并等待 Supervisor Verify。`lint-classic-common-pages` 涉及外部或管理员可配置 iframe 的既有安全边界；在没有新的产品/安全决策前，不通过随意添加 `sandbox` 或 lint override 伪造通过。
- 当前所有结果仍是本地状态；尚未推送、创建 PR 或部署。真实商户支付仍等待线上环境验收，微信登录新增开发继续搁置。

## 状态表

| 模块 | 代码状态 | 当前验收状态 | 备注 |
| --- | --- | --- | --- |
| 邀请返现 / 邀请中心 | 已实现 | 本地代码验收通过，未部署 | 包含管理员审核发放、作废、比例和用户侧记录；关键路径、权限和相关测试已通过 |
| 拼团 | 已实现 | 本地代码验收通过，未部署 | 用户端和管理员端均有 default 路由；开团、参团、取消、结算/退款边界已纳入回归 |
| 支付宝商户直连 | 已实现 | 本地代码验收通过，待线上商户验收 | 需要真实支付宝应用、公钥、私钥、公网回调和实际结算证据 |
| 微信官方支付 | 已实现 | 代码验收通过，待线上商户验收 | 真实商户凭据和支付结算未在本地验证 |
| 微信登录 | 现有代码可用 | 暂不扩展 | 当前开发范围明确排除新增微信登录能力 |
| 视频生成 | 已实现 | 本地代码验收通过，未部署 | 提交、轮询、失败处理和视频/素材引用已纳入回归 |
| 素材库 | 已实现 | 本地代码验收通过，未部署 | 素材归属、引用和删除边界已纳入回归 |
| 渠道监控 | 已实现 | 本地代码验收通过，未部署 | 概览、详情、缺失数据与访问权限已纳入回归 |
| 应用内接入文档 | 已实现 | 本地代码验收通过，未部署 | `/docs` 公开路由、语言、Base URL 与示例边界已纳入回归 |

## 当前未完成项

### 尚未完成或明确搁置的功能

- **微信订阅号验证码登录扩展**：早期计划中的内置订阅号验证码登录未继续推进；这是当前唯一明确处于“二开功能未完成/搁置”状态的业务能力。现有微信登录代码保留，不等于已实现早期计划中的新增订阅号流程。
- 除微信登录扩展外，当前维护范围内列出的邀请返现、邀请中心、拼团、支付宝商户直连、微信官方支付、视频生成、素材库、渠道监控和应用内接入文档均已有实现，并已通过本地质量回归；它们的剩余工作属于线上验收、发布收口或后续增强，不应再描述为“功能尚未开发”。

### 已实现但仍未完成上线闭环

- **真实商户支付验收**：微信/支付宝真实凭据、客户端下单、公网 HTTPS 回调、验签、重复回调幂等、余额到账和真实结算证据只能在线上环境完成。
- **全量 lint 收口**：`lint-final-gates` 已在 child worktree 完成全量 lint、tests、typecheck 和两套前端 build；仍需 Supervisor 独立 Verify、Archive 并合入，warnings 不在本阶段专项清理。
- **发布与部署**：当前 lint supervisor 分支只完成本地 child merge，尚未推送、创建 PR、合入发布目标、打标签、发布或部署；服务器、域名、HTTPS、数据库/Redis、交付方式和回滚路径也仍需上线前确认。

## 线上支付验收待办

以下事项在获得线上环境后执行，不在本地开发阶段伪造“已完成”：

1. 管理员后台保存真实商户配置，并确认敏感字段留空不会覆盖已有值。
2. 微信商户平台配置 `/api/user/wechatpay/notify`，确认公网 HTTPS 回调可达。
3. 分别验证微信 Native、H5、JSAPI 的下单、回调验签、订单幂等和余额到账。
4. 验证支付宝正式/沙箱环境下单、回调验签、重复回调和余额到账。
5. 保留订单号、回调日志和到账日志，作为线上验收证据。

## 当前工程剩余事项

以下事项按已确认边界继续推进：

- `p1-http2-test-stability` 已完成，不再是剩余项；继续保持其生产 `GetBody` 请求链路未改动的边界。
- 继续完成 `p1-lint-debt`：`lint-final-gates` child 的本地门禁已完成，下一步执行 Supervisor 独立 Verify、Archive 和本地合并。
- 最终门禁必须如实记录全量 oxlint error/warning 数量，并运行 `web` 的 lint、tests、typecheck、build 以及 `web/classic` build；不得关闭规则、降低错误级别、扩大 ignore、增加 disable 注释或修改依赖来伪造通过。
- 继续保持真实微信/支付宝商户支付仅为线上验收事项，不把商户凭据、公网 HTTPS、回调或结算缺失当作本地代码缺陷。
- 继续搁置微信登录新增开发；本阶段不新增支付能力、不升级 UI 框架、依赖或数据库。

## 不在当前阶段

- 不开发新的微信登录能力。
- 不要求本地完成真实商户支付结算。
- 不修改受保护的 `new-api`、`QuantumNous` 标识。
- 本轮只执行已获授权的本地 child → supervisor 合并；不推送 GitHub、不创建 PR、不合入发布目标或部署，除非另行明确授权。

## 上线推进目标（2026-08-20 前）

- 本地发布阻塞项：完成 `p1-lint-debt` Supervisor 对最终 child 的独立 Verify、Archive 和本地合并，并形成可追溯的 supervisor Verify 记录。最终前端 lint/typecheck/test/build 已在 child worktree 通过；`p1-http2-test-stability` 与 root/relaykit Go 门禁已经完成。
- 执行策略：独立 owned paths 可以并行推进；子代理最多五个，模型按 Luna max → Terra xhigh → Sol high 降级，每档最多验证两次，且禁止子代理派生子代理。
- 检索策略：未知代码先用 Fast Context 定位，再用 `rg` 精确阅读；需要外部资料时使用 Fathom、Exa、Firecrawl、Tavily 交叉核验。
- 上线环境仍需在发布前确认服务器、域名、HTTPS、数据库/Redis、镜像或二进制交付方式及回滚路径。真实微信/支付宝商户凭据仍不是本地 Build 条件；没有凭据时必须保持对应支付入口关闭或明确标记未完成，不能伪造真实结算验收。
- 每次 Native Verify 接受后同步更新本文，记录通过证据、剩余风险、远端/合并/部署状态和下一目标。
