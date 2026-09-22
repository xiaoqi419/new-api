# rc.40 schema 预检与迁移演练

记录日期：2026-09-22。Fork 基线 `2d054b38054f7fef1a46c6dbbd61e0cdf8c1997e`，固定 upstream `9310231b3c27fea933e939b46cf26e0ce67192e3`。本报告针对单一 `codex/upstream-rc40-integration` 工作树的合并候选，不代表已经获得生产写入或发布授权。

## 生产只读预检

通过 SSH BatchMode 在现有容器环境内解析 DSN，凭据仅交给临时 PostgreSQL 客户端进程，不输出环境变量、DSN、配置值、用户行或业务价格。连接设置 `PGOPTIONS=-c default_transaction_read_only=on`，查询使用 `BEGIN READ ONLY` / `ROLLBACK`。只导出 schema 定义及聚合结果，没有生产数据导出或写入。

| 检查 | torch-ai-test-app | new-api-international |
| --- | --- | --- |
| 运行镜像 | torch-ai-release:20260919-2d054b380 | torch-ai-release:20260919-2d054b380 |
| 主数据库版本 | PostgreSQL 16.14 | PostgreSQL 16.14 |
| 单独日志数据库 | 否 | 否 |
| users.quota / used_quota / aff_quota / aff_history | 全部 bigint | 全部 bigint |
| options 重复 key / 冲突 key / 多余行 | 0 / 0 / 0 | 0 / 0 / 0 |
| options.key 唯一约束 | options_pkey | options_pkey |
| users 复合唯一索引 | idx_users_agent_username(agent_id, username) | 相同 |
| users.username 全局唯一约束 | 无；普通 idx_users_username 存在 | 相同 |
| tokens.key 索引 | idx_tokens_key，唯一 | 相同 |
| prefill_groups.name | uk_prefill_name，deleted_at IS NULL 部分唯一 | 相同 |
| subscription_plans.scope_group | 已存在 | 已存在 |
| users.access_token_created_at | 未存在 | 未存在 |
| task_plugins / login_encryption_keys / audit_logs | 均未存在 | 均未存在 |

代理、团购、订阅、公告、绘图记录、会话/认证流程/外部身份、Passkey、Casbin `casbin_rule` 和 `authz_roles` 表均已存在。主站数据库 DNS 属于 `ai-gateway-net`；最初使用另一应用网络无法解析数据库主机，随后改用应用实际可达网络完成预检，未修改任何网络配置。

## 实际 schema 差异

分别将双站 `pg_dump --schema-only --no-owner --no-privileges` 结果导入独立 PostgreSQL 16 容器，加入纯合成钱包与三条价格配置夹具，然后调用候选源码的 `model.InitDB()`、`model.InitLogDB()`、`model.InitPasswordEncryption()`，连续执行两次。

两站 schema 克隆得到相同差异：

| 对象 | 变化 | 保留与恢复条件 |
| --- | --- | --- |
| task_plugins | 新表；key/version 复合唯一，source 与 icon 使用 LongText，另含 API version、source hash、active/enabled、created_at、remark | PostgreSQL/SQLite 为 text，MySQL 为 longtext；旧渠道、任务没有自动改写 |
| login_encryption_keys | 新表；slot 唯一、private_key_pem text | 初始化继承 options 的内部旧密钥（存在时）；保留旧 options 行，禁止记录密钥 |
| audit_logs | 新独立审计表；event_id 唯一，用户/时间及令牌指纹/时间等索引 | 不受消费日志清理策略影响；新审计写入此表；既有 logs 保留 |
| users.access_token_created_at | 新增 nullable bigint | 不更新现有 token 值；旧 token 创建时间可保持未知 |
| passkey_credentials.rp_id | 新增 nullable varchar | 旧凭据仍保留；域迁移必须结合已有 Passkey domain/session 安全检查 |
| 既有列 | 无删除、无类型/default/nullability 修改 | 四个 bigint 钱包、代理字段、scope_group 均保留 |

实测合成钱包大于 int32 的四个数值与 agent_id 保持不变，ModelPrice / ImagePriceTiers / VideoPriceTiers 三条合成配置保持原值，tenant index 与 scope_group 保留。第二次启动的列定义不变。此结论不代表在生产全量私有数据副本上跑过升级；生产数据特有异常仍需正式备份和上线前预检。

## 迁移实现和兼容边界

- 启动保留已有 64-bit 钱包 schema 前置检查；没有重新升级钱包或放宽单请求/代理 int32 计费边界。
- PostgreSQL token / prefill 唯一性迁移在 AutoMigrate 前执行。迁移测试覆盖旧约束、重命名约束、冲突定义和重复执行；只迁移契约允许的索引定义。
- options 缺少唯一约束时执行独立锁、重建临时表、保留 options_legacy_* 备份。**同 key 不同值会在任何重建/替换前失败**，提示管理员备份并明确选定值；不采用最后一行胜出。启动遇错停止，不吞掉错误继续加载。
- 当前双站 options 已有主键且无重复，预期不触发重建。若上线前出现重复，必须暂停，不将当前预检结果当成永久保证。
- 新媒体 tiers 纳入版本化定价 API 的原子事务，旧经营配置不会被插件默认表达式自动覆盖。媒体 tiers 自动转表达式在不能保留全部档位语义时明确拒绝。
- Task.PrivateData 新字段是现有 JSON 的可选扩展，包括插件身份、状态、计费快照与 result-retention 标记。旧异步任务继续沿冻结旧上下文结算；生产启用插件前还要核对在途任务和渠道绑定。
- 不执行官方模型映射预览/工作台及其应用流程。

## 已完成的隔离验证

演练镜像 digest：`mysql@sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b`；`postgres@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`。

远端临时数据库使用随机临时密码、单独 `--internal` Docker 网络、tmpfs 数据目录、内存上限，无宿主端口、无生产数据卷、无生产网络。测试结束后容器和专用网络均删除成功。

| 检查 | 结果 |
| --- | --- |
| Windows `go test ./model` | 通过（图片列表安全投影修复后复跑 11.960s） |
| 媒体 tiers 版本/原子事务/转换拒绝回归 | 通过 |
| SQLite options 冲突保持原行、相同重复重建、保留 tiers | 通过 |
| 独立 PostgreSQL16.14 token/prefill migration tests | 通过，分别 1.36s / 1.21s |
| 独立 MySQL8.0.46 token/prefill migration tests | 通过，分别 0.04s / 0.05s |
| PostgreSQL16 全 schema 初始化 + 重复启动 | 两次均通过 |
| MySQL8 全 schema 初始化 + 重复启动 | 两次均通过 |
| 主站 schema-only 克隆 + 合成数据升级 | 两次均通过，新增三表两列 |
| 国际站 schema-only 克隆 + 合成数据升级 | 两次均通过，新增三表两列 |

MySQL5.7.8 与 PostgreSQL9.6 最低版本并未启动容器验证；上述运行证据为 PostgreSQL16 / MySQL8，不能替代最低版本兼容测试。独立日志库 ClickHouse 升级也未演练，当前双站没有独立日志库。

外部复现材料（本机，不提交私有 schema dump）：`D:/CodexHome/artifacts/rc40-schema/`，包含 preflight.py、rehearse.py、clone-rehearse.py、migrate.go、Linux model.test/migrate、production-preflight.jsonl、rehearsal-summary.jsonl、clone-summary.jsonl、两站 schema-diff.json。远端 `/tmp/new-api-rc40-schema/` 保存仅 schema/合成测试日志，权限受限；无生产行数据和密码文件。schema-only 源文件仍按运营资料处理，不贴到 PR。

复现二进制编译（从候选工作树，产物置于外部目录）：

```powershell
$env:GOOS='linux'
$env:GOARCH='amd64'
$env:CGO_ENABLED='0'
$env:GOPROXY='https://goproxy.cn,direct'
go test -c -o D:/CodexHome/artifacts/rc40-schema/model.test ./model
go build -o D:/CodexHome/artifacts/rc40-schema/migrate D:/CodexHome/artifacts/rc40-schema/migrate.go
```

测试程序仅对隔离数据库设置 TEST_POSTGRES_DSN / TEST_MYSQL_DSN，运行 `TestMigrate(TokenKey|PrefillGroup)UniquenessPostgreSQL` 或对应 MySQL 测试。**这些环境变量绝不能指向生产库**，测试含建表、约束变更和清理操作。

## 待授权的生产执行方案

1. 先完成代码验证、PR、required CI、合并 origin/main，并记录精确 merge SHA 和不可变镜像 digest。部署镜像不可来自本次 dirty 合并工作树。
2. 在正式维护窗口前，重新只读检查本报告所有前置条件。记录在途任务数量和主站/国际站源版本，核对是否共享数据库；不得猜测实例关系。
3. 单独确认生产迁移方案。停止该站接收新写请求并停止所有连接同库的 worker/应用，完成一致性完整备份（PostgreSQL custom-format dump、global roles/必要权限、部署配置、镜像 digest；密钥与私有值只进入受控备份）。验证备份校验和并恢复到隔离库，确认用户/令牌/渠道/余额/价格/在途任务完整。
4. 先一站，使用已合入的精确镜像只启动一个 master 运行迁移，其他副本停止，避免多副本同时迁移。设置合理 lock/statement timeout；任何锁冲突或 options 冲突立即停止。记录实际 DDL 与耗时，对照仅新增三表两列的预期；出现额外破坏性变化立即停止评审。
5. 候选镜像默认加载并启用内置任务插件，不能把首次启动当作仅加载未启用。在迁移维护窗口内、恢复流量前，通过受控配置写入并核对 `TaskPluginEnabled=false`，保证旧渠道暂时继续 legacy 路径；该设置写入是待单独授权的生产迁移方案组成部分。完成所有既有渠道的插件路由、媒体档位收费、在途任务兼容验收后，再明确启用插件。
6. 在恢复流量前复查索引、钱包 bigint、scope_group、价格配置哈希及条目数、旧密钥继承；检查新审计写入、旧消费日志查询、双站登录/Passkey、代理/团购/订阅和异步任务结算。启用新插件前单独核对渠道绑定和旧 tiers 收费矩阵。
7. 一站验收通过后再处理另一站，最终核对两站公开版本、Git SHA、image tag/digest。只更新应用，不重建数据库、Redis 或代理网关。

## 回退与前向恢复

- 迁移开始前失败：保持旧应用/库，不继续执行；修复前置条件后重跑只读预检。
- 迁移后、恢复流量前失败：停止候选应用，保留迁移后库的备份用于取证。优先回旧镜像且保留新增表/列（旧代码应忽略可选扩展）；若需要完整恢复，恢复维护窗口前已验证备份到新独立数据库，再原子切换应用连接。不原地删除生产表来试错。
- 恢复流量后失败：不能直接覆盖为旧备份，否则会丢新交易。暂停写入，保存当前库，核对两时点之间的用户余额、充值、订阅、审计和任务变化；优先修复前向兼容。新插件在途任务必须由能读取新冻结上下文的版本完成或按审核流程退款，不让旧版本误算。
- options 重建：存在冲突不会开始重建；已成功重建有 options_legacy_*，保留备份但不得直接回切而覆盖后续配置变更。前向修复需要逐 key 比对并明确选择经营配置，密码/价格不输出日志。
- 登录密钥：新表继承旧值，旧 options 行保留。回旧版本前确认密钥仍相同；如期间轮换，必须按密钥轮换策略处理客户端，不猜测覆盖哪个值。
- 数据备份恢复、数据库连接切换、停止生产服务和正式迁移均属于尚未执行步骤，需单独生产授权。
