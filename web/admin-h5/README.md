# Admin Mobile H5

Standalone mobile-first admin shell built with Bun, React 19, TypeScript, Rsbuild, Tailwind CSS, TanStack Query, TanStack Router, and i18next.

## Local development

```sh
bun install
bun run dev
```

Validation commands:

```sh
bun run typecheck
bun run lint
bun run test
bun run format:check
bun run build
```

## Dual-site authentication

The H5 shell maintains two independent in-memory sessions: `domestic` and `international`. The active site is selected with the site switcher in the header. Each site has its own API origin, access token, SID, refresh-cookie origin, user data, refresh failure state, system settings, and query cache namespace. Switching sites never clears the other site's session. A 401 or failed refresh clears only the affected site and returns that site to sign-in.

Configure origins at build time:

```dotenv
VITE_DOMESTIC_API_BASE_URL=https://domestic.example.com
VITE_INTERNATIONAL_API_BASE_URL=https://international.example.com
VITE_DEFAULT_SITE=domestic
```

Both URL variables are optional. An empty value uses the current browser origin, which is useful when `/admin-h5/` and `/api/` are served by the same host. An unset site remains visible in the switcher but cannot make a request; it never falls back to the other site's origin. Configure CORS and `Access-Control-Allow-Credentials` on cross-origin deployments so the browser can send the site's HttpOnly refresh cookie. The app never reads or persists that cookie.

Access tokens, SIDs, and user records stay in memory only. The app does not use `localStorage` or `sessionStorage` for authentication.

## Deployment requirements

Serve `dist/` at `/admin-h5/` with an SPA fallback for `/admin-h5/sign-in`, `/admin-h5/users`, and `/admin-h5/users/:id`. Reverse proxy `/api/*` to the selected backend while preserving the `/api/` prefix. Rebuild the bundle whenever a `VITE_*` origin changes. Do not expose database access or call production services directly from the browser.
