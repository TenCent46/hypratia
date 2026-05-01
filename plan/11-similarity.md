# 11 — Heuristic similarity suggestions

**Goal:** "Suggest links" surfaces 3–5 likely related nodes for the selected node. Local, transparent, no embeddings.

**Depends on:** 06.

## Heuristics (`src/services/similarity/HeuristicSimilarity.ts`)

- TF-IDF over `contentMarkdown` (and `title`, weighted 2×).
- Cosine similarity between the selected node and all other nodes.
- Boosts:
  - Shared tag → +0.10 per tag.
  - Title token overlap → +0.05 per token.
- Threshold: drop suggestions below 0.15.
- Return top **3–5** above threshold.

## UI

- Button in the node inspector: "Suggest links".
- Inline list of suggestions: title, snippet, score (debug-friendly), Accept / Reject buttons.
- Accept → create an edge.
- Reject → record dismissal in-memory so the same suggestion doesn't return immediately. (Persistence later.)

## Service shape

`SimilarityService` wraps the strategy so step 12 can swap in `EmbeddingSimilarity` without touching UI code.

```ts
interface SimilarityStrategy {
  related(nodeId: ID, allNodes: CanvasNode[]): { nodeId: ID; score: number }[];
}
```

Mark the call site with:
```ts
// TODO: swap in EmbeddingSimilarity when EmbeddingProvider is real.
```

## Acceptance

- On a corpus of ~30 nodes, suggestions are obviously sensible to a human reader.
- No edges are created without an explicit accept.
- Empty inputs (no nodes, very short content) return zero suggestions, not errors.

## Risks

- Visual clutter from auto-creating edges — never auto-accept.
- TF-IDF over tiny content vectors is noisy; require a minimum content length (~30 chars) before suggesting.
- IDF over a single conversation is unstable until ~10 nodes exist; show "not enough data yet" below that.
