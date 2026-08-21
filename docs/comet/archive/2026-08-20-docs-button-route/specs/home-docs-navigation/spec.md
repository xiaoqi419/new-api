# Home documentation navigation

## Scenario: Hero documentation button uses the in-app docs route

- **WHEN** 访客或已登录用户在首页点击 Hero 的“文档”按钮
- **THEN** 应用 MUST 通过 TanStack Router 在当前标签页导航到 `/docs`
- **AND** 导航 MUST 保持单页应用行为。

## Scenario: External documentation configuration is present

- **WHEN** 后台 `docs_link` 配置为外部 URL
- **THEN** 首页 Hero 的“文档”按钮 MUST 仍导航到站内 `/docs`
- **AND** 该按钮 MUST NOT 打开外部地址或新标签页。

## Scenario: Other documentation links remain scoped

- **WHEN** 页面包含顶部站内接入文档入口或明确的项目介绍、安装指南、第三方参考链接
- **THEN** 顶部站内入口 MUST 继续导航到 `/docs`
- **AND** 其它具体外部参考链接 MUST 保持原有目标和外部链接语义。

## Requirements

- 首页 Hero 文档按钮 MUST 使用类型安全的 TanStack Router `Link`。
- 首页 Hero 文档按钮 MUST NOT 依赖 `status.docs_link`。
- 首页 Hero 文档按钮 MUST NOT 使用 `window.location`、裸内部 `href`、`target="_blank"` 或其它强制整页跳转。
- 该导航行为 MUST 有真实 Router 点击回归和浏览器验收。
- `/docs` 页面内容、权限和后端契约 MUST 保持不变。
