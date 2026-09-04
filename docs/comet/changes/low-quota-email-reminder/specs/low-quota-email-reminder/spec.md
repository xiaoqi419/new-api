# Low-Quota Email Reminder

## Configuration

The administrator configuration has an enable switch, a global threshold, a selected built-in or custom template, and a test recipient address. The global threshold defaults to one unit of the site's current displayed quota unit. The API accepts displayed-unit input and stores a normalized value together with the unit semantics used at save time. Reading the configuration renders the saved value using those semantics, so later exchange-rate or display-unit changes do not reinterpret an existing threshold.

The configuration is disabled only when the administrator turns it off. When disabled, no low-quota reminder is created or sent. Re-enabling does not retroactively send for an already-low balance; a new crossing after re-enabling is required.

## User override

`UserSetting.QuotaWarningThreshold` remains optional. A non-empty, positive value is interpreted in the current displayed unit at the time the user saves it and is normalized with the same unit metadata as the global value. An empty value means inheritance from the global threshold. Invalid, negative, non-finite, or out-of-range values are rejected with a client error.

## Templates

Built-in templates are selectable and previewable. A custom template has a subject, HTML body, and plain-text body. Rendering accepts only these variables:

`username`, `remaining_quota`, `threshold`, `currency_symbol`, `top_up_url`, `site_name`.

Unknown variables, malformed delimiters, or missing required custom fields fail validation before persistence and before send. Values are escaped according to the output context; HTML bodies must not allow template content to inject arbitrary server-side expressions.

## Trigger lifecycle

Wallet and subscription balances have independent reminder state records. Each state is associated with a user, balance kind, and effective threshold. The state machine is:

`armed` -> `low_pending` -> `sent`

and any balance at or above the threshold transitions `low_pending` or `sent` back to `armed`. A crossing is defined as an authoritative post-settlement or post-adjustment balance changing from `>= threshold` to `< threshold`. A balance that is already below the threshold does not create another reminder on repeated scans.

Creation and deduplication occur transactionally. Concurrent requests or compensation scans may race, but only one transition for a given low-balance cycle can enqueue/send a reminder. Failed delivery remains retryable without creating another logical reminder. A successful delivery records the template and threshold snapshot used for auditability.

The recipient is the user's notification email when configured, otherwise the user's default email. If no email exists, the reminder is skipped with an audit log and the state remains retryable/armed according to the implementation's delivery policy; no fake success is recorded.

## Test email

An administrator-only endpoint sends the selected template rendered with safe example values to the explicitly supplied test address using current SMTP settings. It validates address and template first, returns a structured success or error response, and never mutates user reminder state or consumes quota.

## Compensation task

The existing system-task framework periodically scans enabled users with authoritative low balances and retryable reminder records. It applies the same transactional state transition and template snapshot rules as synchronous settlement hooks. The task is safe to run repeatedly and across multiple instances.

## Compatibility and safety

All persistence uses GORM patterns compatible with SQLite, MySQL 5.7.8+, and PostgreSQL 9.6+. Migrations avoid dialect-specific column types and raw locking syntax. Quota conversion uses the common saturation helpers and rejects invalid user-controlled multipliers. Existing SMTP, NotifyUser, and other notification channels retain their behavior.

## Acceptance contract

1. Display-unit threshold conversion and default `1` are correct for USD, CNY, CUSTOM, and TOKENS.
2. Personal override and empty-value inheritance are correct.
3. Template selection, preview, whitelist validation, and context-safe rendering are correct.
4. Test-email API handles success, invalid address, invalid template, and SMTP failure without changing reminder state.
5. Wallet crossing creates at most one reminder per cycle; repeated low scans do not resend; recovery re-arms it.
6. Subscription lifecycle follows the same rules independently from wallet lifecycle.
7. Persistence and migration work on all three supported databases, including concurrent deduplication.
8. Admin authorization, email absence, retry behavior, observability, i18n, changelog, and regression compatibility are covered.
