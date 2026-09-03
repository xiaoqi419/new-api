# Outcome

在不触碰生产支付、数据库、Redis 或用户资金的前提下，修复 GMPay 内置 TRON 网络费估算对真实 TronGrid 响应的兼容性，并用隔离验证证明动态报价与管理员兜底都能得到可观察、可审计的结果。

# Scope

- 处理真实 TronGrid `getchainparameters` 响应中无关参数、缺失 `value` 和负值参数，确保只读取目标费用键。
- 添加真实响应形状的 Go 回归测试，覆盖动态估算、CoinGecko 429 后 CoinPaprika 回退，以及动态估算失败时的百分比/固定金额兜底。
- 使用真实公开 TRON RPC 和行情端点执行只读估算验证；不签名、不广播、不支付。
- 本轮不部署 EPUSDT、不创建订单；仅验证估算接口和管理员兜底，保持全程只读和隔离。

# Non-goals

- 不修改生产数据库、Redis、支付网关、商户资金或现有用户订单。
- 不执行真实支付、链上转账或伪造成功回调。
- 不把动态估算失败隐藏为动态成功；兜底结果必须标识为管理员配置的百分比或固定金额。
- 没有受控部署入口时不猜测服务器、容器或域名，不索取或在聊天中暴露密码、私钥、PID、Secret。

# Acceptance examples

- A1：真实 TronGrid 返回大量无关参数、缺失 `value` 或负值无关参数时，解析成功并得到正的 energy/bandwidth 费率。
- A2：真实 TRON RPC 与 CoinGecko 正常时，`USDT/tron/USD` 估算返回 `native_amount`、`fee_amount`、`total_amount` 和 RPC/价格来源证据。
- A3：CoinGecko 被限制（HTTP 429）时，估算自动使用 CoinPaprika，报价仍通过金额与新鲜度校验。
- A4：动态估算不可用时，管理员百分比兜底和固定金额兜底分别返回正确费用，并明确 `fallback` 来源，不声称为动态链上报价。
- A5：所有验证均使用隔离 SQLite/配置；不会连接生产 PostgreSQL、Redis 或生产 GMPay 网关。

# Constraints and invariants

- 费用解析必须只接受目标键的有限、非负、有限十进制值；无关参数不得导致整条估算失败。
- 保持三种数据库兼容性和现有 `common` JSON 包装、GMPay 金额/兜底安全不变量。
- 真实 RPC/行情请求使用代码内允许的 HTTPS 主机和超时/响应大小限制。
- 估算失败仍须 fail-closed；只有管理员已配置且经过边界校验的百分比/固定金额规则可以作为显式兜底。
- 隔离网关使用独立 Compose 项目、数据卷、网络、端口、PID/Secret；不复用生产数据。

# Decisions

- 用户已确认本轮验收只要求“能正常测试出估算价格和兜底正常”，不要求真实支付。
- 先修复真实响应解析并完成本地真实 RPC 验证，再在有受控基础设施时部署隔离 EPUSDT；部署不是修改生产环境的授权。
- 测试输入使用 `USDT`、`tron`、`USD` 和正的基础金额；代表性交易仍由内置估算器生成。

# Open questions

- None. 受控测试主机 SSH 公钥入口和测试 HTTPS 域名属于部署前提；缺失时只交付本地真实 RPC/行情与兜底证据并报告未部署原因。

# Verification expectations

- 运行 `go test ./service ./controller -run 'GMPay|NetworkFee|EpayCheckout' -count=1` 及新增回归测试。
- 运行一次真实 TronGrid + CoinGecko 估算和一次强制 CoinGecko 429 的 CoinPaprika 回退估算，记录报价与来源。
- 通过受控注入触发动态估算错误，验证百分比与固定金额兜底的精确输出及来源标记。
- 对改动执行 `rg` 残留检查、格式化和必要的构建/静态检查；清理本轮创建的临时 live-check 文件。
- 不执行 EPUSDT 部署、`/config` 探针、订单创建或任何支付链路写操作。
