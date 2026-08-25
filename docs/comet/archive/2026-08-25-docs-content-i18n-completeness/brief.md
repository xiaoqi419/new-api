# Outcome

`/docs` 接入文档的完整导航、标题、正文、提示、表格说明和 Markdown 导出随当前界面语言切换。中文语言显示完整中文；英文及其他非中文语言不再泄漏中文用户文案，并使用完整英文内容作为现有文档能力的稳定 fallback。

# Scope

- 修复 `web/src/features/docs/doc-data.ts` 中“开始、AI 模型接口、图像、视频、参考”五个内容组的硬编码中文。
- 保持并复用现有 `DocLang` 与 `doc-data-guides.ts` 的中英文选择模式，使侧栏、分组、分类、条目和正文使用同一语言。
- 国际化段落、标题、提示、列表、卡片、参数说明、通用表格表头/单元格、代码块展示标签及 Markdown 导出元数据。
- 保持 `/api/status.server_address` 驱动的动态 `baseUrl`，并确保中英文切换后不改变路由 hash、当前分类、下载能力或内容层级。
- 添加针对中英文数据树、Markdown 导出和 `/docs` 语言切换的回归测试。
- 在 `web/src/features/changelog/data.ts` 添加该用户可见修复的最新条目。

# Non-goals

- 不改变 `/docs` 的视觉设计、导航信息架构、路由、权限或 API 契约。
- 不翻译 API 路径、HTTP 方法和 Header、JSON 字段、参数名/类型/默认值、模型名、品牌名、协议名、环境变量、SDK 标识符或其他技术字面量。
- 不改写 raw code block 中的请求/响应示例，包括示例里的中文 prompt 或 response；这些示例作为协议数据原样保留。
- 不在本 change 中为法语、日语、俄语和越南语编写整套专属文档正文；沿用现有双语文档策略，非中文 locale 使用英文 fallback。
- 不修改后端、数据库、生产配置、生产环境或部署流程。
- 用户本地验收前不提交、推送、合并或部署本 change。

# Acceptance examples

- A1：界面语言为 `en` 时，`/docs` 的 tab、侧栏组名、分类、条目标题、正文、提示、参数说明、通用表格和代码块展示标签均为英文；排除 raw code 示例后，用户可见文档内容不含意外汉字。
- A2：界面语言为 `zh` 或 `zh-TW` 时，`/docs` 保持完整中文导航和正文，既有内容层级、含义与动态 `baseUrl` 不丢失。
- A3：法语、日语、俄语和越南语界面进入 `/docs` 时使用完整英文文档 fallback，不显示简体中文硬编码或原始翻译 key。
- A4：切换语言后，顶部 tab、侧栏和当前正文在同一次渲染中同步切换；无需刷新页面，路由仍为 `/docs`，hash 指向的 section ID 保持稳定。
- A5：API 方法、endpoint path、HTTP Header、JSON 字段、参数名/类型/默认值、模型名、协议字面量、动态 `baseUrl` 和代码示例在中英文构建结果中保持协议等价。
- A6：英文参数表显示 `Parameter / Type / Required / Default / Description` 与 `Yes / No`；中文参数表显示对应中文。Markdown 下载使用当前文档语言的表头、必填值、卡片标点和代码块展示标签。
- A7：英文代码块标签仍能正确识别 JSON、bash、Python、JavaScript 和 HTTP fence language；下载结果不因标签翻译失去语法标记。
- A8：`buildDocGroups(baseUrl, 'en')` 的全部用户文案都有英文值；递归回归测试排除技术字面量和 raw code 后不发现汉字。`buildDocGroups(baseUrl, 'zh')` 保持代表性中文内容。
- A9：桌面和移动视口下，英文与中文 `/docs` 均无页面级横向溢出；侧栏/内容可访问，横向滚动仅限既有代码块和表格容器。
- A10：现有 `/docs` tab、折叠、分类/条目选择、hash、复制、Markdown 下载及动态 server address 行为保持可用。
- A11：新增/更新相关 Vitest，并通过涉及文件 format/lint、前端 TypeScript typecheck、`bun run i18n:sync`、生产 Rsbuild build 和 `git diff --check`。
- A12：用户本地验收前不提交、推送、合并或部署，不触碰生产数据库与生产配置。

# Constraints and invariants

- 遵守现有 React 19、TypeScript、TanStack Router、i18next、Tailwind CSS、Bun/Rsbuild 工具链和 `web/AGENTS.md`。
- 使用集中、数据驱动的文档语言选择机制，不在 JSX 中散落 `language === 'zh'` 分支。
- 中英文可见内容必须成对定义；技术字面量和 raw code 示例只定义一次并复用。
- 若新增或修改 `web/src/i18n/locales/*.json`，所有七种 locale 必须仅通过临时 `web/scripts/add-missing-keys.mjs` 写入，随后运行 `bun run i18n:sync` 并删除临时脚本；不得手工编辑 locale JSON。
- 保留 New API、QuantumNous、许可证、包元数据、仓库链接和项目归属。
- 保留用户和其他 change 已有改动；本 change 使用独立 worktree。

# Decisions

- 使用现有双语文档契约：中文族语言映射为 `zh`，所有非中文语言映射为 `en`。
- 主文档内容采用与 `doc-data-guides.ts` 相同的结构化 `pick(zh, en)` 模式，不把 300 余段长文案作为散落的 JSX 条件。
- raw code block 内容不因界面语言自动翻译；代码块标题属于用户界面文案，需要中英文成对定义。
- Markdown 导出与屏幕渲染共享同一份已本地化数据树，并单独本地化序列化器生成的固定表头与布尔值。
- 任务保持单一 Native change：所有修改集中在同一文档数据树和同一回归测试边界，拆分会增加翻译一致性和合并风险。

# Open questions

- 无。

# Verification expectations

- 递归数据测试覆盖全部 `DocBlock` 类型，验证英文用户文案无意外汉字并验证中文代表性内容。
- Markdown 单元测试验证中英文固定表头、Yes/No、代码 fence language 与 raw code 稳定性。
- `/docs` 组件测试验证语言切换后 tab、侧栏和正文同步更新，且动态 `server_address` 继续显示。
- 运行 `/docs` 相关 Vitest、`bun run i18n:sync`、TypeScript typecheck、生产 build、涉及文件 oxfmt/oxlint 与 `git diff --check`。
- 本地浏览器覆盖英文/中文、桌面/移动、侧栏与正文、Markdown 下载、页面级水平溢出及控制台错误。
