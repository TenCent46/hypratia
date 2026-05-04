# 31 — Chat ingest: similarity-routed parent attachment

**Goal:** when a user imports a chat (paste, ChatGPT export, or capture) whose first user question matches an existing canvas theme, the new chat's nodes hang off that **existing** theme node instead of minting a duplicate parent. Within a single import, topic switches connect to the most semantically related earlier node (parent or sibling), not unconditionally to the parent. User prompts and assistant responses are preserved as paired nodes.

**Depends on:** plan 11 (heuristic similarity / TF-IDF), plan 12 (`EmbeddingProvider` scaffolding + `CanvasNode.embedding` field), plan 16 (theme system — node kind + `themeKind:*` tag conventions). Soft dependency on plan 22 (live chat already uses `Classifier`, which we will reuse for cross-chat lookup).

## Current behavior

There are **three** ingest paths and they each build a self-contained tree. None of them looks at existing canvas nodes when deciding whether to create a new parent.

### A. Paste / ChatGPT-export → CapturePreview

`src/features/canvas/CanvasPanel.tsx:1655` parses a dropped `.json` ChatGPT export with `parseChatgptExport`, hands the picked conversation to `conversationToCaptureText` (`src/services/capture/ChatgptImporter.ts:144`), and opens `CapturePreview` with `source: 'chatgpt-export'`.

`CapturePreview.applyToCanvas` (`src/components/CapturePreview/CapturePreview.tsx:115-160`) is where the bug lives. The root is created unconditionally:

```
const root = addNode({
  conversationId: input.conversationId,
  kind: 'markdown',
  title: titleDraft.trim() || 'Pasted conversation',
  contentMarkdown: `# … \n\n${gist.slice(0, 600)}`,
  position: layout.rootPosition,
  tags: ['hypratia', 'imported'],
});
```

There is no lookup against the existing `state.nodes` to detect an existing theme with the same topic. Children are then `distillLocal`-derived candidates (decisions / tasks / questions / claims / sources from `src/services/capture/distillLocal.ts`), and every child is connected to the **freshly created** `root.id` (lines 154-158). The "user prompt + assistant response are a tight pair" idea is not modelled at all — distill candidates are extracted from individual turns by Markdown shape and lose their conversational adjacency.

### B. Graph Import Modal (`Build graph` flow)

`src/features/graph-import/GraphImportModal.tsx:64-99` calls `buildGraphFromText(trimmed, { conversationId })`.

`src/services/graphBuilder/index.ts:35-112` routes to `buildConversationGraph` or `buildProseGraph`. For chat-shaped input, `buildConversationGraph` (`src/services/graphBuilder/conversation.ts:169-234`):

1. Parses turns via `parseTurns` (line 35) — user/assistant role markers only.
2. Chunks user turns of size 30 and asks the LLM to assign each chunk a `themeId` reusable across chunks within this call (line 189-211).
3. Mints one `theme` root per unique `themeId` (line 217-220) and one `ask`/`insight`/`decision` child per user turn (line 221-232).

The classifier prompt (`SYSTEM_PROMPT` lines 17-27) only knows about themes "this batch already produced" via the `priorThemes` parameter (line 84-87). `priorThemes` is seeded from `themesAcc`, which is **a local Map initialised inside `buildConversationGraph`** (line 188). Existing canvas nodes are never passed in. Result: every import gets its own brand-new theme roots, even when the user has imported the same topic before.

`buildGraphFromText` then commits via `useStore.getState().addNode(...)` (line 70-76) and sets `themeId: themeRootId` only on the just-created in-batch root — same-batch only.

### C. Live chat (`mintAskNode` in `useChatStream`)

`src/features/chat/useChatStream.ts:107-179` does the right shape but only **within one conversation**. `themeRoots` (line 116-121) filters `state.nodes` by `n.conversationId === conversationId`, so the classifier's `recentThemes` list is scoped to the active chat only. The LLMClassifier prompt (`src/services/themes/Classifier.ts:79-129`) feeds the model `id=…` per recent theme so it can return `themeId` to attach to. This is the only place in the codebase where the classifier is given existing nodes — and it is only ever called from live chat, not from any of the import paths above.

### D. Embeddings

`CanvasNode.embedding?: number[]` is declared in `src/types/index.ts:123` but **never written anywhere**. `MockEmbeddingProvider` (`src/services/embeddings/MockEmbeddingProvider.ts:13`) is defined but instantiated nowhere. `SimilarityService` (`src/services/similarity/SimilarityService.ts:1-25`) has a `'embedding'` strategy that comments `// TODO: implement when embeddings are real. Falls back to heuristic.` and routes through `suggestRelated` regardless. `suggestRelated` (`src/services/similarity/HeuristicSimilarity.ts:73-123`) returns top-k related nodes for an existing `nodeId`; it is the wrong shape for "score a candidate text against the canvas" (it requires the candidate to already be a node in `allNodes`). Sidecar metadata reserves `embedding_ref` (`src/services/sidecar/schema.ts:74-75`) and `CanvasAutosaveCore.ts:17` already lists `embedding` among per-node fields it persists, so the storage path is ready when we start writing them.

### E. Round-trip summary

| Path | Looks at existing canvas nodes? | Picks among existing themes? |
|---|---|---|
| CapturePreview (paste / ChatGPT export) | no | no — always mints a new `markdown` root |
| GraphImportModal → `buildConversationGraph` | no | no — themes scoped to current import only |
| `mintAskNode` (live chat) | yes (same conversation only) | yes, via `LLMClassifier.recentThemes` |

The user's reported bug 「同じ内容と判定された議題に対して、同じノードから出してくれず、別の親ノードを作ってしまう」 maps directly onto path A and path B: neither consults existing nodes before creating a parent.

## Gaps

1. **No cross-import parent dedup.** `CapturePreview.applyToCanvas` (`src/components/CapturePreview/CapturePreview.tsx:129-138`) creates `root` unconditionally — no lookup against `useStore.getState().nodes`. Same gap in `buildGraphFromText` (`src/services/graphBuilder/index.ts:67-83`) which commits all `staged.nodes` straight from the staged graph without rewriting `theme`-kind roots to point at an existing root.
2. **No similarity routing inside an import.** `buildConversationGraph` (`src/services/graphBuilder/conversation.ts:221-232`) connects every classified turn to its theme **root** via a `parent` edge. It does not consider attaching to a sibling that's already in the same theme even when the new turn is closer to a sibling than to the root. The `prose.ts:149-160` path emits free-form `related` edges from the LLM but for chat input this branch does not run.
3. **Embeddings are typed but never computed.** `CanvasNode.embedding` is declared (`src/types/index.ts:123`) but no path in `addNode` (`src/store/index.ts:903-909`) or any ingest commit writes it. `MockEmbeddingProvider` exists; no real provider exists; nothing calls `embed()`.
4. **`SimilarityService` has the wrong shape for ingest.** `similarityService.related(nodeId, allNodes)` (`src/services/similarity/SimilarityService.ts:15`) operates on a node that is already in the list. We need a "score this candidate text against all canvas nodes" entry point.
5. **User prompt and assistant response are not paired.** `CapturePreview.applyToCanvas` only emits one node per accepted distill candidate; the user prompt that produced an assistant insight is dropped entirely. `buildConversationGraph` keeps user turns but never emits the assistant body — the assistant context is sent to the LLM but never landed on the canvas.
6. **The "first question = parent, full assistant response inside the parent" rule is not honored.** In `conversation.ts:236-250` `themeRootNode` stores the theme **title** as the body (`contentMarkdown: trimTo(summary, 80)`). Assistant content is discarded.
7. **Topic switches always re-attach to the parent root.** `conversation.ts:227-231` writes `parent` edges from `themeIndex` regardless of which earlier user turn the new turn is closest to. The desired algorithm is "attach to the most related existing node, which may be the root or any earlier sibling."
8. **Live chat is the only path with the right pattern.** `useChatStream.ts:116-179` is the only place that uses `pickClassifier` + recent themes. The import paths bypass it entirely. Either we promote the live-chat pattern into a shared service, or we add cross-conversation lookup to it.

## Target algorithm

Three-way routing decision at parent level (`attach` / `suggest` / `new-root`), and a two-way decision at child level (`attach` / `new-root`). The asymmetry is on purpose: wrong merges are worse than duplicate roots — a duplicate root the user can merge later, a wrong merge distorts their memory map. So parent-level routing has a "I'm not sure, present this as a suggestion" rung that child-level routing does not need.

### Decision shape

```
type RouteDecision =
  | {
      kind: 'attach'
      nodeId: ID
      confidence: number
      reason:
        | 'high-confidence-parent-match'   // score >= PARENT_AUTO_ATTACH_THRESHOLD, same project
        | 'same-conversation-parent-match' // matched root in the same conversation (always silent)
        | 'sibling-match'                  // child-level within-import match
    }
  | {
      kind: 'suggest'
      nodeId: ID
      confidence: number
      reason:
        | 'possible-parent-match'          // PARENT_SUGGEST_THRESHOLD <= score < PARENT_AUTO_ATTACH_THRESHOLD
        | 'cross-project-match'            // any score, candidate lives in a different project
        | 'below-auto-attach-threshold'
    }
  | {
      kind: 'new-root'
      reason:
        | 'no-candidates'
        | 'no-safe-match'
        | 'embedding-unavailable'
        | 'classifier-unavailable'
    }
```

### Step 1 — Resolve the parent (cross-chat dedup)

Given the **first user turn** of the import (or, for prose-only input, the first detected theme), score it against existing theme roots. A node qualifies as a theme root when `kind === 'theme'` AND `tags.includes('themeKind:theme')`.

```
candidates = nodes.filter(isThemeRoot)
scored     = score(candidates, firstTurn)        // embedding cosine OR classifier OR token-overlap fallback
best       = pickBest(scored)                    // tie-break order below

if !best
  return { kind: 'new-root', reason: 'no-candidates' }

if best.crossProject(activeProjectId)
  // never silently create cross-project parent edges
  return { kind: 'suggest', nodeId: best.id, confidence: best.score, reason: 'cross-project-match' }

if best.score >= PARENT_AUTO_ATTACH_THRESHOLD                // 0.90
  return { kind: 'attach', nodeId: best.id, confidence: best.score, reason: 'high-confidence-parent-match' }

if best.score >= PARENT_SUGGEST_THRESHOLD                    // 0.82
  return { kind: 'suggest', nodeId: best.id, confidence: best.score, reason: 'possible-parent-match' }

return { kind: 'new-root', reason: 'no-safe-match' }
```

Same-conversation matches are a special case: even at scores 0.82–0.90, attaching is silent (no toast, no suggestion UI), because the user's mental model inside one conversation is "this turn belongs with the previous theme of this same chat." The router returns `{ kind: 'attach', reason: 'same-conversation-parent-match' }` for that case.

The new root, when created, stores:
- `title` = sentence-cased trimmed first user turn (≤60 chars).
- `contentMarkdown` = the **full assistant response** to that first turn.
- `themeId` = its own id (matches the convention used by `useChatStream.ts:153`).
- `embedding` = the computed `eParent`.
- `tags` = `['themeKind:theme', 'imported:conversation']`.

Tie-break when several candidates score above the relevant threshold:
1. Higher score wins.
2. On a tie, prefer the most recent `updatedAt`.
3. On a further tie, prefer roots in the same project, then in the same conversation.
4. Hard ceiling: never silently merge into a candidate whose `score < 0.95` if its title and the new title share zero non-stopword tokens — a safety belt against embedding hallucinations on short titles. Drops to `suggest` (or `new-root` if the candidate was already in the suggest band).

### Attach UX

When the router returns `{ kind: 'attach', reason: 'high-confidence-parent-match' }`, the import paths show a toast:

```
Linked to existing topic: "{title}"   [Undo]
```

Undo reverses **only** the auto-attachment — it converts the new ask's `parent` edge to point at a freshly-created theme root carrying the original first-turn content. The import's child nodes are kept; only the parent decision is rewound.

`same-conversation-parent-match` is silent (no toast).

`suggest` does not change the structural shape of the import (a new root is still created). It is surfaced separately as a "related topic" affordance — UI deferred, but the router decision must already carry the candidate id so the consumer can render it.

`cross-project-match` is **always** `suggest`, never `attach`. A user shuffling notes between projects depends on project boundaries staying intact.

### Step 2 — Within-import topic routing

Walk the chat in order. For each user turn after the first:

```
classify topicSwitch via LLMClassifier (reuse src/services/themes/Classifier.ts)
if not topicSwitch:
  attachTo = previousAskNodeId           // tight pair: this user turn + prior ask
else:
  // SCOPE: the parent root + every node already created in THIS import
  candidates = [parentRootId, ...nodesCreatedInThisImport]
  scored = candidates.map(c => cosine(eTurn, c.embedding))
  best = scored.sort(desc)[0]
  attachTo = best.score >= SIBLING_MATCH_THRESHOLD ? best.id : parentRootId
```

`SIBLING_MATCH_THRESHOLD` starts at 0.78 (looser than parent dedup because we already know we are in the right theme cluster). All thresholds live in one constants file so the user-visible tuning surface is one place.

### Step 3 — User-prompt / assistant-response pairs

For each user turn we emit two linked nodes:

```
ask  = addNode({ kind: 'theme', themeKind: 'ask',     title: askSummary, contentMarkdown: userTurnFull })
ans  = addNode({ kind: 'theme', themeKind: 'insight', title: ansSummary, contentMarkdown: assistantTurnFull })
addEdge({ source: attachTo, target: ask, kind: 'parent' })
addEdge({ source: ask,      target: ans, kind: 'related', label: 'reply' })
```

The `ask`'s `themeId` is `parentRootId` so the existing cluster machinery (`CanvasPanel.tsx:2195` "select-theme-cluster" walker) keeps working. The `ans` shares `themeId` with the `ask`; double-click on the parent root selects everything beneath it.

### Step 4 — Cross-chat dedup at parent level only (deliberate)

This is the design's load-bearing decision. **Cross-chat dedup happens at the parent/root level only.** When the parent matches an existing root, child turns of the new chat are still emitted as fresh nodes — they are NEVER folded into the existing root's pre-existing siblings.

The principle: the feature preserves the time-structure of conversations while finding the right semantic parent. A chat is a session; sessions matter as units. Folding new asks into pre-existing siblings would:
1. Make turn order ambiguous ("which chat did this ask come from?").
2. Erase the narrative evidence the user relies on ("the September session went like this, then the November session picked it up here").
3. Couple two chats' undo histories.

So children inside a single import route only against the parent root + nodes already created in THIS import (Step 2). They never look at old siblings from previous chats. The attach decision applies to the root level only; everything below the root is fresh.

Existing siblings can still be discovered as suggested *related* links once the new ask has an embedding — that's the existing `SimilarityService.related` flow and is out of scope here.

### Step 5 — Fallback when embeddings are unavailable

The pipeline must remain functional when no `EmbeddingProvider` is configured (the only one today is the deterministic mock, which is not semantically meaningful). Fallback chain, applied per match attempt:

1. **Real embedding provider available** → cosine on `node.embedding`. Lazily compute and persist `embedding` on any candidate node that doesn't have one yet.
2. **No embedding provider** → reuse `LLMClassifier` (`src/services/themes/Classifier.ts:93-129`) but feed it **all theme roots in the active project** instead of just the active conversation. Returned `themeId` (when a string id of an existing root) is the dedup signal.
3. **No LLM key either** → token-overlap heuristic on titles + tags (subset of the boost rules in `HeuristicSimilarity.ts:103-117`). Threshold tuned conservatively (require ≥3 shared non-stopword tokens or ≥0.6 Jaccard on the title bigram set) so we err on the side of *creating* a new root rather than *merging* — wrong-merge is the more painful error to undo.

## Implementation steps

Each step is sized to land as one PR. Steps 1-3 are pure refactors; steps 4-6 add new behavior. Step 7 wires the live-chat path through the same plumbing so we have one rule, not two.

### Step 1 — Extract shared `IngestRouter` service (refactor, no behavior change)

New file: `src/services/ingestRouting/IngestRouter.ts`. Pure module exposing:

```
type RouteDecision =
  | { kind: 'attach'; nodeId: ID; reason: 'parent-match' | 'sibling-match' }
  | { kind: 'new-root' };

routeParent(input: { firstTurn: string; conversationId: ID; projectId?: ID }): Promise<RouteDecision>
routeChild(input: { turn: string; parentRootId: ID; importedSoFar: ID[] }): Promise<RouteDecision>
```

The first cut delegates to `LLMClassifier` (path 2 of the fallback chain). No embeddings yet. Move the classifier seam used by `useChatStream.ts:122` behind this router. Tests: snapshot of decisions on a fixture export. Acceptance: live chat behaviour unchanged.

### Step 2 — Reroute Capture path through `IngestRouter`

Modify `src/components/CapturePreview/CapturePreview.tsx:115-160` so `applyToCanvas`:

1. Calls `IngestRouter.routeParent` with the first user turn (or, for headed prose, the first H1 line + body).
2. Branches on the decision:
   - `attach` → look up the existing node and use it as `root`. Skip `addNode` for the root. Show toast `Linked to existing topic: "{title}"` with Undo (unless `reason === 'same-conversation-parent-match'`, which stays silent).
   - `suggest` → create a new root as usual but record the suggested existing-node id on the new root's frontmatter (`relatedSuggestion: { nodeId, confidence }`). UI surface deferred.
   - `new-root` → create a new root.
3. From this step on, all newly-imported parent roots use `kind: 'theme'` with `tags: ['themeKind:theme', 'imported:conversation']`. There is no migration for existing `kind: 'markdown'` capture roots — see Open Question #5; legacy capture data is treated as not worth preserving and the router simply ignores it for matching.

Acceptance: importing the same first-turn text twice produces one root with two child-turn clusters underneath, plus a "Linked to existing topic" toast on the second import.

### Step 3 — Reroute GraphImport path through `IngestRouter`

In `src/services/graphBuilder/index.ts:67-99`, before the commit loop:

1. For each `staged.nodes[i]` where `tags.includes('themeKind:theme')`, call `IngestRouter.routeParent` with the node's title + first-line summary.
2. If the router returns `{ kind: 'attach', nodeId }`:
   - Skip the `addNode` for that staged root.
   - Record `idByIndex[i] = nodeId` (so child edges land on the existing root).
   - When patching `themeId` for asks (line 86-90), use the existing root's id.
3. Otherwise commit normally.

Also extend `buildConversationGraph` to pass **existing canvas theme roots in the active project** into the chunked classifier's `priorThemes` (`conversation.ts:191`). This is the in-LLM dedup signal for the all-LLM path. Cap the list at the 16 most recently updated to bound prompt size.

Acceptance: build-graph against a chat about "X" twice — second build extends the existing X cluster.

### Step 4 — Wire user/assistant pairing in `buildConversationGraph`

Replace the current "one ask child per user turn" emission (`conversation.ts:221-232`) with the pairing rule: per user turn, emit one `themeKind:ask` node carrying the user turn body and one `themeKind:insight` node carrying the assistant turn body (truncated to a sane cap, e.g. 4 KB; full text saved to the vault as a sidecar `.md` if longer). Edge shape:

```
parent — root → ask
related (label: 'reply') — ask → insight
```

The first ask of a freshly-minted theme root is special: instead of a separate ask node, the **root itself** carries the first user turn body in `contentMarkdown`, matching the user's stated rule "parent node = first user question, full assistant response inside the parent." Concretely, the staged graph collapses (root, ask₀, insight₀) into (root with title=askSummary, contentMarkdown=assistantFullResponse). Subsequent user turns are pairs.

This also fixes the gap where `themeRootNode` (`conversation.ts:236-250`) stores only the title in `contentMarkdown`.

### Step 5 — Add `EmbeddingProvider` wiring (real provider deferred, but the seam works)

Add `embeddingProvider` singleton in `src/services/embeddings/index.ts`. Default: `MockEmbeddingProvider`. Settings field `embeddings.provider: 'mock' | 'off'` with default `'off'` so no compute happens unless the user opts in.

In `IngestRouter.routeParent` and `routeChild`, when `embeddings.provider !== 'off'`:
1. Compute `embed(candidateText)` once.
2. Walk candidates; for any candidate without `node.embedding`, lazily compute and persist via `useStore.getState().updateNode(id, { embedding })`.
3. Compare via cosine; the comparison helper lives in `src/services/embeddings/cosine.ts` (small, pure, easy to test).

The real `OnnxEmbeddingProvider` is a separate plan (12.1, not in scope here). With provider=`off` the router still works via the LLM-classifier fallback from Step 1.

Acceptance: with `embeddings.provider = 'mock'`, two imports about the same topic still attach because the mock is deterministic — even though the mock is not semantically accurate, this proves the wiring is correct. Real semantic dedup waits for a real provider.

### Step 6 — Threshold + tie-break constants module

New `src/services/ingestRouting/thresholds.ts`:

```
PARENT_AUTO_ATTACH_THRESHOLD = 0.90   // score >= 0.90, same project → silent attach + undo toast
PARENT_SUGGEST_THRESHOLD     = 0.82   // 0.82 <= score < 0.90 → suggest, do not structurally attach
SIBLING_MATCH_THRESHOLD      = 0.78   // within-import routing of child turns
SAFETY_TOKEN_OVERLAP_REQUIRED_BELOW = 0.95   // below this, require ≥1 shared non-stopword token in titles
LLM_FALLBACK_TOPK            = 16     // max recent roots fed to the LLM classifier
HEURISTIC_TOKEN_OVERLAP_MIN  = 3      // shared non-stopword tokens for the no-LLM, no-embedding path
```

Reasoning recap:
- 0.90 vs 0.82 split: high confidence merges silently (with undo); medium confidence is shown as a suggestion the user can act on or dismiss. Wrong-merge is the more painful failure mode, so we prefer extra duplicate roots over silent incorrect attachment.
- Cross-project candidates downgrade to `suggest` regardless of score.
- 0.78 child threshold is intentionally looser — we already know we are in the right cluster, so within-import routing has cheaper failure modes (a sibling attached to the root instead of a more-related sibling — visible at a glance, easy to drag).

Expose them in Settings → Advanced (collapsed by default) so power users can tune. Persist via the existing settings store.

### Step 7 — Promote `useChatStream.mintAskNode` to use `IngestRouter`

Replace `useChatStream.ts:107-179` calls into `pickClassifier` with calls into `IngestRouter.routeParent` / `routeChild`. The classifier still runs underneath — this is just funnelling all four ingest paths through one decision module. Net effect: the live chat picks up cross-conversation parent dedup for free, and we only have one tuning surface for the rest of the project's lifetime.

Acceptance: a user types a message about "X" in conversation A; later, in conversation B, types about "X." The new ask in B attaches under the existing X theme root in A (which, importantly, the user can reposition). A toast / quiet badge shows "Linked to existing topic" so the user can undo.

## Open questions

1. **Cross-conversation attachment UX — RESOLVED.** No confirmation modal. The router returns one of three decisions: `attach` (high confidence ≥ 0.90, silent merge with toast + Undo), `suggest` (medium confidence 0.82 – 0.90, surface as a suggested relation but still create a new root), or `new-root` (no safe match). Cross-project candidates can never be `attach` — they downgrade to `suggest` regardless of score. Same-conversation matches stay silent (no toast). Undo reverses only the auto-attachment decision; imported content is preserved.
2. **What counts as the "first question" in a non-conversation paste?** Step 1 of the algorithm specifies "first detected theme" as fallback. The current heuristic (`prose.ts:104-121`) splits by paragraph — fine, but for a Markdown note with an H1, the H1 should win. We pick `firstNonEmptyHeadline ?? firstSentence`; this needs validation against real research notes.
3. **Embedding cache invalidation.** When a user edits a node's `contentMarkdown` in `MarkdownNode` or `ThemeNode`, do we recompute `embedding`? Naive answer: clear it on edit, recompute lazily next time it's queried. Risk: thrash on long edits. Mitigation: debounce 5 s after the last edit before clearing.
4. **Does the parent-match check run on prose imports too?** The plan above only specifies it for chat-shaped input. Prose inputs already produce `themeKind:theme` nodes (`prose.ts:138-146`); the router would naturally apply. Verify this doesn't cause unwanted merges between a research note and a chat that happen to share keywords. Suggested guard: the threshold for prose-vs-chat cross-merge is +0.05 stricter than chat-vs-chat.
5. **Existing `kind: 'markdown'` capture roots — RESOLVED.** No migration. No lazy upgrade. There is no meaningful legacy capture-import data to preserve, and the cost of a migration path (and the matching `isLegacyCaptureRoot` predicate, retro-tag rewrites, etc.) is not worth it. From now on, all imported chat/capture parent roots are created as `kind: 'theme'` with `tags: ['themeKind:theme', 'imported:conversation']`. The router treats only proper theme roots as parent-match candidates; legacy markdown roots never participate in parent dedup and the user can delete or replace them by hand.
6. **Performance ceiling.** For the parent-match query we walk all theme roots in the project. A user with 5 years of imports might have 2k roots. A linear cosine over `dim=384` (the typical real-provider size) is ~750 K floats — fine for one ingest call. We do not need an HNSW index until users report visible latency.
7. **`SimilarityService` API change.** The current `related(nodeId, allNodes)` shape is wrong for ingest. Either (a) add `scoreText(text, allNodes): Suggestion[]` to `SimilarityService`, or (b) keep the ingest cosine logic inside `IngestRouter` and leave the existing API alone. The plan above leans toward (b) to keep blast radius small; revisit when the real embedding provider lands.
8. **What does "topic switch" mean concretely for Step 2?** Today `LLMClassifier` returns a `themeId` per turn — same id ⇒ same topic. We can take that signal verbatim. If we drop the LLM (pure-embedding mode), we need a definition: cosine between turn `i` and turn `i-1` falls below 0.5 ⇒ switch. Tunable in `thresholds.ts`.
9. **Undo.** Cross-chat attachment must be undoable in one Cmd-Z. The store's undo stack today (`store/index.ts:986`) records `add-node` and `add-edge`. A "linked to existing root" decision is materially `add-edge + add-node` for the new ask, with no node change to the existing root — so undo already works, but we should bundle it as a single undo entry to match the user's mental "undo this import" expectation.
