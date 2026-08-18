# 微信官方支付充值

## Requirements

### Requirement: Direct WeChat Pay has a dedicated processor

The primary wallet MUST dispatch `wechatpay` to the dedicated WeChat Pay processor, while `wxpay` MUST remain on the generic online-payment form flow.

#### Scenario: Direct and aggregator methods are selected

- **WHEN** the selected method type is `wechatpay`
- **THEN** the wallet calls the dedicated WeChat processor
- **AND** it does not submit the generic `/api/user/pay` form

- **WHEN** the selected method type is `wxpay`
- **THEN** the wallet calls the existing generic processor

### Requirement: Browser scene selection is capability-aware

The processor MUST select only an enabled scene using the browser user agent and `TopupInfo` capability flags.

#### Scenario: WeChat browser uses JSAPI

- **WHEN** the user agent contains `MicroMessenger`
- **AND** `wechatpay_jsapi` is enabled
- **THEN** the processor prepares JSAPI authorization

#### Scenario: External mobile browser uses H5

- **WHEN** the user agent is mobile and not WeChat
- **AND** `wechatpay_h5` is enabled
- **THEN** the processor requests an H5 order

#### Scenario: Desktop or fallback uses Native

- **WHEN** Native is enabled and the preferred scene is unavailable or the browser is desktop
- **THEN** the processor requests a Native order

#### Scenario: No supported scene fails without an order

- **WHEN** no scene enabled by the backend is usable in the current browser
- **THEN** the processor reports a payment failure
- **AND** it does not call a payment endpoint

### Requirement: Redirect responses are validated

The processor MUST accept only absolute `http` or `https` URLs returned by the backend for H5 and JSAPI redirects.

#### Scenario: Unsafe redirect is rejected

- **WHEN** the backend returns a `javascript:`, relative, or otherwise unsafe URL
- **THEN** the processor reports a payment failure
- **AND** it does not navigate the browser

### Requirement: Native orders are pollable

The processor MUST require both `qr_code` and `trade_no` for a Native response and MUST pass them to the existing QR dialog.

#### Scenario: Native payment succeeds

- **WHEN** the QR dialog polls `/api/user/topup/status` and receives success
- **THEN** the dialog closes and the wallet refreshes the user balance

#### Scenario: Native response is incomplete

- **WHEN** `qr_code` or `trade_no` is missing
- **THEN** the processor reports a payment failure and does not open the QR dialog

### Requirement: Existing payment UX and i18n remain compatible

The wallet MUST use existing loading, toast, i18n, QR dialog, and top-up availability patterns and MUST keep the form usable when direct WeChat Pay is the only enabled gateway.

### Requirement: Verification protects the contract

The change MUST include deterministic tests for processor routing, scene selection, response parsing, redirect safety, and unavailable-scene failure; affected frontend checks MUST pass.
