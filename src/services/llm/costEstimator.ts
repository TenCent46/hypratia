import type { ProviderId } from '../../types';
import { getModelMeta } from './providers';

export type ExtendedUsage = {
  input: number;
  output: number;
  cachedInput?: number;
};

export function estimateUsdFromTokens(
  provider: ProviderId,
  model: string,
  usage: ExtendedUsage | undefined,
): number | null {
  if (!usage) return null;
  const meta = getModelMeta(provider, model);
  if (!meta) {
    if (provider === 'ollama') return 0;
    return null;
  }
  const inputRate = meta.inputUsdPer1M;
  const outputRate = meta.outputUsdPer1M;
  if (typeof inputRate !== 'number' || typeof outputRate !== 'number') {
    return null;
  }
  const cached = usage.cachedInput ?? 0;
  const fresh = Math.max(0, usage.input - cached);
  const cachedRate = meta.cachedInputUsdPer1M ?? inputRate;
  return (
    (fresh / 1_000_000) * inputRate +
    (cached / 1_000_000) * cachedRate +
    (usage.output / 1_000_000) * outputRate
  );
}

export function approxTokens(text: string): number {
  // ~4 chars/token rough estimate
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateUsdForRequest(
  provider: ProviderId,
  model: string,
  inputText: string,
  estimatedOutputTokens = 256,
): number | null {
  const meta = getModelMeta(provider, model);
  if (!meta) return provider === 'ollama' ? 0 : null;
  const inputRate = meta.inputUsdPer1M;
  const outputRate = meta.outputUsdPer1M;
  if (typeof inputRate !== 'number' || typeof outputRate !== 'number') {
    return null;
  }
  return (
    (approxTokens(inputText) / 1_000_000) * inputRate +
    (estimatedOutputTokens / 1_000_000) * outputRate
  );
}

export function formatUsd(usd: number): string {
  if (usd === 0) return 'free';
  if (usd < 0.001) return '<$0.001';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
