# Threshold Recharge Discount Implementation Plan

Goal: Approved threshold discount campaigns with frozen order settlement.
Architecture: Extend existing campaign config, reuse payment adapters and wallet UI. Preserve legacy orders without snapshot and retain gift campaign defaults.
Tech Stack: Go/GORM/decimal, React/TypeScript/Bun.

- [x] Model: test thresholds100/.9 and500/.8;99=>1,100..499=>.9,>=500=>.8; inactive restores fallback. Add mode/rate validation, finite bounds, no gifts in discount mode.
- [x] Model: add order campaign snapshot and credited quota; Insert freezes gifts for new ordinary orders; legacy DB.Create fixtures remain legacy. Test switching campaign after Insert and duplicate settlement. Use CampaignSnapshot to distinguish legacy.
- [x] Controller: adapt quote and checkout together, preserve quote snapshot across provider call. Exclude agent prepay/groupbuy/fixed products. Stripe actual price must agree, not just UI estimate.
- [x] Frontend: admin mode/rate fields, threshold public buttons/banner, seven-language keys via sanctioned script, changelog; test save payload and display.
- [x] Verify: go test ./model ./controller then root vet/build/test; bun check -b, focused frontend tests, changed lint, build; inspect final diff and browser interaction.

Ownership: primary completed all code and validation after GPT-6 Luna worker transports repeatedly failed with HTTP502; no agent result treated as independent review. User approved design in docs/superpowers/specs/2026-11-11-recharge-discount-design.md. Local implementation only.