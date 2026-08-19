# Torch AI 维护状态

> 更新时间：2026-08-19
>
> 本文是当前代码状态的维护记录。二开功能总表见 [`torch-ai-second-development-status.md`](torch-ai-second-development-status.md)；详细设计仍以 `secondary-development-plan.md`、`四需求技术方案.md` 和 `web-default-迁移计划.md` 为参考，但这些文档中的早期“尚未改动”描述已经过时，不能作为当前实现进度的唯一依据。

## 当前结论

- 主要二开功能已经落到 `web/default`：邀请返现、邀请中心、拼团、支付宝商户直连、微信官方支付、视频生成、素材库、渠道监控和应用内接入文档；这些功能已通过 `p1-quality-regression` 的本地关键路径、路由权限和相关测试验收，不再标记为“待统一回归”。
- 四需求技术方案中的用户 Token 排行、API Key/Token 实时并发统计、渠道兜底渠道和发票申请/开票也已经落到当前代码树；它们从本次维护起正式纳入 Torch AI 二开功能清单，详细证据见 [`torch-ai-second-development-status.md`](torch-ai-second-development-status.md)。
- 微信官方支付的代码验收已经完成，Comet change `p0-wallet-wechatpay` 已归档；Native、H5、JSAPI、二维码轮询和跳转安全均已通过本轮验收。
- 微信/支付宝真实商户收款、平台回调、公网 HTTPS、真实支付结算仍未完成。这些属于线上环境验收，不属于当前本地代码缺陷。
- 微信登录相关代码已经存在，但按照当前产品决策，暂不继续扩展微信登录功能。
- Phase 4 已完成质量门禁、跨功能回归、i18n 检查和发布前风险清单整理；A1-A7 已于 2026-08-18 通过独立 Verify，`p1-quality-regression` 已归档并合入 `codex/p0-wallet-wechatpay`（merge commit `4a79c68cd`）。
- 当前本地前端发布门禁已经完成：`lint-final-gates` child 的全量 lint、测试、类型检查和两套前端构建均通过，并以 merge commit `7741f2004` 合入 `codex/p1-lint-debt`；`p1-lint-debt` Supervisor 的 A1-A11 随后通过独立 Terra/xhigh Verify、完成 Archive，并以 merge commit `1e2efa3a2` 本地合入 `codex/p0-wallet-wechatpay`。
- 已启动本机联调实例：Go API 监听 `0.0.0.0:3000`，使用独立 SQLite `data/local-acceptance.db`，`http://localhost:3000` 和局域网 `http://192.168.1.7:3000` 可访问；这不等同于生产部署。
- 现有数据文件 `data/local-acceptance.db` 在 SQLite master `AutoMigrate` 迁移 agents 时失败，错误为 `invalid DDL, unbalanced brackets`；全新 SQLite master 可以启动，因此当前本地验收服务以 `NODE_TYPE=slave` 运行。该部署风险未归因于本次前端 change，也未宣称已修复。
- Comet Native change `p1-feature-gates-native-controls` 已接受：A1-A9 全部通过，迭代 2 独立 Verify 通过；已于 2026-08-19 归档，归档目录为 `docs/comet/archive/2026-08-19-p1-feature-gates-native-controls/`。该 change 保持普通用户的「无限画布」「素材库」「成为代理」公开入口屏蔽，代理后端、管理员管理页和已激活 owner 控制台保留；迭代 1 的 A7 仅因维护文档生命周期表述过时退回，已在迭代 2 修正。本地接受或归档不代表已部署或已完成线上验收。
- 仍存本地验收范围之外的风险：完整 `format:check` 受既有 classic Tailwind `theme.css` 依赖缺口阻塞；最终重建后的受保护视频页面尚未在已认证浏览器会话中重新打开复验；隐藏素材选择器的数据加载仍会调用 `loadAssetOptions` 和 `/api/ark_asset`，属于可另行批准的清理项。上述事项均未写成已修复。
- Comet Native change `upstream-rc25-sync` 已完成 Build 候选：以 Torch AI 基线 `60e2775e3` 和官方 `v1.0.0-rc.25` / `f11641428` 为输入，39 个官方提交、207 个文件差异已经完成三方合并，27 个预测冲突路径已逐组处理；当前仍在 Build，尚未进入 Verify/Archive。
- rc.25 同步保留 Torch AI 的支付、拼团、返现、视频、素材库、无限画布、渠道监控、排行、实时并发、渠道兜底、发票、代理/白标和入口屏蔽策略，同时进入官方额度原子预扣、充值/订阅并发保护、OAuth、渠道测试、高级自定义渠道、Claude/Responses relay 修复和 Vitest 测试基础设施。
- 下一独立 change 目标为“Figma 首页与全局主题改造”。当前 `upstream-rc25-sync` change 不包含首页或全局主题改造；该目标需另行建立 change 并重新确认范围与验收。

## 最终前端门禁记录（2026-08-19）

- `web`：`npx --yes bun run lint` 退出码 0，0 errors、1,682 warnings。warnings 为历史 warning-only 债务，本 child 未专项清理。
- `web`：`npx --yes bun test` 退出码 0，281 pass、0 fail，45 个文件。
- `web`：`npx --yes bun run typecheck` 退出码 0。
- `web`：`npx --yes bun run build` 退出码 0。
- `web/classic`：`npx --yes bun run build` 退出码 0。
- `web`：rc.25 合并后的 `npx --yes bun run test` 退出码 0，53 个测试文件、310 个测试全部通过；旧 `node:test` 测试已迁移到 Vitest，API Key Auto Group 抽屉和 lazy CodeMirror 测试已修复。
- `web`：`npx --yes bun run typecheck` 退出码 0；受影响 keys、CodeMirror 和测试文件的 oxlint/oxfmt 均通过。
- 为清除全量 oxlint 唯一残余 error，`web/classic/.prettierrc.mjs` 将等价的 CommonJS `require` 配置改为 ESM default import/export；该文件属于规格允许的“当前 error 明确要求”范围。未修改 package、lock、依赖、脚本或框架版本。
- 相对 `codex/p0-wallet-wechatpay` 的 `web/.oxlintrc.json` diff 仅保留已批准的四个管理员受信任 iframe 文件级 `react/iframe-missing-sandbox: off` override；既有 Canvas override 未变，未扩大 ignore、降低规则级别或新增 lint-disable。
- 以上结果先在本地 `codex/lint-final-gates` child worktree 形成，并以 merge commit `7741f2004` 合入 `codex/p1-lint-debt`；Supervisor A1-A11 已通过独立 Terra/xhigh Verify、完成 Archive，并以 merge commit `1e2efa3a2` 本地合入 `codex/p0-wallet-wechatpay`。当前仍未推送、创建 PR、发布或部署。
- 微信/支付宝真实商户凭据、公网 HTTPS 回调、真实下单与结算仍待线上环境验收；微信登录新增开发继续按产品决策搁置。
- 本机联调只能验证初始化、管理员支付配置、下单请求和前端轮询；微信/支付宝平台不能访问 localhost 回调，真实到账验收仍需公网 HTTPS 或线上环境。
- 四个管理员可配置外部 iframe 继续采用已确认的受信任集成模型，以保留脚本、同源存储、Cookie、OAuth、表单、弹窗和媒体能力；管理员配置或账户失陷时仍存在 URL 注入 API key 暴露和 iframe 权限滥用的 residual risk。通用 `WebPreviewBody` 仍保留 scripts/forms/popups/presentation，并移除 `allow-same-origin` 以使用 opaque origin。
- rc.25 同步的真实商户支付仍未线上验收：微信/支付宝凭据、公网 HTTPS 回调、平台验签、真实到账和结算必须在线上环境完成；本地 `localhost` 联调不构成支付完成。
- 当前 Build 候选尚未创建 merge commit、推送、PR、发布或部署；下一步由 Comet Runtime 进入 Verify，逐项验收 A1-A13，Verify 通过后再按 Runtime 指示 Archive。

## rc.25 同步 Build 证据（2026-08-19）

- Git 输入：Torch AI `60e2775e3163a2052d7c6f15626c7619cf6cb8a7`，官方 `v1.0.0-rc.25` / `f116414284162ad15d8925f7bca494c109b83e93`，共同基线 `v1.0.0-rc.24` / `5c3abffe8572aa8a49f15c3916707d2019d66af4`；27 个预测冲突路径已解决，`git diff --name-only --diff-filter=U` 和 `git diff --cached --check` 均为空。
- 冲突审查覆盖充值/订阅/退款/代理结算、Token/OAuth、渠道测试与高级自定义渠道、Relay/Claude/Responses、动态计费、API Keys/Auto Group、游乐场、七语言包和前端测试基础设施；充值仍保留默认单笔最高 `500` 的 Torch AI 产品口径。
- root Go：`go test ./...`、`go vet ./...`、`go build ./...` 通过；受影响的 `controller`、`model`、`service`、`relay/...`、`router` 定向测试通过。
- 独立 `relaykit`：`GOWORK=off go build ./...` 与 `GOWORK=off go test ./...` 通过，未引入根模块依赖。
- 前端：`npx --yes bun run test` 为 53 files / 310 tests 全部通过；`npx --yes bun run typecheck` 通过；全量 lint 为 0 errors / 1,681 warnings，warning-only 历史债务不在本 change 清理范围。
- 构建：default、classic、canvas 三套前端生产构建通过；Canvas 仍有既有动态/静态混合导入和大 chunk warning，未伪装为已优化。
- i18n：七个 locale 的键集合均为 6,296，`missing=0`、`extra=0`；同步工具清理了合并产生的重复 JSON key。
- 执行代理模型按项目策略尝试：Luna/max 在确认请求模型正确后，每组最多两次均返回 `503 No available channel`，五组共十次；随后 Terra/xhigh 完成冲突实现，最后 Sol/high 完成前端测试收口。模型降级未改变产品、API、依赖或验收范围。
- 浏览器：使用候选提交构建产物、独立临时 SQLite 和本地测试管理员登录后，桌面端抽查渠道、API Keys、钱包、用量日志、系统设置、游乐场和 changelog 均正常渲染、关键按钮存在且无控制台 error；`/asset-library`、`/canvas`、`/agent-apply` 均显示 Coming Soon。390×844 移动视口复查 API Keys、钱包、设置、游乐场、changelog 和受限页，`document.scrollWidth=390`、主内容宽度为 390，没有横向溢出。
- 浏览器验收使用临时本地账户和临时数据库，不包含生产数据或真实商户凭据；既有 SQLite 验收库重启迁移风险仍保留为已知限制。

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
- `p1-lint-debt` 的 13 个 child 均已完成独立 Verify、Archive 并合入 Supervisor；其中 `lint-final-gates` 以 merge commit `7741f2004` 合入，`lint-supervisor-evidence-repair` 只修复 Supervisor 维护文档合并状态和并发证据留档。Supervisor A1-A11 最终全部通过并归档，归档产物位于 `docs/comet/archive/2026-08-19-p1-lint-debt/`，随后以 merge commit `1e2efa3a2` 本地合入 `codex/p0-wallet-wechatpay`。`lint-classic-common-pages` 涉及外部或管理员可配置 iframe 的既有安全边界；在没有新的产品/安全决策前，不通过随意添加 `sandbox` 或 lint override 伪造通过。
- 当前结果仍是本地状态；尚未推送、创建 PR、发布或部署。真实商户支付仍等待线上环境验收，微信登录新增开发继续搁置。

## 状态表

| 模块 | 代码状态 | 当前验收状态 | 备注 |
| --- | --- | --- | --- |
| 邀请返现 / 邀请中心 | 已实现 | 本地代码验收通过，未部署 | 包含管理员审核发放、作废、比例和用户侧记录；关键路径、权限和相关测试已通过 |
| 拼团 | 已实现 | 本地代码验收通过，未部署 | 用户端和管理员端均有 default 路由；开团、参团、取消、结算/退款边界已纳入回归 |
| 支付宝商户直连 | 已实现 | 本地代码验收通过，待线上商户验收 | 需要真实支付宝应用、公钥、私钥、公网回调和实际结算证据 |
| 微信官方支付 | 已实现 | 代码验收通过，待线上商户验收 | 真实商户凭据和支付结算未在本地验证 |
| 微信登录 | 现有代码可用 | 暂不扩展 | 当前开发范围明确排除新增微信登录能力 |
| 视频生成 | 已实现 | 本地代码验收通过，未部署 | 提交、轮询、失败处理和视频/素材引用已纳入回归 |
| 素材库 | 已实现，公开入口暂不开放 | `p1-feature-gates-native-controls` 已接受；A1-A9 全部通过，迭代 2 独立 Verify 通过并于 2026-08-19 归档 | 素材归属、引用和删除边界保留；视频页隐藏素材选择器，手工 `asset://` 兼容 |
| 无限画布 | 已有代码，公开入口暂不开放 | `p1-feature-gates-native-controls` 已接受；A1-A9 全部通过，迭代 2 独立 Verify 通过并于 2026-08-19 归档 | 路由保留并显示 Coming Soon；不删除画布代码或历史数据 |
| 代理商 / 白标分销 | 部分实现，公开申请入口暂不开放 | `p1-feature-gates-native-controls` 已接受；A1-A9 全部通过，迭代 2 独立 Verify 通过并于 2026-08-19 归档 | 后端、管理员管理页和已激活 owner 控制台保留；完整公开分销闭环尚未验收 |
| 渠道监控 | 已实现 | 本地代码验收通过，未部署 | 概览、详情、缺失数据与访问权限已纳入回归 |
| 应用内接入文档 | 已实现 | 本地代码验收通过，未部署 | `/docs` 公开路由、语言、Base URL 与示例边界已纳入回归 |
| 用户 Token 排行 / 用量日志下钻 | 已实现 | 本地代码验收通过，未部署 | default 与 classic 均有排行面板；复用 `user_ranking` 并写入用户名筛选 |
| API Key / Token 实时并发统计 | 已实现 | 本地代码验收通过，Redis 可实时读取 | `GET /api/token/concurrency`；内存模式明确降级为只显示上限 |
| 渠道兜底渠道 / 自带兜底转发 | 已实现 | 本地代码验收通过，未部署 | 渠道 Setting、重试档位和 relay 兜底转发均已实现 |
| 发票申请 / 管理员开票 / PDF 下载 | 已实现 | 本地代码验收通过，未部署 | 用户订单占用校验、管理员 issue/reject、归属鉴权下载均已实现 |

## 当前未完成项

### 尚未完成或明确搁置的功能

- **微信订阅号验证码登录扩展**：早期计划中的内置订阅号验证码登录未继续推进，属于明确搁置；现有微信登录代码保留，不等于已实现早期计划中的新增订阅号流程。
- **代理商 / 白标分销公开入口**：已有部分后端、管理员管理页和代理 owner 控制台代码，但普通用户申请入口暂不开放。`p1-feature-gates-native-controls` 已接受，A1-A9 全部通过，迭代 2 独立 Verify 通过并于 2026-08-19 归档；不能写成完全未实现，也不能写成公开功能已交付。
- 除微信登录扩展外，当前维护范围内列出的邀请返现、邀请中心、拼团、支付宝商户直连、微信官方支付、视频生成、素材库、渠道监控和应用内接入文档均已有实现，并已通过本地质量回归；它们的剩余工作属于线上验收、发布收口或后续增强，不应再描述为“功能尚未开发”。
- 同样，排行、并发、兜底和发票已经有实现；它们的剩余工作属于线上发布、运行环境差异或后续增强，不应再描述为“设计稿未开发”。

### 后续拓展与尚未完成的模块

- **代理商 / 白标分销系统**：当前已有部分后端、管理端和代理 owner 控制台代码，但普通用户「成为代理」公开入口暂不开放；`p1-feature-gates-native-controls` 已接受，A1-A9 全部通过，迭代 2 独立 Verify 通过并于 2026-08-19 归档；完整分销结算、多租户和白标上线仍需另行验收。
- **QQ 群机器人**：`qq-bot/DESIGN.md` 仍是方案设计、待评审，未写业务代码。

### 已实现但仍未完成上线闭环

- **真实商户支付验收**：微信/支付宝真实凭据、客户端下单、公网 HTTPS 回调、验签、重复回调幂等、余额到账和真实结算证据只能在线上环境完成。
- **全量 lint 收口**：`p1-lint-debt` 已完成 Supervisor 独立 Verify、Archive 和本地目标分支合并；全量 lint 为 0 errors，1,682 warnings 仍是非阻塞的历史 warning-only 债务，不在本阶段专项清理。
- **发布与部署**：lint Supervisor 已本地合入 `codex/p0-wallet-wechatpay`，但尚未推送、创建 PR、合入远端发布分支、打标签、发布或部署；服务器、域名、HTTPS、数据库/Redis、交付方式和回滚路径也仍需上线前确认。

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
- `p1-lint-debt` 已完成，不再是本地工程剩余项：13 个 child 和 Supervisor 均已独立 Verify、Archive，Supervisor 已本地合入 `codex/p0-wallet-wechatpay`。
- 最终门禁必须如实记录全量 oxlint error/warning 数量，并运行 `web` 的 lint、tests、typecheck、build 以及 `web/classic` build；不得关闭规则、降低错误级别、扩大 ignore、增加 disable 注释或修改依赖来伪造通过。
- 继续保持真实微信/支付宝商户支付仅为线上验收事项，不把商户凭据、公网 HTTPS、回调或结算缺失当作本地代码缺陷。
- 继续搁置微信登录新增开发；本阶段不新增支付能力、不升级 UI 框架、依赖或数据库。

## 不在当前阶段

- 不开发新的微信登录能力。
- 不要求本地完成真实商户支付结算。
- 不修改受保护的 `new-api`、`QuantumNous` 标识。
- 本轮已按授权完成本地 child → Supervisor → `codex/p0-wallet-wechatpay` 合并；不推送 GitHub、不创建 PR、不发布或部署，除非另行明确授权。

## 上线推进目标（2026-08-20 前）

- 本地发布阻塞项已收口：`p1-lint-debt` Supervisor 的 evidence repair、独立 Verify、Archive 和本地目标分支合并均已完成，并形成可追溯的 Supervisor Verify 记录。最终前端 lint/typecheck/test/build、`p1-http2-test-stability` 与 root/relaykit Go 门禁均已有通过证据。
- 执行策略：独立 owned paths 可以并行推进；子代理最多五个，模型按 Luna max → Terra xhigh → Sol high 降级，每档最多验证两次，且禁止子代理派生子代理。
- 检索策略：未知代码先用 Fast Context 定位，再用 `rg` 精确阅读；需要外部资料时使用 Fathom、Exa、Firecrawl、Tavily 交叉核验。
- 上线环境仍需在发布前确认服务器、域名、HTTPS、数据库/Redis、镜像或二进制交付方式及回滚路径。真实微信/支付宝商户凭据仍不是本地 Build 条件；没有凭据时必须保持对应支付入口关闭或明确标记未完成，不能伪造真实结算验收。
- 每次 Native Verify 接受后同步更新本文，记录通过证据、剩余风险、远端/合并/部署状态和下一目标。
