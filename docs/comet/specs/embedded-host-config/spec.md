# Capability: Embedded host configuration

## Intent

当 Infinite Canvas 以内嵌 iframe 运行在 New API 站点中时，用户通过「配置与用户偏好」弹窗自行配置 API Key，接口地址锁定为当前站点。模型列表的拉取、勾选和保存必须真正写入渠道；配置缺失时打开该弹窗，而不是鉴权失败横幅。

## Embedded configuration entry

In embedded mode (`isEmbedded()` is true):

- If image-model bootstrap fails, the catalog returns 401/403, or the default channel has no usable models, the application MUST open the existing「配置与用户偏好」dialog.
- The `HostBootstrapStatus` banner titled「图片模型配置需要检查」MUST NOT be used as the configuration entry in that situation.
- The dialog MUST let the user type an API Key or pick one of the current user's host tokens.
- The channel Base URL MUST be the current trusted site origin and MUST be read-only in the channel editor.

Independent (top-level) Canvas keeps its existing configuration entry points.

## Persist selected models

Given an embedded user opens the channel editor, fetches the model catalog, selects one or more models, and clicks Save:

- The parent channel list MUST show `N 个模型` where `N` equals the number of selected models.
- Reopening the editor MUST show the same selected models.
- Host bootstrap / `clearUnavailableImageConfig` MUST NOT wipe `channel.models` immediately after a successful user save of those models.

A save that reports success while the list still shows `0 个模型` is a failure of this capability.

## Security

- Embedded Base URL remains `lockedApiBaseUrl()` (current origin). A user-supplied Key MUST NOT be paired with a third-party provider URL in embedded mode.
- Real API Keys MUST NOT appear in logs, tests, changelog, or Git.

## Acceptance criteria

### Scenario: missing image config opens the settings dialog

- **Given** Canvas is embedded and image-model bootstrap fails or has no usable models
- **When** the user needs to configure generation
- **Then** the「配置与用户偏好」dialog is shown
- **And** the「图片模型配置需要检查」banner is not the configuration entry

### Scenario: site-locked base URL

- **Given** Canvas is embedded on `https://aierxin.cc` or `https://codezip.io`
- **When** the user opens the default channel editor
- **Then** the API base URL field shows that site origin and is disabled

### Scenario: save keeps selected models

- **Given** the user fetched a non-empty catalog, selected models, and saved successfully
- **When** the channel list renders
- **Then** it displays the selected count rather than `0 个模型`
