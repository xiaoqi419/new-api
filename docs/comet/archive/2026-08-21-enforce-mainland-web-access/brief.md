# Outcome

When a deployment explicitly trusts a reverse proxy country header, website HTML requests from mainland China receive a theme-aware HTTP 451 response. The protection covers direct HTML files and SPA fallbacks without changing API relay, static-resource, or health-check behavior.

# Scope

- Add an opt-in mainland web-access middleware that reads `MAINLAND_WEB_ACCESS_COUNTRY_HEADER` only when the TCP peer matches an explicit concrete IP/CIDR in `TRUSTED_PROXIES`.
- Apply the policy before static serving for direct document requests such as `/index.html`, and at every main-site, canvas, and externally configured frontend fallback before HTML or redirect output is returned.
- Return a localized, theme-aware HTTP 451 HTML page for trusted `CN` signals.
- Keep non-CN, missing, malformed, and untrusted country signals fail-open.
- Add backend translations, deployment documentation, a newest-first frontend changelog entry, and focused Go regression tests.

# Non-goals

- Do not add a GeoIP database, external country lookup, or another runtime dependency.
- Do not block `/api`, `/v1`, `/assets`, static JavaScript/CSS/image resources, or conventional health and metrics paths.
- Do not trust `CF-IPCountry`, `X-Country`, forwarded IP headers, or any other client-supplied country value unless the direct TCP peer is explicitly configured as a trusted proxy.
- Do not change authentication, relay, billing, cache, proxy, or frontend business APIs.
- Do not deploy, push, merge, or archive this child change.

# Acceptance examples

- A1: With `MAINLAND_WEB_ACCESS_COUNTRY_HEADER` configured and a matching explicit `TRUSTED_PROXIES` peer, a case-insensitive country value of `CN` returns HTTP 451 and localized themed HTML for `/`, `/index.html`, login, registration, documentation, main SPA, and canvas SPA fallback routes.
- A2: A direct client, a peer outside the explicit proxy list, and a default/blank, `none`, wildcard, malformed, or missing trusted-proxy configuration cannot make a supplied country header authoritative.
- A3: Non-CN values, absent country values, disabled country-header configuration, unknown peer addresses, and unparsable remote addresses continue to the pre-existing response path.
- A4: `/api`, `/v1`, `/assets`, static non-document resources, and health/metrics paths are not changed to HTTP 451 for any country signal.
- A5: The 451 response uses backend i18n for English, Simplified Chinese, and Traditional Chinese, sends non-cacheable HTML, and chooses a conservative dark/blue palette for the current `classic` or default theme without pink styling.
- A6: Focused Go tests cover trusted CN, non-CN, unknown, disabled, and spoofed-header cases across direct-document and SPA-fallback boundaries; affected formatting, Go tests, and frontend changelog checks pass.

# Constraints and invariants

- `MAINLAND_WEB_ACCESS_COUNTRY_HEADER` is opt-in: an empty or blank value disables the policy.
- The policy accepts only `CN` after trimming whitespace and matching case-insensitively; all other values fail open.
- Trust is based on `Request.RemoteAddr` and explicit `TRUSTED_PROXIES` IP/CIDR entries, not `ClientIP()` or forwarded headers. Compatibility defaults are intentionally insufficient for this policy.
- The HTML renderer must terminate the Gin handler after writing HTTP 451 and must not cache the response.
- Preserve other agents' and users' existing changes; do not modify Runtime-managed `comet-state.yaml` or reports.

# Decisions

- Use a dedicated opt-in environment variable instead of assuming a particular CDN or proxy header, so deployments choose their own country signal explicitly.
- Require an explicit concrete `TRUSTED_PROXIES` list even though Gin has compatibility defaults. This keeps a direct client on a private network from enabling or bypassing the policy with a spoofed header.
- Place one reusable policy responder before static document serving and call it again immediately before HTML/SPA fallback output. This closes the direct `/index.html` and deep-link bypass paths without blocking static assets.
- Render the small 451 document server-side with existing backend translations and `common.GetTheme()`; no frontend build or visual dependency is required.

# Open questions

- None. The parent change already confirmed this child scope and the required deployment safety posture.

# Verification expectations

- Use deterministic Gin/httptest cases for trusted CN, trusted non-CN, untrusted spoofed headers, disabled configuration, direct HTML documents, SPA fallbacks, APIs, and static/health exemptions.
- Run focused middleware/router Go tests, `go test ./middleware ./router`, and formatting/static checks for changed Go files.
- Verify all three backend locale files contain the new keys and the frontend changelog entry is newest first.
