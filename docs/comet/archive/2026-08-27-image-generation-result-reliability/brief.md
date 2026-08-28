# Outcome

Make ordinary OpenAI-compatible image calls such as `gpt-image-2` observable in the existing Task Logs page. When the gateway receives a successful image result, it preserves the original image and thumbnail under stable first-party URLs before creating a terminal task record, so a temporary provider URL or a downstream response interruption does not remove the archived result.

# Scope

- Cover synchronous `/v1/images/generations` and `/v1/images/edits` requests handled by the ordinary image relay, independent of the selected provider or channel name.
- Preserve each received URL or base64 image as an original asset plus a thumbnail through the shared drawing-image storage path.
- Add exactly one terminal record to the existing `tasks` table for the final outcome of an image request, after channel retries have resolved.
- Populate the task with a stable public task ID, user, group, channel, model, prompt, action, submit/finish time, duration inputs, status, progress, billed quota, final error when applicable, and stable result metadata.
- Reuse the existing `/api/task` and `/api/task/self` authorization and pagination behavior. Do not merge paginated datasets in the browser.
- Extend the existing Task Logs table and card views with image-specific platform/type labels, thumbnail preview, multi-image navigation, and original-image display.
- Keep the existing usage log and drawing log for compatibility; a successful synchronous image call is intentionally visible in usage/drawing logs and Task Logs.
- Remove Alibaba-specific polling changes from this change. Provider polling hardening, if desired later, belongs to a separate change.

## Source coverage

| Source unit | Read status | Retained meaning | Spec mapping | Acceptance mapping | Coverage |
| --- | --- | --- | --- | --- | --- |
| User correction: `gpt-image-2` is called like a normal API and is not an Alibaba-specific task | complete | Scope the implementation to the ordinary synchronous image relay and remove Alibaba-specific goals | Behavior / Request classification | A1 | covered |
| User requirement: image calls currently only have usage logs and must also create a Task Log record | complete | Materialize one terminal image task in the existing `tasks` data source | Behavior / Task materialization | A2, A3, A4 | covered |
| User requirement: Task Logs must retain and show the generated original image despite temporary provider-link or downstream response fluctuations | complete | Persist received results before task materialization and expose originals in Task Logs | Behavior / Durable image results; Task Logs UI | A5, A6, A7 | covered |
| Attachment 1: `gpt-image-2` is a per-request image model | complete | Confirms the model and billing context; no pricing change requested | Constraints / Billing compatibility | A4 | covered |
| Attachment 2: existing Task Logs page with time, task ID, duration, status, progress, and details columns | complete | Reuse this page and populate its current data source rather than creating a new page | Behavior / Task Logs UI | A3, A6 | covered |
| Attachment 3: existing Usage Logs and Task Logs navigation entries | complete | Keep the existing navigation and add records/preview behavior behind Task Logs | Behavior / Compatibility | A2, A6 | covered |

# Non-goals

- No Alibaba DashScope polling, provider task-ID polling, or provider-specific routing changes.
- No mandatory asynchronous public API, `202` response, or client-side polling contract for `/v1/images/*`.
- No pricing, model ratio, channel selection, or retry-policy changes.
- No browser-side merge of drawing logs into task logs.
- No removal or migration of existing usage logs, drawing logs, Midjourney logs, Suno tasks, or video tasks.
- No production deployment, database replacement, or production data changes in this local-development change.
- No guarantee of reconstructing an image when the provider never returned an image URL/base64 payload to the gateway and exposes no later queryable task ID.

# Acceptance examples

- A1: A successful `gpt-image-2` request through the normal OpenAI-compatible image endpoint is handled without entering Alibaba-specific polling and retains the current synchronous API response envelope.
- A2: One successful image request produces exactly one terminal record visible through the existing Task Logs API/page, even when internal channel retry or fallback attempts occurred.
- A3: The image task shows a stable task ID, model, type, status, 100% progress, submit time, finish time, duration, and the existing admin/user visibility boundaries.
- A4: The image task uses the final billed quota and final selected channel; existing usage and drawing logs remain intact and are not replaced.
- A5: Every image result received as a provider URL or base64 payload is saved as an original plus thumbnail before the success task exposes stable result URLs. The normal image API response body is not rewritten merely to support logging.
- A6: Task Logs shows image thumbnails and allows all images from a multi-image result to be opened using the original first-party asset, while Suno audio and video previews continue to work unchanged.
- A7: If the provider result reached the gateway but writing the downstream response is interrupted, the saved original and successful task record remain available. If no provider result reached the gateway, a final failure task may be recorded but no nonexistent original is claimed.
- A8: Failed final image outcomes are represented by one terminal failure task with an actionable error and no invalid image preview; terminal image tasks are never picked up by the asynchronous task poller.
- A9: Automated tests cover successful and failed materialization, single-record behavior across retries/repeated hooks, original/thumbnail retrieval, multiple image results, user/admin visibility, and frontend image/audio/video rendering boundaries.

# Constraints and invariants

- Preserve SQLite, MySQL, and PostgreSQL compatibility; reuse the existing `tasks` schema and GORM APIs without a database-specific migration.
- Use `platform=image` and dedicated image-generation/image-edit actions. Do not reuse the video `generate` action.
- Store image tasks only as terminal `SUCCESS` or `FAILURE` records, so the existing async task scheduler cannot mistake them for provider jobs requiring polling.
- Preserve the existing `/api/task/self` user isolation and admin-only channel/username visibility.
- Use repository JSON wrappers for business JSON marshal/unmarshal operations.
- Provider URLs are untrusted. Downloads require SSRF protection, response-size limits, MIME validation, finite retries, and a hard timeout.
- Asset capture must use an independent bounded context so a client disconnect during response delivery does not immediately cancel an already-received provider result.
- Public asset keys must remain unguessable capabilities; do not derive public keys directly from known image bytes or response JSON.
- The normal provider response body remains protocol-compatible and is not replaced with a task-style envelope or rewritten to thumbnail URLs.
- Multiple image results are retained and viewable; Task Logs must not silently discard all but the first image.
- Stored assets follow the existing `DRAWING_IMAGE_PATH` and `DRAWING_IMAGE_TTL_DAYS` policy. Production multi-instance deployment requires shared persistent storage, but deployment is outside this change.
- All new frontend text uses i18n and the user-facing change is recorded in the changelog with a release-compatible version.

# Decisions

- Reuse the existing `tasks` table and Task Logs page rather than introducing another log page or combining paginated APIs in the frontend.
- Materialize terminal image tasks from the final image consume/drawing-log context, where the final quota, channel, request ID, model, prompt, duration, and persisted image keys are available.
- Keep usage logs and drawing logs as existing compatibility records; the additional Task record is intentional.
- Use stable first-party original and thumbnail URLs only in task metadata and Task Logs. Preserve the ordinary OpenAI-compatible response body.
- Treat an already-received provider result independently from downstream client delivery: archive it with a bounded context and continue task materialization even if response writing is interrupted.
- Do not claim recovery when the gateway never received a result and the provider supplies no queryable task ID.

# Open questions

- None. The user confirmed the corrected local-only scope on 2026-08-28.

# Verification expectations

- Add focused Go regression tests for image asset capture, terminal image-task materialization, idempotent single-record behavior, and user/admin task serialization.
- Run affected Go tests and vet, plus `git diff --check`; run broader `go test ./...` when the checkout contains required embedded frontend artifacts.
- Add focused frontend behavior tests for image-task table/card previews and audio/video non-regression.
- Run `bun run typecheck`, lint on affected frontend files, relevant Vitest tests, and `bun run build`.
- Use a new independent read-only Verifier through Comet Native and check every acceptance item before asking for archive or Git actions.
