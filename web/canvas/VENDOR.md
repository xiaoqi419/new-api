# Vendored: 无限画布 (infinite-canvas)

This directory is a vendored copy of a third-party frontend application. Its build
output ships inside the distributed image and is served at `/canvas-app`, which the
main frontend embeds in a same-origin iframe on its own `/canvas` page.

|                     |                                                                                   |
| ------------------- | --------------------------------------------------------------------------------- |
| Upstream            | https://github.com/basketikun/infinite-canvas                                     |
| Version             | `v0.18.0`                                                                         |
| Upstream tag commit | `d213a74614e0e4bd8a26383d1e1e907249e9c61`                                         |
| Release date        | 2026-09-07                                                                        |
| License             | MIT (see `LICENSE`)                                                               |
| Imported from       | `https://codeload.github.com/basketikun/infinite-canvas/tar.gz/refs/tags/v0.18.0` |

The upstream application is a pure browser SPA with no backend of its own: it talks
directly to an OpenAI-compatible endpoint from the browser, and keeps its API key,
canvases, assets and history in browser storage. Serving it from this project's own
origin means the endpoint is same-origin, so no CORS handling is involved and each
user's requests are billed against the key that user picks. While embedded the endpoint
is pinned to this site and cannot be edited, so it can only ever call this gateway.

## Layout differences from upstream

- Upstream repository root files `VERSION`, `CHANGELOG.md` and `LICENSE` were copied
  into this directory, because only `web/` is vendored. `vite.config.ts` reads the
  first two, so its paths were adjusted accordingly.
- Not vendored: `package-lock.json` (this project uses bun), `vercel.json` and
  `docker-entrypoint.sh` (nginx-specific; here the build output is served by the Go
  binary instead of nginx).
- Upstream `AGENTS.md` is intentionally not vendored, so it cannot be mistaken for
  this repository's own agent instructions.

## Local patches

The vendored source is synced from the `v0.18.0` tag. The authoritative semantic-diff
manifest is kept in `scripts/format-integration.mjs`; every path listed there must be
reviewed and replayed after a future upstream upgrade. The manifest is intentionally
explicit because the rest of `web/` remains upstream-owned code.

The local changes fall into these groups:

1. **Subpath and build bootstrap** — `index.html`, `vite.config.ts`, and `src/router.tsx`
   make `/canvas-app` a valid Vite base path, load the copied release metadata, prefix
   the local plugin manifest, and pass a basename to the router. The entry document uses
   the same base path for its module and stylesheet URLs.
2. **Host endpoint, theme, and account isolation** — `src/constant/runtime-config.ts`,
   `src/stores/use-config-store.ts`, `src/services/config-file.ts`,
   `src/services/api/image.ts`, `src/services/api/canvas-agent.ts`,
   `src/components/layout/channel-editor-drawer.tsx`, `src/lib/app-theme.ts`,
   `src/components/layout/app-providers.tsx`, `src/main.tsx`, and the host bridge files
   lock embedded requests to the current New API origin, pass only the signed-in user's
   API keys, synchronize theme tokens, and redact bridge/bootstrap errors.
3. **Plugin boundary** — `src/constant/env.ts`, `public/official-plugins.json`, and
   `src/lib/canvas/plugin-loader.ts` keep the default registry and executable plugin
   sources same-origin. Plugin code is evaluated with page privileges, so an arbitrary
   remote registry is not allowed to run in a logged-in iframe.
4. **Embedded navigation policy** — `src/components/layout/app-top-nav.tsx`,
   `src/components/layout/mobile-nav-drawer.tsx`, `src/components/layout/user-status-actions.tsx`,
   `src/layouts/user-layout.tsx`, `src/components/canvas/canvas-top-bar.tsx`, and
   `src/pages/canvas/project.tsx` omit Agent, documentation, GitHub, and the standalone
   video workbench controls only inside the iframe. The configuration and version
   controls remain available; a top-level Canvas deployment keeps upstream behavior.
5. **Upgrade compatibility and type fixes** — `src/services/app-sync.ts`,
   `src/stores/canvas/use-canvas-store.ts`, `src/lib/canvas/canvas-data-migration.ts`,
   the two local locale files, and `src/components/layout/model-script-editor.tsx`
   preserve readable stored projects and adapt the v0.18.0 Ant Design type contract. A
   malformed persisted record is reported instead of being silently overwritten.
6. **Agent and media integration** — the Agent components listed by the manifest,
   `src/stores/use-agent-store.ts`, `src/lib/agent/agent-site-tools.ts`,
   `src/lib/agent/agent-security.ts`,
   `src/lib/host-bootstrap.ts`, and `src/components/agent/use-agent-message-asset-url.ts`
   retain the standalone Agent protocol while enforcing the embedded boundary and
   redacting connection data. The added tests cover navigation visibility, bridge and
   bootstrap lifecycle, migration, account/config races, model capability checks, and
   credential-safe Agent/media behavior.

The added integration files are `scripts/format-integration.mjs`,
`public/official-plugins.json`, `vitest.config.ts`, `src/test-setup.ts`,
`src/lib/host-bridge.ts`, `src/lib/host-contract.ts`, `src/lib/host-bootstrap.ts`,
`src/components/layout/host-bootstrap-status.tsx`, `src/lib/agent/agent-security.ts`,
`src/lib/canvas-i18n.ts`, `src/lib/canvas/canvas-data-migration.ts`,
`src/services/api/model-catalog.ts`, and
`src/components/agent/use-agent-message-asset-url.ts`. The local `.prettierignore`
adds an entry for TypeScript's generated build-info file. Regression tests are collected
recursively from the test directories listed in the format manifest, with the four
implementation-adjacent tests listed explicitly, so a newly added integration test is
automatically checked.

The embedded navigation policy is conditional rendering rather than CSS hiding. A
top-level Canvas deployment therefore keeps the upstream Agent, documentation and
GitHub controls, while the same-origin iframe omits those controls and leaves the
configuration and version-release controls available.

## Build

```sh
cd web/canvas
bun install --frozen-lockfile
VITE_BASE=/canvas-app/ bun run build
```

`VITE_BASE` must match `canvasBasePath` in `router/web-router.go`, which is also the
mount point used by `//go:embed web/canvas/dist` in `main.go`. The Dockerfile builds
this directory in its own `builder-canvas` stage. Non-Docker builds must create all
three ignored embed trees before compiling Go: `make build-all-web` builds the default,
classic, and Canvas frontends; `.github/workflows/release.yml`,
`.github/workflows/electron-build.yml`, and `electron/build.sh` run the same Canvas
build with `VITE_BASE=/canvas-app/` before their Go build step. Building only
`web/` leaves `web/canvas/dist` absent in a clean checkout and the `//go:embed`
directives in `main.go` cannot compile.

## Isolation from this project's toolchain

This directory follows upstream's own conventions (prettier, 4-space indent), not this
project's. It is therefore excluded from:

- `web/.oxlintrc.json` and `web/.oxfmtrc.json` (`ignorePatterns`)
- the main frontend's Tailwind source scanning, via `@source not '../../canvas'` in
  `web/src/styles/index.css` — otherwise Tailwind's automatic detection compiles this
  application's class names into the main stylesheet.

## Format gates and reproducible diff audit

`bun run format:check` runs the integration-only gate in
`scripts/format-integration.mjs`. It formats and checks the explicit local manifest and
all regression tests, while mixed files that retain upstream layout are parser-checked
without rewriting the vendored baseline. If `CANVAS_PRISTINE_WEB` points to a clean
`v0.18.0/web` checkout, those mixed files also receive a changed-line audit against the
pristine source. `bun run format` writes only the owned manifest files. The complete
upstream audit remains available as `bun run format:check:upstream`; it is expected to
report the formatting differences already present in the pristine v0.18.0 release.

To reproduce the semantic diff and verify that the manifest is complete:

```sh
git clone --depth 1 --branch v0.18.0 https://github.com/basketikun/infinite-canvas.git /tmp/infinite-canvas-v0.18.0
CANVAS_PRISTINE_WEB=/tmp/infinite-canvas-v0.18.0/web node web/canvas/scripts/format-integration.mjs --audit-pristine
```

On PowerShell, set `$env:CANVAS_PRISTINE_WEB` to the extracted `web` directory before
running the same Node command. The audit normalizes LF/CRLF, excludes generated
`tsconfig.tsbuildinfo` and the intentionally omitted nginx/package-manager files, and
fails when a semantic upstream drift is not represented in the manifest. A plain
`git diff --no-index --ignore-space-at-eol <pristine>/web web/canvas` is useful for
reviewing the individual hunks after the manifest audit passes.

## Upgrading

1. Download the target tag from `codeload.github.com` and extract it.
2. Sync `web/` from the tarball into this directory, keeping the exclusions listed
   under "Layout differences" and refreshing `VERSION`, `CHANGELOG.md`, `LICENSE`.
3. Replay the patches above, run the `--audit-pristine` command in the previous section,
   then inspect `git diff --no-index --ignore-space-at-eol` against the pristine tree to
   confirm that every remaining difference is intentional.
4. Rebuild with `VITE_BASE=/canvas-app/` and verify `dist/index.html` references
   `/canvas-app/assets/...`.
5. Update the version, tag commit, release date, and the manifest's local patch groups in
   this file and in `THIRD-PARTY-LICENSES.md`.

Upstream marks the project as still under development and does not guarantee
compatibility of previously stored data, so an upgrade should be checked against an
existing canvas before shipping.

## License obligations

- The vendored Canvas application from `v0.18.0` is MIT licensed. Keep the complete
  upstream MIT text and the `Copyright (c) 2026 basketikun` notice in `LICENSE`.
- The surrounding New API project remains under its own AGPL and attribution terms;
  the two license boundaries must not be replaced with one another.
- Upstream author attribution and the in-app page identity are preserved; do not strip
  them.
