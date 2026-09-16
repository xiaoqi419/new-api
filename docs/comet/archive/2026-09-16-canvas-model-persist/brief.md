# Outcome

内嵌无限画布用户勾选并保存的模型列表，在离开页面再进入后仍然存在，不必重新拉取。配置弹窗因此也不会因「0 个模型」再次自动打开。API Key 仍不写入 localStorage。

# Scope

- 持久化已保存的模型名、能力和 `verified` 标记；不持久化 API Key / `verifiedKey`。
- 水合时不再把 `verified` 清掉。
- host bootstrap 在 token loading、catalog 失败时，保留已保存的模型，除非当前 Key 与 `verifiedKey` 明确冲突。
- 渠道已有用户保存的模型时，bootstrap 不再用完整目录覆盖选择。
- 回归测试与 changelog。

# Non-goals

- 不把 API Key 写入浏览器存储。
- 不改 Canvas 内核版本、计费、数据库。
- 未授权前不热更新生产。

# Acceptance examples

1. **A1 再进入仍有模型**：保存 2 个模型后离开再进入，渠道仍显示 2 个模型。
2. **A2 不必再拉**：再进入时不要求用户重新点「获取」。
3. **A3 不因 0 个模型弹窗**：已保存模型时配置弹窗不自动打开。
4. **A4 Key 不落盘**：persistableConfig 仍清空 apiKey。
5. **A5 换 Key 仍清图片模型**：当前 Key 与 `verifiedKey` 都存在且不一致时，丢弃图片模型。

# Constraints and invariants

- 基线 `origin/main` `cd9f0069e`。
- 不写入真实凭据。
- 不留 leftover。

# Decisions

- 模型名是偏好，可以持久化；密钥仍只存在内存，由宿主每次注入。
- catalog 失败不能把已保存选择清成 0。

# Open questions

无。用户已确认需要跨页面持久化。

# Verification expectations

- persist 水合、loading scrub、catalog 失败保留选择的单元测试。
- canvas typecheck / 相关 vitest / format check。
