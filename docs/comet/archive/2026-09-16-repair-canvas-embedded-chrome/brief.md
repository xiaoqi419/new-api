# Outcome

修复已归档 `canvas-embedded-chrome` 的内嵌画布配置与内核缺口：把 Infinite Canvas 升级到上游 `v0.19.0`；内嵌模式下缺配置或模型检查失败时只打开「配置与用户偏好」弹窗，让用户自己填写 API Key，Base URL 锁定为当前站点；用户拉取并选中模型后点保存，渠道列表必须显示真实模型数量，不能再被写成 0。本 change 归档后不得在 `docs/comet/changes/` 留下 active 残留。

# Scope

- 将 vendored `web/canvas` 从 `v0.18.0` 升级到上游正式 release `v0.19.0`，重放现有子路径、Host Bridge、认证令牌、插件来源和安全补丁，并更新 VERSION、VENDOR、许可证与依赖锁。
- 内嵌模式下，图片模型/鉴权失败不再展示「图片模型配置需要检查」横幅作为配置入口；改为打开现有「配置与用户偏好」弹窗，用户自行填写或选择 API Key。
- 内嵌渠道的接口地址继续锁定为当前站点 origin（国内 `https://aierxin.cc`，国际 `https://codezip.io`），用户不能改成第三方上游。
- 渠道编辑器中拉取模型、勾选模型并保存成功后，渠道卡片必须显示所选模型数量；Host bootstrap 不得在保存后清空 `channel.models`。
- 保留内嵌模式隐藏 Agent / 文档 / GitHub 入口，以及独立部署的完整入口。
- 更新主站 changelog；补充覆盖配置弹窗入口、模型保存持久化和版本号的回归测试。

# Non-goals

- 不修改 Classic 前端、计费、后端 API Key 权限模型、数据库、Redis 或网关。
- 不把 Canvas 认证改成 iframe 直接携带 dashboard JWT。
- 不恢复 Asset Library / Agent Apply 等已隐藏入口。
- 不在未获用户明确授权时提交、推送、合并或热更新生产容器。
- 不把自动注入的失效 Host token 当作唯一配置方式；弹窗内仍可选用本站令牌，但用户必须能手填自己的 Key。

# Acceptance examples

1. **A1 内核版本**：构建使用 `web/canvas/VERSION` 的 `v0.19.0`；版本弹窗当前版本为 `v0.19.0`。
2. **A2 配置入口**：内嵌画布在缺少可用图片模型或模型目录鉴权失败时，打开「配置与用户偏好」弹窗；不出现「图片模型配置需要检查 / 鉴权失败」横幅作为配置入口。
3. **A3 Base URL**：内嵌渠道编辑器的接口地址显示当前站点 origin 且不可编辑。
4. **A4 用户 Key**：用户可在弹窗中手填或选择本站令牌作为 API Key，保存后该 Key 用于后续 `/v1/models` 与生图请求。
5. **A5 模型保存**：拉取模型列表、勾选至少一个模型并保存成功后，渠道列表显示 `N 个模型`（N 为所选数量），刷新配置弹窗后数量仍正确。
6. **A6 内嵌导航**：内嵌模式继续隐藏 Agent、文档、GitHub 入口；独立窗口保留这些入口。
7. **A7 归档清洁**：Archive 完成后 `docs/comet/changes/repair-canvas-embedded-chrome` 不存在，产物只在 `docs/comet/archive/`。

# Constraints and invariants

- 实现基线是当前 `origin/main`（含 leftover 清理 PR #53），工作区为独立 worktree，不混入 `secondary-dev` 或其他未提交改动。
- 内嵌 API 地址只能是受信的当前 origin；不得把用户 Key 与未锁定的第三方 Base URL 组合。
- 不在日志、测试快照、changelog 或 Git 中写入真实 API Key。
- `web/canvas` 保持上游 Prettier/4-space；主站 changelog 与 i18n 仍走主站约定。
- 保护 `new-api` 与 QuantumNous 标识；保留 Infinite Canvas MIT 与本仓库 AGPL 边界。

# Decisions

- 本 change 是 `canvas-embedded-chrome` 的 repair，不重开 `canvas-sidebar-entry`。
- 缺配置时只走配置弹窗，不走 HostBootstrap 鉴权横幅。
- 用户自己配置 Key；Base URL 锁站点。
- 保存选中模型后数量必须持久化，Host bootstrap 不得再清掉用户刚保存的模型列表。
- 内核目标为上游 `v0.19.0`。
- 隔离方式只能用独立 worktree，因为当前 `secondary-dev` 工作区有无关脏文件。

# Open questions

无。用户已确认 Shape 摘要。

# Verification expectations

- `web/canvas`：typecheck、build、format check，以及配置弹窗/模型保存/内嵌可见性相关测试。
- 主站：受影响 changelog 与必要 typecheck/lint。
- `git diff --check`；确认 VERSION/VENDOR 为 v0.19.0。
- Archive 后检查 `docs/comet/changes/` 不再包含本 change。
