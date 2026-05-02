# 45 — Distill L2: cheap-model titles + tags + summaries

**Goal:** when the user has a key configured and opts in, run a small model (Claude Haiku, GPT-mini class) over the local distiller's output to upgrade titles, generate 3-line summaries, propose tags, and score importance. Each call is bounded; total spend per conversation is shown up-front.

**Depends on:** 44 (local distiller), `services/llm/` provider abstraction.

## What L2 actually does

- **Title polish** for a candidate node (max 60 chars, imperative for tasks, declarative for decisions).
- **3-line summary** for long-body candidates (> 400 chars).
- **Tags** (max 5, lowercase, hyphenated) per candidate.
- **Importance score** (0–100) so the canvas can size or sort candidates.
- **Conversation title** if the chat had no title (rare for ChatGPT exports, common for pasted snippets).

L2 does **not** propose new nodes — it only enriches what the local distiller produced. This keeps the prompt tiny and the output predictable.

## Cost guardrails

- Default budget: **$0.05 per conversation**, hard-capped. The Capture Preview shows estimated tokens before the user clicks "Enrich".
- Single batched request per conversation (one prompt, one response, all candidates enriched in JSON). No per-candidate fan-out.
- Skip L2 entirely for conversations < 6 turns or < 1500 characters — local distiller is already enough.
- Cache by candidate-content hash so re-running enrich does not re-bill.

## Scope

1. New `src/services/capture/distill/cheap.ts` with `enrichCheap(candidates: DistillCandidate[]): Promise<EnrichedCandidate[]>`.
2. Builds one structured-output prompt; expects a JSON object indexed by candidate id.
3. Uses the provider abstraction; defaults to the configured "cheap" model from settings.
4. Adds a "Enrich with cheap model" button to Capture Preview (disabled if no key configured); shows estimated cost from a token counter.
5. Persists enriched fields on the in-progress capture state so the user can toggle "show enriched" / "show raw".

## Implementation

- Add a `cheapModel` setting (default: claude-haiku-4-5 or current cheap-tier model). Wire in Settings → Providers.
- Reuse `services/llm/ChatProvider` for the call. Use the structured-output / JSON-mode path; do not parse free-form prose.
- Token counting: rough char-count divided by 4 is fine for the estimate; over-budget calls error-out before sending.
- Dedup by content hash; persist hash → enriched fields in app-data so revisits hit the cache.

## Acceptance

1. With a cheap-model key configured and opt-in clicked, candidates gain crisper titles, tags, and 3-line summaries.
2. The estimated cost shown before the call matches the actual cost within ±20%.
3. Re-clicking "Enrich" on the same candidates makes zero API calls (cache hit).
4. Without a key configured, the L1 candidates are still usable; L2 button is disabled with a tooltip explaining why.
5. Hitting the budget cap shows a clear error and does not partially enrich.

## Risks

- Model output drift — pin model version per release and keep a regression fixture.
- Over-enthusiastic titles ("🚀 Revolutionary Decision: …"). Constrain via prompt; reject candidates whose titles fail validation.
- Latency on large conversations — show a "Enriching… N/M" UI and stream where the provider supports it.
