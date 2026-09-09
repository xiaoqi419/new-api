# Responses WebSocket ingress

The client connects using a WebSocket upgrade to `/v1/responses` (alias `/v1/openai/responses`) with its new-api `Authorization: Bearer ...` token. For a fully WebSocket upstream chain, configure the selected OpenAI-compatible channel with `upstream_transport: websocket` and a CPA base URL.

Each JSON `response.create` message runs through the normal Responses request pipeline, including token validation, model permissions, concurrency limits, channel selection and usage settlement. A revoked token is checked again on subsequent turns. Each turn receives an independent consume log and request ID. The public HTTP POST endpoint remains supported.

The first turn supplies `model`; subsequent turns may omit it to reuse the connection's last model. Use `previous_response_id` and incremental `input` items for continuation, including `function_call_output` with the upstream call ID. Server-generated connection identity isolates upstream pooling between client connections. Do not assume response IDs remain usable after reconnect or after upstream pool expiry.

SSE events emitted by the existing relay are sent to the client as JSON WebSocket messages, without SSE framing. `response.cancel` cancels the active internal request. Client disconnect also cancels the request. One subsequent create can be queued; connections and events have bounded lifetime/size.

`generate:false` is retained for upstream warmup. It requires a channel with WebSocket upstream enabled and will not fall back to HTTP on a failed handshake. Warmup suppresses generated output but is not necessarily free: the isolated CPA test reported 316 input tokens and zero output tokens, and new-api settled the reported input usage. The returned response ID successfully supported a same-socket continuation. Actual usage depends on the upstream provider.

## Validation

The isolated full application test completed four generated turns on one authenticated client WebSocket: initial response, previous-response continuation, a function call, and function-call output. Invalid models and token revocation returned error events. Successful quotas 314 + 332 + 360 + 350 equalled the user balance decrement 1356; the disconnected request recorded zero quota and client_gone.

This feature does not guarantee lower model generation latency. Measure time to first text separately from the first metadata/event frame. Production gateways must forward WebSocket Upgrade for GET `/v1/responses`; the isolated test connects directly to the application port and does not verify external gateway configuration.
