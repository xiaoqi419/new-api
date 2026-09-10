# H5 全站用量统计

管理员在 `/admin-h5/stats` 查看当前站点调用量与花费。

时间范围：今天、昨天、近 7 天、近 30 天。请求 `start_timestamp` / `end_timestamp`（本地时区日界）。

数据：

- `GET /api/log/usage_stat`：区间合计 `totals.quota`、`totals.count`（次数）、`totals.token_used`（token）
- 同一接口的 `hours` 和 `models` 提供按时间和模型的次数/额度/token，用于列表。

展示：各项数值 × 2.5。额度经 `formatQuota`。页面不显示倍率说明，保留主线提交 2bb864e41 的现有行为。
