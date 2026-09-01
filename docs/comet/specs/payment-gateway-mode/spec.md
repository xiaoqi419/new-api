# Payment Gateway Mode Isolation And Safe Apply

## 目标

应用以同一代码基线支持两个互斥的 EPay-family 支付模式：国内实例使用 `epay_legacy`，国际实例使用 `gmpay_native`。模式在进程启动时从当前站点隔离数据库读取并冻结，运行期间不热切换。

Root 管理员可以只保存目标模式，也可以在受控环境中“保存并应用”。安全应用只调度当前应用进程的既有优雅关闭，由部署外部 supervisor 自动拉起；Web 应用不获得 Docker、Shell、SSH、systemd、Kubernetes 或任意部署目标控制权。

## 配置与启动冻结

1. 可持久化 Option `PaymentGatewayMode` 只接受 `epay_legacy` 和 `gmpay_native`；不存在或为空时使用 `epay_legacy`。
2. 应用在主数据库初始化和 Options 加载完成后验证并冻结 effective mode。数据库中存在非法值时，在 HTTP listener 启动前失败且错误不泄漏支付凭据。
3. 所有下单、公开支付能力、回调和支付方式模板使用 effective mode，不从 Host、转发头、请求参数、系统名称或支付方式名称推断。
4. 保存 desired mode 不改变当前进程的 effective mode；只有新进程从数据库重新加载并冻结后才生效。
5. `EffectivePaymentGatewayMode` 是只读运行状态，通用 Option PUT 不得写入。

## Option 持久化正确性

1. `UpdateOption` 的查询、创建和保存错误必须逐层返回；数据库失败时不得更新本地 OptionMap。
2. “仅保存”和“保存并应用”都必须在数据库提交成功后才报告保存成功。
3. 持久化失败、目标校验失败或上下文取消时不得调度关闭、不得记录为应用成功。
4. 保存后的本地 desired mode 与数据库值必须一致；重启后的进程以数据库提交值为唯一来源。

## Root 管理界面

1. 支付设置页同时展示当前 effective mode、已保存 desired mode 和当前草稿模式。
2. 草稿与已保存值不同时提供“仅保存”；草稿与 effective mode 不同时，在运行环境符合条件时另外提供“保存并应用”。
3. “保存并应用”必须二次确认，明确提示当前站点会短暂不可用，正在进行的长请求可能等待优雅关闭超时，并说明失败时需运维手工处理。
4. 页面展示后端给出的自重启能力、单实例资格和不可用原因，不由浏览器自行推断。
5. 非 Root 不得读取该控制状态或调用应用操作。
6. 自重启不可用时仍允许“仅保存”，并保留“保存成功，需运维手工重启”的现有流程。

## 自重启能力开关

1. `ADMIN_SELF_RESTART_ENABLED` 默认关闭。只有运维确认当前进程由 `restart: always`、systemd Restart 或等价 supervisor 自动拉起时才可显式启用。
2. 环境开关不是唯一授权。后端还必须确认：
   - 当前运行平台支持应用既有的优雅关闭触发；
   - 系统实例查询成功；
   - 当前站点隔离数据库中恰好一个实例处于活跃窗口；
   - 当前没有已接受但尚未触发的应用操作；
   - desired mode 与 effective mode 不同。
3. 任一条件未知或不满足都失败关闭；多实例不执行普通滚动重启，也不显示为已应用。
4. 国内站与国际站因数据库、进程和环境变量隔离而分别判断资格；一个站点不能调用或选择另一个站点。

## 受限应用 API

1. 提供 Root-only 状态接口，返回 desired mode、effective mode、进程 started_at、自重启 capability、单实例资格和不可用原因；不返回密钥或部署控制细节。
2. 提供 Root-only“保存并应用”接口。请求只允许包含目标模式枚举、预期 effective/desired 状态及幂等标识；不得接受容器、服务、主机、节点、URL、命令、参数、信号、数据库、Redis 或网关目标。
3. 后端重新读取当前状态并执行乐观校验。目标已变化、effective 已等于目标、幂等请求重复、另一个操作进行中或资格丢失时，返回确定状态且不重复触发。
4. 服务端先验证并持久化 desired mode，再写入包含操作者、请求 ID、旧 effective、目标 mode 和接受结果的管理审计；不得记录支付密钥。
5. 只有数据库提交与审计响应准备完成后，接口返回已接受。当前 HTTP 响应提交完成后，异步触发与外部 SIGTERM 相同的既有优雅关闭路径；禁止直接 `os.Exit` 或在 handler 内阻塞等待进程停止。
6. 应用代码只能结束当前进程。数据库、Redis、支付网关、Docker daemon、另一应用实例和另一站点不在该 API 的地址空间或参数空间内。

## 优雅关闭与自动拉起

1. 自重启复用现有 shutdown timeout 和 graceful server shutdown，停止接受新请求并等待在途请求至既有超时。
2. 响应、数据库提交和审计必须发生在 shutdown trigger 之前；测试通过可注入 trigger 验证顺序，不真实结束测试进程。
3. 外部 supervisor 负责拉起进程；应用不尝试 fork、exec、调用 Docker 或修改 Compose。
4. 新进程重新初始化数据库与 Options，并冻结已提交 desired mode。初始化失败时不得启动 HTTP 服务或伪装健康。
5. 自动拉起契约不触碰 PostgreSQL、Redis、EPUSDT/GMPay 网关、数据卷或另一站点应用。

## 恢复状态与成功判定

1. 前端在收到 accepted 后记录操作前 `started_at`，进入 applying 状态，并以有上限的重试轮询 Root-only 状态。
2. 短暂网络错误、502/503 或连接拒绝视为重启中的可重试状态，不立即误报成功。
3. 只有同时满足以下条件才显示 succeeded：
   - 状态接口恢复；
   - 新进程 `started_at` 晚于操作前；
   - effective mode 等于已保存 desired mode；
   - 当前仍符合单实例视图，且没有冲突状态。
4. 轮询超时、进程未重新出现、started_at 未变化、effective 不匹配、出现第二个活跃实例或状态查询失败超过上限时显示 failed/needs-manual-action，不显示“已生效”。
5. 页面刷新后仍可从 desired/effective/started_at 判断是否待应用；无需新增数据库表或依赖 Redis 保存 UI 状态。

## Legacy 与 Native 行为

1. Legacy 模式继续使用现有 EPay MAPI、明确 404 时的兼容路径和 MD5 回调；Native GMPay HMAC 回调在 Legacy 模式下失败关闭。
2. Native 模式的普通钱包使用结构化站内 Crypto checkout；Legacy `/submit.php` 路径不能被旧用户 API 绕过调用。
3. Native 模式下普通钱包的 USDT 多网络行为遵循 `epusdt-multi-chain-wallet-checkout` 完整规格。
4. 订阅、拼团和代理预付继续遵循现有 Native 规格并使用其明确配置；普通钱包网络选择不得无意改变这些产品。
5. 错误模式的回调不得改变订单、用户额度、订阅、拼团或代理钱包数据。

## 数据与部署隔离

1. 不新增支付模式相关数据库表或列；模式继续存储在 Options，系统实例继续使用现有心跳数据。
2. 国内和国际实例可由同一 Git 提交和镜像构建，但数据库、Redis、支付凭据、用户和部署环境完全隔离。
3. `ADMIN_SELF_RESTART_ENABLED` 是逐部署环境变量，默认关闭；选择模式不自动修改语言、币种、品牌、价格、分组或倍率。
4. 本能力不创建国内/国际长期代码分支，也不允许任一实例控制另一实例。

## 审计与安全

1. 保存目标与应用操作使用 Root 身份校验；沿用项目已有 CSRF/session/API 权限边界。
2. 审计记录安全枚举值、操作者、请求 ID、时间和结果，不记录 PID secret、EpayKey、钱包地址或授权头。
3. 应用操作限频且幂等，快速重复点击最多调度一次优雅关闭。
4. 任意未知字段、非法模式、陈旧预期、自由目标参数或 capability 不可用都拒绝，不降级执行部分命令。

## 验证

- Model 测试覆盖 `FirstOrCreate`/`Save` 错误传播、OptionMap 不被污染、合法/非法模式及启动冻结。
- Controller/Middleware 测试覆盖 Root-only、请求 schema、未知字段、乐观校验、幂等、限频、审计、禁用 capability、非单实例和数据库失败不触发。
- Service/Main 测试通过注入 trigger 验证响应与审计先于优雅关闭，并证明触发函数只能作用于当前进程。
- 前端测试覆盖有效/无效资格、“仅保存”、“保存并应用”确认、提交锁、断线轮询、成功三条件及超时/模式不匹配。
- 静态检查证明代码中没有 Docker socket、Shell、SSH、任意 URL、容器名或其他工作负载控制入口。
- 受影响 Go 测试、前端聚焦测试、i18n 同步、生产构建和独立只读 Verifier 验收通过。
