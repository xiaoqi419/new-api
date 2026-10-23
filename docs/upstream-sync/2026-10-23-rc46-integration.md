# Official rc.46 and subsequent fixes integration

Production fork baseline: `20d9b2a4d461a47f5b3db799215a2f06548c9f35`.
Existing local rc.44/rc.45 candidate: `e4a0c71e774cc2303c7ca71f6504014bef22f732`.
Official rc.46: `7d8b91268dab69d7150f345c448b5e250163146a`.
Selected official main: `7fb6e57a5ff671582131c74e00bdfaa867d4e985`.

The user authorized integrating rc.46 and the 13 subsequently inspected main
commits, retaining the preceding rc.44/rc.45 candidate, and pushing the combined
result. Domestic and international production deployment is explicitly excluded.
The sole implementation workspace remains
`D:/CodexHome/worktrees/upstream-rc43/new-api`, branch `codex/upstream-rc45`.
The target is frozen at the inspected commit instead of following later updates.

## Acceptance criteria

- Preserve upstream ancestry: the combined result contains the previous 57
  selected commits and all 32 commits from rc.45 through the selected target.
- Retain fork wallets, reservation safety, subscription isolation, automatic
  video duration, route/fallback policies, reminder currency snapshots/templates,
  classic theme and Canvas.
- Integrate Go 1.26.10, Resend, cache accounting/display, embedding changes,
  retry repricing/reservation, task request/header handling, shared endpoint
  selection, stream fixes, JSON Schema ordering and pricing synchronization.
- Verify root and independent relaykit/tokenkit modules, frontend types, tests,
  lint, localization and production builds; resolve confirmed review findings.
- Push a scoped branch and provide reviewable delivery evidence, without
  modifying either production installation or its configuration.

## Compatibility decisions

SMTP retains the fork's bounded transport timeouts, TLS controls and safe error
messages. Both HTML-only and multipart reminder callers use the selected provider;
Resend receives separate HTML/text fields and never falls back to SMTP after an
ambiguous delivery failure. Reminder thresholds/templates remain in the existing
dedicated settings section instead of gaining a second editor with different
units. The saved-settings email test action is retained for both providers.

Shared plugin endpoints use upstream channel competition while retaining fork
concurrency limiting. WebSocket and task HTTP header override entry points remain
available. Task retries atomically reserve increased prices before submission,
preserving the wallet accounting and automatic-duration snapshot behavior.

The channel editor retains the fork layout, including its existing universal
body passthrough switch. The upstream persistence repair in channel-form is
integrated; regression coverage checks save/reload, explicit disable, route
configuration and header override preservation. The incompatible upstream editor
test harness is not substituted for the fork's focused tests.

All seven frontend locale files are merged through the sanctioned locale script;
fork translations win divergent existing keys, and new upstream keys are added.
Pricing expression previews retain validation of malformed numeric coefficients
and use the new currency adjustment support. The responsive pricing tabs remain.

## Verification and delivery evidence

Evidence directory: `D:/CodexHome/artifacts/rc46-verification/`.

- Root module: `GOWORK=off go vet -p 2 ./...`, `go build -p 2 ./...`, and
  `go test -p 2 ./...` passed with Go 1.26.10.
- `relaykit/` and `tokenkit/`: each independently passed vet, build and all tests
  with `GOWORK=off`.
- Frontend: typecheck passed; the final full Vitest run passed 302 files and
  2,874 tests. Changed-file lint has no errors and two existing numeric-helper
  warnings; plugin lint has no errors and ten non-blocking warnings.
- Default, classic and Canvas production builds passed. Canvas reports existing
  large-chunk and mixed static/dynamic import warnings.
- All seven locale files have 9,042 keys with no missing or extra keys after
  `bun run i18n:sync`; fork translations are retained.
- Isolated production-asset browser QA at `http://127.0.0.1:19486` passed SMTP /
  Resend switching, sender fields, credentials-before-provider save ordering,
  and absence of a duplicate reminder editor. Desktop 1440x1050 and mobile
  390x844 screenshots have no page errors or horizontal overflow. Browser API
  responses were synthetic and external network requests were blocked. The
  Browser plugin was unavailable, so the installed Playwright/Edge was used.
- Independent backend and frontend static reviews were completed. The first
  backend review did not identify the legacy query issue; execution tests did.
  The repair was separately reviewed and its original failing test passed.

Runtime verification exposed two integration issues. The image-price test had
an upstream `flex-wrap` class assertion incompatible with the fork's responsive
grid; its behavior, keyboard navigation and exact price assertions remain. The
legacy Gemini task query fixture also needed its persisted platform identity;
after correcting it, the test exposed missing saved-key and header-override
handling. The bridge now uses the submission key, and Gemini/Vertex queries
apply explicit channel overrides. The regression fails before that repair and
passes afterwards. Resend failures now log only fixed text and HTTP status,
preventing upstream errors from echoing credentials or verification content.

Go's default proxy initially timed out. A process-local `GOPROXY` downloaded
Go 1.26.10; a process-local `GOCACHE=D:/cache/go-build` avoided the Windows cache
junction error. No global tool configuration was changed.

MySQL/PostgreSQL/ClickHouse instance matrices, actual Resend/SMTP delivery and
paid upstream calls were not exercised. Starting a separate local QA backend
was rejected by automatic approval (`blocked by policy`), so browser QA used a
loopback-only static preview with mocked APIs; a SQLite upgrade rehearsal is
not claimed for this iteration. Neither production installation was contacted
or modified. Remote PR/CI results are recorded in the external delivery manifest.
