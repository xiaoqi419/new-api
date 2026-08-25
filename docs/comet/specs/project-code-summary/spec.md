# 二开维护与交接文档规格

## 目标

仓库必须提供 `docs/project-code-summary.md`。它是本 fork 二次开发的维护/交接入口，优先说明当前 main 已包含的二开能力、其状态和维护边界，而不是把上游 New API 的全仓概览作为主要交付物。

## 必备结构

1. 调查快照、证据等级和排除项：记录 `origin/main` SHA、日期、检索降级情况，并说明不对生成物、依赖、二进制与 vendored 第三方代码作逐行承诺。
2. 当前发布基线：明确 `origin/main` 是唯一生产真源，说明 SHA、镜像/容器版本不一致时的比较和停线原则。
3. 已完成二开能力：至少覆盖商业支付/运营、身份/访问/公共体验、模型/生成/扩展三类；每项给出路径、状态和维护注意事项。
4. 未完成与风险：分别列出待线上验收、保留但隐藏、搁置/未开始，以及支付/计费、数据库、缓存、双前端、i18n、上游整合和版本漂移风险。
5. 后续 Agent 流程：从 main、Comet、fast-context/rg、Shape、Build、Verify、PR/CI、精确 SHA 构建、应用部署到清理分支的明确顺序。
6. 最小基础边界：只说明二开 Agent 需要跨越的 HTTP/业务、Relay/计费、RelayKit、数据/缓存、三套前端、Docker/Electron 边界，不复述上游全部实现。
7. 常用验证命令和“历史计划不等于现状”的说明。

## 事实规则

- “已合并”只表示代码位于 `origin/main`；真实支付、回调、生产迁移和生产部署必须另列为线上验收。
- 历史计划、设计稿、旧 branch、旧容器和原目录脏改动不构成当前事实。结论优先级是当前 main 源码/测试，其次是归档 Comet 验证和提交历史。
- 技术断言必须指向真实文件、符号或 Git SHA；Markdown 链接应在本仓库工作树可解析。
- `relaykit/` 仍是独立 Go module，不能暗示它依赖 root 模块；其修改必须经 `GOWORK=off go build ./...` 验证。
- 不得改变受保护的 `new-api` 或 QuantumNous 项目归属。

## 最小验证契约

- `rg` 能找到文档中引用的二开模块和关键符号。
- 文档内 Markdown 路径目标存在，不依赖随机本机目录。
- `git diff --check` 通过，变更仅限 `docs/project-code-summary.md` 和 `docs/comet/changes/project-code-summary/`。
- 独立 Verifier 对 A1-A34 逐项给出证据；依赖线上状态而没有证据的事项必须标为待线上验收而不是通过。
