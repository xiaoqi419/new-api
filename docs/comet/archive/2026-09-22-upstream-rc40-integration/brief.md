# Outcome

在现有二开上完整吸收官方 rc.40 及固定主分支目标的新增功能与修复，逐项记录处置与验证，保留所有二开能力和已有运营数据。

# Scope

- Fork baseline：2d054b38054f7fef1a46c6dbbd61e0cdf8c1997e。
- Upstream target：9310231b3c27fea933e939b46cf26e0ce67192e3，覆盖 rc.40 和日志模型标签修复；任务过程中不追随移动的 upstream/main。
- 205 个历史差异提交逐项核对；已通过 squash 同步的能力判为 already-equivalent，不重复添加。
- 顺序批次：来源/依赖审计 → relay 与 WS → 计费/预扣/表达式 → 任务插件及图片视频 → 账号安全/数据库兼容 → 管理界面/日志/性能 → 全量集成验证。
- 一个 active Native change、一个实现 worktree。各批次为可审查提交，不在中间不兼容状态发布。只读调查可并行；修改相同核心路径必须串行。

# Non-goals

- 用户明确排除官方新增模型映射预览/工作台及其预览应用步骤；保留当前模型映射编辑、运行时重定向和必要兼容修复。

- 不新增未经官方/供应商证实的 grok-4.7 特殊适配或价格。
- 不重做品牌、删除二开页面、重置账号/令牌/渠道/价格/余额。
- 不直接从 upstream 镜像部署；不重建生产数据库、Redis 或网关。
- 不把未经确认的数据结构迁移隐含在普通热更新中。

# Acceptance examples

- A1: 固定源与目标可追溯，提交台账全部有处置、原因和证据，无 pending 项；不把 squash 历史差异误报为缺失功能。
- A2: Chat/Responses/Claude/Gemini 转换覆盖工具图片、推理分段、流式 usage、模型参数及异常边界，定向测试通过。
- A3: Responses WS 改用固定上游官方通用实现；客户端 WS 经渠道 responses_websocket_enabled 能力检查连接上游 WS，普通 HTTP/SSE 保持 HTTP。删除 CPA 专用连接池/预热/自动 HTTP→WS 桥接及其 UI；保留本项目鉴权、租户隔离、限流、路由与计费安全。不声称未实测的延迟提升。
- A4: 表达式、图片缓存、断流估算、预扣与结算保持不负扣、不重复收费、正确退款；已有模型价格与分组倍率不被静默覆盖。
- A5: 任务插件管理、OpenAI 图片 API、多个上游插件绑定、视频/图片用量、2xx 提交及源码限制可用；旧渠道、价格、历史任务有兼容或已验收的转换路径。
- A6: 新增渠道及 GLM/Gemini/Kimi/Ollama 参数修复有协议测试；自定义思考等级转后缀和模型修饰符保持兼容。
- A7: 账号验证、Passkey、审计和数据库兼容更新不破坏双站登录、现有绑定和二开权限。
- A8: 请求策略、模型元数据、分组排序、Key 地址、日志费用/模型提示及移动端改进完成；语言包完整；不引入官方新增模型映射预览/工作台，现有映射编辑和运行契约保持。
- A9: 无限画布、公告中心/已阅、H5/缓存率/用量、支付/GMPay/订阅/代理及路由池均有保留清单与回归证据，无意外文件删除。
- A10: Schema 差异和旧数据转换有具体清单、隔离演练、备份/回滚或前向恢复步骤；生产执行前单独确认实际方案。
- A11: root Go、独立 GOWORK=off relaykit、前端类型/lint/build/test/i18n及独立只读 Verify通过；失败和未运行检查如实记录。
- A12: 发布仅采用 required CI 通过后 PR 合入 origin/main 的精确 SHA；双站同版，应用更新与数据迁移分开记录，公开版本与镜像可核对。

# Constraints and invariants

- 遵守项目 JSON wrappers、SQLite/MySQL/PostgreSQL 兼容、quota saturation 和 relaykit 独立性约束。
- 保留署名和品牌归属；保留用户以及其他任务文件。
- 旧 upstream-compatibility spec 曾排除实验性插件和新增 schema；用户本轮已确认扩大这一边界，排除新增模型映射预览。
- 主站现有经营配置优先保留；新增选项默认避免自动改变原有收费与路由效果。

# Decisions

- 用户已明确要求全部上游功能逐项更新到二开，而非仅 grok 相关修复。
- 2026-09-22 新要求：以后不再用CPA号池，WS采用官方通用版本，取代此前保留CPA专项适配的要求。前一轮Verify/CI通过只覆盖旧候选，不作为本轮通过证据。
- 旧upstream_transport仅停止影响运行，不能自动推断等同 responses_websocket_enabled；已配置官方开关保持。渠道、Key、数据库记录及服务器CPA容器不在自动清理范围。
- 使用固定 upstream SHA、单一实现分支 codex/upstream-rc40-integration，目标 main。
- 同一核心 relay/计费/插件/渠道结构耦合较强，且项目限定单 active/worktree；采用单 change 内顺序批次，不启用多子 change 的 Supervisor 模式。
- 已确认纳入任务插件与必要 schema 支持的代码及隔离演练；生产迁移待具体报告后再授权。
- 已核实用户 bigint 钱包、MaxWalletQuota 与启动前 schema 检查已存在，不重复实施钱包升级；单请求和代理钱包保持现有 int32 饱和边界。
- 旧 ImagePriceTiers/VideoPriceTiers 保留有效语义，新插件表达式不得与旧倍率重复计价；旧异步任务沿冻结的旧账务上下文完成。
- Seedance 省略 generate_audio 的旧语义保持，absent/true/false 分别回归；不因插件默认值变化自动改价。
- Schema 合并保留代理/团购/订阅 scope_group/用户名复合索引等二开迁移；options 重复 key 预检有冲突时不得任意选值。

# Open questions

无阻塞问题。用户已明确回复“确定”，确认客户端WS走官方WS、HTTP/SSE保持HTTP；旧CPA设置不再启用桥接也不隐式开启官方开关。生产记录和容器不自动删除；生产迁移仍另行确认。

# Verification expectations

逐批有针对性的测试和提交，末尾独立语义验收覆盖 A1–A12。协议/计费使用确定性夹具；数据库变动在隔离副本验证；浏览器检查关键二开界面和新管理界面。台账记录上游功能出处、实现位置、验证结果与刻意差异。未解决的真实兼容冲突返回 Shape，不用直接取 theirs/ours 掩盖。
