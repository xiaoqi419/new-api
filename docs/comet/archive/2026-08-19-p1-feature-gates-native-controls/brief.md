# Outcome

在 Torch AI 二开尚未完成公开验收期间，暂时关闭普通用户对 AI 媒体和代理申请入口的访问，并把二开页面中的可见原生控件统一到现有 Base UI 组件；同步 changelog 与维护状态，使代码状态、公开入口和文档一致。

# Scope

- 隐藏普通用户侧 `Asset Library`、`Infinite Canvas`、`Become an Agent` 三个侧边栏入口。
- 直接访问 `/asset-library`、`/canvas`、`/agent-apply` 时显示项目现有 `ComingSoon` 状态，不删除路由文件、后端 API、模型、迁移或既有数据。
- 保留已经激活代理 owner 的 `Agent Console` 和管理员 `Agent Management`，用于内部开发和验收。
- 在视频生成中隐藏素材库选择器，但保留手工输入 `asset://` 的兼容能力和历史数据引用。
- 将 `web/src/features/agents` 与 `web/src/features/agent-console` 中可见的 `NativeSelect` 替换为项目已有 Base UI `Select`。
- 将视频引用编辑器中的可见原生文本输入替换为项目已有 `Input`；发票上传的隐藏 `input[type=file]` 保持不变。
- 在 `web/src/features/changelog/data.ts` 顶部补充 Torch AI 二开汇总条目，覆盖已开发能力、排行/并发/兜底/发票和本次暂时屏蔽范围。
- 更新 `docs/torch-ai-maintenance-status.md`、`docs/torch-ai-second-development-status.md`，将代理状态改为“部分实现、公开入口暂不开放、尚未完成验收”，并记录本次变更。

# Non-goals

- 不删除或重构画布、素材库、代理后端业务代码，不修改数据库结构。
- 不新增或扩展微信登录功能。
- 不在本 change 中合并 QuantumNous/new-api 上游提交；上游 39 个提交、207 个文件差异另开 change 逐组做三方冲突审查。
- 不修改支付凭据、支付回调、依赖版本或框架版本。
- 不移除或替换受保护的 `new-api`、`QuantumNous` 标识。

# Acceptance examples

- A1：普通用户侧边栏不再出现 `Asset Library`、`Infinite Canvas`、`Become an Agent`；已经激活代理 owner 仍能看到 `Agent Console`，管理员仍能看到 `Agent Management`。
- A2：已登录用户直接访问 `/asset-library`、`/canvas`、`/agent-apply` 时不会加载对应业务页面或调用其业务查询，而是显示 `ComingSoon` 状态；其他路由不受影响。
- A3：视频生成页面不显示素材库选择器；手工填写 `asset://...` 仍能保留并提交，历史任务引用不被改写。
- A4：代理管理“状态”、钱包调账“类型”和代理控制台“支付方式”下拉均使用 Base UI `Select` 的弹出菜单，不再打开浏览器原生选项菜单。
- A5：视频引用编辑器的公开 URL 输入外观与项目 `Input` 一致；发票隐藏文件选择 input 的上传行为保持不变。
- A6：`/changelog` 顶部存在本次二开汇总条目，明确列出已开发能力、四需求中的排行/并发/兜底/发票和暂时屏蔽项。
- A7：维护状态文档准确区分本地已通过、待线上验收、部分实现暂不公开、设计中/未实现，不再把已有代理代码写成完全未实现。
- A8：受影响前端定向测试、类型检查、相关 lint 和生产构建通过；未引入新的 lint error。
- A9：桌面与移动浏览器验证菜单、三个受限直达路由、代理下拉、视频素材选择器和 changelog，确认没有布局重叠或原生下拉残留。

# Constraints and invariants

- 遵守 `web/AGENTS.md` 的 i18n、Base UI、可访问性和测试约束；用户可见文案必须通过 `useTranslation`。
- 复用 `web/src/components/ui/select.tsx`、`input.tsx` 和 `coming-soon.tsx`，不新增 UI 依赖。
- 入口屏蔽只影响前端可见路径；后端 API、历史数据和 `asset://` 协议保持兼容。
- 修改必须保持 SQLite、MySQL、PostgreSQL 后端不变；本 change 不触碰后端数据库代码。
- Builder 不执行 Git 写操作；主代理负责提交、合并、文档收口和部署状态。

# Decisions

- 采用“隐藏普通用户公开入口、保留内部代理管理入口”的边界：代理功能已有部分代码，管理员和已激活 owner 仍需继续内部开发验收。
- 直接 URL 采用 `ComingSoon`，而不是删除路由或返回业务错误，便于后续恢复且避免手工输入 URL 绕过入口屏蔽。
- 素材库选择器暂时隐藏，但保留自由文本 `asset://`，避免破坏视频历史任务和已有调用契约。
- 可见预定义选项统一使用 Base UI `Select`；隐藏文件上传 input 属于浏览器必要 API，不纳入替换。
- changelog 采用现有 `YYYYMMDD-<sha>` 格式，使用本轮发布基线标识并由主代理在最终提交前核对。

# Open questions

无。用户已确认上述 Change A 范围；上游同步另行 Shape 和 Build。

# Verification expectations

- 在 `web` 执行受影响组件/路由测试、`bun run typecheck`、相关文件 lint 和 `bun run build`。
- 通过独立只读 Verifier 逐项检查 A1-A9，并补充桌面/移动浏览器验收证据。
- Verify 接受后更新维护文档、记录本地合并/远端/部署状态，并再决定是否进入 Archive。
