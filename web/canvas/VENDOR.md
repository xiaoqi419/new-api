# Vendored: 无限画布 (infinite-canvas)

This directory is a vendored copy of a third-party frontend application. Its build
output ships inside the distributed image and is served at `/canvas-app`, which the
main frontend embeds in a same-origin iframe on its own `/canvas` page.

| | |
|---|---|
| Upstream | https://github.com/basketikun/infinite-canvas |
| Version | `v0.12.1` |
| License | AGPL-3.0 (see `LICENSE`) |
| Imported from | `https://codeload.github.com/basketikun/infinite-canvas/tar.gz/refs/tags/v0.12.1` |

The upstream application is a pure browser SPA with no backend of its own: it talks
directly to an OpenAI-compatible endpoint from the browser, and keeps its API key,
canvases, assets and history in browser storage. Serving it from this project's own
origin means the endpoint is same-origin, so no CORS handling is involved and each
user's requests are billed against the key that user picks. While embedded the endpoint
is pinned to this site and cannot be edited, so it can only ever call this gateway.

## Layout differences from upstream

- Upstream repository root files `VERSION`, `CHANGELOG.md` and `LICENSE` were copied
  into this directory, because only `web/` is vendored. `vite.config.ts` reads the
  first two, so its paths were adjusted accordingly (see patches below).
- Not vendored: `package-lock.json` (this project uses bun), `vercel.json` and
  `docker-entrypoint.sh` (nginx-specific; here the build output is served by the Go
  binary instead of nginx).
- Upstream `AGENTS.md` is intentionally not vendored, so it cannot be mistaken for
  this repository's own agent instructions.

## Local patches

Twelve files differ from upstream and two were added. Each change has to be replayed
on upgrade. Patches 1-6 make the application work under a subpath on this origin;
patches 7-12 plus `src/lib/host-bridge.ts` are the host bridge: they make the embedded
form follow the main site's colors, pin the endpoint to this site, and let the user
pick one of their own API keys instead of pasting it.

1. `vite.config.ts`
   - reads `VERSION` / `CHANGELOG.md` from this directory instead of the parent.
   - normalizes `VITE_BASE` into `basePath` and prefixes the generated local plugin
     manifest entries with it, so a subpath deployment resolves them correctly.
2. `src/router.tsx`
   - passes `basename` to `createBrowserRouter`. Without it the mount prefix is parsed
     as part of the application's own routes and deep links land on the not-found
     page. The trailing slash of `BASE_URL` is stripped, because the entry URL has no
     trailing slash and a `"/canvas-app/"` basename fails to match `/canvas-app`, which
     renders an empty page.
3. `src/constant/runtime-config.ts`
   - adds `DEFAULT_API_BASE_URL`, falling back to the current origin so the endpoint
     field is pre-filled with this site and one build works on any deployment domain.
4. `src/stores/use-config-store.ts`
   - default channel base URL comes from `DEFAULT_API_BASE_URL`; the upstream
     `https://api.openai.com` value remains as the fallback.
   - while embedded, `createModelChannel` and the persist `merge` force every channel's
     base URL to the host's. `createModelChannel` is the single funnel for both
     rehydrated and newly created channels, so this also corrects addresses that were
     stored before the pin existed, or by an older build.
5. `src/lib/canvas/plugin-loader.ts`
   - plugin sources are restricted to this origin. Plugin code is evaluated through a
     dynamic import and therefore runs with the page's privileges: on a shared origin
     an arbitrary remote script could read the session and call this site's API as the
     signed-in user. Only plugins shipped with the image are allowed; widening this
     should be done with an explicit allowlist rather than by removing the check.
   - the local plugin manifest is fetched under `import.meta.env.BASE_URL` instead of
     a hardcoded `/plugins/index.json`.
6. `src/constant/env.ts`
   - the official plugin registry defaults to the same-origin
     `public/official-plugins.json` (added here, shipped empty) instead of the upstream
     jsDelivr manifest. Entries from a cross-origin registry cannot pass the loader
     check above, so listing them would only offer installs that always fail.
7. `src/main.tsx`
   - calls `initHostBridge()` at startup.
8. `src/lib/app-theme.ts`
   - `getAntThemeConfig(dark, host?)` takes the host colors and feeds them to Ant
     Design as `colorPrimary` / `colorBgBase` / `colorTextBase`. Ant Design computes
     its palettes in JavaScript and never reads the CSS variables, so without this
     the components keep upstream's neutral black while the rest of the page turns
     pink. `host` is null when not embedded, which keeps upstream's colors.
9. `src/components/layout/app-providers.tsx`
   - reads the host colors from the bridge store and passes them to
     `getAntThemeConfig`.
10. `src/components/layout/user-status-actions.tsx`
   - hides the built-in light/dark toggle while embedded, because the host owns that
     state and the next sync would overwrite the user's click.
11. `src/components/layout/channel-editor-drawer.tsx`
   - while embedded, the endpoint field is disabled and shows the host address, and
     switching protocol no longer rewrites it.
   - the protocol list drops 火山方舟 while embedded: its `/api/v3` path is not served
     here, so with the endpoint pinned that option could only ever fail. OpenAI and
     Gemini both stay, because the backend serves `/v1` and `/v1beta` natively.
   - adds a picker that fills the API key from one of the signed-in user's own keys,
     supplied by the host. Manual entry is still available, including when the keys
     cannot be loaded.
12. `src/services/config-file.ts`
   - importing a config file overwrites the store directly, bypassing the
     normalization above, so the pinned address is reapplied here. Otherwise importing
     a file exported elsewhere would silently change the endpoint while the UI still
     showed it as locked.

Added file `src/lib/host-bridge.ts`: the whole host-side contract in one place. It
listens for the host's `postMessage`, rejects anything not from this exact origin,
writes the received CSS variables onto `:root`, mirrors light/dark into the existing
theme store, posts a ready message back (the parent's `load` event alone is not a
reliable signal that the app has mounted), exposes the pinned endpoint, and requests
the user's API keys on demand. The keys have to come from the host: authentication is
a rotating access token held in the main app's memory, not a cookie this document
could send, and the key list endpoint is rate limited, so it is fetched only when the
channel editor actually opens.

## Build

```sh
cd web/canvas
bun install
VITE_BASE=/canvas-app/ bun run build
```

`VITE_BASE` must match `canvasBasePath` in `router/web-router.go`, which is also the
mount point used by `//go:embed web/canvas/dist` in `main.go`. The Dockerfile builds
this directory in its own `builder-canvas` stage.

## Isolation from this project's toolchain

This directory follows upstream's own conventions (prettier, 4-space indent), not this
project's. It is therefore excluded from:

- `web/.oxlintrc.json` and `web/.oxfmtrc.json` (`ignorePatterns`)
- the main frontend's Tailwind source scanning, via `@source not '../../canvas'` in
  `web/src/styles/index.css` — otherwise Tailwind's automatic detection compiles this
  application's class names into the main stylesheet.

## Upgrading

1. Download the target tag from `codeload.github.com` and extract it.
2. Sync `web/` from the tarball into this directory, keeping the exclusions listed
   under "Layout differences" and refreshing `VERSION`, `CHANGELOG.md`, `LICENSE`.
3. Replay the patches above, then `diff -rq` against the pristine tarball to confirm
   nothing else drifted.
4. Rebuild with `VITE_BASE=/canvas-app/` and verify `dist/index.html` references
   `/canvas-app/assets/...`.
5. Update the version in this file and in `THIRD-PARTY-LICENSES.md`.

Upstream marks the project as still under development and does not guarantee
compatibility of previously stored data, so an upgrade should be checked against an
existing canvas before shipping.

## License obligations

- AGPL-3.0 applies to this application. Users interacting with the deployed instance
  must be able to obtain the complete corresponding source of the modified version.
- Upstream requires that author attribution and the in-app page identity be preserved;
  do not strip them.
