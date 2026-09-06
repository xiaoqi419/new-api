# 渠道上游 WebSocket 完整规格

## 默认行为

渠道 `setting` JSON 可选字段 `upstream_transport`：空值或 `http` 表示现有 HTTP 上游；`websocket` 只对流式 OpenAI Responses 请求生效。非流式 Responses、Responses compact、Chat Completions、Realtime、音频、图片、视频和其他端点继续使用现有路径。

## 上游连接

new-api 以渠道配置的 Base URL、Authorization 和安全的头部覆盖规则建立 `ws`/`wss` 连接。CLIProxyAPI/CPA 的 Responses WebSocket 先升级规范的 `/v1/responses` 路由；为兼容旧部署，再按 `/v1/responses/ws`、`/v1/ws` 顺序探测别名。`/v1/ws` 仅作为最后兼容路径，避免误选 CPA 的通用 WebSocket relay。不把密钥或完整请求体写入日志。连接继承请求取消并在所有退出路径关闭。

## 协议桥接

把已完成的 Responses 请求包为上游要求的 `response.create` 文本事件。上游 Responses 事件按现有 relay SSE 语义发送给客户端，保留事件类型、JSON 内容和顺序；终止事件中的 usage 继续交给既有 Responses handler、预扣、结算和日志链路。

## 回落和错误

握手 401/404/405、拨号失败、上游协议错误或尚未向客户端输出任何事件时，关闭 WS 并使用同一请求体回到 HTTP Responses。客户端取消、写入失败、读取失败和终止事件都必须停止 goroutine、关闭连接和管道，不产生重复结算。WS 失败日志只记录脱敏原因、渠道和是否回落。

## 管理界面

default 与 classic 渠道编辑器均显示 HTTP/WebSocket 选项、默认 HTTP、i18n 文案和服务端非法值错误映射；配置保存在现有 `setting` JSON，不新增列。

## 验收

- deterministic fixture 覆盖 URL、鉴权、`response.create`、多帧转 SSE、usage、终止、错误、取消和 HTTP 回落。
- 真实测试 CPA 验证规范 `/v1/responses` WS 路由、`response.create`、Responses 事件和 usage，并确认 new-api 客户端仍收到 `text/event-stream` SSE；实现保留 `/v1/responses/ws` 与 `/v1/ws` 兼容探测。
- 关闭开关的旧渠道和所有非 Responses 请求行为与基线完全一致。
