# Outcome

Keep the international production instance as a USD-only storefront with the accepted 1.75x international group pricing, and replace the `usdt.tron` hosted-checkout hop with a native GMPay checkout shown entirely inside the New API recharge dialog.

# Scope

- Update only the international instance `new-api-international` / `newapi_int` on `codezip.io`.
- Keep recharge amount options as integer USD denominations and ensure the configured USDT payment method uses USD amounts.
- Scale each international `GroupRatio` from the corresponding mainland value by 1.75, preserving the model ratio map and all mainland settings.
- Back up the international options and ratio values before writing changes.
- For wallet recharge orders using the configured `usdt.tron` method, call GMPay's native `/payments/gmpay/v1/order/create-transaction` API with `currency=usd`, `token=usdt`, and `network=tron` using the existing merchant PID and secret only on the server.
- Return only the structured checkout fields required by the browser: actual USDT amount, TRON receive address, network/token, gateway trade number, and expiration time.
- Extend the existing in-app EPay checkout dialog to display and copy the exact USDT amount and address, render an address QR code, show a server-based countdown, and continue polling the local order until paid, failed, expired, or timed out.
- Accept normal GMPay JSON callbacks on a dedicated endpoint, verify their HMAC-SHA256 signature and immutable order amount before applying the existing idempotent top-up settlement path.
- Preserve the current MAPI/legacy EPay checkout and callback behavior for every payment method other than `usdt.tron`.

# Non-goals

- Do not modify the mainland instance, mainland database, model ratios, channel settings, provider pools, or database schema.
- Do not apply 1.75x to both `ModelRatio` and `GroupRatio`, and do not apply a second discount through `Price` or `TopupGroupRatio`.
- Do not expose the GMPay merchant secret, callback signature, TronGrid API Key, or other server credentials to the browser or logs.
- Do not scrape, iframe, proxy, or parse the hosted GMPay cashier page.
- Do not change subscription or group-buy checkout behavior in this change; the native GMPay path is scoped to wallet recharge.
- Do not deploy or mutate either production database during local Build and Verify. Production rollout and the one required international payment-method activation are separate user-authorized steps after local acceptance.

# Acceptance examples

- A1: International public currency is USD and recharge options are integer dollar amounts.
- A2: The configured USDT checkout receives USD-denominated integer amounts and the international minimum top-up remains valid.
- A3: For every shared group, `international GroupRatio = mainland GroupRatio * 1.75` within persisted precision; `codex-pro` and image group become 0.35 when mainland is 0.20.
- A4: International model ratios and mainland settings remain unchanged; no mainland database or container is touched.
- A5: A before/after backup of international options and ratios is available for rollback.
- A6: A valid `usdt.tron` wallet recharge produces a signed native GMPay USD/USDT/TRON request and returns a structured checkout containing the local order number, gateway trade number, exact `actual_amount`, `receive_address`, `token`, `network`, and `expiration_time`; the merchant secret is absent from the response and logs.
- A7: The recharge dialog shows the exact USDT amount, TRON network, complete receive address, copy actions, QR code, and a countdown derived from GMPay server/expiration timestamps without navigating to the hosted cashier.
- A8: The dialog continues existing local status polling, refreshes balance after success, transitions to failed/expired/timeout states, and offers retry only where appropriate; closing the dialog stops timers and polling.
- A9: A callback with a valid GMPay HMAC, matching PID/order/amount, `status=2`, and the configured `usdt.tron` order settles at most once; invalid signatures, mismatched amounts/PIDs/orders, non-success status, oversized bodies, and duplicate callbacks cannot create an extra credit.
- A10: Non-`usdt.tron` EPay methods keep their existing MAPI/legacy checkout response and EPay callback behavior, and existing safe-URL validation remains intact.
- A11: New user-facing text is available through the current frontend i18n system in English and Chinese, the changelog records the feature, and the affected Go tests, frontend tests, type check, lint, and production frontend build pass.

# Constraints and invariants

- USD is the international site's native display and payment currency, so `USDExchangeRate` remains 1.
- Recharge denominations are integer USD values; no CNY conversion or fractional USD checkout amounts are introduced.
- Group ratios are usage/accounting multipliers and carry the single 1.75x international uplift. `Price` and `TopupGroupRatio` are not independently multiplied.
- Existing international-only groups are preserved. Groups absent from one side are not invented without an explicit mapping.
- The native checkout uses the already configured GMPay merchant PID/secret and its documented HMAC-SHA256 canonical parameter format. GMPay and TronGrid secrets remain server-side.
- The QR payload is the returned TRON receive address; the exact `actual_amount` remains separately visible and copyable so the user cannot accidentally pay the rounded fiat amount.
- Countdown must use GMPay `expiration_time` together with its server timestamp when available, so browser clock skew does not silently extend an order.
- Callback settlement preserves the existing payment-provider, user ownership, amount, quota-overflow, transaction-lock, agent-wallet, invitation-rebate, lottery-card, and idempotency invariants.

# Decisions

- The 1.75x factor is derived from `0.35 / 0.20` and is applied once to international group ratios.
- The international `Price` remains 1 for integer USD credit purchases; model ratios remain unchanged.
- The accepted international pricing configuration remains unchanged; this goal cycle adds the native GMPay wallet checkout as a code change.
- The `usdt.tron` payment type is the explicit activation signal for the native GMPay path. Other configured EPay types do not probe or switch protocols.
- GMPay native callbacks use their documented JSON/HMAC format rather than coercing them into the legacy EPay MD5 callback format.
- TronGrid credentials are configured in GMPay's `rpc_nodes.api_key`, not in New API. The configured key was verified by a read-only authenticated HTTP 200 probe without printing the key.

# Open questions

- None. The user confirmed the native in-dialog GMPay flow and asked work to continue after configuring the TronGrid key.

# Verification expectations

- Read back all changed international options and ratios after writing.
- Confirm the mainland database/container values are unchanged by targeting only `new-api-international` / `newapi_int`.
- Validate the resulting recharge amount list contains integer USD denominations and the USDT payment method is present.
- Use deterministic fixed-vector tests for GMPay HMAC request and callback signing, endpoint derivation, response validation, amount matching, and callback idempotency.
- Exercise the checkout dialog with structured native data, address/amount copying, expiration countdown, polling success/failure, cleanup, and legacy checkout compatibility.
- Perform only a non-charging signed create-order probe or a user-authorized minimum real payment after deployment; never fabricate a successful payment callback in production.
