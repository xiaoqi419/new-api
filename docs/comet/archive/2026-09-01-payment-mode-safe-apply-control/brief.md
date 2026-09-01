# Outcome

Root 管理员可以在支付设置中安全保存并（在明确满足条件的部署环境中）应用支付网关模式。支付模式仍在进程启动时冻结；应用操作只会在数据库提交、审计和 HTTP 响应准备完成后触发当前进程既有的优雅关闭，由外部 supervisor 负责拉起新进程。

# Scope

- 修复 `UpdateOption` 的查询、创建和保存错误传播，确保数据库失败不污染内存 OptionMap。
- 提供 Root-only 支付模式状态接口，返回 desired/effective 模式、进程启动时间、能力资格、单实例状态及安全原因。
- 提供固定 schema 的 Root-only“保存并应用”接口：只接受模式枚举、预期状态和幂等请求 ID，不接受任意部署目标或命令参数。
- 保留“仅保存”路径；自重启默认关闭，未满足 capability、supervisor、单实例或并发条件时仅提示运维手工重启。
- 将保存、审计、响应和异步 graceful shutdown 固定为安全顺序，避免重复触发、陈旧提交和多实例误操作。
- 在支付设置页展示草稿、desired、effective、能力状态和本地化错误；应用期间有限轮询，只有新进程启动时间、健康状态、模式一致和单实例条件全部满足才显示成功。
- 复用现有 shutdown timeout、system instance heartbeat 和权限/CSRF 边界，不新增数据库表或列，不触碰其他站点、Redis、数据库或支付网关；双站点部署隔离保留为上线前运维门禁，本地阶段不访问线上环境。

# Non-goals

- 不在运行时热切换支付协议，不执行 Docker、Compose、Shell、SSH、systemd、Kubernetes、fork、exec 或 `os.Exit`。
- 不提供选择容器、服务、主机、数据库、Redis、网关、另一站点或信号的能力。
- 不实现多实例滚动重启；无法证明单实例时必须失败关闭并保留手工重启。
- 不修改国内/国际站的业务数据、支付凭据、语言、币种、品牌、价格或倍率；本地 Build/Verify 不访问线上 supervisor、数据库、Redis 或支付网关。

# Acceptance examples

- A9: 合法模式保存时数据库写入失败返回失败，数据库值、OptionMap 和 effective mode 均不变，且不触发退出。
- A10: Root 可选择“仅保存”或“保存并应用”；非 Root 无法读取状态或调用应用接口。
- A11: capability 未启用、平台不支持、实例检测失败或活跃实例不为一时，不提供可执行应用按钮，只显示手工重启提示。
- A12: 应用必须二次确认；重复点击、目标变化、已生效或已有操作时只返回确定状态，不重复退出。
- A13: 应用 API 只接受固定模式、预期状态和幂等标识，不接受自由目标或命令。
- A14: desired 持久化、审计和响应准备完成后才异步触发当前进程 graceful shutdown，由 supervisor 拉起。
- A15: 页面在断连期间重试轮询，只有新 `started_at`、健康、effective==desired 且单实例时显示成功，否则失败/手工处理。
- A16: 当前站点隔离数据库中的第二个活跃实例、stale/未知状态或查询错误会拒绝应用，不报告混合生效。
- A17: 触发路径只结束当前应用进程，不影响 PostgreSQL、Redis、EPUSDT/GMPay 或另一站点。
- A18: 受影响 Go/前端/i18n/构建检查和独立只读 Verifier 全部通过，新增用户可见文案进入 changelog。

# Constraints and invariants

- `PaymentGatewayMode` 仅允许 `epay_legacy`、`gmpay_native`；空值默认 `epay_legacy`，非法值在 HTTP listener 启动前失败。
- effective mode 在启动时读取并冻结；保存 desired 不改变当前进程。
- `ADMIN_SELF_RESTART_ENABLED` 默认关闭，且不是唯一授权条件；必须同时满足优雅关闭支持、单实例、无并发应用操作、desired 与 effective 不同。
- 应用接口固定 Root 权限、请求 schema、审计字段和速率限制；不得记录凭据、授权头、钱包地址或部署细节。
- 不新增支付模式相关数据库结构；数据库、Redis、网关和两站点保持隔离。

# Decisions

- 使用现有 system instance heartbeat 判断当前站点活跃实例数。
- 使用进程内可注入 shutdown trigger 复用已有 graceful shutdown 路径，响应提交后异步触发。
- 前端以 bounded polling 判断恢复，不以单次健康响应或保存成功冒充已生效。
- 用户确认：国内站与国际站的真实 supervisor、数据库、Redis、凭据和部署隔离改为上线前运维验收项；本地 Build/Verify 仅验证代码级当前站点边界，不访问线上环境。

# Open questions

无。父级 Shape 已确认；本轮只调整 A40 的验收时点，不改变安全应用功能范围。

# Verification expectations

- Go model/service/controller/main 测试覆盖错误传播、Root-only、固定 schema、乐观校验、幂等、限频、审计、capability、单实例和 trigger 顺序。
- 前端测试覆盖仅保存、保存并应用确认、禁用/多实例回退、断线重试、成功三条件、超时和模式不匹配。
- 运行受影响 Go 测试、前端聚焦测试、`bun run i18n:sync`、`bun run typecheck`、`bun run build`、静态安全检查和 `git diff --check`。真实双站点 supervisor/数据库/Redis/凭据隔离在上线前由运维单独验收，不作为本地 Verify 的阻塞条件。
