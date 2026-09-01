# Outcome

国际站 GMPay Native 钱包充值只接受 USDT，并按 EPUSDT 当前可用的收款网络提供选择；管理员可以在后台安全地保存并应用支付网关模式，而不向 Web 应用开放 Docker、Shell、SSH 或任意部署目标权限。

支付网关模式在每个应用进程生命周期内仍然冻结。只有显式启用自重启能力、当前站点能够证明为单实例且存在外部自动拉起保障时，Root 管理员才能让当前应用在保存成功后优雅退出，由现有 supervisor 拉起新进程并应用新模式。

# Scope

- 将 GMPay Native 钱包充值的动态资产列表从“网络/任意代币组合”收紧为“一个可用网络对应一个 USDT 选项”。
- 只显示 EPUSDT `/payments/gmpay/v1/config` 当前返回、包含 USDT 且 New API 能安全校验地址的网络；网络和代币匹配不由浏览器决定。
- 支持 TRON、Ethereum、Solana 和 BSC 的 USDT 网络标签；保留后端规范化、去重、数量限制、超时、响应大小限制和短 TTL 缓存。
- 单个 USDT 网络直接建单；多个 USDT 网络先选择网络；没有可用 USDT 网络时失败关闭。
- Native 钱包建单必须显式携带 `network` 与 `token=usdt`，服务端在创建订单前重新验证该组合仍可用。
- Checkout Modal 继续在站内展示网关返回的实际金额、地址、网络、二维码、过期时间和轮询状态，不打开托管支付页。
- 保留已有订单字段和历史回调解析兼容；新订单只创建 USDT 订单，不新增数据库列或迁移。
- 修复 Option 持久化错误未向上传播的问题，确保数据库保存失败不会更新本地 OptionMap、不会返回成功、不会触发应用退出。
- 在 Root 支付设置页同时提供“仅保存”和“保存并应用”。后者仅在目标模式与当前生效模式不一致且运行环境允许时出现。
- 新增受限的支付模式应用接口和状态查询，只接受支付模式枚举及乐观校验信息，不接受命令、容器名、服务名、主机名、URL、信号或其他自由控制参数。
- `ADMIN_SELF_RESTART_ENABLED` 默认关闭。启用时表示运维已确认当前应用由 supervisor 自动拉起；服务端仍必须通过当前站点隔离数据库中的活跃实例记录确认没有第二个实例。
- 接受应用请求后，先完成数据库提交和审计响应，再异步触发当前进程既有的优雅关闭链路；不执行 `os.Exit` 式立即终止。
- 前端在应用重启期间轮询 Root-only 状态，只有新进程启动时间已变化、健康恢复且当前生效模式等于已保存目标模式时才显示成功。
- 拆分为两个可独立实现和验证的子 change，最终合入同一 Supervisor Change 分支：`gmpay-usdt-network-selection` 与 `payment-mode-safe-apply-control`。

# Non-goals

- 不接收 TRX、ETH、SOL、BNB、USDC 或其他非 USDT 资产。
- 不修改 EPUSDT/GMPay 源码、钱包数据库或网关部署，也不让 New API 直接读取网关钱包表。
- 不改变 Legacy EPay、Stripe、Creem、Waffo、支付宝、微信等独立支付路径。
- 不让用户在一次支付失败后自动切换网络，也不把一个网络的订单静默改到另一个网络。
- 不在运行中的进程内热切换 Legacy 与 GMPay Native 协议。
- 不向应用挂载 Docker socket，不执行 Docker、Compose、systemd、Kubernetes、SSH 或任意 Shell 命令。
- 不从后台选择或重启数据库、Redis、支付网关、国内站、国际站或其他工作负载。
- 不承诺多实例滚动应用；多实例、无法可靠判断实例数或未启用自动拉起能力时继续采用“保存后由运维手工重启”。
- 不改变国内站与国际站的数据库、Redis、支付凭据、语言、币种、品牌、价格、分组或倍率配置。
- 不在 Shape 或本地 Build 阶段修改线上环境。

# Acceptance examples

- A1: 当 EPUSDT 配置同时返回 `TRON: [TRX, USDT]`、`Ethereum: [USDC, USDT]`、`Solana: [SOL, USDC, USDT]` 时，用户只看到三个网络卡片，分别为 `TRON / USDT · TRC20`、`Ethereum / USDT · ERC20` 和 `Solana / USDT · SPL`，看不到 TRX、SOL 或 USDC。
- A2: 当 EPUSDT 只返回一个可用 USDT 网络时，点击支付后不显示网络选择器，直接以该网络和 `token=usdt` 创建订单。
- A3: 当存在两个或更多可用 USDT 网络时，点击支付先显示网络选择器；取消选择不创建本地订单或网关订单，选择后只提交被选网络。
- A4: 当 EPUSDT 配置超时、响应无效、没有 USDT、网络未知或所选网络在建单前已不可用时，不调用网关建单、不回退到 TRON，并显示本地化的不可用提示。
- A5: 新创建的非 TRON USDT 订单继续通过现有 `payment_method` 字段绑定网络和 USDT；部署前已经存在的非 USDT pending 订单仍可按其原绑定完成合法回调，不需要数据库迁移。
- A6: 成功建单后 Modal 展示网关返回的精确 USDT 金额、完整地址、所选网络、二维码和有效期；支付成功后按现有流程刷新余额，页面从不打开托管支付页。
- A7: Legacy EPay、订阅、拼团和代理预付现有行为不因普通钱包的多网络 USDT 选择而改变；Native 下这些非普通钱包流程仍按各自现有明确支付方式执行。
- A8: 钱包选择器在桌面和移动端、中文和英文下可完整操作，网络名称、USDT 协议标签、空状态、错误和重试文案全部通过 i18n 提供。
- A9: Root 保存合法 `PaymentGatewayMode` 时，数据库写入失败必须返回失败并保持数据库值、OptionMap 目标值和当前生效模式不变；该失败不得触发退出。
- A10: 当前生效模式与草稿目标不一致时，Root 可选择“仅保存”或“保存并应用”；非 Root 无权读取应用控制状态或调用应用接口。
- A11: `ADMIN_SELF_RESTART_ENABLED` 未启用、运行平台不支持安全优雅退出、实例检测失败或活跃实例数不为一时，页面不提供可执行的“保存并应用”，仍明确显示“已保存，需运维手工重启”。
- A12: “保存并应用”需要二次确认，确认文案明确说明当前站点会短暂不可用；重复点击、目标已生效、目标在确认后变化或另一应用操作正在进行时不会重复触发退出。
- A13: 应用接口不接受任何容器、服务、主机、数据库、Redis、网关、URL、命令或信号参数；后端只能调度当前进程的既有优雅关闭路径。
- A14: 应用操作只有在目标模式成功持久化并写入审计后才返回接受状态；响应提交完成后才异步关闭当前进程，外部 `restart: always` 或等价 supervisor 负责拉起。
- A15: 页面在断连和恢复期间持续轮询；只有新进程 `started_at` 晚于操作前值、健康状态恢复且 `effective_mode == desired_mode` 时显示“已生效”，超时、恢复失败或模式不一致显示失败/待人工处理。
- A16: 单实例保护使用当前站点隔离数据库中的活跃实例记录；存在第二个活跃实例、stale/未知状态或查询失败时拒绝自重启，不会在混合生效模式下报告成功。
- A17: 自重启路径只结束当前应用进程；PostgreSQL、Redis、EPUSDT/GMPay 网关、国内站或国际站另一部署均不在其控制范围内，代码和接口中不存在可选择这些目标的能力。
- A18: 两个子 change 合并后，Go 测试、前端聚焦测试、i18n 同步、前端生产构建、Root 权限与审计检查、单实例/禁用回退测试及独立只读 Verifier 的全部验收项通过；用户可见变更有 newest-first changelog 记录。

# Constraints and invariants

- `origin/main` 在 change 创建时的提交 `3fcf558054468020a9d8c7191cb801e5392e2b77` 是本次开发基线；所有实现只在绑定 worktree 和派生子 change 中进行。
- 国内站和国际站继续共享一个代码基线，使用隔离的数据库、Redis、配置和部署身份，不创建长期站点分支。
- 支付模式必须在进程启动时读取并冻结；保存目标值不直接改变任何运行中请求的协议分支。
- `/payments/gmpay/v1/config` 的 `supported_assets` 是当前 EPUSDT 部署公开的可用资产来源；New API 只取其中包含 USDT 的受支持网络，并在订单创建边界再次验证。
- 网络卡片是一张网络卡，不是一张 network/token 组合卡；`token` 对用户固定为 USDT。
- 浏览器提供的 network/token 不构成授权；服务端的网关配置、网络 allowlist、地址校验和订单级 binding 才是安全边界。
- 历史订单解析兼容与新订单创建策略分离：旧订单可继续按原绑定结算，新订单不得创建非 USDT 订单。
- 自重启能力为默认关闭的部署契约。显式启用只表明 supervisor 保障，不能绕过 Root 权限、数据库提交、单实例检测、二次确认、审计和状态核验。
- 自重启不能依赖用户可控目标、Shell、Docker socket 或外部 URL；任何无法证明安全的环境都必须失败关闭并保留手工重启路径。
- 数据库、Redis、支付网关和另一站点不得被重启；不新增支付模式或钱包相关数据库表、列和迁移。
- 所有用户可见文案必须 i18n；所有用户可见变更必须更新 `web/src/features/changelog/data.ts`。

# Decisions

- D1: 国际站只收 USDT。TRON、Ethereum、Solana、BSC 是网络；TRX、ETH、SOL、BNB 和 USDC 都不是可选支付资产。
- D2: 后端按大小写不敏感方式从 EPUSDT `supported_assets` 中筛选 USDT，每个规范化网络最多返回一项；前端不维护独立币种黑名单。
- D3: 仅接受 New API 已有地址校验支持的网络；当前目标标签为 TRC20、ERC20、SPL 和 BEP20。未知网络即使包含 USDT 也不向用户暴露。
- D4: 单网络跳过选择，多网络先选后建单，无网络失败关闭；服务端拒绝缺少 network/token 的普通钱包 Native 建单，不保留隐式 TRON 回退。
- D5: TRON 新订单继续使用历史 `usdt.tron`；其他 USDT 网络沿用现有可解析的网络绑定编码，不做数据库迁移。历史非 USDT pending 订单的回调兼容保留到自然清空。
- D6: 继续在 New API Modal 内完成付款，不打开 EPUSDT hosted page。
- D7: 支付模式安全应用采用用户确认的“当前进程优雅退出 + 外部 supervisor 自动拉起”方案，不让应用调用部署平台。相比控制 Docker，这个边界更小，但仅允许显式启用且可证明为单实例的部署。
- D8: 管理端保留“仅保存”，新增“保存并应用”；模式生效判断以新进程启动时间、健康恢复和 effective/desired 一致三项共同为准，不能只凭保存成功或 `/api/status` 存活判定。
- D9: `model.UpdateOption` 的数据库错误传播是安全应用的前置修复；写库失败不得更新 OptionMap。
- D10: 应用接口为固定目的的 Root-only API，只接受两个支付模式枚举和防止陈旧提交的预期状态；所有部署目标与退出方式由进程内部固定，客户端无法选择。
- D11: 活跃实例数由当前站点隔离数据库中的系统实例心跳判断；结果不是恰好一个时拒绝自重启。多实例支持和滚动协调留给未来独立能力。
- D12: 官方 EPUSDT 源码与 `wiki/API.md` 证明当前 `/config` 会根据启用链、可用钱包地址和启用代币生成 `supported_assets`；2026-08-31 检查的上游提交为 `aed4a970a28d734c8a35499496604b868a24ef7f`。New API 不直接读取钱包数据库。
- D13: 本任务拆为两个短期子 change 并最终合入同一 Supervisor Change；不产生两个生产分支。USDT 网络选择子项先完成支付行为，安全应用子项负责 Option 持久化、Root API、设置 UI、公共 i18n/changelog 集成。

# Open questions

- [blocking] CONFIRM: 是否确认以上完整 Shape：国际站新钱包订单固定为 USDT、按可用网络选择；支付模式继续启动冻结，仅在显式启用、单实例确认和 supervisor 保障下提供 Root“保存并应用”，否则保持手工重启；按两个短期子 change 实现并最终合回同一代码基线？

# Verification expectations

- Service/Controller 使用确定性 Go 测试覆盖 USDT 筛选、网络去重、配置失败、显式 pair、建单再验证、订单 binding、历史回调兼容和 Legacy 隔离。
- Model/Controller 使用 SQLite fixture 或项目既有数据库测试工具覆盖 Option 写失败不污染内存、Root 权限、禁用能力、单实例拒绝、陈旧状态、重复操作、审计及受控关闭调度。
- 优雅关闭测试必须注入可观察的 shutdown trigger，不允许测试进程真实退出；至少验证响应/审计先于 trigger。
- 前端 Vitest/Testing Library 覆盖单网络直达、多网络 Modal、USDT-only 标签、取消不建单、无资产失败关闭、保存并应用确认、禁用/多实例回退、断线轮询、成功和超时状态。
- 运行 `bun run i18n:sync`、相关前端测试和 `bun run build`；运行受影响 Go package 测试及根模块构建/测试。
- 使用 `rg` 检查旧的任意 token 选择语义、非 USDT 新建单路径、未国际化文案、自由重启参数和未检查的 `UpdateOption` 写入残留。
- 独立只读 Verifier 按 A1-A18 及两份完整目标 Spec 的细粒度验收矩阵逐项给出 passed/failed/blocked 证据。
- Shape 和 Build 全程不连接或修改生产数据库，不重启任何线上容器；线上发布与真实 supervisor 行为验证须在用户后续单独授权后执行。
