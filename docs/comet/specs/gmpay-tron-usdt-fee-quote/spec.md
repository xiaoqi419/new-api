# GMPay TRON USDT fee quote

## Behavior

The built-in GMPay network-fee estimator quotes a TRON USDT TRC-20 transfer using the canonical mainnet contract `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`.

A TRON simulation is valid only when execution succeeded. The estimator MUST reject payloads that report any of:

- `result.result` boolean `false`
- `result.code` equal to `CONTRACT_VALIDATE_ERROR`
- `result.message` containing `REVERT` (case-insensitive)
- `transaction.ret[].ret` equal to `FAILED`

A positive `energy_used` or `energy_required` on a rejected payload MUST NOT become a quote.

When a valid simulation returns a positive energy value, the estimator MUST use that energy. When simulation is unusable but `wallet/getchainparameters` returned valid `getEnergyFee` and `getTransactionFee`, the estimator MUST quote the representative existing-holder constants `64285` energy and `345` bandwidth:

`native_sun = 64285 × getEnergyFee + 345 × getTransactionFee`

If chain burn prices cannot be read from any whitelisted RPC, the estimator MUST return `ErrNetworkFeeUnavailable` rather than inventing prices.

Successful simulation evidence names the simulation method. Empirical fallback evidence names the empirical energy source. Ethereum, BSC, and Solana estimators are unchanged.

## Acceptance criteria

1. A `triggerconstantcontract` body with `result.result=true`, `message=REVERT opcode executed`, `energy_used=8624`, and `ret=FAILED` does not produce a quote from `8624` energy.
2. After that rejected simulation, with `getEnergyFee=100` and `getTransactionFee=1000`, the built-in estimator returns a non-negative quote whose energy evidence is `64285` and native amount is `6.7735` TRX.
3. A successful `estimateenergy` response with `energy_required=65000` still produces a quote from `65000` energy.
4. When every whitelisted TRON RPC is rate-limited, the estimator returns `ErrNetworkFeeUnavailable`.
5. Existing TRON failover tests that recover a valid simulation on a later RPC still pass.

## Non-functional constraints

- Do not read payment-gateway wallet lists or merchant keys.
- Do not add energy-rental or third-party quote vendors.
- Do not use GitHub CI as a release prerequisite.
- Do not record credentials in source, artifacts, logs, or command output.
