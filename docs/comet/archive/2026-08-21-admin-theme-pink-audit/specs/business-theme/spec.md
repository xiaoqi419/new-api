# 业务主题一致性规格

## User-visible behavior

### Requirement: 后台和业务页面使用完整业务主题
所有未声明首页或认证 scoped surface 的业务页面 MUST 使用完整的蓝/青/中性 `--business-*` palette。通用主题 token MUST 覆盖基础表面、交互状态、侧栏、图表、分类标签、概览强调、骨架屏和表格层级，不得回退到旧粉色 palette。

#### Scenario: Light business shell
- **WHEN** 用户以浅色模式打开仪表盘、管理页或普通业务页
- **THEN** 背景、卡片、弹层、按钮、选中态、hover、focus ring 和侧栏使用白色、中性灰、蓝色或青色业务 token
- **AND** 表格表头、禁用行和骨架屏使用中性业务层级
- **AND** 不显示旧玫瑰主色、浅粉表面或梅粉描边

#### Scenario: Dark business shell
- **WHEN** 用户以深色模式打开仪表盘、管理页或普通业务页
- **THEN** 背景、卡片、弹层和侧栏使用中性黑灰层级，交互强调使用蓝色或青色
- **AND** 表格、骨架屏、图表与分类标签在深色表面可辨识
- **AND** 不显示旧深梅背景、粉色强调或粉色焦点环

### Requirement: 数据可视化跟随业务主题
CSS 图表 token 和无法读取 CSS 变量的 Canvas/VChart palette MUST 与业务主题保持一致。主序列 MUST 使用蓝或青；多序列 MAY 使用绿、紫和琥珀等辅助色维持区分，但 MUST NOT 以粉、玫瑰或梅色作为主题序列。

#### Scenario: Multi-series dashboard chart
- **WHEN** 仪表盘绘制一个或多个模型序列
- **THEN** 第一个序列使用业务蓝色
- **AND** 后续序列使用可区分的非粉色辅助 palette
- **AND** 超过 palette 长度时继续按既有循环规则稳定分配颜色

#### Scenario: Model detail chart
- **WHEN** 模型详情页面绘制吞吐量或可用率图表
- **THEN** 吞吐量主序列使用与当前业务图表 token 一致的蓝色
- **AND** 点描边使用当前浅色或深色业务卡片颜色
- **AND** 成功率等业务状态仍使用对应 success、warning、destructive 语义

### Requirement: Scoped 和独立语义颜色保持隔离
首页、认证页、品牌资产和显式数据分类色 MUST 保持其独立视觉语义，不得因业务主题清理被全局重写。

#### Scenario: Marketing and authentication surfaces
- **WHEN** 用户打开首页或登录/注册页
- **THEN** 首页继续使用 `--home-*` palette
- **AND** 认证 surface 继续按现有 scoped 规则继承首页 token
- **AND** 业务主题变更不覆盖这些 scoped aliases

#### Scenario: Legitimate brand and classification colors
- **WHEN** 页面展示品牌字标、厂商/支付图标、管理员自定义颜色或显式分类 badge
- **THEN** 这些颜色保持原有品牌或分类语义
- **AND** 主题清理不得通过全局字符串替换删除或改写它们

## Implementation boundaries

- 业务 CSS token 由 `web/src/styles/theme.css` 集中定义和别名；`theme-presets.css` 只继续负责排版轴与 scoped home/auth surface。
- Canvas/VChart 不能读取 CSS 变量的色值可在对应模块维护显式浅色/深色值，但注释和测试必须说明其与业务 token 的对应关系。
- 不增加具名颜色预设或 `data-theme-color`，不恢复已删除的主题抽屉。
- 测试文件必须位于对应模块的 `__tests__/` 目录，并保护用户可见的 token/palette 契约。
