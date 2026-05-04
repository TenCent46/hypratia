/**
 * Pure cosine helpers used by the chat-ingest similarity router (plan/v1/31
 * Step 5). Kept separate from the EmbeddingProvider interface so this file
 * is trivially testable from a node check script — no Tauri, no fetch.
 */

/**
 * Cosine similarity in `[-1, 1]`. Returns `0` for empty / mismatched vectors
 * rather than throwing — call sites treat 0 as "no similarity signal" and
 * fall through to the new-root path, which is the safe behaviour.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b) return 0;
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Normalise a cosine score from `[-1, 1]` into `[0, 1]` so it composes
 * with the IngestRouter thresholds (which are expressed in `[0, 1]`).
 * Negative cosines clamp to 0 — anti-correlated topics aren't a "match
 * signal" any more than uncorrelated ones.
 */
export function cosineToScore(cosine: number): number {
  if (!Number.isFinite(cosine)) return 0;
  if (cosine <= 0) return 0;
  if (cosine >= 1) return 1;
  return cosine;
}
