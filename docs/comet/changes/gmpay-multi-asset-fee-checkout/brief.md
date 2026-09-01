# Outcome

国际站 GMPay Native 钱包充值支持 USDT 与 USDC，并依据 EPUSDT 当前启用的网络展示可用组合。用户在同一个充值流程中按“币种 → 网络 → 付款详情”完成选择；支付详情明确区分基础充值额度、手续费和实际应付金额，手续费由用户承担但不会被计入到账额度。

# Scope

- 服务端解析 EPUSDT `supported_assets`，只暴露稳定币 `USDT`、`USDC` 以及网关实际返回且 New API 能校验的网络；TRX、ETH、BNB、SOL 等 Gas 原生币和未知代币不作为充值币种。
- 复用现有 `TopUp.Amount`（到账额度）与 `TopUp.Money`（订单应付法币金额）语义，不新增数据库表、列或迁移；通过现有 `payment_method` 编码持久化 `token + network`。
- 订单创建前重新校验币种/网络组合；旧的 `usdt.tron` 和已存在的历史订单回调继续兼容，新的订单允许 `USDT` 或 `USDC`。
- 将 GMPay 返回的 `actual_amount` 作为网关报价的实际稳定币支付总额；支持网关可选的 fee/total 字段，若网关不提供独立费用则使用管理员配置的固定金额或比例兜底。无报价且无有效兜底时拒绝该组合。
- 在钱包充值 Modal 中先选币种，再选网络，最后进入站内二维码/地址 checkout；只有一个有效选项时自动跳过对应步骤。
- 展示基础额度、手续费（含来源）、实际支付总额、token、网络、地址、二维码、订单号、过期时间和状态；保持现有轮询、回调和余额刷新。
- 在支付设置中提供受校验的 GMPay 手续费兜底配置（默认关闭），配置按默认值及可选 `token:network` 覆盖项生效，并限制金额、比例、精度和最大总额。
- 扩大 checkout Modal 的桌面宽度并保持移动端自适应，长地址、长网络名和金额不能溢出或遮挡操作。
- 所有新增文案写入前端 i18n，并在 `web/src/features/changelog/data.ts` 增加 newest-first 记录。

# Non-goals

- 不把 TRX、ETH、BNB、SOL 或其他原生 Gas 币作为充值资产，不自动扩展到网关未声明的代币/网络。
- 不改变 Legacy EPay、Stripe、Creem、Waffo、直连支付宝/微信、订阅、拼团和代理预充值的支付协议或金额口径。
- 不读取或修改 EPUSDT 钱包数据库，不臆造未在官方接口中声明的费用 API，不把链上 Gas 估算冒充网关服务费。
- 不在浏览器端决定费用、不允许客户端覆盖服务端报价、不自动换链或重试时静默更换币种/网络。
- 不触碰线上容器、生产数据库、Redis、支付网关或部署配置；本 change 只在本地 worktree 开发和验证。

# Acceptance examples

- A1：网关返回 `TRON: [TRX, USDT, USDC]`、`Ethereum: [ETH, USDT]`、`Solana: [SOL, USDC]` 时，只显示 `USDT/TRON`、`USDC/TRON`、`USDT/Ethereum`，不显示 TRX、ETH、SOL，也不显示没有声明的 USDC/Ethereum。
- A2：只有一个稳定币时直接进入网络步骤；某币种只有一个网络时选中币种后直接进入付款详情；只有一个币种/网络组合时点击充值不出现多余选择页。
- A3：有多个币种时首次 Modal 只展示 USDT、USDC；选择 USDC 后只展示 USDC 的有效网络；取消或返回不会创建本地订单或调用网关。
- A4：服务端收到缺 token、缺 network、非 USDT/USDC、未知网络或网关已关闭的组合时拒绝建单；建单前 fresh 配置失效时不回退到 TRON。
- A5：基础额度为 30、费用为 5 时，订单到账额度仍按 30 计算，checkout 同时显示 `基础额度 30`、`手续费 5`、`实际支付 35`；回调成功只增加 30 对应额度。
- A6：GMPay 返回动态 `actual_amount` 或显式 fee/total 报价时，checkout 使用服务端验证后的网关总额和费用来源；客户端无法修改该金额。
- A7：动态报价缺失或无效时，匹配的管理员固定/比例兜底按 decimal 计算并受最小值、最大值、总额上限约束；动态报价和兜底都不可用时该组合失败关闭并给出本地化错误。
- A8：回调必须匹配订单的 token/network、金额、签名、provider、租户和 pending 状态；USDT/USDC 历史 `usdt.tron` 兼容规则不影响新订单安全边界，重复回调不重复入账。
- A9：Legacy EPay 与其他支付方式的金额、回调和 UI 不因本 change 改变；普通钱包以外的 Native 业务继续使用其已有资产策略。
- A10：checkout Modal 在桌面端提供足够宽度，在 390px 等窄屏可滚动但不横向溢出；长地址、网络名、费用和按钮均可读可操作。
- A11：中文、英文及项目要求的其他 locale 覆盖币种、网络、费用来源、基础/实际金额、空状态、错误、重试和复制文案；i18n 同步无缺键。
- A12：受影响 Go 测试、前端聚焦测试、i18n 同步、前端生产构建、根模块测试和独立只读 Verifier 按 A1-A11 全部通过；未授权前不推送、合并或部署。

# Constraints and invariants

- 生产代码基线是创建 change 时的精确 `origin/main` 提交 `daecb21d167e5335cc8fd2203fc415fc132eed70`；只在绑定 worktree 中修改。
- EPUSDT `/payments/gmpay/v1/config` 是可用资产来源；结果须经过大小写不敏感的 token 规范化、稳定币 allowlist、网络 allowlist、去重、数量限制、超时、响应体上限和短 TTL 缓存。
- `TopUp.Amount` 只表示用户应得的充值额度，`TopUp.Money` 只表示订单应校验的法币应付金额；手续费不能增加 `Amount`，也不能通过浮点溢出产生负扣款或额外赠送。
- 金额和费用使用 `shopspring/decimal` 及项目既有安全边界，所有用户可控数量在进入计费前验证上限；不得使用裸 float/int 转换绕过饱和检查。
- 订单 binding 使用现有 `payment_method` 字段，推荐规范形式为历史 `usdt.tron` 或新的稳定币组合编码；解析器必须拒绝歧义、空段和非法字符。
- 动态费用只接受服务端/网关响应中经过 schema 校验的字段；未知字段、负数、NaN、Inf、过大值和不一致总额均视为无效。
- 管理员兜底配置默认关闭，按明确优先级（资产覆盖 > 全局默认、固定/比例仅选其一）计算，并设置费用与总额上限；配置解析失败不得使其他支付方式不可用。
- 所有 Go JSON 编解码调用 `common.Marshal`/`common.Unmarshal` 等包装函数；Legacy 路径和现有数据库兼容性必须保持。
- 用户可见文案全部通过 i18next；不修改受保护的项目身份、版权或上游归属信息。

# Decisions

- D1：国际站普通钱包新增且仅新增 USDT、USDC 两种稳定币；原生 Gas 币永不成为充值币种。
- D2：币种/网络列表由网关配置驱动，服务端负责规范化和二次校验，前端只呈现服务端列表。
- D3：选择器采用币种 → 网络两级状态机；单选自动跳过，取消不建单；付款详情始终在当前页面的 checkout Modal 中完成。
- D4：网关 `actual_amount`/显式费用报价优先；官方接口没有独立费用 endpoint 时，不臆造调用，改用管理员固定或比例兜底，并在详情中标记来源。
- D5：手续费由用户承担但不进入到账额度；本地订单和回调仍以服务端保存的基础额度与应付金额校验，不能由客户端传入费用。
- D6：复用现有订单字段和回调协议，不做数据库迁移；旧 `usdt.tron` 订单保持可结算。
- D7：本 change 只实现上述支付扩展；已完成的支付模式启动冻结/安全重启能力只做回归保护，不重新实现。

# Open questions

无。用户此前已确认 USDT/USDC 两级选择、用户承担手续费、动态报价失败时使用固定/比例兜底，以及本地先行开发的范围。

# Verification expectations

- Service/Controller 测试覆盖稳定币过滤、网络/币种去重、显式 pair、stale pair、订单 binding、动态费用字段校验、固定/比例兜底、金额分离、回调金额/签名/幂等和 Legacy 隔离。
- Model 测试证明手续费不改变到账额度，数据库仍兼容 SQLite/MySQL/PostgreSQL 语义且无迁移。
- 前端 Vitest/Testing Library 覆盖币种→网络选择、单选跳过、取消不建单、费用详情、长地址布局、错误/重试和 checkout 轮询。
- 运行 `go test ./controller ./service ./model ./router`、前端聚焦 Vitest、`bun run i18n:sync`、`bun run build`、`git diff --check`，并由独立只读 Verifier 逐项检查 A1-A12。
- Shape/Build/Verify 全程不连接或修改线上环境；真实网关费用字段、扫码支付、异步回调和部署验收留给用户后续单独授权。
