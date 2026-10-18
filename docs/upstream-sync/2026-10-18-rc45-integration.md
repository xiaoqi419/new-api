# Official rc.44 and rc.45 integration

Fork baseline: `20d9b2a4d461a47f5b3db799215a2f06548c9f35` (`origin/main`).
Previous official baseline: `42e694eb60fe3191795c00d416571ced716eb9c4`.
Official target: `6cf0d90b5ff27f901697dddd61e0c28aba8efefc` (`v1.0.0-rc.45`).
Scope: 57 selected upstream commits, retaining their ancestry. All work remains local until the user separately authorizes push and production deployment.

## Acceptance and implementation plan

- [x] Merge all 57 official commits into one local feature branch based on the exact production fork baseline; preserve unrelated user work and production state.
- [x] Preserve bigint wallets, bounded charges, cashback/rebates/agent payments, route constraints and fallback tiers, existing automatic-duration snapshots, Canvas/classic themes and default Chinese.
- [x] Integrate NDJSON-backed CSV log export with complete fork filters, user ID isolation, role-based metadata projections and bounded query ranges; retain exact quota/cache/image/task facts.
- [x] Integrate independent notification preferences without replacing the fork's persistent reminder cycle, displayed-currency snapshots, templates, retry and compensation delivery. Keep root operational/ticket notifications working.
- [x] Integrate token owner-quota query permission, default off for migrated tokens and on only for newly created tokens, including explicit false and cache invalidation.
- [x] Validate Claude zero/cache-only accounting, tool text/reasoning conversion, independent group limits, video plugins and new provider paths against meaningful regression tests.
- [x] Run root and independent module vet/build/tests, frontend typecheck/test/lint/i18n, and default/classic/Canvas builds. Perform isolated local browser interaction checks and independent read-only review.
- [x] Keep only the verified local result for the handoff; no push, PR, main merge or production deployment is authorized. The local commit identity is recorded in the external handoff manifest after commit.

## Compatibility decisions

The fork's dedicated monitoring/alerts configuration remains the single atomic low-balance threshold/template editor. SMTP does not duplicate that threshold with different units. New user low-balance and administrator channel-notice switches coexist with stored currency snapshots and the existing reminder delivery state machine. Pending deliveries check the current user preference before sending. User opt-out suppresses historical cycles; old workers use the observed token/state/preference to conditionally suppress delivery. Compensation records an observed baseline in one conditional update, or an insert-only operation for a missing row, preserving concurrent recovery and new cycles.

Log export streams NDJSON from the backend and converts it to CSV in the frontend, retaining fork-specific filters and the existing role visibility rules. Self statistics select the authenticated user ID, preventing users with the same name in separate tenants from sharing totals. Stored extreme log-range values saturate instead of wrapping the seconds conversion.

Existing token rows keep `allow_user_quota_query=false`; a new token's default is applied in request normalization rather than a database boolean default. Cache invalidation and quota mutation fences remain. Explicitly configured sensitive-word filtering continues to load from saved options; the new upstream defaults apply to unset configuration.

The feature worktree reuses the clean, detached workspace from the previous integration. It contains the sole implementation branch `codex/upstream-rc45`; the main checkout and all production containers are untouched. No live data, credentials or external inference calls belong to the verification artifacts.

## Verification evidence

Evidence directory: `D:/CodexHome/artifacts/rc45-verification/`.

- Root `GOWORK=off go vet -p 2 ./...`, `go build -p 2 ./...` and full `go test -p 2 ./...` passed. The final full run includes controller (166.428s), model, middleware, relay, plugins and service. Focused notification checks additionally cover the final delivery/baseline race repairs.
- `relaykit/` and `tokenkit/` each passed their independent vet, build and full tests with `GOWORK=off`.
- Frontend full Vitest passed **301 files / 2,824 tests**, using `--maxWorkers=4`; typecheck and i18n sync passed. All seven locale files contain **9,002 keys** without missing/extras. Existing fork translations are retained.
- Changed frontend source oxlint completed with zero errors and one non-blocking test warning: JSON serialization deliberately models request transport. Plugin lint has zero errors and ten existing non-blocking warnings about caught-error causes and variable shadowing.
- Default, classic and Canvas production builds passed. Final default build includes the export fixes and changelog; the unchanged classic/Canvas builds preserve those integrations.
- Isolated production-asset browser QA on `http://127.0.0.1:19485` downloaded a CSV containing the expected columns and exercised notification and new-token owner-quota switches. Desktop 1440x1050 and mobile 390x844 checks found no page exceptions or horizontal overflow. The QA servers were stopped after verification.
- Local SQLite old-to-new rehearsal used a copy of the previous rc43 synthetic database. Existing user balances and usage were preserved; the new token permission column was added with historical permissions disabled. No production database was used.
- Independent review identified normalized cache/subscription CSV mismatches, a shared-single-connection export deadlock, missing private-fallback address redaction, and user-notification concurrency boundaries. Regression tests accompany the corresponding compatibility fixes.

The final read-only reviewer confirmed all findings were closed after inspecting the atomic baseline and token-aware suppression changes. Both stale-snapshot regressions were verified to fail before their repairs and pass afterwards.

MySQL/PostgreSQL/ClickHouse instance tests were not configured and were skipped where they require DSNs. Compatibility evidence is portable GORM paths and SQLite regressions, not a production rehearsal on those databases. No real upstream inference, GitHub CI, push, PR, production image build or deployment was performed. The module download initially hit a network timeout at proxy.golang.org; one process-local goproxy.cn download populated the cache without altering repository or global Go configuration.

## Selected commit inventory

| Commit | Official change |
| --- | --- |
| `3827fd830` | fix(web): show cache read price on expression model cards (#7757) |
| `3f926c3ef` | fix(metrics): count completed streams after context cancellation (#7638) |
| `bbf60b49f` | fix(logs): vertically align billing source icons on mobile (#7760) |
| `b22a43b6e` | fix: mark task settlement logs with is_task for tiered billing display (#7446) |
| `34b194212` | fix(pricing): allow root access when the model square is disabled (#7761) |
| `ba0e478e0` | fix(relaykit): preserve assistant text with tool calls (#6871) |
| `fc08b76f0` | fix(web): preserve recorded billing tiers in usage log previews (#7763) |
| `4bfcf2812` | chore(web): bump @lobehub/icons to 5.22.0 (#7764) |
| `9948b1ef1` | fix(pricing): accept declared endpoint arrays in pricing conversion (#7724) |
| `2ed058795` | fix(ci): stabilize checks and configure Bun dependency updates (#7765) |
| `2b85a8fc6` | fix(auth): show legal consent warning on password login (#7771) |
| `767a82b87` | fix(claude): forward thinking.block_binding and every anthropic-beta value (#7732) |
| `ba29f0645` | chore(deps-dev): bump @xmldom/xmldom from 0.8.13 to 0.8.15 in /electron (#7187) |
| `b8c2dc126` | build(deps): bump yace from 1.1.0 to 1.1.1 in /web (#7770) |
| `c730add95` | build(deps): bump stream-markdown-parser from 1.1.3 to 1.2.18 in /web (#7769) |
| `82306b3c3` | build(deps-dev): bump @tanstack/router-plugin in /web (#7768) |
| `bf4e1ebfb` | build(deps-dev): bump oxfmt from 0.57.0 to 0.72.0 in /web (#7766) |
| `7e25797d1` | chore(deps-dev): bump electron from 39.8.10 to 41.10.6 in /electron (#7625) |
| `7f51a9722` | chore(deps-dev): bump js-yaml from 4.3.1 to 4.3.2 in /electron (#7327) |
| `1c58f3d16` | chore(deps-dev): bump fast-uri from 3.1.5 to 3.1.7 in /electron (#7169) |
| `3fe394cdb` | chore(deps): bump github.com/gorilla/websocket from 1.5.0 to 1.5.3 (#7001) |
| `9f048107e` | chore(deps): bump ai from 7.0.31 to 7.0.136 in /web (#7767) |
| `3c9fb2a0d` | chore(deps-dev): bump brace-expansion from 1.1.16 to 1.1.21 in /electron (#7623) |
| `93cf4ba6f` | chore(deps-dev): bump js-yaml from 4.3.1 to 4.3.2 in /electron (#7327) |
| `dd5985405` | chore(deps-dev): bump undici from 6.28.0 to 6.29.0 in /electron (#7624) |
| `633b4c5b1` | feat(logs): export usage logs from the common log page (#7774) |
| `b4be2a784` | feat(ui): show newly added pricing groups at the top (#7782) |
| `63cecab82` | feat(channel): support Sub2API balance queries (#7749) |
| `d10eafb57` | fix(relay): report the real cause when a request body cannot be read |
| `ef60ef27f` | fix(relay): keep the cause of a failed body read for every later reader |
| `7de10f2c6` | feat(token): let an API key read its owner's quota |
| `4013729f6` | fix: disable sensitive word filtering by default and clear the default word list (#7814) |
| `a0bf6a8a4` | fix(vertex): pass project_id in API Key mode to avoid 404 on official endpoints (#6330) |
| `c9f7b6208` | fix(web): sort pricing models by input, output and per-request price (#7813) |
| `1b63c28dc` | fix(claude): preserve explicit zero usage and cache-only billing (#7816) |
| `76cd5114e` | build: upgrade moejs to v0.1.0-alpha.7 |
| `150ab3cd4` | chore(licenses): refresh the third-party dependency inventory |
| `bfdad293c` | fix(vidu): bill the model, duration and resolution Vidu generates |
| `f196934ce` | feat(plugins): bind Hailuo, Vidu and Veo plugins to New API channels |
| `718a4e7f9` | fix(vertex): use the multi-region hostnames for us and eu |
| `19d435e7f` | fix(relay): mask only the custom upstream address in error messages (#7822) |
| `908f94d65` | fix(web): hide pages the user cannot open from console search |
| `c9179d38b` | fix(playground): support the reasoning field in chat responses (#7831) |
| `6549a17ed` | fix(dashboard): draw flow chart labels in the theme text color (#7821) |
| `45fbb149f` | fix(rate-limit): count each group with its own limit separately |
| `ca2cae676` | fix(relaykit): emit summary on reasoning items announced without one (#7833) |
| `d03220473` | feat(aws): add Mantle Messages API support |
| `09109ec31` | fix(middleware): 过载哨兵改用容器口径并加入连续性与新鲜度判定 (#7317) |
| `ff3684658` | fix(relayconvert): 保留 Chat/Claude → Responses 转换中 input_image 的 detail 字段 (#7855) |
| `f92c57650` | fix(web): cover Cloudflare clef and NVIDIA model families in provider rules (#7840) |
| `b0a98ac49` | fix(web): apply theme class before first paint so Dark Reader detects dark mode (#7571) |
| `3e2ce2c88` | fix: align model card summary with status bar hours (#7847) |
| `5a59d6915` | fix(pricing): hide task prices left at zero when another price is set |
| `5e9595190` | feat(channels): add drag mode for channel priority ordering |
| `5c31c1fa9` | feat(channels): improve priority dragging and add onboarding guides |
| `6461f084f` | feat(notify): turn each kind of notification on or off (#7868) |
| `6cf0d90b5` | feat(deepseek): support V4.1 Flash, the Search and Fetch APIs, and @ reasoning modifiers (#7867) |
