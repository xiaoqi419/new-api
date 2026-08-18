# Outcome

在不改变系统、运营、支付、模型、性能与个人设置行为的前提下，清零 classic 非 Ratio settings 当前 219 项 oxlint errors。

# Scope

- 独占修改 `web/classic/src/pages/Setting/{Chat,Dashboard,Drawing,Model,Operation,Payment,Performance,Personal,RateLimit}/**` 与 `pages/Setting/index.jsx`。
- 独占修改 `web/classic/src/components/settings/personal/**`。
- 独占修改 `web/classic/src/components/settings/*.jsx`，但明确排除已分配给 `lint-classic-topup-settings-ratio` 的 `RatioSetting.jsx`。
- 允许修改上述目录内直接相关的既有测试；当前 classic 未发现 test script 或直接测试文件时如实报告。

# Non-goals

- 不修改 Ratio settings、topup、table、common pages、foundation、default 前端、后端、lint 配置、package/lock、依赖、i18n、changelog或受保护品牌。
- 不新增设置项或改变公开配置契约；不处理 warnings 专项，不使用 `--fix`、disable 注释、规则降级或新增 ignore。

# Acceptance examples

- A1：权威 oxlint 对全部 owned paths 返回 0 errors。
- A2：Hooks、Promise、array key、component export 与机械性修复保持设置加载/保存、表单初始化、验证、错误传播、导航和模块副作用；相关既有测试通过，或明确报告无测试。
- A3：Git diff 只包含批准目录与本 child 正式产物，不含 RatioSetting、配置、package/lock、依赖、disable 或范围外变化。

# Constraints and invariants

- 先用 Fast Context 定位调用链，再用 `rg` 精确查找并完整阅读修改文件。
- Hooks 修复不得重复触发保存/请求；设置 payload、默认值、敏感字段留空语义和 side effects 必须保持。
- 禁止派生子代理或执行 Git/Comet 写操作；需要跨 ownership 修改时停止并报告。
- 测试只保护真实行为，不添加 smoke、随机、sleep、性能或覆盖率测试。

# Decisions

- 本 child 严格继承已确认的 `p1-lint-debt` A2/A3 范围，无需重复用户确认。
- `RatioSetting.jsx` 和 `pages/Setting/Ratio/**` 由另一个 child 独占，本 child 不得触碰。

# Open questions

- 无。

# Verification expectations

- 从 `web` 对全部 owned paths 运行权威定向 oxlint，并记录 error/warning 数量。
- 运行可用的邻近既有测试；没有测试时明确记录并由最终 classic build 覆盖。
- 新的只读 Verifier 核对 A1-A3、完整 diff 与实际检查结果。
