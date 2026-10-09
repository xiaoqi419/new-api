# Official rc.41 and rc.42 integration

Fork baseline: `74418e4d46d4252e7f20287719a624b273c67081`.
Previous official baseline: `9310231b3c27fea933e939b46cf26e0ce67192e3`.
Official target: `6370b29424168039e94d40d610191e7d2e65dbf4` (`v1.0.0-rc.42`).
Scope: all 47 official commits after the prior integration, preserving existing fork contracts.

## Integration requirements

- Preserve bigint wallet storage, strict recharge bounds, rebate/agent ledgers, custom payment modes, top-up gifts and lottery behavior.
- Preserve default/classic frontends, infinite canvas, announcements, repeated-menu refresh, per-user concurrency and mainland access policy.
- Retain the previously excluded model-mapping preview/floating workbench.
- Integrate scoped dashboard access tokens, admin step-up verification, plugin/token counting performance, search accounting, protocol conversions and new task models.
- Retain original project identity, licenses, attribution, PR process and release discipline.
- Build root/tokenkit on Go 1.26; relaykit remains independently buildable on its declared baseline.

## Migration and release

The new `user_access_tokens` table stores token fingerprints and permission scopes. Existing opaque dashboard tokens enter a persisted 30-day compatibility window at first upgraded startup; API keys used for model relay are a separate mechanism and are unaffected by this token migration. Automation using dashboard tokens must move to named scoped tokens before that deadline.

Application startup performs the normal schema migration. A release must rehearse it on isolated SQLite, MySQL and PostgreSQL data; compare quota-column types and keep all existing application tables. Production databases are not reset or replaced. Application-only deployment follows PR/CI/merge and an immutable build from the exact production main commit.

The stock plugin assets and configured-price paths are distinct. Existing video/image expressions remain usable and editable; omitted Seedance audio retains the fork's explicit silent default. Explicit audio requests and reported usage remain respected.

Static compression uses separate caches for default/classic so a theme switch cannot serve another theme's cached content. Canvas assets use the existing separate mount and the same static-bucket policy.

## Commit inventory

Statuses describe code integration and provenance, not a claim that all tests have already passed. Verification evidence is recorded below once the required checks finish.

| Commit | Official change | Disposition | Integration note |
| --- | --- | --- | --- |
| `8cb88ebd1` | fix: move force operation into confirm slot so plugin-in-use dialog has one cancel button (#7528) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `996adffe5` | fix(web): keep text selection when opening a model pricing row for editing (#7403) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `5401874c6` | fix(ci): align ldflags -X package path with module path so release binaries embed the real version (#7536) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `a46f045d6` | fix: match current price column width to source columns so expressions wrap alike (#7542) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `6c14c0762` | feat: highlight differing values in source price expressions (#7543) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `c76452d22` | fix(playground): add break-all to playground input (#6600) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `d04c118c8` | fix(channel): preserve Responses WebSocket setting on save (#7468) | already-equivalent | Keep fork channel-form round-trip for responses_websocket_enabled and existing extended-channel tests. |
| `c2b7a9a9e` | fix(claude): preserve per-message output_config in Claude messages (#7561) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `789c97019` | fix(claude): preserve auto mode safeguards in native requests (#7598) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `f5e54ccdb` | fix(web): revalidate marketplace fetches so stale caches do not fail integrity checks | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `87bb71e7f` | feat(plugins): serve Seedream images through the OpenAI Images protocol in doubao | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `3509ae7c1` | fix(pricing): keep prices saved before a usage profile narrows editable | adapted | Include legacy video_input usage facts without changing configured fork video/image tiers. |
| `6cbb1c7ed` | feat(auth): require step-up verification for admin user management | adapted | Step-up verification combined with concurrency, permissions and bigint wallet behavior. |
| `caca52f8d` | feat(auth): replace the dashboard access token with scoped access tokens | adapted | Scoped access tokens and legacy transition integrated; explicit fork route rules required, handled by integration regression checks. |
| `335ebcff7` | fix(relayconvert): keep Responses custom tools on Chat Completions upstreams | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `2ffc59590` | feat(jsplugin): run task plugins on moejs | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `c71eefbcd` | docs: update readme | adapted | Keep fork README, attribution, deployment documentation and existing product assets; localized official documentation updated. |
| `2506e1b98` | fix(auth): reject non-standard roles when creating a user | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `4924361ae` | feat(auth): edit the name and permissions of an access token | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `ae73ef8e2` | feat(plugins): add Seedream 5.0 flash and price each Seedream model by its own tiers | adapted | Add model-specific Seedream tiers and Flash; keep fork Seedance silent-output default consistent with upstream payload. |
| `2035a82ae` | feat(web): add a refresh button to the channels table | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `feefe09f2` | fix: isolate TLS configs across HTTP transports (#7627) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `d0cb7347c` | fix: use max_completion_tokens for gpt-6-sol and gpt-6-luna (#7559) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `811212067` | fix(web): Add class to wrap the long strings at auto-disable status tooltip content in channel manage page (#7604) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `dfd3cd893` | fix(web): hide system settings from non-root admins (#7513) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `5fe8917be` | fix(i18n): keep cached zhTW/zhCN interface codes stable across page loads (#7139) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `56758edf9` | fix(web): correct translations, chart ordering, and font loading (#7628) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `1a4166d8e` | fix(relayconvert): keep Responses custom tools on Claude and Gemini upstreams (#7636) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `b48b74ab7` | feat(jsplugin): decode hook results with moejs ToGoInto | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `973cf8ef4` | fix(keys): prevent rounded clipping of group names (#7645) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `78bd5b1cb` | fix(relaykit): Gemini stream token details, Responses tool-output media on Gemini, Opus 5.5 default effort (#7687) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `8ca26d81d` | fix(web): stop frontend build files from exhausting the web rate limit | adapted | Independent static limiter and precompressed files apply to default/classic and prefixed canvas assets; mainland gate retained. |
| `956019109` | feat(web): filter the user list by group | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `c6bac617d` | fix(relaykit): make the thinking suffix adapter toggle cover effort suffixes | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `0908d9e7b` | fix(epay): upgrade go-epay to v0.0.5 | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `bb28f2cca` | feat(tokenkit): move token counting into a module calibrated on agent traffic | adapted | Integrate independent tokenkit, Go1.26 and improved tool/image counting; preserve count_tokens when CountToken=false and bounded audio aggregation. |
| `0a532f7f7` | feat(plugins): add an xAI Grok Imagine video plugin | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `0a03088e0` | fix(relayconvert): fix lossy conversions and converted-stream failure billing | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `acb347a19` | feat(relay): web search encoding per channel and vendor-reported search billing (#7690) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `45094bdf4` | fix(web): 修复 OriginOS 6 设备渠道页白屏 | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `04c597bf6` | feat: support regex conditions in advanced parameter overrides (#7698) | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `d10f11fff` | feat(gemini): bill Google Search grounding per query or per grounded prompt | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `0cce21db0` | perf(jsplugin): stop rebuilding the usage-key replacer and request body on every hook call | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `bc8235792` | test(relaykit): keep format-conversion tests out of the repository | adapted | Keep meaningful fork conversion/billing regression tests; upstream test-layout change is not permission to remove them. |
| `b23471112` | build: upgrade moejs to v0.1.0-alpha.6 | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `192802ee0` | build: build release binaries with moejs's PGO profile | integrated | Official delta retained; merged-callsite behavior covered by corresponding root/module/frontend checks. |
| `6370b2942` | feat(jsplugin): keep JSON member order for plugins that declare json-order@1 | integrated | Capability-based JSON order preservation; limits and existing request validation retained. |

## Verification (2026-10-09)

- Root `GOWORK=off go vet -p 2 ./...`, `go build -p 2 ./...` and `go test -p 2 ./...` completed successfully. Both independent modules passed their own vet, build and test commands.
- Frontend full Vitest run: **275 files / 2,615 tests passed**. Related feature run: **46 files / 448 tests passed**. Typecheck, scoped oxlint (zero errors), changed-file format check and i18n sync passed. Seven locales received 106 new keys each; all existing fork translations remain.
- Main, classic and canvas production builds passed. A local application binary built with the moejs PGO profile served the real embedded frontends for browser verification.
- Browser QA checked desktop 1440x1050 and mobile 390x844: access-token list/create dialog, permission controls, channel refresh and user list. No page errors or mobile horizontal overflow. Screenshots accompany the PR.
- Independent read-only review identified missing scope declarations on fork routes and static gzip negotiation/method bugs. Both were corrected and the reviewer confirmed closure. Root route coverage and static-resource regressions passed.
- Isolated old-to-new database rehearsal: SQLite, PostgreSQL 16 and MySQL 8, each with two candidate starts, preserved synthetic quota=5,000,000,000, used_quota=5,000,000,001 and a legacy 32-character dashboard token. The scoped-token table and persisted legacy retirement deadline were present after each start. PostgreSQL and MySQL schema types were cross-checked with their native clients.
- The initial external rehearsal validator incorrectly expected PostgreSQL's SQL `bigint` spelling instead of the driver's `int8`, and used an unquoted MySQL `key` in its final inspection query. Native-client assertions corrected those validator errors; no production schema or business data was accessed by the rehearsal. Temporary database containers/network were removed after the successful run.

Evidence: `D:/CodexHome/artifacts/rc42-verification/` and remote `/tmp/new-api-rc42-rehearsal-20261009-r4/`. These are test artifacts, not application source. Minimum MySQL 5.7.8/PostgreSQL 9.6 and a separate ClickHouse log database were not run; compatibility at those baselines is based on the retained portable GORM paths, not a tested deployment claim.

GitHub CI and the final PR merge remain release gates. Production hot update requires the user's separate final confirmation; no production app/container has been changed by this integration.
