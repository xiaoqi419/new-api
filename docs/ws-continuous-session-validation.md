# Continuous Responses WebSocket validation

2026-09-10. This report describes controlled tests, not a production rollout.

The CPA test uses one credential, its unchanged fixed SOCKS5 exit, gpt-5.6-sol, low reasoning, and the synthetic input Reply OK. Four cold/warm pairs alternate order. Cold sessions close after each request; the warm cohort retains one actual WebSocket connection. Eight core calls and two optional continuation calls all received response.completed.

| Pair | Cold first text (s) | Warm-cohort first text (s) |
|---|---:|---:|
| 1 | 33.438 | 12.095 (initial connection) |
| 2 | 11.845 | 9.667 (reused) |
| 3 | 12.591 | 10.889 (reused) |
| 4 | 30.387 | 11.418 (reused) |

Cold first-text median: 21.489 seconds. Warm-cohort median including initial connection: 11.154 seconds. Cold response.created median: 1.851 seconds; warm-cohort: 0.483 seconds. The four warm requests share one measured connection identity; four cold requests have four distinct identities. This is evidence of persistent connection reuse and lower observed latency in this sample, not a guarantee of a 48% improvement in production. Upstream variability remains material.

The optional previous_response_id continuation reused its base connection successfully but took 30.702 seconds to produce text, compared with 22.960 seconds for its base turn. Reuse alone therefore does not remove all long-tail waiting.

## New-api implementation audit

Native downstream WebSocket ingress freezes handshake headers per connection and forwards changing client_metadata in each turn. Existing authenticated session/credential/channel/model/proxy isolation is retained.

For separate HTTP/SSE requests, changing handshake-only metadata can select a new pool. Do not blanket-exclude X-Codex-Turn-State, session headers or authentication. Excluding metadata even when mirrored into client_metadata requires stronger verification that upstream handshake consumers do not depend on the original value. No speculative header-exclusion optimization was applied.

Original artifacts live in the task's external ws-verification/cpa-pool-bench directory: ws-cold-warm-report.md, ws-cold-warm-results.json, ws-cold-warm-stderr-sanitized.txt. No production settings, credential proxies or direct-fallback settings were changed; temporary credential clone was removed.
