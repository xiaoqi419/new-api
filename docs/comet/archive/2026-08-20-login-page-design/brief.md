# Outcome

将 New API 登录页升级为具有明确品牌识别、科技感和艺术构成的 AI 开发者认证入口，同时保留现有认证能力、路由行为和服务端配置。

# Scope

- 重做 `AuthLayout`、`AuthCard`、登录页相关视觉层级和响应式布局。
- 桌面端采用左右分栏：深色品牌面板 + 浅色/主题化认证区域；移动端收敛为单栏。
- 左侧使用与首页一致的黑、荧光绿、紫色和多彩品牌色，以图形 Logo、去重后的大尺寸标题、完整描述、配置统计和无连线的 Claude/Codex/Gemini/40+ 模型横向带构成编辑式品牌场景。
- 桌面品牌面板通过内容占比和视觉层级解决留白，不再使用模型拓扑、折线路由、中心网关图或穿过内容的轮廓字水印；低频背景扫描、模型带扫光和错峰入场提供克制动态。
- 认证区域使用独立 scoped auth surface 直接别名到首页当前的浅色/深色语义 token，并采用更锐利的卡片轮廓与品牌信号线；不保留旧粉色或脱离主题的装饰色。
- 复用当前主题 token、系统名称、logo、可配置登录页标题/描述/背景和统计信息。
- 保留并重新组织用户名或邮箱登录、密码、Passkey、OAuth、微信、Telegram、OIDC、自定义 OAuth、验证码、Turnstile、忘记密码、注册入口和协议文案。
- 补充登录页的行为和布局回归测试，并更新前端 changelog。

# Non-goals

- 不修改后端认证接口、JWT/session 格式、OAuth 协议、Passkey 协议或 2FA API。
- 不改变登录成功后的 redirect 规则、2FA 跳转或错误处理语义。
- 不删除动态 provider，不把用户名或邮箱改成只允许邮箱。
- 不引入 image-to-code，不把外部模板或远程图片直接写入生产代码。

# Acceptance examples

- 登录页在桌面端展示品牌面板和认证卡片，在窄屏展示无横向溢出的单栏布局。
- 桌面品牌面板以图形 Logo、去重后的大标题、配置描述或七语言默认描述、配置统计和无连线的 Claude/Codex/Gemini/40+ 模型横向带填充主视觉，不显示重复系统名称、轮廓字水印、模型拓扑、折线路由或中心网关图；模型名称只用于表达已支持的模型生态，不依赖真实 provider 配置，也不代表登录 OAuth provider 数量；减少动态效果时场景保持清晰静态状态。
- 系统状态关闭某个 OAuth/Passkey/密码登录能力时，对应控件不显示，其他入口仍可用。
- 用户可从登录页进入注册和忘记密码；登录表单提交仍调用既有 API，并保留 redirect 和 2FA 分支。
- 登录页在浅色、深色和七种前端语言下均可读，认证区域跟随首页当前主题 token、不残留旧粉色，控件具有可访问名称、键盘焦点和稳定尺寸。
- 验证码、Turnstile、OAuth、Passkey 的现有对话框/流程未被视觉改造破坏。

# Constraints and invariants

- 使用 React 19、Tailwind、现有 Base UI/shadcn 组件和 i18next；所有新增用户可见文本必须进入七种 locale。
- 保留 `new-api`、`New API`、`QuantumNous` 版权和品牌归属信息。
- 保留当前 worktree 中与首页页脚、定价页和主题相关的未提交修改。
- 外部研究仅作为设计依据。Fathom Brave 搜索成功；ReactBits 官方组件页为客户端渲染，Jina Reader 请求超时且 Fathom Extract 只能取得页面标题，因此进一步核对了官方 GitHub 源码与许可证。Pixel Swap、Dot Grid 和 Pixel Trail 均经过评估，但用户审阅后明确不要拓扑和叠加式交互点阵；最终实现只保留研究中低频、分层动效的原则，不复制外部源码，也不新增动画依赖。

## External research

- [50+ login page examples for SaaS designers (Eleken, 2026-03-17)](https://www.eleken.co/blog-posts/login-page-examples): AI developer products benefit from a compact sign-in form paired with a coding-oriented brand panel; used as the split-layout reference.
- [12 Best shadcn/ui Login, Signup Templates 2026 (AdminLTE.IO, accessed 2026-08-21)](https://adminlte.io/blog/shadcn-ui-login-signup-auth-templates): confirms split brand panels, social-first alternatives and passkey variants as established patterns; used only for interaction hierarchy, not copied markup.
- [58 SaaS Login UI Design Examples (SaaSFrame, accessed 2026-08-21)](https://www.saasframe.io/categories/login): supports restrained SaaS auth composition and narrow form widths; used as a secondary visual reference.
- [SaaS Login Design Inspiration (Landingfolio, accessed 2026-08-21)](https://www.landingfolio.com/inspiration/login/saas): supports a focused login surface with strong typography and minimal decoration; used as a composition reference.
- [ReactBits Pixel Swap (accessed 2026-08-21)](https://reactbits.dev/animations/pixel-swap): evaluated as a content-to-content transition; it is not used as the persistent full-panel background because its reveal model does not directly address the empty brand field.
- [ReactBits Dot Grid (accessed 2026-08-21)](https://reactbits.dev/backgrounds/dot-grid): evaluated for filling negative space, then rejected after visual review because an interactive point field added another competing layer instead of improving the composition hierarchy.
- [ReactBits official repository (accessed 2026-08-21)](https://github.com/DavidHDev/react-bits): official source confirms copy-ready React variants, component dependencies, and the MIT + Commons Clause license. The reviewed Dot Grid source uses Canvas, GSAP and InertiaPlugin; Pixel Trail uses Three.js, React Three Fiber and Drei. These dependencies and implementations are not added to the auth page.

# Decisions

- 视觉方向：编辑式 AI 开发者品牌面板。以图形 Logo、去重后的大尺寸标题、完整描述和横向模型带形成主要内容密度，使用黑色基底、荧光绿提示线和多彩品牌图标建立科技感；明确不使用重复品牌名、轮廓字水印、模型拓扑、折线路由或中心网关图。
- 视觉资产：复用运行时动态 Logo 和仓库已有 `@lobehub/icons` 中的 Claude、Codex、Gemini 品牌图标；第四项使用现有 Waypoints 图标和 40+ 文案表达模型生态。模型横向带不是实时 provider 状态或登录 OAuth 列表，不生成图片，也不调用 image-to-code。
- 文案层级：后台标题与系统名称不同时优先显示后台标题；标题为空或与系统名称重复时使用项目已有七语言文案“AI Development Tools Gateway”。描述为空时使用项目已有七语言文案“Integrate Claude Code, Codex CLI, Gemini CLI and more AI coding assistants”。认证卡片是桌面端唯一完整呈现 Logo 与系统名称的位置。
- 主题继承：认证区域的 background/card/primary/secondary/muted/accent/border/input/ring 等语义变量直接映射到现有 `--home-*` 当前主题 token；装饰信号仅使用 `home-lime` 和 `home-purple`，模型品牌图标保留其品牌色，不再维护独立粉色 auth palette。
- 动态效果：品牌内容和四个模型项错峰入场，模型横向带有低频扫光，背景扫描缓慢移动；全部使用 transform/opacity，`prefers-reduced-motion` 下关闭并保留静态内容。
- 性能边界：不新增 Three.js、React Three Fiber、Drei、GSAP、Canvas RAF 或指针跟随逻辑；移动端沿用紧凑单栏。
- 桌面布局：品牌面板约占 40%，认证内容约占 60%；认证卡片宽度受限，避免大屏拉伸。
- 移动布局：隐藏大面积品牌面板，显示紧凑品牌标识和完整表单；不产生横向滚动。
- OAuth provider 继续由 `SystemStatus` 动态决定；不静态假设只有 GitHub、微信或某三个 provider。
- 登录和注册继续使用独立路由与共享分段切换，避免重写认证状态机。

# Open questions

- 无。用户已明确授权采用推荐方案连续完成并验收，不再等待中间视觉确认。

# Verification expectations

- 受影响 Vitest/RTL 测试。
- 受影响文件的 oxlint 和 oxfmt。
- `tsgo -b` 或项目等价类型检查。
- Rsbuild 生产构建。
- 浏览器桌面/移动截图和登录页关键条件渲染检查。
