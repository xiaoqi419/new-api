# Capability: Embedded selected-model persistence

## Intent

Embedded Infinite Canvas MUST remember the models the user saved. Leaving `/canvas` and returning MUST still show those models. The user MUST NOT have to fetch the catalog again. API keys MUST NOT be written to localStorage.

## Behavior

### Persist

When embedded, `persistableConfig` stores channel model names, capabilities, scripts, and `verified: true`. It MUST store empty `apiKey` and empty `verifiedKey`.

### Hydrate

Embedded hydration MUST keep saved models and `verified: true`. It MUST NOT rewrite every model to `verified: false`. Keys remain empty until the host injects them.

### Scrub

`clearUnavailableImageConfig` keeps a verified image model when:

- there is no current key yet, or
- `verifiedKey` is empty, or
- `verifiedKey` equals the current key.

It drops a verified image model only when both keys are non-empty and differ.

### Bootstrap catalog

If the target channel already has saved models, bootstrap MUST NOT replace that list with the full host catalog. A catalog error MUST NOT clear the saved list.

## Acceptance criteria

### Scenario: return from another page

- **Given** the user saved two models on the default channel
- **When** they leave Infinite Canvas and open it again
- **Then** the channel still shows `2 个模型`
- **And** they are not forced to fetch the catalog again

### Scenario: keys stay out of storage

- **Given** an embedded config is persisted
- **Then** stored `apiKey` and `verifiedKey` values are empty
