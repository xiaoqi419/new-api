---
generated_from_state_version: 7
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 1
- Verifier attempt: 1
- Completed: 2026-08-21T20:56:50.424Z
- Summary: Independent verifier reviewed the formal brief/spec, actual diff and routing/trust paths, then Runtime checks. All A1-A22 pass: only an explicit direct TCP peer can make the configured country header authoritative, trusted CN website document and fallback paths receive localized theme-aware 451, and API/relay/static/health boundaries remain fail-open.

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1: With `MAINLAND_WEB_ACCESS_COUNTRY_HEADER` configured and a matching explicit `TRUSTED_PROXIES` peer, a case-insensitive country value of `CN` returns HTTP 451 and localized themed HTML for `/`, `/index.html`, login, registration, documentation, main SPA, and canvas SPA fallback routes. | Focused Gin tests return 451 for trusted, trimmed/case-insensitive CN on root, direct index.html, login, registration, documentation, main SPA, and canvas SPA boundaries; source places the guard before static serving and fallback output. |
| A2 | passed | brief.md | A2: A direct client, a peer outside the explicit proxy list, and a default/blank, `none`, wildcard, malformed, or missing trusted-proxy configuration cannot make a supplied country header authoritative. | The trust parser rejects blank, none, wildcard, malformed, and nonmatching peers; focused cases confirm client-supplied CN remains fail-open unless the direct peer matches an explicit list. |
| A3 | passed | brief.md | A3: Non-CN values, absent country values, disabled country-header configuration, unknown peer addresses, and unparsable remote addresses continue to the pre-existing response path. | Focused cases cover non-CN, missing country, disabled policy, untrusted peer, default proxy configuration, and unparsable peer; all retain the existing fallback response. |
| A4 | passed | brief.md | A4: `/api`, `/v1`, `/assets`, static non-document resources, and health/metrics paths are not changed to HTTP 451 for any country signal. | Focused cases keep API, relay, assets, a static SVG, and all specified health/metrics paths at their existing successful responses; the path exemption is evaluated before rendering 451. |
| A5 | passed | brief.md | A5: The 451 response uses backend i18n for English, Simplified Chinese, and Traditional Chinese, sends non-cacheable HTML, and chooses a conservative dark/blue palette for the current `classic` or default theme without pink styling. | Renderer sets 451, HTML content type, no-store, restrictive CSP, escaped backend i18n strings, and default/classic theme-specific blue palettes without the pink value; locale and theme tests pass. |
| A6 | passed | brief.md | A6: Focused Go tests cover trusted CN, non-CN, unknown, disabled, and spoofed-header cases across direct-document and SPA-fallback boundaries; affected formatting, Go tests, and frontend changelog checks pass. | Runtime Go tests, Go vet, changed-file gofmt, diff whitespace, and targeted changelog lint/format all passed; focused output covers trusted, untrusted, disabled, and service-boundary cases. |
| A7 | passed | specs/mainland-web-access/spec.md | The embedded website server can enforce a mainland-China website access policy without changing API relay behavior. The policy is disabled unless `MAINLAND_WEB_ACCESS_COUNTRY_HEADER` is set to the name of the reverse proxy header that carries the country code. | The policy is opt-in because it returns false when MAINLAND_WEB_ACCESS_COUNTRY_HEADER is blank; it is only attached to website/static and fallback boundaries. |
| A8 | passed | specs/mainland-web-access/spec.md | When enabled, the server reads that header only if all of the following are true: | The country header is evaluated only after country value, explicit proxy-list parsing, and direct-peer validation all succeed. |
| A9 | passed | specs/mainland-web-access/spec.md | `TRUSTED_PROXIES` is an explicit, non-empty comma-separated list of concrete IP addresses or CIDRs. | explicitTrustedProxyPrefixes requires a nonempty comma-separated set and parses each concrete address or CIDR. |
| A10 | passed | specs/mainland-web-access/spec.md | The list is not `none`, does not contain `*`, and every entry is a valid IP address or CIDR. | The parser rejects none, wildcard, blank entries, and every malformed address/CIDR list rather than partially trusting it. |
| A11 | passed | specs/mainland-web-access/spec.md | The direct TCP peer parsed from `Request.RemoteAddr` belongs to one of those entries. | The decision parses Request.RemoteAddr and requires netip prefix containment for the direct TCP peer. |
| A12 | passed | specs/mainland-web-access/spec.md | The configured header value trims and case-insensitively equals `CN`. | Configured country values are trimmed and compared with CN using EqualFold; focused tests exercise spaced lowercase cn. |
| A13 | passed | specs/mainland-web-access/spec.md | The policy does not use `ClientIP()`, `X-Forwarded-For`, another forwarded address, a GeoIP lookup, or a default/private trusted-proxy range to decide whether a country header is authoritative. If any input cannot establish trust, the request follows its existing path. | Static review finds no ClientIP, X-Forwarded-For, forwarded address, GeoIP, or Gin default trust decision in this policy; it only uses Request.RemoteAddr and the explicit parser. |
| A14 | passed | specs/mainland-web-access/spec.md | The policy is evaluated before static serving for root and direct HTML document requests, including `/index.html`. It is also evaluated immediately before the main SPA fallback, the canvas SPA fallback, and the fallback used when `FRONTEND_BASE_URL` redirects website routes. Therefore trusted `CN` requests cannot obtain website HTML or bypass the policy through login, registration, documentation, canvas, or another SPA deep link. | The middleware is registered before both static servers for root/direct HTML, and BlockMainlandWebAccess is called immediately before main, canvas, and FRONTEND_BASE_URL fallback output. |
| A15 | passed | specs/mainland-web-access/spec.md | When the policy applies, the response is HTTP 451 with `text/html; charset=utf-8`, `Cache-Control: no-store`, and a restrictive inline-document security policy. The page uses the active `classic` or default theme via `common.GetTheme()`, contains no pink palette, and localizes its status, title, and explanation from backend i18n. | The 451 renderer writes text/html charset utf-8, Cache-Control no-store, restrictive inline-document CSP, and theme-aware escaped localized HTML before Abort. |
| A16 | passed | specs/mainland-web-access/spec.md | The policy never blocks API or relay paths beginning with `/api` or `/v1`, static assets under `/assets`, or conventional health and metrics paths (`/health`, `/healthz`, `/ready`, `/readyz`, `/live`, `/livez`, and `/metrics`). Static non-document resources remain served by the existing static middleware. | Exemption code covers /api, /v1, /assets, listed health/metrics prefixes, while direct non-document static resources are not intercepted by the document middleware; focused cases pass. |
| A17 | passed | specs/mainland-web-access/spec.md | Operators enable the policy by configuring both variables with a proxy they control. For example, a proxy at `192.0.2.10` that supplies `CF-IPCountry` uses: | The deployment documentation and .env.example describe both variables and provide the explicit 192.0.2.10 / CF-IPCountry operator configuration. |
| A18 | passed | specs/mainland-web-access/spec.md | Leaving the country-header variable empty disables the policy. `TRUSTED_PROXIES` compatibility defaults, `none`, wildcard entries, malformed lists, or a direct peer outside the list leave the policy fail-open even if a request presents `CN`. | Static review and focused cases verify blank header configuration, implicit defaults, none, wildcard, malformed lists, and nonmatching peers fail open. |
| A19 | passed | specs/mainland-web-access/spec.md | Focused tests prove trusted CN requests receive HTTP 451 on direct document and SPA fallback paths. | Focused verbose Go output proves trusted CN receives 451 for direct root/index.html and main/canvas SPA fallback paths. |
| A20 | passed | specs/mainland-web-access/spec.md | Tests prove trusted non-CN, missing values, disabled configuration, untrusted direct clients, and malformed/implicit trusted-proxy configuration do not trigger HTTP 451. | Focused verbose Go output proves non-CN, missing, disabled, untrusted, implicit, none, wildcard, malformed, and unparsable-peer scenarios do not return 451. |
| A21 | passed | specs/mainland-web-access/spec.md | Tests prove API, static asset, and health/metrics paths remain outside the policy boundary. | Focused verbose Go output proves API, v1, assets, static SVG, health, readiness, liveness, and metrics paths remain outside the 451 boundary. |
| A22 | passed | specs/mainland-web-access/spec.md | Locale tests or static assertions confirm the English, Simplified Chinese, and Traditional Chinese backend message keys resolve. | Focused locale test resolves the new English, Simplified Chinese, and Traditional Chinese backend title and message keys. |

## Checks

| Check | Command | Working directory | Status | Exit | Duration |
| --- | --- | --- | --- | ---: | ---: |
| Mainland web-access Go tests | test ./middleware ./router ./common | . | passed | 0 | 589 ms |
| Mainland web-access Go vet | vet ./middleware ./router | . | passed | 0 | 525 ms |
| Changed Go source formatting | -d middleware/mainland_web_access.go middleware/mainland_web_access_test.go router/main.go router/web-router.go i18n/keys.go | . | passed | 0 | 47 ms |
| Git diff whitespace check | diff --check | . | passed | 0 | 46 ms |
| Frontend changelog lint | E:\code\new-api\web\node_modules\oxlint\bin\oxlint -c .oxlintrc.json src/features/changelog/data.ts | web | passed | 0 | 74 ms |
| Frontend changelog formatting | E:\code\new-api\web\node_modules\oxfmt\bin\oxfmt --check src/features/changelog/data.ts | web | passed | 0 | 300 ms |

## Blockers

_None._

## Risks and skipped work

- Independent root-package compilation could not run because this worktree lacks generated web/dist, web/classic/dist, and web/canvas/dist; direct go test . independently confirms the missing canvas embed input. The required router and middleware packages compile and test successfully.
- The worktree has no web/node_modules and Bun is unavailable. The only frontend change is the changelog entry, which was checked with the repository parent workspace local oxlint and oxfmt binaries; a full frontend build was not run.

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | Independent verifier reviewed the formal brief/spec, actual diff and routing/trust paths, then Runtime checks. All A1-A22 pass: only an explicit direct TCP peer can make the configured country header authoritative, trusted CN website document and fallback paths receive localized theme-aware 451, and API/relay/static/health boundaries remain fail-open. | 2026-08-21T20:56:50.424Z |

## Conclusion

Independent verifier reviewed the formal brief/spec, actual diff and routing/trust paths, then Runtime checks. All A1-A22 pass: only an explicit direct TCP peer can make the configured country header authoritative, trusted CN website document and fallback paths receive localized theme-aware 451, and API/relay/static/health boundaries remain fail-open.
