# 登录页视觉与行为规格

## User-visible behavior

### Requirement: 登录页提供品牌化、响应式认证入口
登录页 MUST 在桌面端呈现品牌面板和认证区域，在移动端以单栏方式呈现；任何视口不得出现横向溢出或互相遮挡。品牌面板 MUST 使用与首页同源的黑色、荧光绿、紫色和多彩品牌色，以图形 Logo、去重后的大尺寸标题、完整描述、配置统计和无连线的 Claude/Codex/Gemini/40+ 模型横向带构成编辑式科技场景。

#### Scenario: Desktop sign-in
- **WHEN** 用户在宽屏打开 `/sign-in`
- **THEN** 左侧仅显示系统图形 Logo，认证卡片显示完整 Logo/系统名称，并显示登录页配置中的品牌标题/描述/统计信息（若有）
- **AND** 后台标题与系统名称不同时使用后台配置值；标题为空或与系统名称重复时显示已有七语言产品价值标题；描述使用后台配置值，描述为空时显示已有七语言默认产品描述
- **AND** Claude、Codex、Gemini 和 40+ 模型项位于同一条无连线横向带，不显示折线路由、模型拓扑或中心网关图
- **AND** 品牌面板不显示重复系统名称或穿过内容的轮廓字水印，标题、描述、模型带和统计信息互不遮挡
- **AND** 认证区域的背景、卡片、控件和装饰信号跟随首页当前浅色/深色主题 token，不显示旧粉色 auth palette
- **AND** 品牌内容和模型项错峰入场，模型带具有低频扫光，背景扫描缓慢移动；`prefers-reduced-motion` 下所有动画停止并保留静态可读内容
- **AND** 模型横向带仅是支持能力示意，不作为登录 provider 或实时上游状态列表
- **AND** 认证卡片具有锐利轮廓和品牌信号线
- **AND** 登录卡片宽度受限，表单、provider 和底部协议文案保持清晰垂直节奏

#### Scenario: Mobile sign-in
- **WHEN** 用户在窄屏打开 `/sign-in`
- **THEN** 品牌面板折叠为紧凑品牌标识，登录卡片适配屏幕宽度
- **AND** 大面积品牌文字、模型横向带和装饰动效不在移动端渲染为可见场景
- **AND** 页面不产生横向滚动，所有主要控件保持可操作

### Requirement: 登录页保留现有认证能力
登录页 MUST 继续根据 `SystemStatus` 展示密码登录、Passkey、OAuth、微信、Telegram、OIDC、自定义 OAuth、Turnstile 和点击验证码入口。

#### Scenario: Conditional providers
- **WHEN** 服务端状态关闭某个 provider 或密码登录
- **THEN** 对应入口不显示或保持现有禁用语义
- **AND** 其他可用认证入口和协议文案仍正常显示

#### Scenario: Password login submission
- **WHEN** 用户填写用户名或邮箱和密码并提交
- **THEN** 继续调用现有 login API
- **AND** 成功响应继续遵循 redirect 或跳转到 2FA
- **AND** 失败响应继续通过现有错误提示机制反馈

### Requirement: 登录页导航和可访问性保持完整
登录页 MUST 保留注册、忘记密码、协议链接、键盘焦点和可访问名称。

#### Scenario: Auth navigation
- **WHEN** 用户点击注册、忘记密码或协议链接
- **THEN** 使用现有类型安全路由进入对应页面

#### Scenario: Keyboard and labels
- **WHEN** 用户仅使用键盘浏览页面
- **THEN** 登录输入、密码可见性、provider 按钮、提交按钮和导航链接均可聚焦和操作
- **AND** 输入控件具有稳定的 label/placeholder 语义

### Requirement: 主题和本地化兼容
登录页 MUST 兼容当前浅色、深色和七种前端语言，不得硬编码仅适用于英文的布局宽度或文案。

#### Scenario: Theme and locale
- **WHEN** 用户切换主题或语言
- **THEN** 登录页继续使用首页当前主题 token，旧粉色或脱离主题的装饰色不重新出现，文字不溢出、不遮挡相邻控件

## Implementation boundaries

- 主要实现文件：`web/src/features/auth/auth-layout.tsx`、`web/src/features/auth/components/auth-card.tsx`、登录/注册页面的组合层和必要的 auth 样式。
- 认证 API、redirect helper、OAuth hook、Passkey API、验证码 hook 不在本 change 中重构。
- 动效使用 CSS，不新增 Three.js、React Three Fiber、Drei、GSAP、Canvas RAF 或指针跟随逻辑。
- 测试文件放在对应模块的 `__tests__/` 目录。
