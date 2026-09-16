# Embedded navigation visibility

## Goal

When Infinite Canvas is hosted by New API in its same-origin iframe, the host owns the surrounding product navigation. Canvas must therefore omit the upstream Agent, documentation, and GitHub entry points while retaining the controls that are still useful inside the host.

## Functional requirements

### Requirement: Detect the host mode consistently

The visibility decisions MUST use the existing `isEmbedded()` helper from `src/lib/host-bridge.ts`. A top-level window is independent mode; a window whose parent is different is embedded mode.

### Requirement: Hide Agent entry points in embedded mode

In embedded mode the application MUST NOT render:

- the `AppTopNav` button labelled “打开 Agent” (or its “收起 Agent” tooltip);
- the `CanvasTopBar` Codex compact status control;
- the `CanvasTopBar` right-side Agent button;
- the Agent side panel, including a panel left mounted or opened by persisted state;
- automatic Agent connection or URL-triggered automatic panel opening.

The Agent stores, API clients, panel components, plugin host operations, and independent-mode behavior MUST remain available in source code.

#### Scenario: Embedded page has no Agent controls

- **Given** the Canvas document is loaded in an iframe
- **When** the root layout and a canvas project render
- **Then** no Agent opening control, status control, or Agent panel is present in the accessible/rendered UI

#### Scenario: Standalone page keeps Agent controls

- **Given** the Canvas document is the top-level window
- **When** the root layout and a canvas project render
- **Then** the existing Agent controls and panel behavior remain available

### Requirement: Hide documentation entry points in embedded mode

In embedded mode the application MUST NOT render the top-level documentation link or the canvas menu item that opens `DOCS_URL`. Independent mode MUST retain both links.

#### Scenario: Embedded canvas menu omits documentation

- **Given** the Canvas project is embedded
- **When** the canvas menu is opened
- **Then** the menu has no “文档” item

### Requirement: Hide the GitHub button in embedded mode

In embedded mode the top-level `GitHubLink` control MUST NOT be rendered. GitHub URLs used for version checks and prompt source metadata are data dependencies and MUST remain unchanged.

### Requirement: Preserve host-owned controls and version behavior

In embedded mode configuration and version-release controls MUST remain usable. Version checking MUST continue to read the vendored `web/canvas/VERSION` constant and use the existing upstream check URLs. The upgrade sets that file exactly to the pinned upstream `v0.19.0`; runtime or unrelated changes MUST NOT mutate it after the upgrade.

### Requirement: Preserve independent deployment

When not embedded, all existing navigation controls, Agent behavior, documentation links, GitHub link, and theme behavior MUST remain unchanged.

## Compatibility and accessibility

- Hidden controls MUST be conditionally omitted rather than visually hidden with CSS.
- Existing labels and accessible names for controls that remain visible MUST not change.
- No server API or stored canvas data format changes are permitted.

## Version baseline and upgrade

The vendored application MUST be upgraded from the current `v0.18.0` baseline to the upstream latest formal release `v0.19.0`. The upgrade MUST use the tagged source rather than changing only the version string, replay all local path/host-bridge/security patches, refresh dependency locks and license/vendor metadata, and pass an independent build and compatibility review. The built-in version value and release modal MUST report `v0.19.0` after the upgrade.

The upgrade MUST preserve existing Canvas data where the upstream format is compatible. If a stored record cannot be read, the application MUST surface a clear error and MUST NOT silently overwrite it.

## Integration baseline

Authenticated users visiting `/canvas` MUST receive the New API `CanvasStudio` host page. The host MUST serve the built Canvas application at `/canvas-app`, embed it same-origin, and preserve the existing authentication, theme, and endpoint-lock contract. Host configuration UX for API keys and selected models is specified by `embedded-host-config`.
