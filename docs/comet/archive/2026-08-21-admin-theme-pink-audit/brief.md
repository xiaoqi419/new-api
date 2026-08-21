# Outcome

消除管理后台和业务页面中由旧粉色主题遗留造成的混合配色，使基础表面、交互态、图表、分类标签、概览强调、表格和加载状态统一使用当前蓝/青/中性业务主题，同时保留品牌与业务语义本来需要的独立色彩。

# Scope

- 审计 `theme.css` 的完整 token 链，移除仍可被消费或继续误导维护的旧粉色通用 palette，并补齐浅色、深色业务主题的图表、标签、概览、侧栏、骨架屏和表格 token。
- 让所有通用 Tailwind/shadcn token 完整别名到 `--business-*`，保证后台与普通业务页面不再从未映射的旧粉色值取色。
- 更新无法读取 CSS 变量的 Canvas/VChart 硬编码色，包括仪表盘多序列图表和模型定价详情图表，使其与当前业务主题一致。
- 对仍含旧粉色文案或硬编码值的主题派生代码做精确残留检查；只修复主题派生色，不盲目替换所有 `pink`。
- 增加直接保护业务主题 token 和 Canvas palette 的回归测试，并在现有最新 changelog 条目中记录修复。

# Non-goals

- 不修改首页 `--home-*` 黑白、紫色和荧光绿视觉体系，也不修改登录页 scoped auth surface。
- 不移除品牌字标的暖桃、珊瑚、洋红渐变，不重绘 Claude、Codex、Gemini、支付渠道或模型厂商图标的品牌原色。
- 不移除管理员主动可选的 `pink` 自定义色卡，也不取消日志/状态分类中为区分数据而明确使用的粉色 variant。
- 不修改后端主题配置、认证、支付、订阅或拼团契约，不新增主题切换功能。
- 不重写历史 changelog 中对旧版本粉色主题的真实记录。

# Acceptance examples

- 在浅色或深色模式打开 `/dashboard`、管理设置页或其他业务页时，背景、卡片、按钮、hover、focus ring、侧栏、表格、骨架屏、概览卡和图表均来自蓝/青/中性业务 palette，不显示旧玫瑰或梅粉主题色。
- 仪表盘存在多条模型序列时，Canvas 图表使用可区分的蓝、青、绿、紫和琥珀辅助序列，不以粉/玫瑰作为主序列色，并保留循环扩展行为。
- 模型详情吞吐图的序列色与浅色/深色卡片描边跟随当前业务 palette，不再使用旧粉色 `--chart-1` 或旧粉色卡片色。
- 首页和登录页仍保持各自 scoped palette；品牌字标、厂商品牌图标、业务状态标签和管理员自定义粉色色卡没有被误删。
- 390px 与 1440px 视口下业务页面无新增横向溢出、遮挡或不可操作状态。

# Constraints and invariants

- 使用现有 React 19、Tailwind、Base UI 和主题架构，不新增依赖。
- CSS token 必须同时覆盖浅色和深色，并保持通用 token 与 Canvas 硬编码色的语义一致。
- 主题修复不得改变数据、路由、权限、API 或交互流程。
- 保留当前 worktree 中登录页、订阅迁移、拼团支付、文档按钮、页脚和模型广场等已有未提交改动。
- 所有实现先经过 `fast-context` 语义定位，再用 `rg` 精确核对；修改后执行旧粉色残留检查。

# Decisions

- 根因不是后台预设或 `data-theme-color` 重新覆盖：具名颜色预设已删除，当前 Provider 只应用字体、圆角、密度和内容宽度轴。浏览器 computed style 证明基础 `--background`、`--primary`、`--accent`、`--ring` 和 `--sidebar` 已是业务色。
- 根因是业务 alias 只覆盖了基础 token，`--chart-*`、`--tag-*`、`--overview-accent-*`、`--skeleton-*`、`--table-*` 和部分 sidebar 子 token 继续继承旧粉色；Canvas/VChart 另有无法读取 CSS 变量的粉色硬编码。
- 采用完整的 `--business-*` token 集作为后台和业务页唯一主题来源；浅色使用白/中性表面和蓝青强调，深色使用中性黑灰表面和蓝青强调。
- 多序列数据可使用绿、紫、琥珀等辅助色维持可区分性，但不再使用粉、玫瑰或梅色作为主题主序列；这些辅助色属于数据可视化，不改变业务主色。
- 合法粉色按用途保留：品牌字标渐变、厂商品牌色、管理员自定义 swatch、显式数据分类 variant、静态资源与历史 changelog。

# Open questions

- 无。用户已明确授权采用推荐方案连续完成并验收，不再等待中间确认。

# Verification expectations

- 主题 token 与 Canvas palette 的定向 Vitest 回归测试。
- `tsgo -b`、受影响文件 oxlint/oxfmt、Rsbuild 生产构建和 `git diff --check`。
- `rg` 检查生产代码中旧粉色主题值和旧主题说明的残留，逐项区分合法保留项。
- Playwright 在 1440px 与 390px、浅色与深色下检查至少一个后台/仪表盘页面和一个管理页面的 computed token、可见布局、横向溢出及 console/page error。
- 独立只读 Verifier 对照全部 acceptance 复核；通过后自动归档 Comet change。
