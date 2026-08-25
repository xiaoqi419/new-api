# Outcome

Public pages must keep the configured brand footer area visible even when a custom footer/legal strip is configured. The custom strip shown in the reference image (contact text, agreement/privacy links, copyright and attribution) must render as an additional bottom row instead of replacing the brand area.

# Scope

- Update the React public footer composition and its responsive styles.
- Preserve system-configured `footerHtml`, site name, logo, agreement/privacy links, copyright and attribution.
- Cover the behavior with focused footer component tests.

# Non-goals

- No backend, API, database, migration, deployment or production configuration changes.
- No changes to footer copy, legal URLs, branding values or existing homepage CTA behavior beyond composing both footer regions.

# Acceptance examples

- A1: When `footerHtml` is configured, the default public footer still renders its brand area and also renders a distinct custom footer strip containing the configured HTML and legal/attribution metadata.
- A2: On the homepage, the existing brand CTA footer remains visible and the custom strip is rendered below it; the two regions do not replace or overlap one another.
- A3: On business/public pages such as `/docs`, the configured brand footer area and custom strip are both visible in document order.
- A4: Agreement/privacy links remain conditional on status for the custom strip, while the existing homepage legal row behavior is unchanged.
- A5: The custom strip wraps cleanly at narrow widths and does not introduce page-level horizontal overflow.
- A6: Existing footer behavior when `footerHtml` is empty remains unchanged.
- A7: Focused footer tests and frontend typecheck/build pass.

# Constraints and invariants

- Keep the protected project attribution and license references intact.
- Keep existing `displayName`/`displayLogo` resolution and `useStatus`/`useSystemConfig` data sources.
- Avoid duplicate legal links in the new custom strip; the existing default metadata remains the source for the default footer variant.

# Decisions

- The custom strip is an additional sibling region inside the public footer, not an early-return branch.
- The existing home CTA region remains controlled by `data-public-surface='home'`; the custom strip is available on both home and business surfaces.

# Open questions

- [blocking] CONFIRM: Implement the footer as two stacked regions: preserve the existing brand/CTA footer and append the screenshot-style custom contact/legal strip whenever `footerHtml` is configured, with responsive wrapping and no backend/database changes.

# Verification expectations

- Run focused Footer Vitest tests, TypeScript typecheck, production frontend build, formatting/lint checks for changed files, and `git diff --check`.
