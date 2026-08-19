# Outcome

在不改变 Torch AI 已有二开功能、公开入口状态、计费口径和数据兼容性的前提下，将当前二开基线 `60e2775e3` 无损同步到 QuantumNous/new-api `v1.0.0-rc.25`（`f11641428`）。合并结果既完整继承官方 rc.25，也保留当前全部二开实现，并形成可重复的构建、测试、浏览器验收和维护记录。

# Scope

- 以官方 `v1.0.0-rc.24` 对应提交 `5c3abffe8` 为三方共同基线，把官方 `v1.0.0-rc.25` 提交 `f11641428` 合入当前 Torch AI 提交 `60e2775e3`。
- 同步 rc.24 到 rc.25 的 39 个官方提交、207 个文件差异；对预测出的 27 个真实冲突路径逐文件读取 base/ours/theirs，按行为取并集，禁止整文件机械选择 ours 或 theirs。
- 同步官方在额度原子预扣、充值订单保护、订阅并发、OAuth 绑定、渠道测试、高级自定义渠道、字段透传、Claude 工具转换、Responses 缓存 token 结算、前端测试基础设施等方面的修复和增强。
- 完整保留邀请返现、邀请中心、拼团、支付宝商户直连、微信官方支付、视频生成、素材库、无限画布、渠道监控、应用内文档、用户 Token 排行、API Key/Token 实时并发统计、渠道兜底、发票、代理商/白标分销和现有主题双前端。
- 保持素材库、无限画布、普通用户成为代理入口继续屏蔽；保留管理员代理管理和已激活 owner 控制台；手工 `asset://` 兼容不变。
- 仅接受 rc.25 本身带来的依赖变化，包括前端 Vitest/Testing Library/jsdom 测试栈、DOMPurify 补丁和 Electron 锁文件更新；不得顺带升级其他依赖。
- 更新 `web/src/features/changelog/data.ts`、`docs/torch-ai-maintenance-status.md` 和 `docs/torch-ai-second-development-status.md`，记录同步版本、验证证据、未覆盖项和线上验收边界。

# Non-goals

- 不改造首页或全局主题；Figma 首页与主题继续作为本 change 之后的独立目标。
- 不新增二开功能，不开放当前已屏蔽入口，不扩展微信登录，不完成代理公开分销闭环。
- 不新增数据库表、列或迁移；rc.25 的 quota reserve 使用 Redis 与现有用户/令牌额度列，不作为数据库结构变更。
- 不改变公开 API、支付金额口径、计费表达式语义、额度单位、渠道兜底顺序或现有权限边界；若官方变化与这些契约无法兼容，停止 Build 并重新请求用户决策。
- 不伪造微信/支付宝真实商户凭据、公网 HTTPS 回调或真实结算验收。
- 不清理历史 warning-only lint 债务，不修改 UI 框架，不移除或替换受保护的 `new-api`、`QuantumNous` 信息。
- 不推送、创建 PR、发布或部署；这些外部操作需要用户另行授权。

# Acceptance examples

- A1：最终 Git 历史同时包含 Torch AI 基线 `60e2775e3` 和官方 rc.25 `f11641428`，合并基线可追溯到 `5c3abffe8`；不存在未解决冲突、冲突标记或意外丢失的二开文件。
- A2：27 个预测冲突路径均有逐文件三方审查结果；充值、Token、渠道、认证、动态计费、前端交互和七语言包采用行为取并集，并在维护记录中列出冲突分组与关键取舍。
- A3：官方额度原子预扣、充值/订阅并发安全和退款修复生效，同时 Torch AI 微信/支付宝直连、拼团、返利、代理结算、quota saturation 审计和非负计费不变量保持；重复回调、并发扣减、余额不足和退款回补的相关测试通过。
- A4：Token/OAuth 合并后，API Key 实时并发接口及 Redis/内存降级、GroupSwitch/Auto Group 兼容、访问令牌轮换确认、第三方账号绑定和现有微信登录搁置边界均保持。
- A5：渠道合并后，官方 auto-disable-only 测试模式、高级自定义渠道、字段透传与模型同步修复可用；Torch AI 渠道兜底层级、自带兜底转发、渠道监控、多 Key 状态和 HTTP/2 设置不回退。
- A6：官方 Claude 参数为空工具保留、空工具抑制、Responses cached token 结算和相关 relay 修复生效；显式零值传递、计费快照、动态表达式、quota clamp 审计保持，`relaykit` 继续可在 `GOWORK=off` 下独立构建和测试。
- A7：维护清单中的全部 Torch AI 二开路由、API、模型和前端入口仍存在；素材库、无限画布、普通用户成为代理继续显示 Coming Soon/隐藏入口，管理员和已激活 owner 的代理入口仍可用，`asset://` 不被改写。
- A8：合并没有新增数据库 schema；所有新增/修改数据库操作遵守 SQLite、MySQL 5.7.8+、PostgreSQL 9.6+ 兼容约束，行锁继续使用 `lockForUpdate`，JSON 编解码继续走 `common.*` wrapper。
- A9：仅保留 rc.25 自带的依赖与锁文件变化；前端测试迁移后现有 Torch AI 测试仍被发现并执行，`bun test`、typecheck、受影响 lint、default build 和 classic build 通过，lint 保持 0 errors 并如实记录 warning 数量。
- A10：七个前端 locale 的键集合一致，i18n 同步报告 `missingCount=0`、`extrasCount=0`；更新日志新增最上方中文用户可读的 rc.25 同步条目，版本符合 `YYYYMMDD-<sha>`。
- A11：root Go 的格式、vet、build、全量测试，以及独立 relaykit 的格式、build、test 通过；若环境检查不可用，必须记录可复现阻塞，不能把未运行写成通过。
- A12：维护文档准确区分“官方 rc.25 已同步”“本地验收通过”“待线上商户验收”“公开入口暂不开放”和“尚未推送/发布/部署”，并保留已知 SQLite 旧验收库迁移风险。
- A13：在独立本地服务中完成桌面与移动浏览器抽查，登录/注册、渠道、API Keys、钱包、用量日志、设置、游乐场、changelog 和三个受限直达路由无崩溃、无明显布局回退，关键按钮与弹窗仍可操作。

# Constraints and invariants

- 遵守根 `AGENTS.md`、`web/AGENTS.md` 和 `pkg/billingexpr/expr.md`；计费与额度路径必须保持防溢出、非负、原子预扣和 saturation 可审计。
- 所有冲突文件在修改前必须完整阅读相关 base/ours/theirs 片段和调用链；未知代码先 Fast Context，再用 `rg` 精确定位。
- 不通过关闭 lint、降低规则级别、扩大 ignore、删除有意义测试或修改业务语义来制造通过记录。
- 前端可见文案使用 i18n；官方测试基础设施迁移必须兼容当前项目的 Windows/Bun 执行方式。
- `relaykit/` 不得依赖根模块；涉及其 API 或代码必须执行独立构建和测试。
- Builder/执行子代理不得执行 Git 写操作；分支、合并、暂存、提交和最终收尾仅由主代理操作。
- 当前工作区为 `E:\code\torch-ai\.worktrees\upstream-rc25-sync`，change 分支 `codex/upstream-rc25-sync`，目标分支 `codex/p0-wallet-wechatpay`。

# Decisions

- 用户选择独立 worktree，避免旧 `p1-lint-debt` Runtime 状态和当前主工作区影响本次同步。
- 采用单一 Native change：官方合并产生共享 index 和跨后端/前端契约冲突，拆成独立 child 会增加重复合并与协调风险；实现阶段可在主代理完成 Git 合并后按互斥文件所有权派发修复任务。
- 对官方 rc.25 与 Torch AI 二开采用“行为取并集”：官方安全/兼容修复必须进入，二开功能和产品状态必须保留；无法同时满足时不擅自取舍。
- 接受 rc.25 自带的测试栈、DOMPurify 和 Electron 依赖变化，但禁止范围外依赖升级。
- 本 change 不新增数据库 schema；quota reserve 是对现有额度字段和 Redis 缓存的并发安全实现。
- 上游同步完成后再进行 Figma 首页和主题改造，避免共享前端文件发生二次冲突。

# Open questions

- [blocking] CONFIRM: 确认以上 rc.25 精确版本、27 个冲突逐项取并集、官方依赖变化、二开保护清单、A1-A13 验收和非目标后进入 Build。

# Verification expectations

- Git：祖先关系、冲突标记、diff/stat、合并来源和非预期删除检查。
- 后端：受影响计费/充值/订阅/Token/渠道/relay 测试，随后 root `gofmt`、`go vet ./...`、`GOWORK=off go build ./...`、`GOWORK=off go test ./...`。
- relaykit：`GOWORK=off gofmt` 检查、`GOWORK=off go build ./...`、`GOWORK=off go test ./...`。
- 前端：`bun install --frozen-lockfile` 或项目可用的等价锁文件安装、受影响测试、`bun test`、`bun run i18n:sync`、`bun run typecheck`、受影响 lint、`bun run build` 和 `web/classic` build。
- 浏览器：桌面与移动关键页面、公开入口屏蔽、登录/渠道/钱包/API Keys/用量/设置/游乐场/changelog 抽查。
- 独立只读 Verifier 按 A1-A13 逐项给出 passed/failed/blocked；真实商户支付继续作为线上未覆盖项。
