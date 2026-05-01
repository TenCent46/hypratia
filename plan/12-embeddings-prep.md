# 12 — Embedding provider scaffolding (mock only)

**Goal:** prepare the seam without shipping a model. No cloud calls, no large download, no broken features.

**Depends on:** 11.

## Interface

```ts
// src/services/embeddings/EmbeddingProvider.ts
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  dim(): number;
  name(): string;
}
```

## Mock

`MockEmbeddingProvider.ts` — deterministic hash-based pseudo-vector. Useful only for tests and wiring.

## SimilarityService

Wrap `HeuristicSimilarity` (default) and a future `EmbeddingSimilarity` behind one strategy interface from step 11. Configurable via a settings field; default = heuristic.

## Schema

`CanvasNode.embedding?: number[]` already exists. Leave optional. **Don't** compute or store anything in this step.

## Future-proofing comments

Drop these at the future model load site:
```ts
// TODO: ONNX Runtime Web + sentence-transformers MiniLM via WebGPU
// TODO: transformers.js as a fallback for CPU
// Persist embeddings on the node so we don't recompute on every load.
```

## Acceptance

- `pnpm tsc --noEmit` clean.
- Existing search and graph features unchanged.
- Swapping the strategy at runtime works (heuristic ↔ mock embedding) without UI changes.

## Risks

- Scope creep into actually downloading a model. Resist. Tier 2.
- Premature embedding storage — leave the field optional; don't write zeros.
