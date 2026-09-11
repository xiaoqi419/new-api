---
generated_from_state_version: 67
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 5
- Iteration: 1
- Verifier attempt: 2
- Completed: 2026-09-10T21:41:46.360Z
- Summary: All A1-A31 acceptance criteria pass. The CPA Responses WebSocket bridge now preserves valid provider error events, records staged latency under a joinable request id, and keeps HTTP fallback/replay safety. The daily usage header adds current-user local-day cache rate and total token usage. Runtime checks, GitHub PR/CI, exact-merge release evidence, and dual-site container deployment evidence satisfy the final release gate.

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1: 现有 WS/SSE、连续会话和防重复请求测试通过。 | Existing WS/SSE, continuous-session, request-deduplication, and provider-error regression behavior is covered by the focused OpenAI Responses WebSocket tests; the Runtime repeated the key provider-error/timing tests 50 times successfully. |
| A2 | passed | brief.md | A2: 今日汇总仅当前用户，按自然日边界统计，列表筛选和其它用户数据不影响结果。 | The daily usage API uses the authenticated Gin user id and browser-local day bounds. Controller/model tests verify another user's logs and list filters do not affect the returned summary. |
| A3 | passed | brief.md | A3: 缓存率加权汇总正确，总 Token 不重复计算缓存，空数据和历史缺失数据可读。 | The model aggregation computes canonical total tokens from input/completion when needed, sums cache-read tokens separately, and returns a weighted cache rate or nil for missing telemetry; model tests cover scoped rows, fallback totals, and empty rows. |
| A4 | passed | brief.md | A4: 桌面日志顶部顺序为用量、RPM、TPM、缓存率、总用量；窄屏可读，支持翻译和隐私遮罩。 | The usage log header renders DailyUsageStats after TPM, displaying Cache Rate and Total Usage with i18n keys across supported locales and privacy-aware formatting; frontend component and hook tests passed. |
| A5 | passed | brief.md | A5: 记录长耗时样本和分阶段证据，明确可归因与尚无法归因部分；本地修复需有回归验证，不用改变生成参数制造改善。 | CPA Responses WS timing logs now expose lease, first event, first text, terminal, terminal write, and cleanup stages under the same request id, and latency-evidence.md records what can and cannot be attributed without changing generation parameters. |
| A6 | passed | brief.md | A6: 受影响后端测试、前端类型检查/测试/构建通过；发布通过主线 PR、CI、不可变镜像，两站代码一致。 | Release gate is satisfied. PR #47 merged into origin/main at f8af32add2c07938708a134ad2e315294d27de5b; PR and post-merge CI run 34530218947 succeeded for backend vet/build/test and frontend typecheck/build/test/i18n sync. The server is running image torch-ai-release:20260910-daily-usage-summary with image id sha256:0ae252562afd4efa9b058b48470f0a967a134a83d4f49fbbe252be2519250ce6 on both app containers, both healthy, and both container-local /api/status responses report version 20260910-daily-usage-summary. |
| A7 | passed | specs/channel-upstream-websocket/spec.md | 渠道 `setting` JSON 可选字段 `upstream_transport`：空值或 `http` 表示现有 HTTP 上游；`websocket` 只对流式 OpenAI Responses 请求生效。非流式 Responses、Responses compact、Chat Completions、Realtime、音频、图片、视频和其他端点继续使用现有路径。 | The adaptor only selects the websocket path when relay mode is Responses, the request is streaming, and channel setting upstream_transport equals websocket; other relay modes and non-streaming/compact endpoints stay on existing paths. |
| A8 | passed | specs/channel-upstream-websocket/spec.md | new-api 以渠道配置的 Base URL、Authorization 和安全的头部覆盖规则建立 `ws`/`wss` 连接。CLIProxyAPI/CPA 的 Responses WebSocket 先升级规范的 `/v1/responses` 路由；为兼容旧部署，再按 `/v1/responses/ws`、`/v1/ws` 顺序探测别名。`/v1/ws` 仅作为最后兼容路径，避免误选 CPA 的通用 WebSocket relay。不把密钥或完整请求体写入日志。 | The bridge derives ws/wss candidates from the channel Base URL, probes canonical /v1/responses before compatibility aliases, applies authorization/header overrides safely, and keeps X-Client-Request-Id authoritative without logging secrets or request bodies. |
| A9 | passed | specs/channel-upstream-websocket/spec.md | WS 连接在 new-api 进程内按渠道上游、鉴权指纹和模型隔离。首轮请求只有在提供稳定的会话标识（例如受信任的会话/对话头）时才可绑定空闲连接；没有会话标识的首轮请求必须建立新连接，避免不同会话共享上游上下文。后续请求带有 `previous_response_id` 时，优先复用生成该 ID 的连接；`store=false` 的请求必须保持同一连接语义，不能仅凭全局空闲连接猜测上下文。 | The pool key includes endpoint, auth/query fingerprints, model, user id, channel id, and proxy hash; tests verify user/proxy/auth isolation, session hints are bounded, and previous_response_id affinity is preserved. |
| A10 | passed | specs/channel-upstream-websocket/spec.md | 每条连接同一时刻只能被一个请求 lease；正常终止后归还连接池，连接空闲超时、达到最大生命周期、写入/读取失败或协议错误时淘汰。借用空闲连接时执行有界的健康检查；仅请求尚未尝试发送时允许安全重建；发送后读取失败不重放。请求取消会释放当前 lease，所有 goroutine、管道和连接均有确定的退出路径。 | Pool lease logic serializes one request per websocket, releases healthy sockets, marks failed/cancelled sockets broken, supports bounded health/safe rebuild before send, and avoids replay after request bytes may have been sent; deterministic lease tests cover these paths. |
| A11 | passed | specs/channel-upstream-websocket/spec.md | 把已完成的 Responses 请求包为上游要求的 `response.create` 文本事件。上游 Responses 事件按现有 relay SSE 语义发送给客户端，保留事件类型、JSON 内容和顺序；终止事件中的 usage 继续交给既有 Responses handler、预扣、结算和日志链路。 | The bridge wraps the Responses payload as a response.create websocket event and forwards upstream event JSON as SSE data frames, preserving event order and usage-bearing terminal events for the existing Responses handler/billing path. |
| A12 | passed | specs/channel-upstream-websocket/spec.md | 只有尚未尝试发送请求的握手失败可安全回落 HTTP。尝试写入后，即使首帧未到也不得自动重放。取消、错误与终止事件及时释放资源。上游返回的合法 Responses `error` / `response.error` 事件按 SSE 原样传递给客户端，并作为终止事件记录分阶段时序；本地无法解析的首帧仍视为 bridge 协议错误。 | Handshake/setup failures can fall back before send; once write/read after send fails the error is non-replayable. Valid upstream error/response.error events are now forwarded as SSE and terminate with upstream_error_event timing, while invalid first frames remain protocol errors. |
| A13 | passed | specs/channel-upstream-websocket/spec.md | default 与 classic 渠道编辑器均显示 HTTP/WebSocket 选项、默认 HTTP、i18n 文案和服务端非法值错误映射；配置保存在现有 `setting` JSON，不新增列。 | Channel settings persist upstream_transport in existing setting JSON with validation for illegal values, and both default/classic editors expose HTTP/WebSocket options with i18n/error mapping; no new database column is introduced. |
| A14 | passed | specs/channel-upstream-websocket/spec.md | deterministic fixture 覆盖 URL、鉴权、`response.create`、多帧转 SSE、usage、终止、错误、取消和 HTTP 回落。 | Deterministic fixtures cover URL candidates, authorization, response.create envelopes, websocket-to-SSE multi-frame forwarding, usage, terminal handling, error handling, cancellation, and HTTP fallback behavior. |
| A15 | passed | specs/channel-upstream-websocket/spec.md | deterministic fixture 覆盖稳定会话的连接复用、`previous_response_id` 粘性、不同会话隔离、连接失效淘汰、发送前安全重建、发送后禁止重放和单连接串行 lease。 | Deterministic fixtures cover stable session reuse, previous_response_id stickiness, session isolation, failed connection eviction, safe rebuild before send, no replay after send, and single-connection serial leasing. |
| A16 | passed | specs/channel-upstream-websocket/spec.md | 真实测试 CPA 验证规范 `/v1/responses` WS 路由、`response.create`、Responses 事件和 usage，并确认 new-api 客户端仍收到 `text/event-stream` SSE；实现保留 `/v1/responses/ws` 与 `/v1/ws` 兼容探测。 | Live CPA evidence in latency-evidence.md/upstream matrix shows canonical /v1/responses websocket routing with response.create, Responses events, usage, and new-api text/event-stream SSE output; the implementation retains /v1/responses/ws and /v1/ws compatibility probes. |
| A17 | passed | specs/channel-upstream-websocket/spec.md | 关闭开关的旧渠道和所有非 Responses 请求行为与基线完全一致。 | The websocket path is opt-in per channel and restricted to streaming Responses. Existing HTTP behavior for disabled channels and non-Responses relay modes is unchanged by adaptor gating and regression tests. |
| A18 | passed | specs/channel-upstream-websocket/spec.md | 长耗时使用同请求分阶段证据定位，区分首事件、首文本、终止和记录时间，不承诺上游生成速度。日志顶部 TPM 右侧增加当前登录用户今日缓存率与总 Token；使用本地自然日，独立列表过滤，加权缓存率，不重复计入缓存，支持空值、翻译、隐私和跨日刷新。 | Long-duration diagnosis is implemented through per-request staged timing instead of generation-parameter changes. The usage log header adds current-user local-day cache rate and total tokens next to TPM, independent of list filters and with empty/i18n/privacy handling. |
| A19 | passed | specs/upstream-compatibility/spec.md | 输入仓库：`https://github.com/QuantumNous/new-api`，官方 `upstream/main`。 | The upstream compatibility spec records QuantumNous/new-api as the upstream input repository and upstream/main as the official input branch. |
| A20 | passed | specs/upstream-compatibility/spec.md | 目标：`v1.0.0-rc.33`，提交 `eb99ab1b40343c3317bb47981cccdbb2b159a5fa`。 | The upstream compatibility spec records target v1.0.0-rc.33 at commit eb99ab1b40343c3317bb47981cccdbb2b159a5fa. |
| A21 | passed | specs/upstream-compatibility/spec.md | 共同基线：`2d8e50bf36e94200b809dfb39e73624ec48b1e23`。 | The upstream compatibility spec records common baseline 2d8e50bf36e94200b809dfb39e73624ec48b1e23. |
| A22 | passed | specs/upstream-compatibility/spec.md | 本 fork 生产基线：开始实现前重新 fetch 的 `origin/main`。 | The production fork baseline is origin/main. Release evidence confirms PR #47 was merged into origin/main and remote main now resolves to f8af32add2c07938708a134ad2e315294d27de5b. |
| A23 | passed | specs/upstream-compatibility/spec.md | 逐项审查共同基线之后的官方提交，记录提交、路径、行为、风险、冲突处理和验证证据。 | The change includes the upstream commit matrix and specifications documenting official commits, affected paths, behavior, risks, conflict handling, and validation evidence after the common baseline. |
| A24 | passed | specs/upstream-compatibility/spec.md | 将稳定的安全、协议兼容、数据库兼容、性能、计费完整性、模型/relay 和明确用户功能合入 fork；用户已确认第二批模型/协议/计费改动全部实现。 | The integrated changes preserve stable security/protocol/database/performance/billing/model/relay behavior and include the user-confirmed second-batch model/protocol/billing updates, with local and CI checks passing. |
| A25 | passed | specs/upstream-compatibility/spec.md | 对与 Torch AI 二开同一行为链的文件做三方语义合并，保留两侧可同时满足的契约；不能同时满足时回到 Shape，不擅自覆盖。 | Three-way semantic merge constraints are documented in the spec and previous independent verification found no unresolved conflict marker or accidental overwrite of Torch AI custom behavior. |
| A26 | passed | specs/upstream-compatibility/spec.md | 保留现有支付、充值、订阅、GMPay、H5、低余额提醒、视频、代理、双前端和保护性品牌/元数据。 | The release did not remove payment, recharge, subscription, GMPay, H5, low-balance reminder, video, proxy, dual-frontend, or protected branding/metadata behavior; the scoped PR diff contains no such removal. |
| A27 | passed | specs/upstream-compatibility/spec.md | 排除官方发布说明标注为实验性、会替换架构或删除现有二开模块的变更；密码传输加密和 int32 迁移按用户确认纳入，但不采用会覆盖二开模块的整段重构。 | The spec records excluded experimental/architecture-replacing changes and includes password-encryption/int32 migration decisions without wholesale upstream rewrites that would replace custom modules. |
| A28 | passed | specs/upstream-compatibility/spec.md | 不新增数据库 schema；数据库、Redis、JSON wrapper、quota safety 和 relaykit 独立性不回退。 | No database schema change was added for this change; the implementation uses existing setting JSON/log tables, project JSON wrappers, and passed root plus relaykit checks. |
| A29 | passed | specs/upstream-compatibility/spec.md | 合并结果可从官方目标提交和 fork 基线追溯，工作树无冲突标记和意外删除。 | The merge result is traceable from official target commit and fork baseline through the specs, upstream matrix, PR #47, and merge commit; git diff checks passed and no conflict markers were reported in Runtime checks. |
| A30 | passed | specs/upstream-compatibility/spec.md | 官方纳入项的行为测试通过，二开能力的回归测试和关键前端页面保持。 | Officially included behavior and custom regressions are protected by the focused backend tests, usage frontend tests, root/relaykit builds, frontend typecheck/build/i18n sync, PR CI, and post-merge CI. |
| A31 | passed | specs/upstream-compatibility/spec.md | root/relaykit/前端检查记录真实结果，未运行项目明确列为限制。 | Root, relaykit, frontend, Runtime, CI, live CPA, and deployment checks are recorded. The only unrepeatable item in this final local turn was public HTTPS status from this machine due TLS/502 path issues, replaced by successful SSH container-local status checks. |

## Checks

| Check | Command | Working directory | Status | Exit | Duration |
| --- | --- | --- | --- | ---: | ---: |
| Responses WS provider error and timing regression repeated | -NoProfile -Command go test ./relay/channel/openai -run 'TestDoResponsesWebsocketRequest(ForwardsFirstProviderErrorWithoutReplay\|StopsOnProviderErrorAfterOutput\|LogsTerminalTimingStages\|KeepsRelayRequestIDAfterHeaderOverrides)$' -count=50 | . | passed | 0 | 2199 ms |
| Affected backend package tests | -NoProfile -Command go test ./relay/channel/openai ./model ./controller ./router -count=1 | . | passed | 0 | 13965 ms |
| Affected backend vet | -NoProfile -Command go vet ./relay/channel/openai ./model ./controller ./router | . | passed | 0 | 1204 ms |
| Root Go build | -NoProfile -Command go build . | . | passed | 0 | 1283 ms |
| Frontend usage daily stats tests | -NoProfile -Command bun x vitest run src/features/usage-logs/components/__tests__/daily-usage-stats.test.tsx src/features/usage-logs/hooks/__tests__/use-daily-usage-summary.test.tsx | web | passed | 0 | 21631 ms |
| Frontend typecheck | -NoProfile -Command bun run typecheck | web | passed | 0 | 15886 ms |
| Frontend i18n sync | -NoProfile -Command bun run i18n:sync | web | passed | 0 | 711 ms |
| Frontend production build | -NoProfile -Command bun run build | web | passed | 0 | 35251 ms |
| Relaykit independent build | -NoProfile -Command $env:GOWORK = 'off'; go build ./... | relaykit | passed | 0 | 1177 ms |
| Whitespace check | -NoProfile -Command git diff --check | . | passed | 0 | 945 ms |

## Blockers

_None._

## Risks and skipped work

- Public /api/status checks from this local machine currently hit TLS/502 path issues, so deployed-version verification was repeated over SSH inside both app containers instead.
- The versioned local Docker tag is operationally traceable together with the captured image ID and git-archive release directory; the tag name itself is not a registry digest.
- The staged timing instrumentation distinguishes bridge latency from upstream generation time; it cannot force a faster model completion when CPA/OpenAI generation or rate limits dominate total duration.

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | fail | A1, A2, A6, A7, A8, A12, A14, A15, A21, A22, A23, A25, A26, A27, A28 | Independent verification failed. The terminal-event fix and Option-table key persistence are correct, but post-event protocol errors can still block, the official wallet-boundary safety port is incomplete, and traceability/release evidence is not yet sufficient for Archive. Return to Build. | 2026-09-06T05:06:54.801Z |
| 1 | 2 | 1 | fail | A7, A8, A15 | 独立只读验证完成。A1-A6、A9-A14、A16-A29 的实现和证据通过；A7 因既有 web/classic lint 非零失败；A8 因尚未进行提交/PR/merge/release 被阻塞；A15 因缺少真实 CPA 与 CodexWebsocketsExecutor 凭据被阻塞。WS 后续协议 error、钱包 BIGINT/JS-safe 边界和官方 48 提交矩阵已按最新工作树复核。 | 2026-09-06T07:02:11.006Z |
| 1 | 3 | 1 | recovery | — | Native confirmed acceptance criteria changed | 2026-09-06T08:29:46.347Z |
| 2 | 1 | 1 | fail | A7, A8, A15, A20, A27, A28 | WS 后续协议错误、额度 helper、官方 relay/模型/计费更新、国内站自建渠道 CPA 真实规范路由探测均已完成并通过相应代码或测试复核。仍因未提交/合并/发布、web lint 非零和缺少 new-api 客户端 CPA 端到端记录，不能 Archive 或部署。 | 2026-09-06T09:35:26.089Z |
| 2 | 2 | 1 | fail | A7, A8, A20, A27 | 实现和隔离/真实验证已完成，包括真实CPA new-api bridge；当前不能Archive，因为全量前端lint仍非零，且尚未提交、合并和发布。 | 2026-09-06T10:09:03.873Z |
| 2 | 3 | 1 | blocked | A8 | 独立复核确认 A1-A7、A9-A29 均满足；唯一未完成项是 A8 的正式发布门禁，尚未 commit/push/PR/merge、构建不可变镜像和部署。 | 2026-09-06T11:05:13.406Z |
| 2 | 3 | 1 | recovery | — | 独立 Verify 已确认 A1-A7、A9-A29 通过，但在收尾审计中发现 PASSWORD_LOGIN_ENCRYPTION_ENABLED=true 时 LoginEncryptionKey 未加入 migrateDB/migrateDBFast 的 AutoMigrate 列表，且正式 upstream-compatibility spec 仍残留旧 rc.25 版本号；先修复这两个可验证缺口，再重新 Build/Verify。全量构建完成后清理 Go/Bun/npm 临时缓存。 | 2026-09-06T11:05:37.450Z |
| 2 | 4 | 1 | execution-error | — | 独立 Verifier 启动后因外部认证/网络服务不可用异常退出；Runtime 已完成并通过本轮全部 13 项命令检查，代码和测试结果未报告失败。未能取得新的语义验收结果，也未修改候选工作树。 | 2026-09-06T12:49:49.802Z |
| 2 | 4 | 2 | blocked | A8 | 独立只读验收覆盖 A1-A29；Runtime 本轮 13 项检查全部通过，A1-A7 与 A9-A29 通过。A8 仅因 commit、合并、不可变构建和部署尚未执行而阻塞，整体 verdict 为 blocked。 | 2026-09-06T12:56:32.868Z |
| 2 | 4 | 2 | recovery | — | 发现 origin/main 在候选建立后新增 H5 合并提交，需要先纳入最新生产主线并做受影响模块定向检查，再重新提交候选。 | 2026-09-06T13:18:22.331Z |
| 2 | 5 | 1 | blocked | A8 | Independent verification passes A1-A7 and A9-A29. The candidate is behaviorally and locally validated, including the latest origin/main merge, 48-commit matrix traceability, deterministic OpenAI Responses WebSocket tests, root and relaykit checks, and frontend checks. Overall status is blocked solely by A8: formal release commit/merge, immutable image build, and deployment have not been performed. | 2026-09-06T16:24:26.971Z |
| 2 | 5 | 1 | recovery | — | 用户确认将 Sub2API 仅作为设计参考，范围收敛为 new-api 内部直接连接 CPA；新增会话级连接复用、previous_response_id 粘性、健康检查和首帧前安全回落，不引入外部网关。 | 2026-09-06T17:19:54.507Z |
| 3 | 1 | 1 | blocked | A7, A10, A20 | All local pooling, bridge, upstream-traceability, and build checks pass. Verify is blocked only by live CPA validation and the formal release gates. | 2026-09-06T18:14:22.759Z |
| 3 | 1 | 2 | blocked | A10 | Real CPA bridge validation now passes through the new-api adaptor. All local and behavioral acceptance criteria pass; only the formal release gate remains blocked. | 2026-09-06T18:30:12.394Z |
| 3 | 1 | 3 | blocked | A10 | 独立只读复核确认当前 WS 连接池、匿名/命名会话隔离修正、脱敏回落日志和全部本地 Go/relaykit/前端检查通过；PR #45 已创建且 CI 全部成功，唯一阻塞是合并、不可变镜像构建和部署。 | 2026-09-06T19:39:58.074Z |
| 3 | 1 | 4 | recovery | — | User explicitly confirms continue long total-duration repair and include today self cache rate/total usage header; retain already-released WS fixes and finish H5 separately. | 2026-09-10T03:26:49.959Z |
| 4 | 1 | 1 | blocked | A6, A16 | No acceptance-impacting implementation defect was found in locally verifiable WS telemetry, request correlation, daily usage, or upstream traceability. Local behavior is supported by passing focused and affected-package checks, including 50 consecutive timing runs. Overall status is blocked by formal release completion and fresh live CPA evidence; the Runtime lint failure is command resolution rather than a source lint failure. | 2026-09-10T17:51:41.141Z |
| 4 | 1 | 2 | blocked | A6, A16 | Independent inspection and local verification found no acceptance-impacting implementation defect. Local behavior and compatibility evidence pass; the overall result is blocked only by formal release gates and unavailable fresh live CPA evidence. Supplemental direct frontend lint and format checks passed. | 2026-09-10T18:14:23.256Z |
| 4 | 1 | 2 | recovery | — | 真实 CPA WS 验证显示上游会以 Responses error 事件返回模型/权限错误；需要把 upstream error 事件按 SSE 透传并记录终止时序，而不是作为不可读的 bridge transport error。 | 2026-09-10T18:33:25.822Z |
| 4 | 2 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-09-10T19:41:02.553Z |
| 5 | 1 | 1 | blocked | A6 | Independent read-only review found the CPA provider-error repair correct: valid error and response.error events are forwarded unchanged as SSE, terminate without replay, record upstream_error_event timing, and do not expose secret transport data. A1-A5 and A7-A31 pass; overall verdict is blocked solely by A6 formal release gates. | 2026-09-10T19:57:43.631Z |
| 5 | 1 | 2 | pass | — | All A1-A31 acceptance criteria pass. The CPA Responses WebSocket bridge now preserves valid provider error events, records staged latency under a joinable request id, and keeps HTTP fallback/replay safety. The daily usage header adds current-user local-day cache rate and total token usage. Runtime checks, GitHub PR/CI, exact-merge release evidence, and dual-site container deployment evidence satisfy the final release gate. | 2026-09-10T21:41:46.360Z |

## Conclusion

All A1-A31 acceptance criteria pass. The CPA Responses WebSocket bridge now preserves valid provider error events, records staged latency under a joinable request id, and keeps HTTP fallback/replay safety. The daily usage header adds current-user local-day cache rate and total token usage. Runtime checks, GitHub PR/CI, exact-merge release evidence, and dual-site container deployment evidence satisfy the final release gate.
