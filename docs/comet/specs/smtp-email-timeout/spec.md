# 有界 SMTP 邮件发送规格

## 完整目标

SMTP 邮件发送必须从 TCP 拨号开始使用约 10 秒的共享绝对 deadline。该 deadline 必须作用于 TCP 连接、服务端 greeting、隐式 TLS 握手、STARTTLS 协商和握手、认证、发件人、收件人、DATA、正文写入、正文结束与 QUIT 的全部网络 I/O。任何阶段都不得获得独立的完整超时预算。

## 连接与 TLS 行为

- 所有 SMTP 连接通过 `net.Dialer.DialContext` 在该 absolute deadline 下建立，并在成功后立即对底层 `net.Conn` 设置同一个 deadline。
- 启用 `SMTPSSLEnabled` 或未启用 STARTTLS 的 465 端口继续使用隐式 TLS；TLS 握手失败或超时返回可识别的隐式 TLS 阶段错误。
- 启用 `SMTPStartTLSEnabled` 时继续要求服务器支持 STARTTLS，并在协商或握手失败、超时时返回可识别的 STARTTLS 阶段错误。
- 明文 SMTP、显式 STARTTLS、隐式 TLS、现有认证选择逻辑和 `SMTPInsecureSkipVerify` 的证书校验语义保持兼容。

## 错误安全与端点契约

- 每个可失败的 SMTP 阶段以 `%w` 包装底层错误，允许调用方使用 `errors.Is` 或 `errors.As` 识别原因。
- 对外 `Error()` 文本必须标识失败阶段，并在 deadline 到期时标识 timeout；不得包含 SMTP token、账号、收件人、邮件主题或正文。
- `SendEmail` 返回安全阶段错误后，`/api/option/test_email` 继续使用既有 RootAuth、CriticalRateLimit、HTTP 200 JSON 失败结构和成功审计行为，无需新增或改变控制器协议。

## 回归测试

- 测试只使用本地监听器和临时自签名证书，不访问公网或真实邮箱。
- greeting 不发送、隐式 TLS handshake 卡住、STARTTLS handshake 卡住三类测试通过包内受控 deadline 快速完成，断言错误阶段、timeout 语义、错误链和敏感值不泄露，而不比较实际耗时。
- 既有明文、STARTTLS、隐式 TLS 与 TLS 校验测试继续覆盖成功和拒绝路径。
