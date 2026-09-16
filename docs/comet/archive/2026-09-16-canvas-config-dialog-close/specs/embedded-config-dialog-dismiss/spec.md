# Capability: Embedded config dialog dismiss

## Intent

When an embedded Infinite Canvas user has successfully saved at least one channel with an API key and selected models, the「配置与用户偏好」dialog MUST close and stay closed. Host bootstrap catalog errors MUST NOT reopen it.

## Behavior

### Configured channel

If any channel has a non-empty `apiKey` and `models.length > 0`:

- Clicking「完成」or the dialog close control MUST set the dialog closed.
- `HostBootstrapStatus` MUST NOT call `openConfigDialog` solely because `modelStatus === "error"` or host token bootstrap failed.

### Unconfigured channel

If no channel has both a key and at least one model, the dialog MAY open automatically once so the user can configure a key.

### Manual open

The existing configuration button MUST still open the dialog at any time.

## Acceptance criteria

### Scenario: dismiss after successful save

- **Given** the default channel shows a non-zero model count after save
- **When** the user clicks「完成」or close
- **Then** the dialog remains closed

### Scenario: bootstrap error does not trap the dialog

- **Given** a channel already has a key and models
- **And** host bootstrap `modelStatus` is `error`
- **When** the dialog is closed
- **Then** it is not reopened automatically
