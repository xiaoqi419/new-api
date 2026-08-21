# Outcome

在不改变充值、支付入口、订阅购买与倍率定价行为的前提下，清零 classic topup 与 ratio settings 当前 136 项 oxlint errors。

# Scope

- 独占修改 `web/classic/src/components/topup/**` 与 `web/classic/src/pages/TopUp/**`。
- 独占修改 `web/classic/src/pages/Setting/Ratio/**` 与 `web/classic/src/components/settings/RatioSetting.jsx`。
- 允许修改上述目录内直接相关的既有测试；当前 classic 未发现 test script 或直接测试文件时如实报告。

# Non-goals

- 不新增或改变支付能力、商户接口、结算、倍率表达式契约或微信登录；不修改其他 settings、table、common pages、后端、lint 配置、package/lock、依赖、i18n、changelog或受保护品牌。
- 不处理 warnings 专项，不使用 `--fix`、disable 注释、规则降级或新增 ignore。

# Acceptance examples

- A1：权威 oxlint 对全部 owned paths 返回 0 errors。
- A2：Hooks、Promise、array key、component export 与机械性修复保持充值方式选择、支付轮询/弹窗、订阅购买、倍率编辑/序列化、稳定列表 identity 和错误传播；相关既有测试通过，或明确报告无测试。
- A3：Git diff 只包含批准目录与本 child 正式产物，不含配置、package/lock、依赖、disable 或范围外支付/设置变化。

# Constraints and invariants

- 先用 Fast Context 定位调用链，再用 `rg` 精确查找并完整阅读修改文件。
- 不改变真实商户线上待验收状态，不接触微信登录；支付异步清理、倍率保存与表达式语义必须保持。
- 禁止派生子代理或执行 Git/Comet 写操作；需要跨 ownership 修改时停止并报告。
- 测试只保护真实行为，不添加 smoke、随机、sleep、性能或覆盖率测试。

# Decisions

- 本 child 严格继承已确认的 `p1-lint-debt` A2/A3 范围，无需重复用户确认。
- 真实支付凭据和回调继续留在线上验收；本 child 只做 lint error 修复。

# Open questions

- 无。

# Verification expectations

- 从 `web` 对全部 owned paths 运行权威定向 oxlint，并记录 error/warning 数量。
- 运行可用的倍率/支付邻近既有测试；没有测试时明确记录并由最终门禁覆盖。
- 新的只读 Verifier 核对 A1-A3、完整 diff 与实际检查结果。
