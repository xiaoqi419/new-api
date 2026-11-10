# 本地整合 New API rc.48、rc.49

## 范围与基线

- 用户授权：仅本地更新、验证、汇报；禁止推送、创建 PR、发布镜像或部署。
- fork 基线：`49255bb1b49f556cdc6130c054eb5d7d2bc70fb4`，开始前从 `origin/main` 重新获取。
- rc.48：`706144769e5bed5a47b78721e3bb11da3cf4c0b9`。
- 固定目标 rc.49：`48a6c87f9e7757fdc58e5be9bcb4f8281ad0dfd0`；基线之外共 57 个上游提交。
- 唯一整合工作树：`D:/CodexHome/worktrees/upstream-rc47/new-api`，分支 `codex/upstream-rc49-local`。复用既有干净工作树，保留主 checkout 的未跟踪文件。
- Comet 恢复探针返回 `none`，没有活跃 Native change，因此未创建或推进 Comet workflow。

## 更新内容

1. 缓存安全：用户、API 令牌、登录会话缓存完整性签名；Redis Cluster 跨槽键修复；两步验证锁定结束后重新计数。
2. 模型和协议：gpt-image-2.6 的 complexity、SVG、GIF、帧和 markup；DeepSeek Responses 工具历史 reasoning；Gemini Argon 思考配置；Azure Responses WebSocket；Vertex v1beta1 开关和服务账号访问令牌缓存。
3. 渠道：多密钥恢复、保留手动禁用状态、亲和重试从最高优先级开始、逐规则清空亲和缓存，以及创建渠道返回对应 ID。
4. 任务插件：厂商原生调用路径及顶层 `/v1`；可灵 4.0 时长和价格；Vertex Gemini Omni、Omni 1.2 Flash、多图片与 token 用量计费；流式任务异常时的结算修复。
5. 定价界面：缺失、失效及陈旧插件定价提醒；已启用渠道模型范围；删除草稿可撤销；保存前显示逐模型价格差异并确认；手机操作菜单。
6. 转换与性能：moego JSON/请求体处理、裸 `[DONE]`、xAI 用量明细、Bedrock safeguards、Cloudflare 向量结果；上游 HTTP/2 PING 探测默认关闭。
7. 其他：SQLite 裸路径启用默认 WAL、busy timeout 和 IMMEDIATE；OAuth 注册邀请关系；退出登录卸载鉴权页面；访问和异常日志跟随轮转；DOMPurify 等依赖修复。

## fork 兼容处理

- 保留 bigint 钱包、充值/提现/返利/代理商账本、支付方式、订阅和奖励流程；未修改任何运行中配置或业务价格。
- 保留令牌分组切换字段、用户与令牌并发限制、代理商字段；将这些额外字段纳入 Redis 签名缓存的完整写入，避免签名因字段丢失而失败。
- 对上述额外字段补充篡改、缓存修复及保留合法值回归；继续保留实时额度计数，修复缓存元数据不覆盖已预扣额度。
- 合并亲和重试偏移时保留 fork 的路径过滤与分组切换语义；保留 Doubao 管理员阶梯价格、静音默认以及图片数量调整后的阶梯价格。
- 保留默认和经典前端、无限画布 v0.20.0、公告弹窗、默认中文和双站访问策略。
- Vertex 新开关接回现有分区渠道编辑器；价格确认使用现有对话框封装，图片/视频阶梯价格保留在快照、草稿、提交与变更展示中。
- 七种语言按三方来源合并，通过翻译脚本写入，再执行 i18n sync；每种语言新增/更新 43 个上游翻译键，保留 fork 文案。
- JSON 优化后将 fork 的两个遗留 gjson 调用接回 ojson；日志输出关闭时释放文件句柄，避免 Windows 轮转测试临时文件无法清理；提示消息测试等待可见状态，保留原断言。
- 更新内置更新日志，版本使用构建时注入值；尚未生成或承诺正式发布镜像标签。

## 本地验证

证据保存在 `D:/CodexHome/artifacts/rc49-*` 和 `rc49-verification/`，不写入生产环境。

- 根模块 `GOWORK=off go vet -p 2 ./...`、`go build -p 2 ./...` 和最终 `go test -p 2 ./...` 通过。
- `relaykit/` 独立 vet、build 和全量测试通过；`tokenkit/` 独立 build 和全量测试通过。
- 前端 Bun 1.4.4 frozen-lockfile 安装、类型检查通过；全套 306 个文件、2,953 项测试通过。最后补充的阶梯价格变更展示经过同文件 11 项测试复核。
- 默认、经典和画布生产构建通过。经典构建有持久缓存目录清理警告，画布保留既有大 chunk 提示。
- 变更文件 oxlint、oxfmt 检查通过；七种语言无缺失和额外键，历史未翻译项未扩大为本轮翻译任务。
- Browser plugin 不可用，按 frontend-testing-debugging 技能使用现有 Playwright/Edge。仅在 loopback 提供生产静态资源，所有 API 均模拟、外部请求全部阻断。
- 浏览器桌面 1440×1050、手机 390×844 验证：模型价格删除保留为草稿；确认前无提交；确认后提交正确模型变更；无页面异常和横向溢出。模拟配置必须包含真实 API 返回的完整价格选项；不完整 mock 最初触发错误边界，修正 mock 后通过，未为此改变生产逻辑。
- GPT-6 Luna 审查代理虽可创建，却返回空任务，没有形成有效独立审查；未以该返回冒充审查通过。

## 发布前须知与限制

- 缓存签名要求协调升级共享数据库/Redis 的相关应用节点；不要把新旧缓存协议混跑当作已验证兼容。
- HTTP/2 健康检查默认关闭；此轮没有擅自开启。
- 新厂商原生路径对 callback_url 的限制按上游实施；现有调用方发布前需要核对。
- SQLite WAL 备份要考虑伴随的 `-wal`、`-shm` 文件及一致性快照。
- MySQL/PostgreSQL 外部服务矩阵、真实支付/邮件、付费模型调用和线上双站切换未执行；本轮不包含这些授权。
- 没有推送、PR、GitHub CI、镜像发布、生产登录或部署。

## 上游提交清单

逐提交来源清单附于下方。完整目标采用 Git 合并保留祖先关系；兼容差异以上述 fork 处理和测试为依据，而不是把提交数当作功能数。

| 提交 | 上游变更 | 处理 |
| --- | --- | --- |
| `ad5611282` | fix(relay): apply GPT-6 chat parameter rules to gpt-6.1-sol and gpt-6.1-terra (#8064) | 整合，保留 fork 兼容 |
| `54788117d` | fix: count completed non-stream relays after context cancellation (#7844) | 整合，保留 fork 兼容 |
| `49271d2d8` | fix(aws): preserve safeguards in Bedrock Invoke requests (#8071) | 整合，保留 fork 兼容 |
| `55515dbae` | fix(relay): terminate streams on exact bare done markers (#8074) | 整合，保留 fork 兼容 |
| `26c488c44` | fix(relay): allow Azure channels to opt in to Responses WebSocket (#8047) (#8075) | 整合，保留 fork 兼容 |
| `b08ee86fe` | fix(cloudflare): preserve embedding response data (#8041) | 整合，保留 fork 兼容 |
| `fcc241cdf` | fix: start affinity fallback at the highest channel priority (#8078) | 整合，保留 fork 兼容 |
| `e449cc700` | feat: sample immediate task successes in model performance metrics (#8067) | 整合，保留 fork 兼容 |
| `a2defd2a8` | Merge commit from fork | 整合，保留 fork 兼容 |
| `9eda50a32` | Merge commit from fork | 整合，保留 fork 兼容 |
| `829f0828a` | fix: unmount authenticated layout on sign-out to stop credential-less refetches (#8110) | 整合，保留 fork 兼容 |
| `f3660175e` | Merge commit from fork | 整合，保留 fork 兼容 |
| `4193734a2` | fix(logger): keep gin access and recovery logs on the current log file after rotation (#8098) | 整合，保留 fork 兼容 |
| `a3851c29e` | fix: save Turnstile keys before enabling (#7960) | 整合，保留 fork 兼容 |
| `3150dfea9` | chore(deps): bump github.com/go-jose/go-jose/v4 from 4.1.4 to 4.1.6 (#8112) | 整合，保留 fork 兼容 |
| `837b8145f` | chore(deps): bump undici in /electron (#8006) | 整合，保留 fork 兼容 |
| `ee0f0ac78` | chore(deps-dev): bump electron from 41.10.6 to 42.11.16 in /electron (#8008) | 整合，保留 fork 兼容 |
| `7fa815edb` | chore(deps-dev): bump fast-uri from 3.1.7 to 3.1.9 in /electron (#8007) | 整合，保留 fork 兼容 |
| `1695171fa` | chore(deps): bump tailwind-merge from 3.6.0 to 3.7.0 in /web (#8106) | 整合，保留 fork 兼容 |
| `cef78205e` | chore(deps-dev): bump knip from 6.27.0 to 6.43.0 in /web (#8105) | 整合，保留 fork 兼容 |
| `9fc70bb83` | chore(deps-dev): bump @tanstack/react-query-devtools in /web (#8104) | 整合，保留 fork 兼容 |
| `6e78cb328` | chore(deps): bump marked from 18.0.6 to 18.1.2 in /web (#8103) | 整合，保留 fork 兼容 |
| `1e8c707ac` | chore(deps): bump @codemirror/language from 6.12.4 to 6.13.1 in /web (#8102) | 整合，保留 fork 兼容 |
| `883eeb87d` | feat(plugins): warn about task models a plugin cannot charge | 整合，保留 fork 兼容 |
| `77436271f` | fix(deps): upgrade DOMPurify to 3.4.17 (#8116) | 整合，保留 fork 兼容 |
| `37d23dcc8` | fix(profile): honor global sidebar visibility (#7429) | 整合，保留 fork 兼容 |
| `c59f6fd55` | feat(plugins): serve task plugins at the vendors' own paths and answer as the vendors do (#8117) | 整合，保留 fork 兼容 |
| `8b253de42` | fix(plugins): keep Kling 4.0 durations in range and map every video size (#8118) | 整合，保留 fork 兼容 |
| `1424ffdd4` | fix(plugins): load plugins that declare their own /{key} address (#8119) | 整合，保留 fork 兼容 |
| `fe57cba42` | fix(plugins): prefer Kling's returned price (list_price) for Kling 4.0 cash billing (#8125) | 整合，保留 fork 兼容 |
| `ea343c4a8` | fix(plugins): charge relayed streams even when the reserve or task insert fails (#8121) | 整合，保留 fork 兼容 |
| `d0abbf6e0` | feat(plugins): generate video with Gemini Omni on Vertex AI channels (#8142) | 整合，保留 fork 兼容 |
| `70e6af642` | perf: read and edit request JSON and base64 with moego (#8148) | 整合，保留 fork 兼容 |
| `651d5a213` | fix(xai): preserve token details in stream usage conversion (#6420) | 整合，保留 fork 兼容 |
| `c046559bb` | feat(plugins): bill gemini omni by the tokens vertex reports (#8153) | 整合，保留 fork 兼容 |
| `45746eee4` | feat(relay): add opt-in HTTP/2 health checks (#8059) | 整合，保留 fork 兼容 |
| `9b473a3fe` | fix(twofa): restart the failure count after a lockout expires (#8172) | 整合，保留 fork 兼容 |
| `52c173038` | feat(gemini): add Argon fields and reasoning mappings (#8177) | 整合，保留 fork 兼容 |
| `83b18fe6c` | feat(channel): return created IDs with input mappings (#8164) | 整合，保留 fork 兼容 |
| `94b521664` | feat(vertex): add per-channel v1beta1 endpoint switch (#8179) | 整合，保留 fork 兼容 |
| `ba5f73677` | fix(gemini): bill embeddings from upstream usageMetadata (#8182) | 整合，保留 fork 兼容 |
| `706144769` | fix(auth): 校验 Redis 鉴权缓存完整性 (#8200) | 整合，保留 fork 兼容 |
| `3374f251e` | feat: forward image complexity and markup for gpt-image-2.6 (#8208) | 整合，保留 fork 兼容 |
| `e3e74205f` | fix(pricing): guide users through model pricing issues | 整合，保留 fork 兼容 |
| `72f3dc7da` | fix(pricing): review model price changes before saving | 整合，保留 fork 兼容 |
| `2de51a19e` | fix(cache): 修复用户和令牌缓存的 Redis 跨槽错误 (#8218) | 整合，保留 fork 兼容 |
| `6fa80abc7` | fix: clarify session cache actions and expose per-rule clearing | 整合，保留 fork 兼容 |
| `a5a465926` | fix(vertex): cache service-account access tokens until they expire | 整合，保留 fork 兼容 |
| `e03439033` | refactor(aws): remove the unused api_key HTTP request path | 整合，保留 fork 兼容 |
| `8c8940c99` | fix(plugins): serve uploaded plugins at top-level /v1 paths (#8241) | 整合，保留 fork 兼容 |
| `433830b4e` | fix(channel): restore a multi-key channel when a key is enabled after all keys failed | 整合，保留 fork 兼容 |
| `ada15c050` | fix(channel): keep a manual channel disable when a request fails | 整合，保留 fork 兼容 |
| `9c2c370a6` | fix(sqlite): keep the default SQLite settings when SQLITE_PATH is a plain path | 整合，保留 fork 兼容 |
| `a3fd673bb` | feat(deepseek): 补全 Responses 工具历史缺失的 reasoning (#8162) | 整合，保留 fork 兼容 |
| `dd50ee0a5` | feat(plugins): add gemini omni 1.2 flash and send every input image to vertex (#8228) | 整合，保留 fork 兼容 |
| `e8298df63` | feat(channels): 高级自定义渠道增加 DeepSeek 搜索与抓取路径选项 (#8250) | 整合，保留 fork 兼容 |
| `48a6c87f9` | fix(oauth): persist inviter when creating OAuth users (#8247) | 整合，保留 fork 兼容 |
