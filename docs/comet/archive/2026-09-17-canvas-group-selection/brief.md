# Outcome
修复无限画布分组/API key选择、模型拉取与生成使用凭证不一致。
# Scope
渠道编辑草稿、宿主令牌身份恢复、模型请求竞态及回归验证；发布双站应用镜像。
# Non-goals
不修改数据库内容、结构、卷，不重启数据库/Redis/网关，不改计费或上游渠道。
# Acceptance examples
- A1: 选择宿主令牌后，无需保存即可使用该令牌拉取模型；后台初始化不得覆盖编辑草稿。
- A2: 保存后生图使用所选渠道令牌，刷新后同账户仍恢复同一令牌；密钥和verifiedKey不得持久化。
- A3: 切换账户、令牌失效或旧模型响应到达时，不复用其他账户凭证，不把旧目录套用到新分组。
- A4: 回归测试、类型检查与构建通过；独立验收确认变更不涉及数据库、计费或基础设施配置，发布方案仅重建应用。
# Constraints and invariants
源基线origin/main=3fa063346a734f4c66255a3d5c724f8c2356e5ff。隔离旧工作区改动。只更新应用容器；真实生图会计费并自然写业务日志，优先测试边界模拟避免测试写生产库。
# Decisions
用户已明确授权修复、测试后直接热更新线上容器且不动数据库。按已确认范围执行，无新增产品功能。保留保存/取消语义，拉模型使用未保存草稿。以非秘密账户ID+令牌ID保存选择而非密钥。
身份恢复与跨账户隔离约束适用于宿主令牌选择及自动恢复。原有显式手动填写API key入口保留，其有效性仍由后端Bearer鉴权；只有匹配当前宿主令牌的手填key才能绑定可恢复身份。未在宿主列表中的手填key只在本次内存使用，不新增跨刷新秘密持久化能力，也不得被后台恢复成另一个账户的密钥。
# Open questions
无。
# Verification expectations
覆盖未保存选key拉模型、保存/刷新还原、账户隔离、多渠道独立凭证及迟到响应。只读独立Verifier验收；发布按PR/CI/main精确提交构建顺序。

发布是开发验收通过后的必要交付步骤，未部署不得声称完成。记录双站合并提交、镜像、公开版本及基础设施容器ID/启动时间/挂载未变证据后交付。
## Deployment verification plan

After independent code verification and required PR checks, build the merged origin/main SHA using the existing Dockerfile and an immutable YYYYMMDD-<9-character-sha> tag. VERSION is build metadata; do not edit application source on the server.

Back up both Compose files. Change only their application image tags. Run compose config validation, then update each app with --no-deps --force-recreate app. Preserve the exact application environment and mounts. Verify /api/status reports the target version internally and through aierxin.cc/codezip.io; fetch each canvas entry and its hashed asset.

Compare before/after IDs, start times and mounts for PostgreSQL, Redis, both gateways and Caddy. No direct database commands, migrations, account creation or billable test generation. On health/version failure restore the backed-up image configuration and recreate app services only.
