# Outcome

使 SMTP 邮件发送在服务器不响应时在约 10 秒内可靠失败，覆盖 TCP 连接、SMTP greeting、隐式 TLS 与 STARTTLS 握手以及之后的 SMTP 读写；失败向调用方提供可识别的阶段信息，同时不暴露 SMTP 凭据或邮件内容。

# Scope

- 在 `common/email.go` 中以单一绝对 deadline 驱动 TCP 连接、TLS/STARTTLS 握手与全部 SMTP I/O。
- 保留现有明文 SMTP、显式 STARTTLS、465 隐式 TLS、认证选择和 TLS 校验配置语义。
- 将网络/协议失败包装为可识别阶段错误，保留底层错误链以便 `errors.Is`/`errors.As`，但不将 SMTP token、账号、收件人或正文写入错误文本。
- 在 `common/email_test.go` 中使用本地可控 listener 覆盖 greeting、隐式 TLS handshake 和 STARTTLS handshake 卡住场景，并保留正常路径回归覆盖。
- 保持 `/api/option/test_email` 的现有鉴权、HTTP 状态和 JSON 响应契约；仅通过安全的 `SendEmail` 错误文本影响其失败消息。

# Non-goals

- 不改变 SMTP server、port、TLS 模式、认证机制或管理员配置字段的含义。
- 不修改前端、认证视觉、IP/地区访问策略、部署配置或其他邮件业务流程。
- 不依赖公网 SMTP、真实邮箱或性能耗时阈值断言测试超时行为。
- 不改变测试邮件的收件人选择、审计记录或控制器鉴权逻辑。

# Acceptance examples

- 接受 TCP 连接但不发送 SMTP greeting 的本地服务端会使 `SendEmail` 返回包含 greeting 和 timeout 阶段的安全错误。
- 在隐式 TLS 或 STARTTLS 的握手阶段停止响应的本地服务端会使 `SendEmail` 返回对应 TLS 阶段的安全错误，而不会让请求等待到网关超时。
- 正常明文、STARTTLS 和 465 隐式 TLS 流程继续发送邮件；`SMTPInsecureSkipVerify` 仍控制测试/兼容证书校验。
- 经 `/api/option/test_email` 返回的失败消息不包含 SMTP token、账号、收件人或邮件正文。

# Constraints and invariants

- deadline 必须设置在实际 `net.Conn` 上，并从拨号开始保持为同一个绝对截止时间，不得按 SMTP 阶段重置。
- 使用 `net.Dialer.DialContext` 和 `SetDeadline`，确保连接、TLS 握手和 `net/smtp` 内部读写均可中断。
- 阶段错误必须通过 `%w` 保留因果链，并对外输出无敏感值的稳定阶段描述。
- 新增/重写 Go 测试使用 `testify/require` 进行致命断言、`testify/assert` 进行非致命断言。

# Decisions

- 默认操作 deadline 设为约 10 秒；测试仅通过包内受控值缩短该 deadline，不提供新的运行时 SMTP 配置项。
- 连接建立后仅设置一次 `SetDeadline`，TLS 包装层沿用同一底层连接，避免连接、握手和 SMTP 命令分别获得完整超时预算。
- 阶段错误的可见文本只包含 SMTP 阶段与 timeout/failed 状态；底层错误通过包装链保留给程序检查而不直接展示。
- 继续使用现有 fake SMTP server 的成功路径测试，并为卡住场景增加独立本地 listener fixture。

# Open questions

- 无。Supervisor 已确认本 child 的范围、约 10 秒目标和实现方向。

# Verification expectations

- 运行新增的 greeting、隐式 TLS handshake 和 STARTTLS handshake 卡住回归测试。
- 运行 `go test ./common`，并执行 `gofmt` 与适用的 Go 静态检查。
- 检查错误文本不包含测试 SMTP token、账号、收件人或正文，且错误链仍可识别超时。
