# Synchronous Image Task History and Durable Results

## Behavior

### Request classification

OpenAI-compatible `/v1/images/generations` and `/v1/images/edits` requests are synchronous image requests regardless of the selected provider, channel name, or model name. Models such as `gpt-image-2` use the ordinary image relay. This capability does not invoke Alibaba-specific task polling and does not change the public request into an asynchronous task protocol.

The client continues to receive the existing successful OpenAI-compatible image response envelope. Logging and result preservation must not replace that envelope, return a mandatory `202`, or rewrite image fields to thumbnail URLs.

### Durable image results

When a successful provider response contains image URLs or base64 image data, the gateway captures every supported result before publishing a successful task record. Each result produces:

- an unmodified original asset;
- a bounded thumbnail asset;
- an unguessable internal key;
- a stable first-party thumbnail URL; and
- a stable first-party original URL.

Provider URL downloads use SSRF-protected networking, the selected channel's configured outbound proxy where applicable, MIME and magic-byte validation, a response-size limit, finite retries, and a hard timeout. Result capture uses an independent bounded context after the provider result has been received, so downstream client cancellation does not automatically discard the archive operation.

Capture is auxiliary to the ordinary response contract. A capture failure is logged and reflected in task result metadata without rewriting or corrupting the provider response. The system never reports a durable original URL unless the original file exists.

Stored originals and thumbnails use the existing drawing-image path and TTL policy. Thumbnail and original endpoints are distinct. An expired or missing asset returns a normal not-found result, and the frontend renders an unavailable state rather than a broken successful preview.

### Task materialization

Each final synchronous image request outcome creates at most one terminal record in the existing `tasks` table. Channel retries and channel fallback attempts belong to the same task record.

Successful image tasks contain:

- a stable public task ID derived from the gateway request identity without exposing provider credentials or temporary URLs;
- `platform=image`;
- an image-generation or image-edit action distinct from video actions;
- `SUCCESS` status and `100%` progress;
- submit/start/finish timestamps and duration;
- final user, group, selected channel, model, prompt, and billed quota;
- an ordered array of persisted image result objects containing the key, thumbnail URL, and original URL; and
- the first original URL in the legacy single-result field for compatible consumers.

Final failed image requests create a single `FAILURE` task containing the stable task ID, available request/model/channel metadata, timestamps, final error, and no invalid result URL. Image task records are terminal at insertion/update time and are never eligible for asynchronous provider polling.

Task materialization is idempotent for the gateway request identity. Repeated internal materialization of the same request updates or preserves one record rather than creating duplicates.

### Task Logs API and UI

The existing `/api/task/self` and `/api/task` endpoints remain the only Task Logs data sources. User isolation, admin authorization, pagination, ordering, filtering, username handling, and channel visibility retain their existing behavior.

Image task DTOs expose safe result metadata but never expose `Task.PrivateData` credentials or upstream secrets. The frontend recognizes `platform=image` and the dedicated image actions without classifying them as video.

For successful image tasks, desktop and card views show a thumbnail/result action. Opening the preview loads the original first-party asset. Multi-image tasks allow every result to be viewed in order. Missing or expired originals show an explicit unavailable state. Failed image tasks show the final error and no image action.

Existing Suno audio and video task previews, status badges, duration display, progress behavior, and details dialog remain compatible.

### Compatibility and observability

Usage logs and drawing logs continue to be written as before. The Task record is an additional user-facing history entry, not a replacement for accounting or drawing-log records. Billing values in a successful image task match the final consume log.

If the provider result reached the gateway and was archived but downstream response delivery failed, the task and original remain available. If the provider never returned a result and exposes no queryable task ID, the gateway can record the final failure but cannot reconstruct an image it never received.

## Acceptance IDs

- A1: Normal OpenAI-compatible image requests remain synchronous and do not use Alibaba-specific polling.
- A2: One final image request creates at most one terminal Task Log record across retries and fallbacks.
- A3: Successful image tasks contain the stable ID, image platform/action, model, timestamps, duration, status, progress, final channel, group, user, and quota.
- A4: Final failed image requests create one terminal failure task with the actionable final error and no invalid result.
- A5: Every received URL/base64 result is bounded, validated, and persisted as original plus thumbnail before stable task result metadata is published.
- A6: The ordinary image API response envelope and image fields remain compatible and are not rewritten for task logging.
- A7: Task Logs exposes all successful images through thumbnail and original URLs and handles missing/expired assets without a broken preview.
- A8: Task Logs user/admin authorization, pagination, and sensitive-data boundaries remain unchanged.
- A9: Existing audio and video task rendering remains compatible after image task support is added.
- A10: Usage/drawing logs continue unchanged, and successful task quota/channel metadata matches the final billed request outcome.
- A11: An already-received result survives downstream response interruption; an unreceived result is not falsely claimed as recoverable.

## Error and safety requirements

- Provider-result capture must not permit arbitrary internal-network access or unbounded downloads.
- Public image keys must be unguessable and must not expose provider URLs, credentials, or predictable hashes of known content.
- Task data returned to ordinary users contains only safe stable URLs and request metadata; admin-only and private task data remain protected by existing DTO rules.
- Capture errors, persistence errors, and task materialization errors are logged with the gateway request identity. A task must never point to a file that was not successfully committed.
- Database operations use GORM-compatible behavior shared by SQLite, MySQL, and PostgreSQL.
- Terminal image tasks must not enter the asynchronous unfinished-task scheduler.

## Verification requirements

- Backend tests cover success, final failure, multiple images, URL and base64 capture, bounded/safe fetching, original/thumbnail endpoints, idempotent materialization, final quota/channel mapping, and terminal-task exclusion from polling.
- Controller/model tests verify user isolation and admin-safe serialization for image task metadata.
- Frontend tests cover image task table/card actions, original-image preview, multi-image navigation, missing assets, failed tasks, and audio/video non-regression.
- A broader backend test, vet, frontend typecheck/lint/test/build, and independent read-only acceptance verification are required before completion, subject to explicitly reported checkout/environment blockers.
