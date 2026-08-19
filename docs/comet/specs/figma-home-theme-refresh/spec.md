# Figma 首页与主题复刻规格

## Capability

`figma-home-theme-refresh` updates the public default landing page and shared theme tokens to match the supplied Figma file `SnTAn1XXoaAvEQgG61mm38` without changing existing product contracts.

## Figma source of truth

- Light homepage: node `6:2` (`主页-浅`), natural canvas 1920x4424; hero frame `44:3` is 1392x897, feature section frame `38:63` is 1248x770, feature grid `6:94` is 1196x470.
- Dark homepage: node `44:2` (`主页-深`), same content hierarchy with dark surface, low-opacity borders and neon-lime emphasis.
- Dashboard/model/playground nodes `52:2`, `64:2`, `76:2`, `66:170`, `72:2` are reference material for business-theme tokens and navigation density, not full page rebuild targets.

## Required behavior

1. The default `classic-landing` template renders the Figma hierarchy in this order: public navigation, hero with eyebrow/title/CTA and API response panel, model/provider visual, `01` core features, four utility cards, `02` three-step workflow, `03` lower-cost/control section, and dark connection CTA/footer.
2. Light mode maps the Figma canvas to white/near-white surfaces, title text around `#0e0e0e`, muted text around `#6b6b6b`, emphasis purple around `#2f00e5`, and neon-lime around `#d4ff1f`. Dark mode maps the page to around `#1f1f1f`, hero/CTA to around `#0e0e0e`, card surfaces to `#111`/`#1c1c1c`, white text, low-opacity borders, and the same neon-lime/purple accents.
3. Feature grid geometry uses a 1196x470 container with a 2x2 598x235 arrangement at the desktop reference width. Utility cards are 230x162 with 40px gaps. Spacing, typography, radius and shadow values must be encoded as stable responsive constraints, not content-dependent shifts.
4. At 1440px and 768px the layout scales through the project container system. At 390px the hero, cards, controls and footer stack without horizontal overflow; text wraps inside its parent and no button/control overlaps another element.
5. Public header controls expose accessible names and keyboard focus states. Theme and language changes update the page without a full reload. Get Started/login links use the existing auth/navigation contracts.
6. Existing custom-home behavior is unchanged: configured URL iframe, HTML/Markdown content, active template ID, section visibility toggles, and administrator content overrides all take precedence over built-in defaults exactly as before.
7. All default-home assets are local repository files. No default-home component may reference `www.figma.com/api/mcp/asset/...` or another temporary design URL.
8. All new visible strings go through i18next and are present in en, zh, zh-TW, fr, ru, ja and vi. The changelog contains a newest-first entry describing the pixel-accurate Figma homepage/theme refresh.
9. Shared theme tokens are split between homepage (`--home-*`) and authenticated business surfaces (`--business-*`). Business defaults remain white/light-gray with blue/cyan/purple/green/yellow/red semantics and dark business surfaces remain black/charcoal with readable contrast.
10. The implementation stays within the existing React/Tailwind/Base UI stack and does not change backend API, database schema, UI framework versions, payment/login behavior, or protected brand/copyright identifiers.

## Verification matrix

- Static: affected lint/format, focused home/theme tests, typecheck and production build.
- Browser: light/dark screenshots at 1920, 1440, 768 and 390; geometry and overflow assertions; keyboard navigation; no console errors.
- Compatibility: administrator custom-home branches and `web/classic` build remain available; any environment-blocked check is recorded as blocked rather than passed.
