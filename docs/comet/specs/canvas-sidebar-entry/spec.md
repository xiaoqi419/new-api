# Capability: Canvas sidebar entry

## Intent

认证用户需要从 New API 现代主站的侧边栏进入已集成的 Infinite Canvas。侧边栏应提供稳定、可翻译且与现有 Canvas 路由一致的入口，同时不改变 Canvas 页面或其他前端的行为。

## Root navigation contract

在 `useSidebarData()` 返回的根导航中，`navGroups` 必须包含以下相邻分组顺序：

1. `chat`
2. `media`
3. `general`

当当前用户是 Agent 时，`agent` 分组仍位于所有分组之前；其余分组顺序不变。`media` 分组结构必须为：

```text
id: media
title: t('AI Media')
items:
  - title: t('Infinite Canvas')
    url: /canvas
    icon: Palette
```

`media` 不需要 `activeUrls` 或 `configUrls`。它通过现有 `filterHiddenAuthenticatedEntries` 流程，不应被隐藏入口规则过滤掉。

## User-visible behavior

- 普通认证用户在侧边栏看到“AI Media / Infinite Canvas”（中文环境显示“AI 媒体 / 无限画布”）。
- Agent 认证用户同样看到该分组和链接，并保留 Agent Console。
- 点击链接导航到 `/canvas`；现有 TanStack Router 路由继续渲染 `CanvasStudio`，由现有组件加载同源 `/canvas-app`。
- 侧边栏中继续隐藏既有退役入口（例如 `/asset-library`、`/agent-apply`）；本 capability 不恢复这些入口。
- Classic 前端不因本 capability 新增 `/canvas` 链接或路由。

## Localization

实现必须调用 `t('AI Media')` 和 `t('Infinite Canvas')`，复用仓库中已有的 flat JSON 翻译键。不得把中文或英文显示文本硬编码在导航数据中。

## Compatibility and safety

- 仅修改现代主站导航数据、导航测试和 changelog；不修改 `/canvas` route module、CanvasStudio、`/canvas-app` 构建产物、后端或数据库。
- 继续依赖未映射 URL 默认可见的侧边栏配置行为，不增加新的配置迁移。
- 代码和测试必须保持 TypeScript 类型正确、lint/format 通过，且不泄露任何凭据。

## Acceptance criteria

### Scenario: standard authenticated user

- **Given** `useAuthStore` reports a non-Agent authenticated user
- **When** `useSidebarData()` is rendered
- **Then** `media` appears after `chat` and before `general`
- **And** its link contract is `Infinite Canvas` → `/canvas` with `Palette`

### Scenario: Agent authenticated user

- **Given** `useAuthStore` reports `is_agent = true`
- **When** `useSidebarData()` is rendered
- **Then** `agent` remains first, followed by `chat`, `media`, and `general`
- **And** the Canvas link remains present

### Scenario: existing Canvas integration

- **Given** the user activates the Canvas link
- **When** the browser navigates to `/canvas`
- **Then** the existing CanvasStudio route and same-origin `/canvas-app` integration continue to load without code changes

### Scenario: retired entry visibility

- **Given** the sidebar is rendered for an Agent user
- **Then** `/asset-library`, `/agent-apply`, and the retired root media assertion remain absent

### Scenario: validation

- **Then** the targeted sidebar tests, typecheck, lint, build, format check, and `git diff --check` pass.
