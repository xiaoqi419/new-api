# HTTP/2 请求体重试测试稳定性规格

## Scenario: RST_STREAM 后确定地验证请求体重放

- raw HTTP/2 server 完整接收第一条请求体后写入 `RST_STREAM(REFUSED_STREAM)`，并在允许重试的用例中保持连接可用，读取 retried stream 后返回 200。
- 普通 replayable body 与透传 body 的两次请求体都必须与原 payload 完全一致。
- 故意移除 `GetBody` 的用例必须返回明确的不可重试错误，server 只观察到一次请求；连接由 cleanup 收尾，不通过立即关闭制造 socket reset。

## Scenario: GOAWAY 后在新连接上确定地重试

- server 在第一条连接完整接收请求后写入 `GOAWAY(NO_ERROR)`，`LastStreamID` 为 0，并保持第一条连接到客户端可靠观察控制帧。
- server 接受第二条连接，读取完整 retried body 并返回 200；两次请求体必须完整且相等，第二次请求必须发生在新连接。

## Scenario: Fixture 生命周期和错误处理可中断

- fixture 显式拥有 listener、所有 accepted connections 和后台 goroutine，并提供可重复调用或等价安全的 cleanup。
- 测试在可能提前终止的断言前注册 cleanup；cleanup 关闭 listener 与连接，以解除阻塞中的 `Accept`、`ReadFrame` 或写操作。
- `WriteRSTStream`、`WriteGoAway` 和响应写入错误必须立即记录并返回，不能先关闭连接再检查写入结果。
- 实现不使用 sleep、随机化、根据耗时猜测同步、无限等待或仅靠 deadline 做正常收尾。

## Scenario: 生产请求契约保持不变并通过完整门禁

- `ApplyUpstreamBodyMetadata`、`BodyStorage.NewReader`、生产 HTTP client、retry policy、API、依赖与 Go toolchain 均保持不变。
- 四个现有 HTTP/2 行为测试在 Windows 上连续十轮稳定通过，channel package 与 root 全量 Go 测试通过，且批准范围外没有代码变更。
- Verify 接受后更新维护状态文档，再进入 Archive。
