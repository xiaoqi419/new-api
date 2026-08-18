# Outcome

在不改变现有共享组件、数据表、认证辅助、搜索、导航、主题和聊天入口行为的前提下，清零 `web/src` 合并后剩余的 51 项 oxlint errors，并保持相关测试与 frontend typecheck 通过。

# Scope

- 独占修改当前 23 个剩余 error 文件：
  - `web/src/components/ai-elements/{prompt-input,web-preview}.tsx`；
  - `web/src/components/{command-menu,confirm-dialog,copy-button,long-text,multi-select,page-transition,risk-acknowledgement-dialog,tag-input,theme-switch}.tsx`；
  - `web/src/components/data-table/core/{column-header,pagination}.tsx`；
  - `web/src/components/data-table/toolbar/{bulk-actions,faceted-filter,view-options}.tsx`；
  - `web/src/context/search-provider.tsx`、`web/src/hooks/use-table-url-state.ts`；
  - `web/src/lib/{http-status-code-rules,nav-icons,passkey,utils}.ts(x)`；
  - `web/src/routes/_authenticated/chat/$chatId.tsx`。
- 允许在上述模块边界内新增或修改直接保护真实语义回归的既有测试。
- 修复 import cycle、Promise rejection 处理、稳定列表 identity、type-only import、条件/字符串/数组等价改写与 iframe error；warning-only 专项不进入范围。

# Non-goals

- 不修改其他 feature child 已拥有的文件、classic 前端、backend、lint config、package/lock、依赖、i18n、changelog、生成路由或受保护品牌。
- 不新增用户可见功能或视觉改版，不改变聊天 preset/API key 注入契约，不通过 `--fix`、disable、ignore 或规则降级制造绿色结果。
- 不把当前没有调用点的 AI element 组件扩展成新功能；只保持其通用组件契约并修复已存在的 lint error。

# Acceptance examples

- A1：权威 oxlint 1.74.0 对全部 23 个 owned files 返回 0 errors，warnings 数量如实记录。
- A2：搜索/command menu import cycle 被真实拆除；Promise rejection、passkey 编解码、URL table state、HTTP status rules、列表 identity、主题与确认对话框行为保持；相关既有测试与 frontend typecheck 通过。
- A3：Git diff 只包含批准的 owned files、直接相关测试与本 child 正式产物；不含 classic/backend/config/package/lock/dependency/i18n/changelog/disable/ignore 变化。

# Constraints and invariants

- 先用 Fast Context 定位调用链，再用 `rg` 和完整文件阅读确认修改；不得仅凭 lint 建议机械改写高扇出共享代码。
- 可选 type import 必须保留原模块的运行时副作用语义；stable key 必须来自数据 identity，不使用数组索引或随机值。
- Promise 修复必须返回或处理 rejection，不新增空 catch；import cycle 通过抽取稳定共享边界解决，不用动态加载规避。
- iframe sandbox 必须依据实际信任模型处理。不能同时保留 `allow-scripts` 与同源能力却声称形成有效隔离，也不能通过破坏外部聊天的 cookies/storage/OAuth 来通过 lint。
- 不修改 `web/.oxlintrc.json`，除非 supervisor 先回到 Shape、由用户明确批准新的精确例外并同步父 brief/spec/A4/A10。

# Decisions

- 本 child 严格继承已确认的 `p1-lint-debt` A1/A3 范围；除新的 iframe 安全冲突外，不重复请求用户确认。
- 合并后权威基线为 51 errors / 23 files；warning-only diagnostics 不阻塞本 child。
- `WebPreviewBody` 当前在 `web/src` 没有调用点，也没有父页面 DOM、storage 或 postMessage 契约。其通用 arbitrary-URL preview 保留 scripts/forms/popups/presentation，但移除 `allow-same-origin`，使 sandbox 使用 opaque origin；该处理不改变当前可达用户流程。
- 管理员配置的外部聊天 preset 当前把 API key 与 server address 注入 URL，并允许 camera/microphone。有效 sandbox 若不含 `allow-same-origin` 会把外部应用置于 opaque origin，可能破坏 cookies、localStorage 与 OAuth；去掉 `allow-scripts` 则会直接破坏聊天应用。现有无 sandbox 行为与 0-error 门禁发生冲突，必须由用户决定信任模型。
- 外部资料交叉核验使用 Fathom、Exa、Tavily，并以 WHATWG HTML Standard 与 MDN 为准；当前工具面没有可调用的 Firecrawl 能力，此缺口如实保留。

# Open questions

- [blocking] Q1: 对管理员配置的外部聊天 iframe，是保持现有完整第三方应用能力并为精确文件批准 lint override，还是启用会限制 origin/storage/OAuth 的 sandbox，或改为新标签页打开？该决定同时影响 default chat 与 classic 中同类外部/admin-configured iframe；确认前不修改这些安全属性。

# Verification expectations

- 从 `web` 对 23 个 owned files 运行权威定向 oxlint，并记录 error/warning 数量。
- 运行 owned modules 的邻近既有测试和 `npx --yes bun run typecheck`；没有直接测试的语义由新的只读 Verifier 完整审计。
- 验证前运行 `git diff --check`、scope scan、config/package/lock/disable 检查；新的只读 Verifier逐项核对 A1-A3。
