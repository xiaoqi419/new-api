---
generated_from_state_version: 6
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 1
- Verifier attempt: 1
- Completed: 2026-09-03T18:02:33.272Z
- Summary: TRON quote strategy and fallback UI match the spec. Unit tests for parse, estimator modes, and the fee-config editor passed.

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1: 未写 `tron_quote_mode` 的已有配置加载后策略为模拟失败再经验兜底，TRON 模拟失败且已有单价时仍报出约 64285 energy。 | Missing tron_quote_mode resolves to simulate_then_empirical; existing empirical test still quotes 64285 after failed simulation. |
| A2 | passed | brief.md | A2: 管理员选择「只走链上模拟」并保存后，TRON 模拟失败不再使用 64285；若管理员兜底关闭则拒绝创建充值。 | simulate mode returns ErrNetworkFeeUnavailable on failed simulation and does not attach empirical energy. |
| A3 | passed | brief.md | A3: 管理员选择「只走经验能量」并保存后，TRON 报价跳过 `estimateenergy`，用 64285 × 实时 energy 单价 + 345 带宽。 | empirical mode quotes 64285/6.7735 TRX and never calls estimateenergy or triggerconstantcontract. |
| A4 | passed | brief.md | A4: 管理员选择「模拟失败后经验兜底」时行为与当前生产一致。 | Default and empty mode keep the previous simulate-then-empirical path. |
| A5 | passed | brief.md | A5: 中文界面下，兜底规则类型选中「固定金额」或「充值金额百分比」后，触发器显示对应中文而不是 `fixed`/`percent`。 | SelectValue renders translated Fixed amount / Percentage of top-up; UI test asserts trigger does not show percent. |
| A6 | passed | brief.md | A6: 规则类型为百分比时，右侧输入标签为百分比、带 `%` 后缀、说明不再写成 USD；切回固定金额后恢复 USD 输入。 | Percent mode uses Fallback percentage (%) label, % suffix, and 0-100 copy; fixed mode keeps USD label. |
| A7 | passed | specs/gmpay-fee-admin-controls/spec.md | `GMPayFeeConfig.tron_quote_mode` 控制内置 TRON USDT 估算器： | GMPayFeeConfig.tron_quote_mode is parsed and drives BuiltinNetworkFeeEstimator. |
| A8 | passed | specs/gmpay-fee-admin-controls/spec.md | \| 值 \| 行为 \| | Three documented modes are implemented as simulate, empirical, simulate_then_empirical. |
| A9 | passed | specs/gmpay-fee-admin-controls/spec.md | \| `simulate` \| 仅链上模拟。`estimateenergy`/`triggerconstantcontract` 失败（含 REVERT）则动态报价失败。 \| | simulate-only fails closed on simulation errors including REVERT/unavailable RPCs. |
| A10 | passed | specs/gmpay-fee-admin-controls/spec.md | \| `empirical` \| 跳过合约模拟。读取链参数后按 64285 energy + 345 bandwidth × 实时单价报价。 \| | empirical path uses getchainparameters then 64285 energy + 345 bandwidth. |
| A11 | passed | specs/gmpay-fee-admin-controls/spec.md | \| `simulate_then_empirical` \| 先模拟；全部允许 RPC 均模拟失败但已拿到单价时，改用经验能量。 \| | simulate_then_empirical still calls empiricalTRONNetworkEstimate after lastSimulation. |
| A12 | passed | specs/gmpay-fee-admin-controls/spec.md | 缺省、空字符串或旧配置没有该字段时视为 `simulate_then_empirical`。非法值拒绝保存。 | Parse defaults empty/missing; unknown values are rejected. |
| A13 | passed | specs/gmpay-fee-admin-controls/spec.md | 经验路径不得在缺少 `getEnergyFee`/`getTransactionFee` 时编造单价。经验能量固定为现有持仓档 64285，不使用新地址 130285。 | Empirical still requires parsed chain fees; energy constant remains 64285. |
| A14 | passed | specs/gmpay-fee-admin-controls/spec.md | ETH、BSC、Solana 估算不受该字段影响。 | tron_quote_mode is only read in estimateBuiltinTRON. |
| A15 | passed | specs/gmpay-fee-admin-controls/spec.md | 动态报价失败后，现有 `fallback_enabled` 管理员固定/比例规则仍按原语义生效。 | Administrator fallback_enabled path is unchanged after dynamic failure. |
| A16 | passed | specs/gmpay-fee-admin-controls/spec.md | 规则类型选项值为 `fixed` / `percent`。界面必须显示翻译文案： | Select items remain value fixed/percent with translated children. |
| A17 | passed | specs/gmpay-fee-admin-controls/spec.md | `fixed` → `Fixed amount` | Fixed amount label is used for selected and dropdown copy. |
| A18 | passed | specs/gmpay-fee-admin-controls/spec.md | `percent` → `Percentage of top-up`（覆盖规则可用 `Percentage`） | Percentage of top-up / Percentage used for percent rules. |
| A19 | passed | specs/gmpay-fee-admin-controls/spec.md | 选中后触发器显示同一套翻译，不得回显枚举值。 | SelectValue children override raw enum display. |
| A20 | passed | specs/gmpay-fee-admin-controls/spec.md | `percent` 时数值输入： | Percent numeric input is specialized in the fallback fieldset. |
| A21 | passed | specs/gmpay-fee-admin-controls/spec.md | 标签表示百分比； | Label is Fallback percentage (%). |
| A22 | passed | specs/gmpay-fee-admin-controls/spec.md | 可见 `%` 后缀； | ConfigInput suffix % is rendered for percent mode. |
| A23 | passed | specs/gmpay-fee-admin-controls/spec.md | 说明写 0–100，相对充值本金； | Description states 0 to 100 of the top-up amount. |
| A24 | passed | specs/gmpay-fee-admin-controls/spec.md | 不得再写「以 USD 表示」。 | Percent description no longer says values are expressed in USD. |
| A25 | passed | specs/gmpay-fee-admin-controls/spec.md | `fixed` 时输入仍为 USD 金额。存储仍是规则 `value` 字符串；百分比后端计算保持 `base * value / 100`。 | Fixed mode still uses USD amount input; percent backend formula is unchanged. |

## Checks

_No Runtime checks were recorded._

## Blockers

_None._

## Risks and skipped work

- Full bun typecheck/oxlint of web/ was not run.

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | TRON quote strategy and fallback UI match the spec. Unit tests for parse, estimator modes, and the fee-config editor passed. | 2026-09-03T18:02:33.272Z |

## Conclusion

TRON quote strategy and fallback UI match the spec. Unit tests for parse, estimator modes, and the fee-config editor passed.
