# Public Footer Brand and Legal Composition

## Behavior

The public footer has two independently renderable regions:

1. The existing brand region. On the home surface this is the branded CTA section; on business/public surfaces this is the existing logo, site name, description and optional demo links section.
2. An optional custom bottom strip driven by `footerHtml`. It contains the configured custom HTML plus the existing conditional agreement/privacy links and project attribution.

When `footerHtml` is empty, the current footer output remains unchanged. When it is present, it must not suppress the brand region. The two regions render in order, with the custom strip below the brand region.

## Responsive behavior

The custom strip is full-width within the public footer, uses the existing border/background language, and wraps its content on narrow viewports. It must not create document-level horizontal overflow.

## Invariants

- Site name and logo continue to come from the existing system configuration fallback chain.
- Legal links continue to follow `user_agreement_enabled` and `privacy_policy_enabled` for the inline custom strip.
- Existing homepage CTA/legal layout and empty-`footerHtml` behavior remain intact.
- No backend, database, migration, API, or production configuration behavior changes.
