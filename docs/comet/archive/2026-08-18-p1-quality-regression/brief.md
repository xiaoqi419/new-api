# Outcome

把 Torch AI 当前已经落地的二开功能推进到可发布的质量门禁状态。真实微信/支付宝商户收款继续标记为“待线上验收”，不因本地缺少商户凭据伪造通过；微信登录新增开发继续搁置。

# Scope

- 对钱包充值、邀请返现/邀请中心、拼团、认证、视频生成、素材库、渠道监控和应用内接入文档执行关键路径回归。
- 建立并记录后端 Go vet/build/test、relaykit 独立构建、前端 typecheck/lint/build/test 的发布前检查结果。
- 检查七种前端语言的键集合、同步报告和新增二开文案；英文与简体中文必须完整，其他语言沿用现有英文回退策略。
- 检查公开文档、登录用户页面、管理员页面、功能开关和回调接口的路由/权限边界。
- 修复本轮检查确认的真实回归；当前已确认的 CI 后端构建缺口是未为 `web/classic/dist` 与 `web/canvas/dist` 提供 embed placeholder。
- 同步维护文档和 Comet 验收记录。

# Non-goals

- 不接入或验证真实微信/支付宝商户凭据、真实客户端支付、线上公网 HTTPS、回调和结算；这些仅列入线上验收清单。
- 不新增微信登录能力，不改变现有 OAuth/微信登录产品决策。
- 不新增支付方式、数据库迁移、公开 API 契约、依赖升级或 UI 框架迁移。
- 不部署、不推送、不创建 PR、不合并。

# Acceptance examples

- A1：root module 与 `relaykit` 均通过 `go vet`；`go build ./...` 和 `cd relaykit; GOWORK=off go build ./...` 均通过，且 root embed 所需的三个 dist 目录在干净 checkout 中有明确来源或 placeholder。
- A2：`make test`（root 子包与 relaykit）通过，或对任何无法运行的检查记录可复现的环境阻塞和线上/CI替代验证方式。
- A3：具备 Bun 的环境中 `web` 的 `bun run typecheck`、`bun run build`、`bun test` 和 `bun run i18n:sync` 通过；当前 change 修改或直接影响的 default 前端文件定向 lint 通过。全量 `bun run lint` 的 1,400 errors / 383 files 作为历史 lint debt 拆入独立后续 change，不作为本 change 的通过条件，也不得声称全量 lint 已通过。
- A4：i18n 同步报告中所有 locale 的 `missingCount` 与 `extrasCount` 为 0；`en`/`zh` 覆盖全部新增用户可见键，其他语言继续按既有 fallback 规则，不扩大本轮翻译范围。
- A5：路由矩阵可观察地证明 `/docs` 可公开访问；钱包、拼团、返现、视频、素材库、渠道监控要求登录；返现/拼团管理端与支付配置要求管理员；支付回调仅公开放行到处理器验签；模块开关关闭时前后端均不提供可用业务路径。
- A6：钱包支付分类/跳转安全/WeChat Native-H5-JSAPI、返现、拼团、认证、视频/素材引用和渠道监控已有测试集通过，新增或修复的真实回归有针对性测试保护。
- A7：维护状态文档明确区分“本地代码验收通过”“待线上验收”和“暂时搁置”，并列出管理员凭据配置、公网回调和真实支付验收步骤。

# Constraints and invariants

- 保留 `new-api`、`QuantumNous` 及既有版权/归属信息。
- 遵守项目根 `AGENTS.md` 与 `web/AGENTS.md`；JSON 业务序列化继续使用 `common.*` wrapper；不修改用户已有 `.agents/skills/comet-any/` 文件。
- 代码改动只限于本 change 的质量门禁、真实回归修复、测试和正式文档；不把线上环境缺失当成本地实现缺陷。

# Decisions

- 本阶段采用单一 Native change，先完成 Shape；只有用户确认共享理解后才进入 Build。
- 当前 Windows 可通过 `npx --yes bun` 运行项目 Bun CLI；`typecheck`、`test`、`build` 和 `i18n:sync` 已通过，但 `bun run lint` 全量检查仍失败（classic：1,059 errors / 236 files；default `src`：341 errors / 147 files，共 1,400 errors / 383 files）。
- root `GOWORK=off go test ./...` 已通过，channel-affinity 测试隔离缺陷已修复；不要再把旧的 root Go failure 作为当前阻塞。
- 已确认的 CI embed 缺口进入本阶段候选修复范围；是否需要额外修复由实际检查结果决定，不提前扩张范围。
- 用户已确认当前 change 维持已修改/直接影响的 default 文件定向 lint，classic 与其余 default 的 1,400 项历史 lint debt 拆为独立后续 change；不得通过关闭规则、降低错误级别或忽略目录伪造全量通过。

# Open questions

- 无。线上商户支付继续待线上验收，微信登录继续搁置。

# Verification expectations

- A1-A7 已完成一次独立 Verify 通过；最终归档状态以 Runtime 管理的 `comet-state.yaml` 与 `verification.md` 为准。
- 不得把定向 lint 通过写成全量 lint 通过；验证记录必须保留 1,400 errors / 383 files 的全量历史基线和用户已确认的拆分决定。
- Verify 阶段由新的只读 Verifier 逐项检查 A1-A7；Bun CLI 可通过 `npx --yes bun` 运行的检查应记录真实结果，线上商户验收必须明确标记为本地未运行，而不是默认为 passed。
