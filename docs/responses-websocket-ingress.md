# Responses WebSocket ingress

## Transport selection

Clients upgrade GET `/v1/responses` (compatible alias `/v1/openai/responses`) using their new-api token. Supported OpenAI, OpenAI-compatible, Advanced Custom, Sub2API and New API channels require `responses_websocket_enabled=true`. Advanced Custom additionally requires an eligible converter-free Responses route. Unsupported/disabled channels do not silently enable WS.

POST HTTP/SSE requests remain HTTP to the upstream. The retired `upstream_transport` option no longer selects an HTTP-to-WS bridge and does not enable the official flag. Existing JSON records remain readable; ordinary saves may omit the obsolete key. No channel, credential or CPA container is deleted by this code update.

## Request and session behavior

The implementation follows fixed upstream `9310231b3` in `controller/responses_websocket.go` and `relay/responses_websocket.go`. Each response.create is authenticated, model-rate-limited and concurrency-limited; token revocation and account changes are checked on later turns. The public router resolves the trusted client address once, then the per-turn runner uses that fixed address.

Session-local upstream reuse and previous_response_id rules follow the official relay. No CPA-specific cross-request pool, route-alias probing, automatic warmup or SSE bridging remains. Official raw WS envelope handling retains generate control independently of the HTTP DTO. A request explicitly using generate:false is not a promise of free use: charging follows the actual reported usage and supported protocol rules.

stream_id and event_id associate protocol events/errors. Cancellation, disconnect, terminal usage and errors are handled by one request worker so refunds do not race socket readers. Existing routing and quota safeguards, including the channel's explicit reasoning-to-model-suffix transform, remain enforced.

## Validation and limits

Deterministic tests cover enabled/disabled channels, multi-turn continuation, token revocation, tenant identity, concurrency acquisition/release, event correlation, cancellation, billing, old setting isolation and POST SSE remaining HTTP. No paid upstream request is needed for these tests. Deployment still needs WebSocket Upgrade forwarding on the public gateway. No unmeasured latency improvement is claimed.

The prior CPA live experiment was historical evidence for the removed implementation, not validation of this replacement. Use the current change's verification report for release status.
