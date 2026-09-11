# Outcome

管理 H5 新增全站用量统计页：调 new-api 现有接口，展示调用次数、token、额度，全部 ×2.5。时间范围：今天、昨天、近 7 天、近 30 天。

# Scope

- `web/admin-h5/` 增加 `/stats` 页与导航。
- 调用 `GET /api/data/` 与 `GET /api/log/stat`，管理员登录态。
- 展示值 = 接口值 × 2.5；额度用现有 `formatQuota`。
- 不改后端、不改库。

# Non-goals

- 不改桌面后台。
- 不在服务端写死 2.5 倍率。

# Acceptance examples

- A1: 登录后可打开统计页，未登录跳转登录。
- A2: 可选今天、昨天、近 7 天、近 30 天。
- A3: 次数、token、额度展示为查询结果的 2.5 倍。
- A4: 接口失败时有错误与重试。

# Constraints and invariants

- origin/main 为基线。H5 随主仓发布。

# Decisions

- 倍率 2.5 仅前端展示。
- 全站数据走管理员接口。
- 时间范围：今天 / 昨天 / 近 7 天 / 近 30 天。

# Open questions

# Verification expectations

- H5 typecheck、相关 vitest。
