# Docs Content Internationalization Completeness

## Capability

The public `/docs` capability exposes the gateway's developer documentation as a stable, data-driven hierarchy of tabs, groups, categories, endpoint sections, explanatory blocks, and downloadable Markdown. The rendered and downloaded documentation follows the active interface language while preserving all protocol identifiers and examples.

## Language model

- `DocLang` supports the existing documentation modes `zh` and `en`.
- Interface locales whose resolved language starts with `zh` select the `zh` document tree.
- All other supported interface locales select the complete `en` document tree as the stable fallback.
- Every user-visible content value in the document data tree has a Chinese and English form unless it is a technical literal that must remain identical.
- The tab bar, sidebar hierarchy, active page, section headings, blocks, and Markdown download all consume the same resolved document language.

## Content hierarchy

The complete documentation tree retains these stable groups and IDs:

- `start`: overview, authentication/base URL, and common conventions/errors.
- `guides`: quick start, groups/routing, rate limits, and error-code guidance.
- `tools`: supported CLI, editor/IDE, chat-client, and browser-extension integrations.
- `ai`: models, chat formats, completions, embeddings, reranking, moderation, audio, realtime, and unsupported endpoint reference.
- `images`: Gemini, OpenAI, Qwen, and Midjourney image APIs.
- `video`: Seedance, asset library, Sora, Kling, and Seedance reference APIs.
- `reference`: SDK quick start, billing/quota, and rate-limit reference.
- `faq`: account, verification, balance, invoice, and compliance guidance.

Group IDs, category IDs, item IDs, `/docs` route behavior, URL hashes, tab membership, ordering, and collapsible behavior remain language-independent.

## Localized fields

The following data is user-facing and switches between Chinese and English:

- group, category, and item labels;
- paragraphs, section headings, notes, and list items;
- card titles and descriptions;
- parameter descriptions;
- generic table headings and explanatory cells;
- code block presentation labels such as request, response, success, and failure;
- Markdown-generated parameter-table headings, required-state values, and prose punctuation.

English content must be complete and meaningful rather than transliterated, abbreviated into raw keys, or replaced with empty text. Chinese content retains the current meaning and coverage.

## Protocol invariants

The following values are protocol data and remain unchanged across languages:

- HTTP methods and endpoint paths;
- HTTP Header names and wire values;
- JSON keys and parameter identifiers;
- parameter types and defaults;
- status codes, URL schemes, query keys, shell flags, environment variables, and SDK identifiers;
- model IDs, provider/product names, protocol names, and dynamic `baseUrl` values;
- raw code block payloads, including example prompts and responses.

Localization must not change request semantics, response semantics, copy-button values, endpoint display, or the server address derived from `/api/status.server_address`.

## Rendered documentation behavior

- `/docs` remains a public TanStack Router route inside `PublicLayout`.
- Changing the interface language causes the tab bar, sidebar, active section headings, and content blocks to update in one render without a full page reload.
- The selected tab/category/section is identified by stable IDs, so changing languages does not create language-specific routes or hashes.
- Parameter tables use existing i18next UI labels for column headings and required-state values.
- Code blocks and tables may retain their own local horizontal scroll containers; the document page itself must not gain horizontal overflow on supported desktop or mobile viewports.
- Existing copy, download, sidebar collapse, category selection, item selection, intersection tracking, hash update, and dynamic server-address behavior remain intact.

## Markdown export

- `buildCategoryMarkdown` builds from the same localized tree as the rendered page.
- Category/item headings, prose, notes, list items, cards, table explanations, and code block presentation labels use the selected document language.
- Parameter-table headers and required-state values use the selected document language.
- English presentation labels continue to produce the correct fenced-code language for JSON, bash, Python, JavaScript, and HTTP examples.
- Raw fenced code, endpoint paths, `base_url`, parameter identifiers, model IDs, and other protocol literals remain unchanged.

## Fallback and resilience

- English is the documentation fallback for all non-Chinese interface locales.
- A missing status response uses the existing browser-origin fallback for `baseUrl`; localization does not alter that behavior.
- Document localization must not expose raw translation keys, `undefined`, empty labels, or partially Chinese English content.
- Raw code samples may intentionally contain Chinese prompt or response data and are excluded from the no-Han user-prose invariant.

## Accessibility and responsive behavior

- Existing semantic headings, buttons, navigation order, visible focus, and accessible button behavior remain unchanged.
- Localized labels may wrap or truncate only within existing constrained navigation areas; they must not overlap adjacent controls.
- At desktop and mobile widths, no page-level horizontal overflow is introduced. Existing code/table overflow remains contained locally.

## Verification contract

- Recursively test the complete `buildDocGroups(baseUrl, 'en')` data tree and reject Han characters in user-visible fields while excluding raw code and explicit technical literals.
- Test representative Chinese labels and prose from every main group.
- Test protocol invariants across `zh` and `en` trees.
- Test localized Markdown metadata, fenced-language detection, and raw code stability.
- Test live `/docs` language changes for synchronized tab/sidebar/body updates and stable dynamic `baseUrl`.
- Run related Vitest, frontend typecheck, i18n synchronization, production build, scoped format/lint, and Git whitespace checks.
- Browser-check English and Chinese at desktop and mobile sizes for sidebar/content language, overflow, download behavior, and console errors.

## Non-goals

- No change to backend behavior, database schemas/data, production configuration, authentication, billing, or deployment.
- No change to `/docs` visual design, route structure, information architecture, endpoint contracts, or navigation IDs.
- No dedicated full-document translation for French, Japanese, Russian, or Vietnamese in this change; those locales use the complete English fallback under the existing bilingual document model.
- No automatic translation of raw code samples or protocol literals.
