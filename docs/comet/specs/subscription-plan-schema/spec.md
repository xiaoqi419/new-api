# Subscription plan schema

## Scenario: Fresh SQLite schema

- **WHEN** 服务首次在空 SQLite 数据库执行主数据库迁移
- **THEN** `subscription_plans` 表包含 `scope_group` 列
- **AND** 该列使用 `varchar(64) DEFAULT ''`
- **AND** 创建带显式作用域分组的订阅套餐成功并可按原值读回。

## Scenario: Upgrade an existing SQLite schema

- **WHEN** 已有 `subscription_plans` 表缺少 `scope_group` 且包含历史套餐行
- **THEN** 启动迁移使用 SQLite 支持的 `ALTER TABLE ... ADD COLUMN` 补齐该列
- **AND** 历史套餐的既有字段和值保持不变
- **AND** 历史套餐的 `scope_group` 读取为空字符串，以保持适用于所有分组的旧行为。

## Scenario: Idempotent startup

- **WHEN** 同一数据库已经包含 `scope_group` 并再次执行迁移
- **THEN** 迁移成功结束
- **AND** 不重复添加列或破坏现有套餐数据。

## Scenario: Other supported databases

- **WHEN** 主数据库为 MySQL 或 PostgreSQL
- **THEN** 继续使用 GORM `AutoMigrate(&SubscriptionPlan{})` 管理 `scope_group`
- **AND** 不执行 SQLite 专用 PRAGMA 或 DDL。

## Requirements

- `SubscriptionPlan.ScopeGroup` 的数据库列 MUST 存在于全新和历史 SQLite schema。
- SQLite CREATE DDL 与缺列补齐清单 MUST 使用相同的列名、类型和默认值。
- 迁移 MUST 保留空作用域代表全分组适用的历史业务语义。
- 迁移 MUST 支持重复执行。
