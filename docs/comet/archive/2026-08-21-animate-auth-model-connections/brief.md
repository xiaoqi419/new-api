# Outcome

在桌面认证叙事区为 Claude、Codex、Gemini 与“40+”模型能力提示增加一条克制的流动连接轨道。该效果只表达多模型接入，不改变登录、注册或表单行为，并在减少动态效果偏好下稳定为静态连接。

# Scope

- 在既有 `AuthExperienceLayout` 的桌面品牌叙事区实现单轨连接与流动高光。
- 保留 Claude、Codex、Gemini 和“40+”的当前模型标识、可访问名称及信息层级。
- 使用现有主题语义变量完成光效，不使用旧粉色、拓扑网络、独立插画或新依赖。
- 为动画存在、布局不位移、不可交互、主题变量与 reduced-motion 降级补充聚焦回归测试。
- 在 changelog 最新位置记录可见的认证叙事区改进；若没有新用户可见文案，不新增翻译键。

# Non-goals

- 不修改登录欢迎文案、注册、忘记密码、OAuth、验证码、表单请求或导航。
- 不改变认证面板尺寸、栅格、模型信息的顺序或移动端表单结构。
- 不引入拓扑图、粒子背景、大面积动画、可点击模型卡片或额外运行时依赖。
- 不修改 SMTP、IP 访问控制、部署和其他 child 所有的代码或文档。

# Acceptance examples

- A1：在 `lg` 及以上的认证品牌区，Claude、Codex、Gemini 与“40+”提示之间存在单一、可见的流动连接/高光；模型提示本身仍在原位置，页面不发生布局位移。
- A2：连接层为装饰性且不响应指针事件，不遮挡标题、说明、模型名称或表单，也不表现为按钮或链接。
- A3：光效使用当前主题的语义变量，不遗留硬编码旧粉色，不创建拓扑网络。
- A4：`prefers-reduced-motion: reduce` 下动画停止并显示静态连接，模型信息保持完整。
- A5：认证体验布局回归测试、相关格式/lint/类型检查和生产构建通过，并在 changelog 中记录本次用户可见改进。

# Constraints and invariants

- 仅在 `web/src/features/auth/components/auth-experience-layout.tsx` 的品牌区及其专属测试/变更记录中实现；保留其他代理和用户已有改动。
- 动画层必须使用 `aria-hidden='true'`、`pointer-events-none`、绝对定位且不占文档流，禁止改变现有模型栅格的尺寸或间距。
- 减少动态效果必须由 CSS `@media (prefers-reduced-motion: reduce)` 处理，不能依赖 JavaScript 计时器。
- 仅使用当前已有的图标、Tailwind 与 CSS 变量；任何新增用户可见文字必须使用 i18next 并覆盖七种现有语言。

# Decisions

- 使用一条沿模型提示底部运行的静态轨道和单个高光，而非把模型项连接成拓扑图，避免空旷、视觉嘈杂和布局风险。
- 将动画作为无障碍隐藏的纯装饰层；模型列表仍是唯一的信息源，确保动作偏好或 CSS 动画不可用时内容无损。
- 通过自定义属性继承当前 `--primary` 主题色，将光效限制在面板局部，避免残留旧主题的粉色阴影。

# Open questions

- 无。

# Verification expectations

- 回归测试检查模型提示、连接装饰、不可交互契约、静态排版约束和 reduced-motion CSS 降级规则。
- 静态检索确认没有旧的 `data-auth-motion` 反向断言、拓扑相关标记或硬编码粉色；认证表单和路由入口保持未改。
- 运行聚焦 Vitest、格式检查、受影响文件 lint、TypeScript 类型检查、生产构建和 `git diff --check`。
