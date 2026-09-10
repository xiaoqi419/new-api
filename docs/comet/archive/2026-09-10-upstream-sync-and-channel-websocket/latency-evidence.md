# 长耗时排查：分阶段证据

## 目标

同一请求的长耗时不再作为一个不透明总时长上报，而是拆成可归因的阶段，用于区分：

- 上游还在生成（首事件到首文本之间的间隔大）；
- 流中途停顿（首文本到终止事件之间的间隔大）；
- 上游已完成但网关/下游拖尾（终止事件与清理之间的间隔大）；
- 连接建立或复用开销（桥接开始到拿到 lease 的间隔大）。

不把 `response.created` / `response.in_progress` 这类记账事件当作真实首文本，也不承诺上游生成速度。

## 采集位置

`relay/channel/openai/cpa_responses_ws.go` 在一次 WebSocket 桥接尝试内打一行结构化日志，所有阶段都以桥接开始为 0 点：

| 字段 | 含义 |
| --- | --- |
| `bridge_start_ms` | 固定为 0，作为基准 |
| `bridge_to_lease_ms` | 从桥接开始到拨号或从连接池复用拿到 lease 的阶段完成时间；包含请求准备和连接池等待 |
| `upstream_first_event_ms` | 上游第一个事件到达 |
| `upstream_first_text_ms` | 上游第一个真实文本事件（`response.output_text.delta` / `.done`）到达 |
| `upstream_terminal_ms` | 上游终止或协议错误事件到达 |
| `bridge_terminal_write_ms` | 终止帧写入 bridge `io.Pipe` 完成；客户端真正的 SSE render/flush 仍由 Responses handler 负责 |
| `cleanup_ms` | 释放 lease、关闭管道等收尾完成 |

日志同时带 `reason`、`channel`、`reused`，因此连接复用与回落路径也能区分。

## 已采集样本

来源：`go test ./relay/channel/openai/ -run TestDoResponsesWebsocketRequestLogsTerminalTimingStages -count=1 -v`
（测试验证事件顺序、请求 ID 传递和收尾时点，不用睡眠或耗时阈值制造性能结论；真实生产间隔由线上日志提供）

```text
[INFO] 2026/09/11 - 00:45:29 | timing-test-request | responses websocket timing: request_id=timing-test-request reason=healthy channel=0 reused=false bridge_start_ms=0 bridge_to_lease_ms=1 upstream_first_event_ms=1 upstream_first_text_ms=1 upstream_terminal_ms=1 bridge_terminal_write_ms=1 cleanup_ms=1
```

这个本地样本只证明阶段口径和关联字段存在；它不代表真实上游延迟。线上读法是：`upstream_first_event_ms - bridge_to_lease_ms` 看首事件前等待，`upstream_first_text_ms - upstream_first_event_ms` 看首文本前生成间隔，`upstream_terminal_ms - upstream_first_text_ms` 看流中停顿，`cleanup_ms - bridge_terminal_write_ms` 看 bridge 收尾拖尾。日志前缀、`request_id=`、CPA 的 `X-Client-Request-Id` 和 consume log 的 `request_id` 使用同一请求 ID。

该样本同时被断言覆盖：各阶段必须单调不减，避免阶段口径被写反（`TestDoResponsesWebsocketRequestLogsTerminalTimingStages`）。

## 可归因与尚不可归因

可归因（本轮已具备证据）：

- 连接建立/复用开销；
- 上游首事件延迟；
- 上游首文本延迟（真实文本，不是记账事件）；
- 终止事件之后的本地桥接与写回拖尾；
- 失败路径（`acquire_failed`、`envelope_write_failed`、`first_frame_*`、`upstream_read_failed`、`downstream_write_failed`）发生在哪个阶段；
- CPA 已建立 WebSocket 后返回的合法 Responses provider error（`error` / `response.error`）会记录为 `upstream_error_event`，并把原始错误事件透传到 SSE，不再伪装成不可读的 bridge transport error。

尚不可归因（本轮未取得证据，列为限制）：

- 真实生产长耗时样本。需要线上渠道与 CPA 凭据在真实请求上复现，当前环境无法执行；
- 上游模型自身生成速度。这是上游能力，不作为本 change 的优化目标，也不通过降低推理力度、截断回答或改写生成参数制造"改善"。

## 使用方式

对同一条长耗时请求，取该请求对应的 `responses websocket timing:` 行：

- `upstream_first_event_ms - bridge_to_lease_ms` 偏大 → 上游排队/思考；
- `upstream_first_text_ms - upstream_first_event_ms` 偏大 → 上游生成中；
- `upstream_terminal_ms - upstream_first_text_ms` 偏大 → 流中途停顿；
- `cleanup_ms - bridge_terminal_write_ms` 偏大 → bridge 本地收尾拖尾，属可修复缺陷；客户端真正 flush 的耗时要结合 Responses handler 的请求总耗时判断；
- 若桥接日志整体缺失 → 该请求未走 WS 路径（回落 HTTP 或非流式），应与 HTTP 路径分别对比。

## CPA 实时验证

2026-09-11 通过 SSH 本地端口转发，对服务器上的 CPA `/v1/responses` 执行了同一 `doResponsesWebsocketRequest` 桥接测试：

- CPA 对不可用模型返回 `type=error`、HTTP 语义状态 `404`、`code=model_not_found`。修复前，桥接将事件写入管道后以 `responses websocket upstream protocol error` 结束，直接读取响应体会得到 transport error；
- 修复后，响应体正常 EOF，保留 `data: {"type":"error", ...}`，并记录 `reason=upstream_error_event`、`upstream_terminal_ms` 和 `bridge_terminal_write_ms`；
- 使用 CPA `/v1/models` 返回的 `gpt-5.6-terra` 执行成功路径，实时桥接测试通过，端到端耗时约 3 秒。该结果证明当前 CPA 路由、WS 握手、事件转发和成功终止路径可工作；它不等价于生产渠道 35 的整体首字或总耗时基准。
