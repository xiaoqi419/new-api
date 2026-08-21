# Login Welcome Copy

## Complete objective

The sign-in card presents a localized welcome title and description that make the next step clear without changing any authentication behavior.

## Localized content

- The sign-in page obtains both strings through `useTranslation()` and `t()`.
- The title source key is `Welcome back! 👋`.
- The description source key is `Sign in to dive into the ocean of AI.`.
- In Simplified Chinese, the rendered title is exactly `欢迎回来 ！👋` and the rendered description is exactly `登录后进入AI的汪洋大海中~`.
- English, Traditional Chinese, French, Japanese, Russian, and Vietnamese each provide a natural localized title and description in their existing locale dictionary.
- Every source key exists in all seven supported locale dictionaries: en, zh, zh-TW, fr, ja, ru, and vi.

## Responsive and accessible presentation

- The title remains the sign-in card heading and the description remains supporting text.
- Both strings retain the card's existing `min-w-0` and `break-words` constraints, so a 320px viewport can wrap long localized text without horizontal overflow.
- The emoji is text content in the heading and does not replace an accessible label or control.

## Compatibility

- Password login, OAuth, Passkey, captcha, 2FA, redirect handling, terms, and all existing sign-in form controls retain their current behavior.
- The sign-up page, password-recovery pages, shared authentication layout, navigation, model animation, SMTP behavior, IP access behavior, deployment, and backend APIs are outside this capability.

## Change record

- The newest changelog entry records the user-visible sign-in welcome copy update.
