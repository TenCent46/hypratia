/**
 * Plan 49 — Cost tiering & budget tracking.
 *
 * Every LLM call (L2 / L3) is recorded here. The tracker is the single
 * source of truth for "how much have we spent this month" and "is this call
 * within budget." UI surfaces (header badge, capture preview enrich button,
 * settings) read from this same store slice.
 *
 * L1 calls (free local heuristics) never touch this module.
 */

import { useStore } from '../../store';
import { estimateCostUSD, estimateTokens, priceOf } from './prices';

export type CostTier = 'L2' | 'L3';

export type CostRecord = {
  /** ISO timestamp of when the call completed. */
  at: string;
  tier: CostTier;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
};

export type Budgets = {
  /** Hard cap for L2 spend per calendar month (UTC). 0 disables the tier. */
  L2: number;
  /** Hard cap for L3 spend per calendar month (UTC). 0 disables the tier. */
  L3: number;
};

export const DEFAULT_BUDGETS: Budgets = { L2: 5, L3: 0 };

function ymKey(iso: string): string {
  return iso.slice(0, 7); // 'YYYY-MM'
}

function thisMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Sum spend records by tier for the current calendar month. */
export function monthToDate(
  records: CostRecord[],
): Record<CostTier, number> {
  const m = thisMonthKey();
  const out: Record<CostTier, number> = { L2: 0, L3: 0 };
  for (const r of records) {
    if (ymKey(r.at) !== m) continue;
    out[r.tier] += r.costUSD;
  }
  return out;
}

/** Combined month-to-date cost across both tiers. */
export function totalMonthToDate(records: CostRecord[]): number {
  const m = monthToDate(records);
  return m.L2 + m.L3;
}

/**
 * Estimate the cost of an LLM call before sending. Caller decides whether
 * to proceed; budget guard below is the hard stop.
 */
export function estimate(
  modelId: string,
  promptText: string,
  expectedOutputTokens = 400,
): { tier: CostTier; cost: number; tokensIn: number; tokensOut: number } | null {
  const inputTokens = estimateTokens(promptText);
  const out = estimateCostUSD(modelId, inputTokens, expectedOutputTokens);
  if (!out) return null;
  return { ...out, tokensIn: inputTokens, tokensOut: expectedOutputTokens };
}

/**
 * Hard guard: would this call cause MTD spend in its tier to exceed the cap?
 * Returns `null` when the call is fine, or `{ over: true, tier, mtd, budget }`
 * when it would cross the line.
 */
export function checkBudget(
  modelId: string,
  promptText: string,
  expectedOutputTokens = 400,
):
  | null
  | { tier: CostTier; mtd: number; budget: number; estimated: number } {
  const e = estimate(modelId, promptText, expectedOutputTokens);
  if (!e) return null;
  const state = useStore.getState();
  const budget = state.settings.budgets?.[e.tier] ?? DEFAULT_BUDGETS[e.tier];
  if (budget === 0) {
    // Tier disabled entirely — caller must not invoke.
    return { tier: e.tier, mtd: 0, budget: 0, estimated: e.cost };
  }
  const mtd = monthToDate(state.settings.costRecords ?? [])[e.tier];
  if (mtd + e.cost > budget) {
    return { tier: e.tier, mtd, budget, estimated: e.cost };
  }
  return null;
}

/**
 * Record a completed call. Called by the LLM provider wrappers; consumers
 * should not call this directly.
 */
export function recordCost(input: {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}): CostRecord | null {
  const p = priceOf(input.model);
  if (!p) return null;
  const cost =
    (input.tokensIn / 1_000_000) * p.inputPerM +
    (input.tokensOut / 1_000_000) * p.outputPerM;
  const record: CostRecord = {
    at: new Date().toISOString(),
    tier: p.tier,
    provider: input.provider,
    model: input.model,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    costUSD: cost,
  };
  useStore.getState().recordCost(record);
  return record;
}
