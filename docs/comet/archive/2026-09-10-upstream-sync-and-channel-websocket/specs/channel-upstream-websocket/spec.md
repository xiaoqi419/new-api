# 渠道上游 WebSocket 完整规格

## 默认行为

渠道 `setting` JSON 可选字段 `upstream_transport`：空值或 `http` 表示现有 HTTP 上游；`websocket` 只对流式 OpenAI Responses 请求生效。非流式 Responses、Responses compact、Chat Completions、Realtime、音频、图片、视频和其他端点继续使用现有路径。

## 上游连接

new-api 以渠道配置的 Base URL、Authorization 和安全的头部覆盖规则建立 `ws`/`wss` 连接。CLIProxyAPI/CPA 的 Responses WebSocket 先升级规范的 `/v1/responses` 路由；为兼容旧部署，再按 `/v1/responses/ws`、`/v1/ws` 顺序探测别名。`/v1/ws` 仅作为最后兼容路径，避免误选 CPA 的通用 WebSocket relay。不把密钥或完整请求体写入日志。

WS 连接在 new-api 进程内按渠道上游、鉴权指纹和模型隔离。首轮请求只有在提供稳定的会话标识（例如受信任的会话/对话头）时才可绑定空闲连接；没有会话标识的首轮请求必须建立新连接，避免不同会话共享上游上下文。后续请求带有 `previous_response_id` 时，优先复用生成该 ID 的连接；`store=false` 的请求必须保持同一连接语义，不能仅凭全局空闲连接猜测上下文。

每条连接同一时刻只能被一个请求 lease；正常终止后归还连接池，连接空闲超时、达到最大生命周期、写入/读取失败或协议错误时淘汰。借用空闲连接时执行有界的健康检查；仅请求尚未尝试发送时允许安全重建；发送后读取失败不重放。请求取消会释放当前 lease，所有 goroutine、管道和连接均有确定的退出路径。

## 协议桥接

把已完成的 Responses 请求包为上游要求的 `response.create` 文本事件。上游 Responses 事件按现有 relay SSE 语义发送给客户端，保留事件类型、JSON 内容和顺序；终止事件中的 usage 继续交给既有 Responses handler、预扣、结算和日志链路。

## 回落和错误

只有尚未尝试发送请求的握手失败可安全回落 HTTP。尝试写入后，即使首帧未到也不得自动重放。取消、错误与终止事件及时释放资源。上游返回的合法 Responses `error` / `response.error` 事件按 SSE 原样传递给客户端，并作为终止事件记录分阶段时序；本地无法解析的首帧仍视为 bridge 协议错误。

## 管理界面

default 与 classic 渠道编辑器均显示 HTTP/WebSocket 选项、默认 HTTP、i18n 文案和服务端非法值错误映射；配置保存在现有 `setting` JSON，不新增列。

## 验收

- deterministic fixture 覆盖 URL、鉴权、`response.create`、多帧转 SSE、usage、终止、错误、取消和 HTTP 回落。
- deterministic fixture 覆盖稳定会话的连接复用、`previous_response_id` 粘性、不同会话隔离、连接失效淘汰、发送前安全重建、发送后禁止重放和单连接串行 lease。
- 真实测试 CPA 验证规范 `/v1/responses` WS 路由、`response.create`、Responses 事件和 usage，并确认 new-api 客户端仍收到 `text/event-stream` SSE；实现保留 `/v1/responses/ws` 与 `/v1/ws` 兼容探测。
- 关闭开关的旧渠道和所有非 Responses 请求行为与基线完全一致。

## 本轮剩余目标

长耗时使用同请求分阶段证据定位，区分首事件、首文本、终止和记录时间，不承诺上游生成速度。日志顶部 TPM 右侧增加当前登录用户今日缓存率与总 Token；使用本地自然日，独立列表过滤，加权缓存率，不重复计入缓存，支持空值、翻译、隐私和跨日刷新。
