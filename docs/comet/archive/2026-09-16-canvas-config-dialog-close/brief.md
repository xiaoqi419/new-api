# Outcome

内嵌无限画布在用户成功保存渠道模型后，可以关闭「配置与用户偏好」弹窗，并且不会被自动重新打开。保存成功后的渠道数量保持可见。

# Scope

- 修复 `HostBootstrapStatus` 在 `modelStatus === error` 时反复 `openConfigDialog` 导致无法关闭的问题。
- 当至少有一个渠道已有 API Key 且 `models.length > 0` 时，不再自动打开配置弹窗。
- 用户点击完成或关闭后，本次会话内不再因同一 bootstrap 错误强制重开。
- 仍允许用户主动点「配置」打开弹窗。
- 未配置（无 Key 或无模型）时，仍可自动打开一次配置弹窗。
- 补充回归测试；更新 changelog。

# Non-goals

- 不改 Canvas 内核版本、计费、数据库、Classic、网关。
- 不撤销已保存的模型列表。
- 未获用户明确授权前不热更新生产。

# Acceptance examples

1. **A1 可关闭**：内嵌画布在渠道已有模型时，点「完成」或关闭按钮后弹窗保持关闭。
2. **A2 不重开**：bootstrap 仍报告 modelStatus error 时，只要渠道已有 Key 和模型，不再自动打开弹窗。
3. **A3 未配置仍可开**：渠道没有 Key 或模型时，仍自动打开一次配置弹窗。
4. **A4 主动打开**：用户点击配置入口仍能打开弹窗。

# Constraints and invariants

- 实现基线 `origin/main`（`b014be4f5`），独立 worktree。
- 不写入真实凭据。
- 不留 `docs/comet/changes/` 与 archive 并存。

# Decisions

- 自动打开只服务「尚未配好」的状态；配好后由用户决定何时打开。
- 保存成功即视为已配置，即使 host catalog 检查仍失败。

# Open questions

无。用户已确认保存成功后必须能关闭弹窗。

# Verification expectations

- 针对 HostBootstrapStatus / 配置弹窗关闭的组件测试。
- canvas typecheck、相关 vitest、format check。
