# Official rc.47 and subsequent fixes integration

## Scope and acceptance

- Production fork baseline: `4df660dc2af06e18d8d8388a78afdf47ca4d22df`, freshly fetched from `origin/main`.
- Previously integrated upstream: `7fb6e57a5ff671582131c74e00bdfaa867d4e985`.
- Official rc.47: `e835b1bfc43b565d625537830dbfb19328925134`.
- Frozen upstream target: `01da3a55f838cfa21010b05c7451c0a42cf5a173` (17 new commits: 10 through rc.47 and 7 subsequent commits).
- Sole implementation workspace: `D:/CodexHome/worktrees/upstream-rc47/new-api`, branch `codex/upstream-rc47`.

The user authorized local integration and verification only. No push, PR, merge
to main, image publication, production connection or deployment is authorized.
The Comet resume probe returned `none` with no active Native change.

Acceptance requires preserving upstream ancestry and all 17 selected changes;
retaining fork wallets, billing bounds, payment/reward flows, subscriptions,
notifications, routing/fallback, default Chinese, classic theme and Canvas;
and passing relevant root/independent-module builds/tests, frontend typecheck,
tests, lint, localization consistency and all three frontend builds.

## Compatibility decisions

- Keep the Docker build platform override while updating the pinned Bun builder
  to 1.4.4. Preserve the fork README and all project/author attributions.
- Keep the API key editor's existing Dialog and tabs. Apply explicit nullable
  expiration defaults, closed-form reset and loading/submission interaction
  guards within that UI instead of replacing it with the upstream Sheet. Allow
  the tab bar to grow when labels wrap on mobile so the next field is not covered.
- Combine dynamic pricing classification with existing modality filtering and
  group-ratio labels. Task-usage pricing retains its distinct category.
- The channel affinity test fixture already isolates keys using process ID,
  test name and an atomic sequence, and cleans cache entries. Retain this
  stronger existing equivalent of the upstream test isolation fix.
- Use the baked application version for the newest changelog entry so a later
  authorized immutable release can supply its actual image tag.
- Fill the new model default object with the fork's context/output limits,
  dates, parameter count, modalities and capabilities. New API key fixtures
  include the fork's group-switch and concurrency fields.
- Clean install revealed nine existing test files importing undeclared
  `happy-dom`. Declare development dependency 20.11.1, matching the previous
  workspace's installed version; retain frozen-lockfile reproducibility.

## Review repairs

Independent read-only review found two missing connections for upstream's new
`cache_creation_input_tokens` field. `HasOpenAIUsageTokens` must recognize a
cache-write-only increment in both Chat and Responses details, or the billing
snapshot discards the increment. Compaction normalization must also retain the
field; clone all input details rather than maintaining a partial field list.

Both regressions were reproduced before repair and pass after repair:
`TestOpenAIBillingUsagePreservesCacheCreationOnlyDelta` exercises snapshot,
merge and canonicalization for both dialects, preserving totals without adding
cache writes twice. `TestOaiResponsesCompactionHandlerKeepsCacheCreationInputTokens`
exercises the real compaction handler. The independent reviewer rechecked both
repairs and the API key form guard and reported no remaining blockers.

## Verification

Evidence is stored outside the checkout at
`D:/CodexHome/artifacts/rc47-verification/`.

- Frontend clean frozen-lockfile install and typecheck passed with local Bun
  1.4.4 (1,808 files across two projects). No global runtime settings changed.
- Full frontend Vitest suite: 302 files and 2,894 tests passed. jsdom reports
  existing unimplemented scrollTo/canvas warnings; no test failures remain.
- Changed-file oxlint: 19 files, 187 rules, no diagnostics. Changed-file oxfmt
  check passed. All seven locales contain 9,042 translation keys, with no
  missing or extra keys; this update adds no translation keys.
- Default, classic and Canvas production asset builds passed. Canvas retains
  existing large-chunk and mixed static/dynamic import warnings.
- Browser QA used Playwright/Edge because the Browser plugin is not available.
  A loopback-only static preview served the actual production assets; all API
  responses were synthetic and external requests were blocked. The preview
  closed after verification. Desktop 1440x1050 and mobile 390x844 passed key
  expiry switching and saved the non-expiring record as `expired_time: -1`,
  with no page errors or horizontal overflow. Blocked external resources
  account for the recorded network console messages.
- Desktop browser QA also switched from a model with a vendor to one without,
  saved `vendor_id: 0`, and retained all fork metadata. Public pricing correctly
  filtered fixed request and image-count expressions while excluding the
  token-priced model. Screenshots and synthetic saved payloads are retained.
- Root module passed final `GOWORK=off go vet -p 2 ./...`, build and the full
  test suite after the billing repairs. `relaykit/` independently passed final
  vet, build and all tests with `GOWORK=off`; `tokenkit/` independently passed
  the same checks and was not modified.
- After the mobile tab-height correction, frontend typecheck, changed-file
  lint/format and the production asset build were repeated. The key-editor
  interaction suite passed all seven tests. Browser QA also checks that the
  last tab's bottom edge is above the next field label on both viewports.

No external database matrix, actual email/payment delivery or paid inference
was exercised. No production environment was connected to or modified. No
GitHub CI, remote push, PR, main merge, image publish or deployment was run.

## Selected upstream commit inventory

All entries are integrated through the merge parent. The channel affinity
fixture is deliberately retained as an already-equivalent, stronger fork test.

| Commit | Official change |
| --- | --- |
| `30748c655` | fix(logging): 隐藏访问日志中的查询凭据 (#7972) |
| `33c61a242` | fix: prevent stale values when switching edit drawer records (#7989) |
| `a40446041` | chore(web): upgrade Bun to 1.4.4 and use bun check |
| `0034b2491` | fix(task): wait up to 72 hours before timing out tasks |
| `1dafb19a4` | fix(gemini): preserve top-level imageConfig in chat conversion |
| `b6b85cae5` | chore(deps): bump react-resizable-panels from 4.12.2 to 4.14.6 in /web (#7982) |
| `4105bd089` | chore(deps): bump input-otp from 1.4.2 to 1.5.0 in /web (#7980) |
| `0b667ca47` | chore(deps): bump i18next from 26.3.6 to 26.5.3 in /web (#7979) |
| `5c8032d70` | chore(deps): bump react-i18next from 17.0.10 to 17.1.0 in /web (#7981) |
| `e835b1bfc` | chore(deps): bump axios from 1.18.1 to 1.20.0 in /web (#7835) |
| `9823ebc7e` | fix(billing): bill cache_creation_input_tokens reported in prompt_tokens_details (#7909) |
| `bc795cc11` | fix:修复stop为非字符串和[]string的协议转换问题 (#7935) |
| `f1569d1ea` | fix(pricing): classify dynamic per-request billing correctly (#8010) |
| `4d962e464` | fix(relaykit): preserve tool argument numbers in Claude responses (#7996) |
| `0165fef98` | fix(relaykit): preserve Gemini text alongside tool calls (#7998) |
| `34003e9c2` | test: stabilize channel affinity cache keys (#8009) |
| `01da3a55f` | perf(relay): stop recompiling param override regexes on every request (#8061) |
