# Outcome
在保留 Torch AI 生产 fork 已上线能力和数据契约的前提下，将官方 QuantumNous/new-api 的可兼容稳定更新审查后合入 `origin/main`，并为渠道增加可选的上游 WebSocket 传输模式。两个能力都必须可追溯、可回滚、可独立验证，最终再进入同一发布序列。

# Scope

- 以官方 `upstream/main` 当前提交 `eb99ab1b40343c3317bb47981cccdbb2b159a5fa`（`v1.0.0-rc.33`）为研究输入；共同基线为 `2d8e50bf36e94200b809dfb39e73624ec48b1e23`。
- 对 rc.25→rc.33 的官方提交逐项分类：稳定安全/兼容/性能修复、可保留的用户功能、需要行为合并的核心改动、与本 fork 冲突或会删除二开能力的改动。
- 用户已确认按四个开发单元推进：第一批稳定兼容修复、第二批全部模型/协议/计费改动、第三批登录传输加密与基础类型迁移、第四批渠道上游 WebSocket；第二批 O1–O4 全部纳入实现范围。
- 同步结果采用“行为取并集”：引入官方可验证更新，保留充值、订阅、GMPay、双站 H5、低余额提醒、视频/支付/代理等 fork 能力；官方实验性插件架构、会删除二开模块的前端/Docker 重构、治理/CI 文件仍排除。
- 重点实现 gpt-6-astra 表达式计费、显式模型修饰符与 reasoning 保真、Responses/Claude/relay 计费完整性、SQLite/PostgreSQL/MySQL 兼容、ETag/缓存、前端修复、密码传输加密、int32 迁移和渠道 WS；每个变更记录来源、冲突取舍和测试证据。
- 密码传输加密的 RSA 私钥复用既有 `Option` 表中的内部行 `__internal.PasswordLoginRSAKey`，不新增表或列；首次启动通过跨数据库兼容的主键冲突忽略写入确保多实例复用同一密钥。
- 渠道 WS：在现有 `setting` JSON 增加 `upstream_transport`（空/`http`/`websocket`），默认保持 HTTP；仅对流式 OpenAI Responses 请求按渠道开关使用上游 WebSocket，非流式、compact 和其他端点保持 HTTP。
- WS 模式由 new-api 作为 WS 客户端直接连接 CPA/兼容上游，发送 Responses `response.create`，把 Responses 事件转成当前 SSE 输出，沿用现有 usage/额度/日志链路；在有明确会话标识或可验证 `previous_response_id` 时复用同一条 CPA 连接，避免每轮重复握手。无会话标识的首轮请求不跨会话借用连接。
- 连接池只存在于 new-api 进程内，按渠道上游、鉴权指纹、模型和会话绑定；空闲超时、连接生命周期、单连接串行 lease 和失效连接淘汰必须有界。握手、鉴权、协议错误或上游拒绝时，同一请求回落 HTTP，并记录是否回落。
- 两套前端渠道编辑器提供 HTTP/WebSocket 选择并使用 i18n；不新增数据库列，不改变对外客户端协议，不改 CPA/CPAM 源码。

# Non-goals

- 不把官方 upstream/main 直接作为生产基线，不从 upstream 构建或部署。
- 不直接整段 merge 66 个已知冲突而用 ours/theirs 覆盖行为；不删除本 fork 的受保护品牌、支付、H5 或运营功能。
- 不在本次同步中启用官方实验性插件系统、会移除现有模块的架构替换或治理/CI 文件；密码传输加密和 int32 迁移已由用户确认纳入本 change，但必须在独立实现单元中完成兼容验证。
- 不新增 new-api 对外 `/v1/ws`，不修改 Codex/Cursor 客户端，不改变默认 HTTP 行为；不引入 Sub2API、Bifrost、LiteLLM 等外部网关或运行时依赖。
- 不修改生产 PostgreSQL、Redis、网关配置；未完成本地和隔离验证前不部署。

# Acceptance examples

- A1：官方来源、目标提交、共同基线和每个纳入/排除的提交均有可复核记录；`origin/main` 历史可追溯且没有未解决冲突、误删二开文件或冲突标记。
- A2：官方稳定 relay、计费、认证、数据库兼容、缓存/ETag 和前端修复按证据进入；现有支付、H5、低余额提醒、GMPay、视频、代理和双前端能力及测试保持。
- A3：gpt-6-astra 与模型修饰符/推理力度功能在模型映射、价格、Responses/Chat/Claude 转换和计费中保持一致，显式零值与额度安全不回退。
- A4：WS 设置保存和读取只允许空/http/websocket；默认与未开启渠道行为完全等价，前后端字段和 i18n 一致。
- A5：开启 WS 的流式 Responses 请求能完成握手、发送 `response.create`、转发事件为标准 SSE，并从 `response.completed` usage 进入现有结算；非流式/compact/其他端点仍走 HTTP。
- A6：WS 401/404/405、握手失败、协议 error、客户端取消和连接关闭均释放资源并回落 HTTP 或返回原有错误；不泄露 Authorization、Cookie 或完整请求体。
- A7：root 和独立 relaykit 构建、受影响 Go/前端测试、类型检查、lint、双前端构建及隔离 CPA WS 验证通过；未执行项和线上凭据边界如实记录。
- A7b：带稳定会话标识或有效 `previous_response_id` 的连续 Responses 请求复用同一 CPA WebSocket；不同会话不共享连接；连接空闲超时、失效淘汰、单连接串行 lease 和客户端取消不会泄漏 goroutine、连接或管道。
- A7c：复用连接在首帧前失效时最多安全重建一次并保持原请求体；已向客户端输出事件后不自动重放；连接复用失败和 HTTP 回落原因可观察但不包含密钥或完整请求体。
- A8：只从合并后的精确 `origin/main` SHA 构建不可变镜像；发布前不修改数据库、Redis、国内/国际站网关。

# Constraints and invariants

- `origin/main` 是唯一生产源；根目录 `secondary-dev` 和现有 `responses-upstream-websocket` dirty worktree 只读保护，不 reset/clean/覆盖。
- 所有 Go 业务 JSON 编解码使用 `common.*`；relaykit 保持独立模块并执行 `GOWORK=off go build ./...`。
- 计费/额度必须经过现有安全边界和 checked quota helpers；WS 与 HTTP 使用同一 usage、预扣、结算和日志路径。
- 默认 HTTP、现有客户端 SSE、数据库 schema、Redis 和受保护项目身份保持兼容。
- 上游官方 rc.33 发布说明明确插件系统仍属实验性且不推荐生产，本 change 默认排除该架构替换。

# Decisions

- 采用单一 Native change 的双轨范围：先完成上游兼容性矩阵和安全同步，再在同一生产基线上实现渠道 WS；两轨共享 relay/channel、前端和发布验证，但不把规划中的旧 dirty worktree 直接当作候选。
- 采用“选择性同步 + 行为取并集”而不是整段 upstream merge；原因是 `git merge-tree` 预估 66 个冲突，且官方 rc.33 相对共同基线有大量删除/重构。
- 渠道 WS 默认关闭、按渠道显式启用，仅用于流式 Responses，失败自动回落 HTTP；Sub2API 仅作为连接池、会话粘性和首帧恢复的设计参考。

# Open questions

- 用户决定：按四个并行开发单元推进；官方第二批 O1–O4 全部实现，第三批密码传输加密与 int32 迁移也实现；实验性插件架构、治理/CI 和删除二开模块的重构不实现。
- 用户确认：渠道 WS 默认关闭，仅用于流式 Responses，失败回落 HTTP；保留现有支付、H5、低余额提醒、视频、代理、双前端和额度安全能力。

# Verification expectations

- Git：官方 remote/tag/commit、merge-base、冲突清单、纳入/排除矩阵、目标 SHA 和工作区洁净度。
- Backend：受影响 relay、计费、认证、模型、数据库和控制器测试；`gofmt`、`go vet`、`GOWORK=off go build ./...`、必要的 `go test`。
- relaykit：`cd relaykit; GOWORK=off go build ./...` 与受影响测试。
- Frontend：受影响 Vitest/Testing Library、lint、`bun run typecheck`、`bun run build` 和 `web/classic` 构建；i18n key 同步。
- WS 隔离：本地 deterministic WS fixture 覆盖握手、帧转 SSE、usage、错误/取消/回落；再用线上 CPA `https://cpa.codezip.io` 的临时授权 key 验证规范 `/v1/responses` 路由、`response.create` 和客户端 SSE 桥接。授权信息不写入仓库、日志或测试报告。
- 交付：只在合并到 `origin/main` 后构建不可变镜像，核对两个公网 `/api/status` 版本；CI/线上支付/生产 SMTP/数据库方言若未运行必须明确标记。
