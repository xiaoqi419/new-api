# Mainland Website Access Specification

## Complete behavior

The embedded website server can enforce a mainland-China website access policy without changing API relay behavior. The policy is disabled unless `MAINLAND_WEB_ACCESS_COUNTRY_HEADER` is set to the name of the reverse proxy header that carries the country code.

When enabled, the server reads that header only if all of the following are true:

- `TRUSTED_PROXIES` is an explicit, non-empty comma-separated list of concrete IP addresses or CIDRs.
- The list is not `none`, does not contain `*`, and every entry is a valid IP address or CIDR.
- The direct TCP peer parsed from `Request.RemoteAddr` belongs to one of those entries.
- The configured header value trims and case-insensitively equals `CN`.

The policy does not use `ClientIP()`, `X-Forwarded-For`, another forwarded address, a GeoIP lookup, or a default/private trusted-proxy range to decide whether a country header is authoritative. If any input cannot establish trust, the request follows its existing path.

## Website document boundaries

The policy is evaluated before static serving for root and direct HTML document requests, including `/index.html`. It is also evaluated immediately before the main SPA fallback, the canvas SPA fallback, and the fallback used when `FRONTEND_BASE_URL` redirects website routes. Therefore trusted `CN` requests cannot obtain website HTML or bypass the policy through login, registration, documentation, canvas, or another SPA deep link.

When the policy applies, the response is HTTP 451 with `text/html; charset=utf-8`, `Cache-Control: no-store`, and a restrictive inline-document security policy. The page uses the active `classic` or default theme via `common.GetTheme()`, contains no pink palette, and localizes its status, title, and explanation from backend i18n.

The policy never blocks API or relay paths beginning with `/api` or `/v1`, static assets under `/assets`, or conventional health and metrics paths (`/health`, `/healthz`, `/ready`, `/readyz`, `/live`, `/livez`, and `/metrics`). Static non-document resources remain served by the existing static middleware.

## Configuration and operations

Operators enable the policy by configuring both variables with a proxy they control. For example, a proxy at `192.0.2.10` that supplies `CF-IPCountry` uses:

```text
TRUSTED_PROXIES=192.0.2.10
MAINLAND_WEB_ACCESS_COUNTRY_HEADER=CF-IPCountry
```

Leaving the country-header variable empty disables the policy. `TRUSTED_PROXIES` compatibility defaults, `none`, wildcard entries, malformed lists, or a direct peer outside the list leave the policy fail-open even if a request presents `CN`.

## Verification contract

- Focused tests prove trusted CN requests receive HTTP 451 on direct document and SPA fallback paths.
- Tests prove trusted non-CN, missing values, disabled configuration, untrusted direct clients, and malformed/implicit trusted-proxy configuration do not trigger HTTP 451.
- Tests prove API, static asset, and health/metrics paths remain outside the policy boundary.
- Locale tests or static assertions confirm the English, Simplified Chinese, and Traditional Chinese backend message keys resolve.
