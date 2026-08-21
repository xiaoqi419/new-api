# Outcome

Make the sign-in card welcome copy clearer and personal while preserving the existing authentication behavior and responsive layout.

# Scope

- Update only the sign-in page title and description i18n keys.
- Add natural translations for the seven supported frontend locales.
- Add a focused sign-in regression test for the required Simplified Chinese copy and the existing wrapping constraints.
- Add one newest-first changelog entry for the user-visible copy update.

# Non-goals

- Do not change login, registration, OAuth, Passkey, captcha, 2FA, redirect, or password-recovery behavior.
- Do not modify authentication layout, model connection animation, navigation, SMTP, IP access control, deployment, or backend code.
- Do not alter the sign-up page copy or introduce a new UI dependency.

# Acceptance examples

- A1: In Simplified Chinese, the sign-in title is exactly "欢迎回来 ！👋" and the description is exactly "登录后进入AI的汪洋大海中~".
- A2: English, Traditional Chinese, French, Japanese, Russian, and Vietnamese provide natural localized equivalents; the title and description retain the existing `min-w-0` and `break-words` constraints needed at 320px.
- A15: The new user-visible source keys are present in all seven locale dictionaries and the latest changelog entry describes this update.
- A18: The sign-in card uses the localized title and description keys rather than hard-coded Chinese text.
- A23: The child changes only its assigned login-copy files and preserves the existing authentication contract.

# Constraints and invariants

- Frontend user-facing copy must use `useTranslation()` and `t()`.
- Locale updates must remain synchronized across en, zh, zh-TW, fr, ja, ru, and vi.
- The required Simplified Chinese strings, punctuation, spacing, emoji, and tilde are exact display contracts.
- The existing card's responsive wrapping behavior is retained instead of adding layout-specific code for this copy change.

# Decisions

- The title source key is "Welcome back! 👋" and the description source key is "Sign in to dive into the ocean of AI.".
- The Simplified Chinese values are fixed by the confirmed parent contract; all other locales use concise natural phrasing.
- The user confirmed this strictly derived scope through the Supervisor, so no further clarification is required before Build.

# Open questions

- None.

# Verification expectations

- Run the focused sign-in layout test, targeted format and lint checks, frontend typecheck, relevant production build, and i18n sync.
- Submit a Builder handoff for independent Verify; do not self-verify, archive, merge, or deploy.
