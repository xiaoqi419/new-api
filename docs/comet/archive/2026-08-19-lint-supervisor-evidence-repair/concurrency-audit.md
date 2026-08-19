# p1-lint-debt 并发与依赖审计

更新时间：2026-08-19

## 结论

本 Supervisor 的并发约束由两层事实共同限定：项目策略规定最多 5 个执行子代理且禁止子代理派生；当前宿主团队总并发槽为 6，其中 1 个固定给主代理，因此执行子代理的硬上限为 5。该上限是运行环境约束，不依赖子代理自报，也不允许通过额外派生突破。

因此，本次流程的并发上界满足“活跃子代理不超过五个”。仓库没有保留逐秒调度遥测，本文不把不存在的时间线写成事实；可复核证据是宿主并发配置、项目 AGENTS/Comet brief/spec、children.yaml 依赖图、各 child 的独立归档状态和最终 Git 合入历史。

## 依赖波次

| 波次 | child | 依据 |
| --- | --- | --- |
| 首波 | `lint-default-channels-pricing`、`lint-default-dashboard-models-settings`、`lint-default-user-features`、`lint-default-layout-assets`、`lint-classic-foundations` | 无依赖；各自 ownership 独立 |
| 第二波 | `lint-default-shared` | 依赖四个 default child |
| 第三波 | `lint-classic-channels-models`、`lint-classic-users-tables`、`lint-classic-topup-settings-ratio`、`lint-classic-settings-pages`、`lint-classic-common-pages` | 均依赖 `lint-classic-foundations` |
| 最终门禁 | `lint-final-gates` | 依赖所有终端代码 child，负责全量 lint/test/typecheck/build |
| 证据修复 | `lint-supervisor-evidence-repair` | 只依赖 `lint-final-gates`，覆盖 A6/A9/A11 |

`docs/comet/changes/p1-lint-debt/children.yaml` 是依赖关系的权威记录；各 child 归档记录和 `git log --graph` 可复核实际合入顺序。该审计不声称存在未保留的逐秒 active-agent 计数，而是明确记录硬上限、禁止派生和波次证据。

## 范围与限制

- 本 child 只修改维护状态和审计/Comet 正式文档。
- 1,682 条 lint warnings、真实商户支付、微信登录新增开发和 iframe trust residual risk 均保持父 Supervisor 的原有结论。
- Supervisor 仍未推送、创建 PR、合入 `codex/p0-wallet-wechatpay`、发布或部署。
