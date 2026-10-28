# Infinite Canvas v0.20.0 integration

## Scope and acceptance

- Fork baseline: `origin/main` at `12fbf021ab05a61e5c41a20f1ae2a8e4393f5a49`.
- Existing Canvas: v0.19.0, `e856c878e0a34651bb828e28f0af20d71016a7d4`.
- Frozen target: official v0.20.0, `3a6b64b602ad062b29fac66902ed18a7ef5fd9dc`.
- Workspace: `D:/CodexHome/worktrees/upstream-rc47/new-api`, reused clean at
  origin/main; sole implementation branch `codex/canvas-v020`.
- User scope: local implementation and verification, report before push or
  deployment. Neither production site is contacted or modified by this task.
- Comet resume probe returned none; no active Native change was resumed.

Integrate all upstream v0.19.0-to-v0.20.0 application changes, preserving the
host endpoint lock, theme and token bridge, account/credential fencing, saved
model selection, configuration races, media storage and old-project migration.
Verify native/script image options, unavailable model behavior, preference
hydration/import, Canvas tests/types/build, pristine manifest, locales and a
real local browser flow using synthetic data without paid inference.

## Integration decisions

Use a three-way merge against both pristine tags. Retain Bun and the current
dependency lock; upstream added pnpm workspace/lock files without changing
application dependencies. Exclude upstream root marketing/docs and deployment
files according to VENDOR.md. VERSION, CHANGELOG and the MIT license come from
the official tag. The two post-tag main commits change only documentation or
marketing assets and are outside the frozen application target.

The model resolver now preserves missing explicit selections so readiness can
block the request; embedded Canvas still never falls back to vendored demo
models. The new regenerate/auto-focus preferences are normalized in both the
fork's persisted config and file import paths. Existing model/config dialog
save and late-request guards are retained. Image quality stays independent
of size, with Gemini resolution forwarded for aliases and custom scripts
receiving their own resolution parameter.

The Gemini image script template previously derived unsupported ratios such as
`85:128` from rounded presets (`1360x2048`). The new template now selects the
nearest supported aspect ratio, matching the native request. Actual script
execution tests reproduce the failure before repair and pass afterwards for
both 2K 2:3 and 4K 4:3 presets. Existing saved custom scripts are not rewritten.

Changed-file lint removes unused private conversion helpers and stale imports,
and rewrites the existing side-panel selection ternary as equivalent branches.
These cleanups do not change protocol dispatch or generation behavior.

The pristine audit exposed two pre-existing unlisted local dialog patches;
they are now registered. Upstream's image-thumbnail test already lived under
src/lib/__tests__. New focus/model-selection tests are likewise relocated to
the existing Vitest tree with import/runner adaptation. The manifest records
these mappings rather than ignoring arbitrary missing tests. Existing fork
locale keys and values are preserved, and upstream additions reach both
Canvas languages. Main web locales remain unchanged.

## Verification

Evidence is kept outside source at `D:/CodexHome/artifacts/canvas-v020/`.

- Canvas typecheck passed. Full suite: 21 test files, 166 tests passed, including
  migrated upstream focus/model tests, host/account/credential boundaries,
  stored-data migration and new image/preference contracts.
- Native and script image contracts cover quality independent of size, multi
  reference edits, Gemini aliases and script resolution. Preference tests
  cover import plus reload and malformed-value defaults. The initial script
  test incorrectly used 4096x4096, beyond the existing 3840px edge bound; it
  now uses the supported 4K preset 2880x2880 without weakening validation.
- Main frontend typecheck passed (1,808 files / two projects). Host Canvas
  integration tests: two files / 15 tests passed. Main and Canvas production
  asset builds passed. `GOWORK=off go build -p 2 ./...` and
  `GOWORK=off go test -p 2 ./router` both passed (exit code 0), recorded in
  `go-verification.json`. Backend source and independent modules are unchanged.
- Pristine manifest audit and changed-line format check passed for 74 files.
  Changed Canvas source/test/tool files passed 95 correctness lint rules with
  zero diagnostics (25 files). Main changelog lint and format passed.
- Canvas English and Chinese each contain 1,640 keys; all 1,631 official keys
  are present and no previous fork key was dropped. Existing missing timeout
  and preview-storage labels were restored. The seven main locales remain
  unchanged, with 9,042 matching keys each.
- Browser QA uses the actual production assets in a loopback-only preview,
  Playwright/Edge and a synthetic same-origin parent. Desktop 1440x1050 and
  mobile 390x844 load an existing v0.19 project, preserve its nodes/references,
  restore the selected host key without persisting the credential, retain
  the endpoint lock and keep thumbnail/regenerate preferences after reload.
  A desktop overwrite operation sends one existing external reference through
  the real multipart path, excludes its own old image, keeps two nodes and
  the inbound edge, and persists the generated result in IndexedDB. No page
  errors occurred. The local preview closes after each run. The Browser plugin
  was unavailable; the removed bundled Playwright runtime was replaced with
  an external test-tools installation, without changing app dependencies.
- Independent read-only review found no remaining integration blockers after
  checking model selection, host boundaries, overwrite references, template
  repair and preference normalization. Test evidence includes the template
  failure-before/pass-after logs.

Builds retain existing Canvas large-chunk/mixed-import warnings and jsdom
pseudo-element warnings. No real upstream image/video generation, WebDAV server,
local Agent/proxy, production account or user browser data was used. Backend
full suites and Classic build were not repeated because their source and
dependencies are unchanged. No push, PR, main merge, image publication or
production deployment was performed or authorized for this update.
