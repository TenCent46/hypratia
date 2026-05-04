/**
 * Embedding provider seam (plan/v1/31 Step 5).
 *
 * The provider singleton is selected by `Settings.embeddings.provider`:
 *   - `'off'`    → `null`. Callers must fall back to non-embedding scoring
 *                  (token overlap heuristic / LLM classifier).
 *   - `'mock'`   → `MockEmbeddingProvider`. Deterministic 64-d hash —
 *                  not semantically accurate, only useful for proving the
 *                  wiring works end-to-end. Two calls with the same input
 *                  return identical vectors so dedup tests are stable.
 *
 * Real providers (e.g. ONNX MiniLM) land in a follow-up plan; the seam is
 * shaped here so adding one is a single switch case + a settings option.
 */

import { MockEmbeddingProvider } from './MockEmbeddingProvider.ts';
import type { EmbeddingProvider } from './EmbeddingProvider.ts';
import type { EmbeddingProviderId } from '../../types';

export { cosineSimilarity, cosineToScore } from './cosine.ts';
export type { EmbeddingProvider } from './EmbeddingProvider.ts';

let cached: { id: EmbeddingProviderId; provider: EmbeddingProvider } | null =
  null;

/**
 * Resolve the configured embedding provider, or `null` when the user
 * hasn't opted in. Memoised — switching providers via Settings calls
 * {@link resetEmbeddingProviderCache} so the next call rebuilds.
 */
export function getEmbeddingProvider(
  id: EmbeddingProviderId,
): EmbeddingProvider | null {
  if (id === 'off') {
    cached = null;
    return null;
  }
  if (cached && cached.id === id) return cached.provider;
  if (id === 'mock') {
    const provider = new MockEmbeddingProvider();
    cached = { id, provider };
    return provider;
  }
  // Future providers (e.g. 'onnx-minilm') land here.
  cached = null;
  return null;
}

/** Drop the memoised provider so the next `getEmbeddingProvider` rebuilds. */
export function resetEmbeddingProviderCache(): void {
  cached = null;
}
