# International USD Pricing and Native GMPay Checkout

## Goal

The international site must charge and display in USD while pricing usage groups 1.75 times above the mainland group-ratio baseline. Wallet recharge through the configured `usdt.tron` method must remain in the New API dialog and use GMPay's structured native checkout contract instead of encoding its hosted cashier URL into a QR code.

## Behavior

1. International recharge amounts are integer USD denominations and remain directly payable through the configured USDT method.
2. International `Price` remains `1`, `USDExchangeRate` remains `1`, and `TopupGroupRatio` remains unchanged unless an existing international-specific value is required for the configured payment method.
3. For each group present in the international configuration and mapped to a mainland group, persist `international GroupRatio = mainland GroupRatio * 1.75`.
4. Preserve the international model ratio map and all model-specific fixed prices. `gpt-image-2` remains independently priced and is not silently rewritten.
5. No domestic production resource is modified.

## Native GMPay order creation

1. Wallet recharge dispatch selects the native GMPay path only when the configured payment method is exactly `usdt.tron`; every other EPay payment type retains the current MAPI and legacy fallback path.
2. The server derives and validates an HTTPS GMPay create-order endpoint ending in `/payments/gmpay/v1/order/create-transaction` from the configured EPay/GMPay address. It rejects malformed or non-HTTP(S) endpoints and never accepts a browser-supplied gateway URL.
3. The server sends `pid`, local `order_id`, `currency=usd`, `token=usdt`, `network=tron`, the decimal USD amount, server-generated `notify_url` and `redirect_url`, and an optional order name. It calculates the documented lowercase hexadecimal HMAC-SHA256 signature over sorted non-empty parameters, excluding only `signature`.
4. Merchant credentials remain exclusively on the server. Request failures and logs must not include the secret, signature, full response body, or other credentials.
5. A successful response must have an HTTP-success envelope, a matching `order_id`, positive finite `actual_amount`, valid non-empty TRON `receive_address`, `token=USDT`, waiting status, a gateway trade number, and a future expiration time. Missing, malformed, mismatched, oversized, or rejected responses fail the local pending order without returning an unusable checkout.
6. The normalized browser response includes local and gateway order numbers, `checkout_type=crypto`, exact fiat `money`, exact crypto `actual_amount`, receive address, token, network, expiration time, and server time when available. It excludes `payment_url` and all credentials.

## Native checkout dialog

1. The existing in-app checkout dialog accepts both legacy EPay checkout data and the normalized `crypto` checkout data.
2. For `crypto`, it renders the exact `actual_amount` with token, `TRON` network, the complete receive address, address and amount copy buttons, a QR code whose payload is the receive address, local order number, and a countdown.
3. The dialog does not navigate, open, embed, or encode GMPay's hosted `payment_url` for a native checkout.
4. Countdown is based on `expiration_time` and GMPay `server_time` when present. Reaching zero stops automatic polling and marks the checkout expired without claiming payment failure.
5. Existing authenticated local-order polling remains authoritative for credit completion. Success stops polling, refreshes wallet data, and closes or transitions consistently; failed, expired, and timeout states expose their existing recovery actions.
6. Closing or replacing an order clears intervals and prevents late asynchronous updates. Manual refresh remains available without creating overlapping requests.

## GMPay callback and settlement

1. A dedicated public callback accepts only a bounded JSON body using GMPay's documented callback fields.
2. It identifies the configured platform merchant by `pid`, verifies the lowercase HMAC-SHA256 signature in constant time, requires `status=2`, and loads the local order by `order_id`.
3. Before settlement it requires the order to belong to the EPay provider and `usdt.tron` method, and requires the signed fiat `amount` to equal the immutable local `Money` value using decimal comparison. The callback's receive address, actual amount, token, transaction ID, and gateway trade number are treated as audit data, not as authority to change the purchased quota.
4. Valid callbacks enter the existing transactional and idempotent top-up settlement path. Duplicate or concurrent callbacks can credit at most once and receive the success acknowledgement expected by GMPay.
5. Invalid signature, PID, order, amount, status, provider, method, or body returns a non-success acknowledgement and does not change order, user, agent-wallet, group-buy, invite-rebate, lottery, or quota state.
6. Legacy EPay MD5 callbacks and every non-`usdt.tron` EPay checkout continue unchanged.

## Acceptance

- A1: `quota_display_type=USD`, `Price=1`, and `USDExchangeRate=1` on the international instance.
- A2: `amount_options` contains only integer dollar denominations and the configured USDT method is enabled/present.
- A3: Shared group ratios match the 1.75x mapping, including `codex-pro: 0.35` for mainland `0.20`.
- A4: Model ratios, fixed model prices, mainland options, and mainland containers remain unchanged.
- A5: A timestamped international-only backup can restore the prior options and group ratios.
- A6: A fixed native-order test proves `usdt.tron` creates the documented signed USD/USDT/TRON request and normalizes only validated structured fields without leaking secrets.
- A7: A component test proves the native dialog displays and copies the exact amount/address, encodes the address in the QR, shows network/token/countdown, and never uses the hosted payment URL.
- A8: Controlled-timer tests prove polling success/failure/expiration/timeout/manual refresh and cleanup behavior without overlapping requests or stale state updates.
- A9: Callback tests prove fixed-vector HMAC verification, PID/order/amount/method/status validation, body-size enforcement, and exactly-once settlement under duplicate callbacks.
- A10: Regression tests prove non-`usdt.tron` EPay MAPI/legacy checkouts and callbacks retain their current behavior and safe-target checks.
- A11: English and Chinese strings, changelog entry, focused Go/frontend tests, frontend type check, affected-file lint, and production build are present and passing.

## Non-goals

- No schema, model-ratio, channel, provider, subscription checkout, group-buy checkout, or domestic deployment changes.
- No production deployment or production database mutation occurs before local acceptance and explicit rollout authorization.
