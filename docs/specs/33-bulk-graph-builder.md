# 33 — Bulk Graph Builder

## Why

A user often arrives with **a lot of existing material** — a long chat
export, a research note, a meeting transcript — and wants the canvas to
show its structure as a graph instantly, instead of typing every ask
again. Spec 32 added a per-message conversation map for live chats; this
spec adds a **batch import** that turns a pasted blob into the same kind
of graph (or a concept graph for prose).

The user does not have to tell the importer what kind of input they have.
A small / fast LLM (typically a local Llama via Ollama) routes the input
to the right builder; if no light model is configured or it fails, we
fall back through a configurable chain to a heavier model. If the entire
chain fails, the heuristic path produces a reasonable default rather than
erroring out.

## Inputs and outputs

Input:

- A single text blob. May be conversation export, prose, or mixed.
- Optional: target conversation id (otherwise a new "Imported map"
  conversation is created so the imported nodes have a home).

Output:

- A batch of `CanvasNode`s and `Edge`s appended to the store, laid out
  in a fresh region of the canvas so they don't collide with existing
  content.
- A compact summary returned to the UI: `{ classifiedAs, nodeCount,
  edgeCount, modelUsed, durationMs }`.

## Architecture

```
features/graph-import/GraphImportModal      ← UI: paste / drop, run
                       │
                       ▼
services/graphBuilder/index.buildGraphFromText(input, opts)
                       │
            ┌──────────┴───────────┐
            ▼                      ▼
      router.routeInput     buildConversationGraph
       (light → fallback)    or buildProseGraph
                                   │
                                   ▼
                       layout.layoutBatch(nodes, anchorPos)
                                   │
                                   ▼
                       store.addNode / store.addEdge (batched)
```

`services/graphBuilder/` is the only place that knows the LLM-call
shape for routing and concept extraction. UI talks to it via
`buildGraphFromText`.

## Model chain

The module exposes `buildModelChain(settings, override?)` that returns
an ordered list of `ModelRef` to try, top to bottom:

1. **Light tier** — Ollama / Groq llama models, when configured.
   Picked by walking provider configs and looking for any model whose
   id matches `^(llama|qwen|phi|mistral)-?\d`. The first match wins.
2. **Cheap-cloud tier** — `gpt-4o-mini`, `gpt-4.1-mini`,
   `claude-haiku-4-5`, in this order, if a key is set for that
   provider.
3. **Heavy tier** — `settings.defaultModel`.
4. **Heuristic tier** — no model; pure regex/parsing path.

Each call site (`route`, `buildConversation`, `buildProse`) walks the
chain. On any thrown error, malformed JSON, or empty result, we move
to the next tier. The first tier that succeeds wins.

The chain is built once per `buildGraphFromText` invocation and reused
across the routing call and the builder's content calls so we don't
re-pick a model mid-run.

## Routing

`routeInput(text, chain) → 'conversation' | 'prose'`.

- Truncates to 4000 chars before sending so light models stay snappy.
- Prompt: "Decide if this is a chat / conversation transcript or a
  piece of prose. Reply with one word: `conversation` or `prose`."
- Heuristic fallback: count occurrences of `^(user|assistant|human|me)\s*[:>]`
  case-insensitive. ≥3 distinct turns → conversation; else prose.

## Conversation builder

Goal: reproduce the spec-32 theme/ask structure for the imported chat.

1. **Parse turns** — split by lines matching
   `^(?:user|human|me|q|あなた)\s*[:>]\s*` (case-insensitive). Anything
   between user markers up to the next non-user marker is the user
   turn's content (multi-line OK).
2. **Single batched LLM call** — give the chain up to 30 user turns at
   a time. Prompt asks for a JSON array, one object per input turn:
   `{ index, themeId | null, isNew, themeTitle, askSummary, themeKind,
   importance }`. The model is told to reuse a `themeId` when a turn
   continues an existing theme.
3. **Build nodes** — for each unique theme: create a `theme` root node
   with `themeId = its own id`. Then for each turn: create an `ask`
   node tagged `themeKind:ask`, edge `parent` from theme → ask. Larger
   inputs split into chunks of 30 turns; chunks share themes by passing
   the theme summaries from the previous chunk.
4. **Heuristic fallback** — if the LLM chain is exhausted, produce one
   theme root with the conversation's first sentence as title, and one
   ask child per parsed turn.

## Prose builder

Goal: extract a small concept graph from a research-style blob.

1. **Single LLM call** — input is the full text (truncated at 24 kB to
   stay under typical context budgets). Prompt asks for two arrays:
   - `concepts: [{ id: string, title: string, summary: string,
     importance: 1..5 }]` — at most 24 concepts.
   - `edges: [{ source: id, target: id, kind: 'related',
     label?: string }]`.
2. **Build nodes** — each concept becomes a `theme`-kind canvas node
   (re-using ThemeNode rendering) with `tags: ['themeKind:theme',
   'imported:prose']`. Edges are dashed `related`-kind.
3. **Heuristic fallback** — split prose into sentences, treat the
   first sentence of each paragraph as a concept title, summarize the
   rest as the body. No edges. This is intentionally minimal: the
   point is to never silently fail.

## Layout

`layoutBatch(nodes, anchorPos)`:

- Picks an empty rectangle on the canvas (rightmost existing node + 80
  px gap, or `(200, 200)` if the canvas is empty).
- Conversation graph: left-to-right columns of theme roots, vertical
  stacks of asks below each. Mirrors the live-mint layout from spec 32.
- Prose graph: a 4-wide grid for concepts, with row spacing scaled by
  importance.

## UI surface

A new modal `GraphImportModal`:

- Triggered by slash command `/import-graph` and a new canvas
  right-click item "Import to map…".
- Body: large textarea ("Paste conversation history or prose"); drag &
  drop a `.txt` / `.md` file fills the textarea.
- Footer:
  - Build button — runs `buildGraphFromText`.
  - Status line — model used + tier.
  - Close (×) in header.
- While running: button is disabled, status shows the current step.
- On success: closes modal, focuses the canvas at the first new node.
- On failure: surfaces the error inline; never throws to the host.

## Settings

`settings.graphBuilder?: { lightModel?: ModelRef }` — optional explicit
override for the light tier. When unset, the chain auto-detects.

## Hard rules

- Never block other UI: `buildGraphFromText` is async and returns a
  promise; UI shows a spinner.
- Never lose nodes on partial failure: each successfully classified
  turn / extracted concept is committed; remaining failures fall back
  to heuristic.
- Never emit malformed `Edge` rows: `source` and `target` must both
  resolve to a node added in the same batch.
- API key checks reuse `services/secrets`; no key plumbing duplicated.
- The router and builders live behind module exports; UI never imports
  `chat`/`secrets` directly.

## Acceptance

1. Pasting a chat-style block (with `User:` / `Assistant:` markers)
   produces a theme tree with ask children, identical in shape to
   what the live `mintAskNode` flow would produce for the same turns.
2. Pasting a research note produces a small concept graph (≤ 24
   concepts, dashed `related` edges).
3. With **no** API keys configured, a heuristic-built graph still
   appears.
4. With Ollama configured but no cloud key, the build runs on the
   light tier and the status line says so.
5. The pasted-content modal does not lock up the UI; ESC / × closes
   it; the build can be cancelled mid-flight.
6. Reload preserves all imported nodes and edges (uses existing
   storage).

## Out of scope (follow-ups)

- Streaming progress UI. Current cut shows "Working…" only.
- Importing from a `.zip` or whole-folder of markdown. Today: paste
  one file's text at a time.
- Embedding-based dedup of similar concepts across imports.
- Per-source-message back-references for pasted conversations (we have
  no in-app `messageId` to link to).
