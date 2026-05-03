/**
 * Plan 49 — model price table. USD per 1M tokens.
 *
 * Maintained per release. Prices drift; the version below is logged in
 * Settings → About so users can see how stale the table is. Never used to
 * bill anyone — only to estimate / track local spend in `CostTracker`.
 */

export const PRICE_TABLE_VERSION = '2026-05-02';

export type ModelPricing = {
  /** Match by exact id or `model.startsWith(prefix)`. First hit wins. */
  match: string;
  /** Marketing tier — drives the L1/L2/L3 budget bucket. */
  tier: 'L2' | 'L3';
  /** USD per 1M input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
};

/**
 * Order matters — more specific prefixes first. The matcher is a simple
 * `startsWith`, so "claude-opus-4-7" beats "claude" only when listed earlier.
 */
export const PRICE_TABLE: ModelPricing[] = [
  // --- Anthropic ---
  { match: 'claude-opus-4-7', tier: 'L3', inputPerM: 15, outputPerM: 75 },
  { match: 'claude-opus-4-6', tier: 'L3', inputPerM: 15, outputPerM: 75 },
  { match: 'claude-opus', tier: 'L3', inputPerM: 15, outputPerM: 75 },
  { match: 'claude-sonnet-4-6', tier: 'L3', inputPerM: 3, outputPerM: 15 },
  { match: 'claude-sonnet', tier: 'L3', inputPerM: 3, outputPerM: 15 },
  { match: 'claude-haiku-4-5', tier: 'L2', inputPerM: 1, outputPerM: 5 },
  { match: 'claude-haiku', tier: 'L2', inputPerM: 1, outputPerM: 5 },
  // --- OpenAI ---
  { match: 'gpt-4o-mini', tier: 'L2', inputPerM: 0.15, outputPerM: 0.6 },
  { match: 'gpt-4o', tier: 'L3', inputPerM: 2.5, outputPerM: 10 },
  { match: 'gpt-4.1-mini', tier: 'L2', inputPerM: 0.4, outputPerM: 1.6 },
  { match: 'gpt-4.1', tier: 'L3', inputPerM: 2, outputPerM: 8 },
  { match: 'gpt-5', tier: 'L3', inputPerM: 5, outputPerM: 20 },
  // --- Google ---
  { match: 'gemini-1.5-flash', tier: 'L2', inputPerM: 0.075, outputPerM: 0.3 },
  { match: 'gemini-1.5-pro', tier: 'L3', inputPerM: 1.25, outputPerM: 5 },
  { match: 'gemini-2.0-flash', tier: 'L2', inputPerM: 0.1, outputPerM: 0.4 },
  { match: 'gemini-2.5-pro', tier: 'L3', inputPerM: 1.5, outputPerM: 6 },
  // --- Mistral / Groq / others fallthrough as cheap (rough) ---
];

export function priceOf(modelId: string): ModelPricing | null {
  for (const row of PRICE_TABLE) {
    if (modelId === row.match || modelId.startsWith(row.match)) return row;
  }
  return null;
}

/** Rough char-count divided by 4 token estimator. Bias high so estimates don't lie. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

export function estimateCostUSD(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): { tier: 'L2' | 'L3'; cost: number } | null {
  const p = priceOf(modelId);
  if (!p) return null;
  const cost = (inputTokens / 1_000_000) * p.inputPerM + (outputTokens / 1_000_000) * p.outputPerM;
  return { tier: p.tier, cost };
}
