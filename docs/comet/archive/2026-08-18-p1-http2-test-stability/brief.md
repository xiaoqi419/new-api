# Outcome

稳定 Windows 上的 raw HTTP/2 请求体重试测试夹具，使现有 `Request.GetBody` 重放契约在 RST_STREAM 与 graceful GOAWAY 场景下可重复、确定地验证，并消除连接关闭时序导致的 `wsarecv` 假失败。

# Scope

- 仅修改 `relay/channel/api_request_getbody_test.go` 中 raw HTTP/2 测试 server 的 listener、连接、goroutine 与 cleanup 生命周期。
- 在发送 `RST_STREAM(REFUSED_STREAM)` 或 `GOAWAY(NO_ERROR)` 后保持连接到客户端可靠观察协议帧，随后由测试 cleanup 统一收尾。
- 保留现有四项行为覆盖：普通 replayable body 的 RST 重试、透传 body 的 RST 重试、GOAWAY 后新连接重试、缺少 `GetBody` 时明确拒绝重试。
- 修复写帧错误检查顺序，确保 `WriteRSTStream` / `WriteGoAway` 的错误在关闭连接前被观察。

# Non-goals

- 不修改 `relay/channel/api_request.go`、`common/body_storage.go`、`relay/common/outbound_body.go` 或其他生产请求链路。
- 不改变 HTTP client/transport 策略、公开 API、依赖版本、Go 版本、数据库或产品行为。
- 不删除或弱化现有 HTTP/2 行为断言，不把 HTTP/2 用例替换为 HTTP/1。
- 不使用固定 sleep、随机重试、扩大超时或吞掉 socket 错误来掩盖竞态。

# Acceptance examples

- A1：`go test ./relay/channel -run '^TestUpstreamGetBody_HTTP2' -count=10 -timeout=60s -v` 连续通过；四个既有 HTTP/2 用例均保留且无 Windows `wsarecv` reset/abort 假失败。
- A2：RST 与 GOAWAY retry 用例都观察到两次完整请求体；缺少 `GetBody` 的用例仍只发送一次，并返回同时包含 `cannot retry err` 与 `Request.Body was written` 的明确错误。
- A3：fixture 对 listener 和所有已接受连接具有确定的 cleanup；写控制帧错误在关闭前检查；断言提前失败时也能解除 `Accept` / `ReadFrame` 阻塞，且实现不含 sleep、随机化或弱化断言。
- A4：`go test ./relay/channel -count=1` 与 root `GOWORK=off go test ./...` 通过；Git 差异除 Comet 正式产物外只包含批准的测试文件，不包含生产 HTTP 代码、依赖或 Go 版本变化。

# Constraints and invariants

- 保留现有 `Request.GetBody`、`ReplayableBody` 和独立 body reader 的生产契约。
- 遵守根 `AGENTS.md` 的后端测试质量要求，继续使用 `testify/require` 与 `testify/assert` 表达现有行为契约。
- 测试收尾必须确定且可中断；不得依赖执行速度、平台调度或连接被动超时。
- 不修改用户已有 `.agents/skills/comet-any/`，不改受保护的 `new-api`、`QuantumNous` 标识。

# Decisions

- Fast Context 与 `rg` 复核确认生产 replay chain 完整，失败发生在 raw-frame fixture 写完控制帧后立即关闭 TCP 的时序窗口；本 change 按测试夹具缺陷处理。
- 用户已确认仅稳定测试夹具；若修复生命周期后仍能复现协议层失败，停止扩张并重新调查，不自行修改生产 transport 或升级依赖。
- change 使用独立 worktree，目标分支为 `codex/p0-wallet-wechatpay`。

# Open questions

- 无。当前证据和用户确认已覆盖实现边界、非目标与验收方式。

# Verification expectations

- Builder 先运行 A1 的十轮定向稳定性检查，再运行 package 与 root 全量检查；不得用单次通过替代稳定性验收。
- 新的只读 Verifier 必须逐项核对 A1-A4、实际 diff、cleanup 失败路径和最新命令结果。
- Verify 接受后、Archive 前同步更新 `docs/torch-ai-maintenance-status.md`，记录真实通过证据和剩余上线风险。
