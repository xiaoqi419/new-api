# Official rc.43 and follow-up integration

Fork baseline: `f7aadfde431e16b943e6106a6d189c82bcb60f7a` (`origin/main`).
Previous official baseline: `6370b29424168039e94d40d610191e7d2e65dbf4` (`v1.0.0-rc.42`).
Official target: `42e694eb60fe3191795c00d416571ced716eb9c4`.
Scope: the 11 commits in rc.43 and 15 subsequent commits selected by the user, retaining their Git ancestry.

## Integration contracts

- Preserve bigint wallet balances, bounded charges, recharge bounds, gifts, rebates, agent payments, lottery credits and quota reminder delivery state.
- Preserve named automatic groups, route allowlists, per-user concurrency, fail-open request limiting during Redis outages, loopback-only default trusted proxies, and mainland website access policy.
- Preserve default/classic themes, Canvas, existing pricing configuration and the explicit silent default for Seedance.
- Integrate structured console messages while accepting legacy string log writers; keep content parts, token names, cache telemetry and role-based metadata filtering.
- Keep project identity, attribution, licenses, module paths and existing release requirements.

## Operational behavior

`DEFAULT_LANGUAGE` accepts `en`, `zh-CN` and `zh-TW`. This fork defaults to `zh-CN` when unset. User preferences and request language headers continue to take precedence for backend messages. Console APIs expose English fallback text with translation keys and parameters; seven frontend languages include those keys.

The channel option `tls_insecure_skip_verify` applies to the selected channel's outbound HTTP and WebSocket connections. It defaults off. TLS policies form part of the HTTP client cache key and do not replace the existing HTTP/1 and connection-shard options. Plugin `utils.fetch` retains declared-host checks, manual redirects and bounded execution/body limits.

Playground storage is scoped to the signed-in account. Legacy keys carry no owner and are discarded rather than assigned to the next account. Pending saves and unmount flushes retain the account that created the session; switching accounts remounts its state.

Automatic video duration reserves the model's longest duration and uses completion usage for expression settlement. Wan legacy pricing also settles automatic durations against the frozen per-second price and existing multipliers; fixed-duration and fixed-per-request tasks keep their established behavior. `TASK_PRICE_PATCH` suppresses the automatic-settlement marker at submission for explicitly fixed-per-request models. Completion uses the persisted marker so a later configuration change cannot reinterpret an existing task. Missing or invalid completion facts retain the reservation. Seedance pricing and its silent-output default remain intact.

No new database schema is introduced by this integration. The existing portable GORM and bigint migrations remain. Local browser QA uses a separate SQLite database and synthetic accounts, without production data or upstream model calls.

## Verification

- Root checks: `GOWORK=off go vet -p 2 ./...`, `go build -p 2 ./...` and `go test -p 2 ./...`.
- Independent modules: vet, build and tests inside both `relaykit/` and `tokenkit/`, with `GOWORK=off`.
- Frontend: typecheck, changed-source oxlint, i18n sync, full Vitest, and default/classic/Canvas production builds.
- Browser: embedded production assets on `http://127.0.0.1:19483`; desktop 1440×1050 and mobile 390×844. Verify TLS defaults/toggle, API-key time input retaining seconds, meaningful screens, no page exceptions and no horizontal overflow.
- Regression coverage includes structured and legacy log writers, channel TLS isolation, callback signature redaction, Playground delayed writes across account changes, Responses retry input, mixed reasoning/text stream chunks and Gemini JSON Schema preservation.

Evidence is stored outside source at `D:/CodexHome/artifacts/rc43-verification/`. Root vet, build and full tests passed; both independent Go modules passed their own vet/build/test commands. The frontend full run passed 285 files / 2,665 tests. Typecheck, changed-source oxlint (zero warnings/errors), i18n sync (8,924 keys in each of seven languages; no missing/extras), all three frontend production builds and local browser interactions passed. The browser screenshots cover TLS settings and second-precision time inputs on both viewport sizes.

Plugin lint completed with zero errors and ten non-blocking warnings concerning caught-error causes and a shadowed variable. The new xAI resolution probe's unused catch binding was removed; the full plugin regression package passed afterwards.

Independent review found the legacy automatic-duration overcharge and the fixed-per-request override edge; both have deterministic submit/settlement regressions. Completion tests cover fractional and zero usage, missing/invalid facts, configuration changes after submission, complete wallet/token/user/channel accounting, failures/refunds, funding errors and saturation audit. The final reviewer confirmed those issues were closed. No MySQL/PostgreSQL instance rehearsal or real upstream generation was run in this update; database evidence is limited to retained portable code and local SQLite regression/QA.

The user explicitly requested a local update report before any push or production hot update. This change therefore remains in the existing local feature worktree: no push, GitHub PR, remote merge, production image build or deployment is performed. The future release still requires PR/CI/merge and an immutable build from the exact merged `origin/main` commit.

## Commit inventory

| Commit | Official change | Integration |
| --- | --- | --- |
| `7aa3531ef` | fix(task-plugin): set multipart content type for upstream requests (#7655) | Integrated; fork contracts retained. |
| `e0483122c` | fix(relayconvert): drop trailing assistant text from Responses input on Claude and Gemini | Integrated; fork contracts retained. |
| `128089fa7` | feat(i18n): translate web console messages in the frontend and AI-client errors in the backend (#7712) | Integrated; fork contracts retained. |
| `1d4328e97` | docs(relaykit): rewrite README for the current conversion API | Integrated; fork contracts retained. |
| `b66674ac2` | feat(task-plugin): let Seedance and wan3.0 pick the video duration with -1 | Integrated; fork contracts retained. |
| `29509776e` | feat(jsplugin): let driver hooks read upstream data with utils.fetch | Integrated; fork contracts retained. |
| `66c3e1428` | fix(hailuo): download MiniMax v1 videos through the file retrieve link | Integrated; fork contracts retained. |
| `3f0224478` | feat(web): show the request domains a plugin declares when uploading it | Integrated; fork contracts retained. |
| `ba3b2c015` | refactor(jsplugin): stop requiring json-clone@1 and submit-sse-delta@1 | Integrated; fork contracts retained. |
| `c8d234baa` | fix(xai): bill video edits and extensions by their output resolution | Integrated; fork contracts retained. |
| `c6741c36a` | feat(channel): add a per-channel switch to skip upstream TLS verification | Integrated; fork contracts retained. |
| `1ca79d57e` | fix(pricing): show recent status samples without gaps | Integrated; fork contracts retained. |
| `0f38a14a5` | fix(web): restore browser sans-serif for Auto font | Integrated; fork contracts retained. |
| `036ba376d` | fix(relaykit): match Claude effort and Gemini 2.5 budgets to each model | Integrated; fork contracts retained. |
| `13c8e90b8` | fix(relayconvert): send Responses image URLs to Chat upstreams as objects | Integrated; fork contracts retained. |
| `5ac756284` | fix(relayconvert): keep answer text that shares a stream chunk with reasoning | Integrated; fork contracts retained. |
| `977450a3e` | fix(rate-limit): explain model rate-limit rejections without Redis | Integrated; fork contracts retained. |
| `b892a6b2e` | fix(web): reload once when a page's code fails to load | Integrated; fork contracts retained. |
| `1fb6d07fe` | perf(web): stop loading the whole Simple Icons pack on four pages | Integrated; fork contracts retained. |
| `06dd76a9d` | fix(playground): keep each account's Playground data separate | Integrated; fork contracts retained. |
| `96275d224` | fix(web): show date pickers and relative times in the interface language | Integrated; fork contracts retained. |
| `93ea55f3c` | feat(web): pick dates and times down to the second | Integrated; fork contracts retained. |
| `4b13d9388` | fix(relayconvert): drop non-string enum values when converting OpenAI tool schemas (#7729) | Integrated; fork contracts retained. |
| `801456a06` | fix(relay): send a close frame when a Responses WebSocket session ends | Integrated; fork contracts retained. |
| `c10780e05` | fix(relayconvert): keep JSON Schema constraints in tools and structured output sent to Gemini | Integrated; fork contracts retained. |
| `42e694eb6` | fix(web): map Meta Muse Spark models to Meta icon (#7734) | Integrated; fork contracts retained. |
