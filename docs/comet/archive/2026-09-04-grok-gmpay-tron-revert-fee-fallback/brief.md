# Outcome

Stop the built-in GMPay TRON estimator from treating a reverted USDT transfer simulation as a successful dynamic quote, and quote a representative existing-holder TRC-20 transfer from live chain burn prices when simulation cannot succeed.

# Scope

- Reject TRON simulation payloads whose execution failed, including `result.result=true` with `REVERT opcode executed`, `transaction.ret=FAILED`, and `CONTRACT_VALIDATE_ERROR`.
- When chain burn prices are available but simulation is unusable, quote `64285` energy plus `345` bandwidth using the same node's `getEnergyFee` and `getTransactionFee`.
- Keep Ethereum, BSC, and Solana estimator behavior unchanged.
- Add regression coverage for the revert false-success and the empirical fallback.
- Record a frontend changelog entry for the user-visible TRON quote change.

# Non-goals

- Do not read EPUSDT/GMPay receive-address books or merchant wallets.
- Do not add energy rental, paymaster, or third-party fee APIs.
- Do not change checkout amount math (`base + fee = total`) or settlement credit of the base amount.
- Do not use GitHub CI as a release prerequisite.
- Do not write credentials into source, artifacts, logs, or command output.

# Acceptance examples

- Given `triggerconstantcontract` returns `result.result=true`, `message=REVERT opcode executed`, and a small `energy_used`, the built-in estimator does not quote that energy.
- Given live `getEnergyFee=100` and `getTransactionFee=1000` after a failed simulation, the quote uses `64285` energy and `345` bandwidth and is about `6.7735` TRX.
- Given a successful `estimateenergy` `energy_required=65000`, the estimator still uses that simulated energy.
- Given every TRON RPC is rate-limited so chain parameters are unavailable, the estimator still returns `ErrNetworkFeeUnavailable`.

# Constraints and invariants

- Quotes must stay non-negative and fail closed when burn prices cannot be read.
- Empirical energy is a representative existing-USDT-holder transfer, not a new-address 2x quote.
- Evidence must identify whether energy came from simulation or the empirical constant.
- Preserve unrelated user changes outside this worktree.

# Decisions

- Reject reverted TRON simulations even when `result.result` is `true`.
- After simulation failure, use `64285` energy (existing USDT holder) times live `getEnergyFee`, plus `345` bandwidth times live `getTransactionFee`.
- Do not use gateway receive addresses as `from` or `to`.
- Ethereum/BSC/Solana keep their current estimators.

# Open questions

# Verification expectations

- `gofmt` on changed Go files and `git diff --check`.
- Focused TRON builtin estimator tests covering revert rejection, empirical fallback, successful simulation, failover, and fail-closed rate limits.
- `go test ./service -count=1` for the service package.
- Changelog entry for the user-visible TRON quote fix.
