# 49 — Cost tiering & budget UI

**Goal:** make the L1 / L2 / L3 cost story visible and enforceable. The user should always know what each action will spend and be able to cap it.

**Depends on:** 44, 45, 46.

## What to surface

- A persistent **Cost** badge in the header showing month-to-date spend (sum of L2 + L3 calls). Click → drill-down per provider / per call.
- A pre-call estimate before any L2 / L3 action: "≈ 1,820 input tokens, 320 output tokens, est. \$0.013."
- A monthly budget per tier (L2 default \$5, L3 default \$0) that must be raised explicitly.
- Hard caps are enforced at the provider call site, not just the UI.

## Scope

1. New store slice `costSlice` tracking call records: `{ at, tier, provider, model, tokensIn, tokensOut, costUSD }`.
2. New service `src/services/cost/CostTracker.ts` with `record()`, `monthToDate()`, `over budget?`.
3. Settings → Providers → Budget panel for per-tier monthly caps.
4. Pre-call estimator helper `estimate(prompt, model)` using char-count / 4 heuristics + a per-model price table.
5. Header badge component; details modal lists recent calls.
6. Capture Preview integrates: "Enrich (cheap, ~\$0.013)" button text is dynamic.

## Implementation

- Persist call records under app-data; rotate at month boundary (keep last 13 months).
- Price table lives in `src/services/cost/prices.ts`, keyed by model id, with per-1M token rates. Updated per release.
- Tracker is the single source of truth — wrap every `services/llm/` call so nothing slips past.

## Acceptance

1. Hovering the header badge shows month-to-date spend per tier.
2. Hitting an L2/L3 button shows the estimate before the call; canceling does not record.
3. Exceeding the monthly cap blocks further calls until the user raises it; existing canvases still work.
4. Estimates match actual spend within ±20% across 50 sample calls.
5. With both budgets at \$0, the app remains fully usable on L1 only.

## Risks

- Token estimation is fuzzy; under-estimates anger users when actual spend is higher. Bias toward over-estimating in the UI.
- Price drift when model prices change — surface the source price-table version in Settings → About.
- Cost UI noise: the badge should be quiet at \$0 (greyed, no number).
