# Payment Gateway Mode Safe Apply

## 目标与边界

同一代码基线支持 `epay_legacy` 和 `gmpay_native` 两种互斥支付模式。模式由当前站点隔离数据库提供，在进程启动时读取并冻结；运行期间不热切换。Root 管理员可保存 desired mode，并在显式启用且证明安全的单实例部署中保存并应用。

Web 应用只结束自身进程，复用现有 graceful shutdown；外部 supervisor 负责重新拉起。任何数据库、Redis、支付网关、另一站点、容器、主机或命令控制均不在 API 能力范围内。

## 配置与持久化

1. `PaymentGatewayMode` 只接受 `epay_legacy` 和 `gmpay_native`，不存在或为空时使用 `epay_legacy`。
2. 初始化数据库和 Options 后校验并冻结 effective mode；非法值在 HTTP listener 启动前失败，错误不得泄漏凭据。
3. 所有下单、公开支付能力、回调和模板使用 effective mode，不根据 Host、转发头、请求参数或系统名称推断。
4. 保存 desired 不改变当前 effective；只有新进程重新加载后生效。
5. `EffectivePaymentGatewayMode` 为只读运行状态，通用 Option PUT 不得写入。
6. `UpdateOption` 必须逐层返回查询、`FirstOrCreate` 和 `Save` 错误；任何数据库失败都不得更新 OptionMap。

## Root API 与权限

1. 提供 Root-only 状态接口，返回 desired、effective、`started_at`、自重启能力、单实例资格、当前操作状态和不可用原因，不返回密钥或部署细节。
2. 提供 Root-only“保存并应用”接口。请求只允许目标模式枚举、预期 effective/desired 值和幂等 request ID；未知字段、容器/服务/主机/URL/命令/信号/数据库/Redis/网关参数一律拒绝。
3. 服务器重新读取状态并执行乐观校验。目标已变化、effective 已等于目标、请求重复、已有操作或 capability 丢失时返回确定状态且不重复触发。
4. 保存和应用均沿用既有 CSRF/session/API Root 权限边界；非 Root 不得读取状态或调用应用接口。

## Capability 与单实例保护

1. `ADMIN_SELF_RESTART_ENABLED` 默认关闭；开启只表示运维确认当前进程由 `restart: always`、systemd Restart 或等价 supervisor 自动拉起。
2. 后端还必须确认当前平台支持既有 graceful shutdown、系统实例查询成功、当前站点隔离数据库中恰好一个活跃实例、没有未触发的应用操作，且 desired 与 effective 不同。
3. 任一条件未知或不满足时失败关闭；页面仍允许仅保存并提示需要运维手工重启。
4. 国内站与国际站独立判断，任何一个站点不能选择或控制另一个站点。

## 保存、审计与关闭顺序

1. 先验证目标并持久化 desired，再写入不含凭据的管理审计（操作者、request ID、旧 effective、目标和结果）。
2. 数据库提交和审计响应准备完成后返回 accepted；HTTP 响应提交完成后异步触发当前进程既有 graceful shutdown。
3. 禁止在 handler 中阻塞等待、直接 `os.Exit`、fork/exec 或调用外部部署工具。
4. 关闭复用既有 shutdown timeout，停止新请求并等待在途请求；外部 supervisor 负责拉起新进程。
5. 可通过注入 trigger 测试“响应与审计先于 trigger”，测试不得真实终止进程。

## 前端状态与恢复

1. 支付设置页显示草稿、desired、effective、`started_at`、capability 和后端返回的原因。
2. 草稿与 desired 不同时显示“仅保存”；草稿与 effective 不同时，且 capability 可用时显示“保存并应用”。
3. 应用按钮必须二次确认，说明站点会短暂不可用、长请求可能等待 graceful timeout、失败时需手工处理；提交期间锁定重复点击。
4. accepted 后记录操作前 `started_at`，进入 applying，以有上限的轮询查询 Root 状态。502/503、连接拒绝和短暂网络错误视为可重试。
5. 只有状态恢复、新进程 `started_at` 晚于旧值、effective 等于 desired、仍为单实例且无冲突时显示 succeeded。
6. 轮询超时、启动时间未变化、模式不匹配、多实例或状态错误显示 failed/needs-manual-action，不显示已生效；刷新页面可通过持久化状态恢复判断。

## 数据与部署隔离

- 不新增支付模式表或列；继续使用 Options 和现有系统实例心跳。
- 不触碰 PostgreSQL、Redis、EPUSDT/GMPay、数据卷、另一站点或其他容器。
- 本地代码和接口不得提供跨站点选择或控制；国内和国际实例可使用同一提交/镜像，实际数据库、Redis、凭据和部署环境隔离作为上线前运维门禁，由发布验收单独确认，不要求本地 Build/Verify 访问线上环境。
- 模式选择不改变语言、币种、品牌、价格、分组或倍率。

## 验收矩阵

- A9–A18 按父级 brief 验收：错误传播和不污染内存、Root-only 双路径、capability/单实例失败关闭、二次确认和幂等、固定 API 边界、提交/审计/trigger 顺序、bounded polling 三条件成功、当前进程隔离，以及完整本地 Go/前端/i18n/构建/Verifier 检查；真实双站点部署隔离属于上线前运维门禁，不阻塞本地 Verify。
