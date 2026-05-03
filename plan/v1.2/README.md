# Hypratia v1.2 — Canvas parity + AI conversation rescue

v1.0 made the metaphor real. v1.1 made the workspace feel modern. v1.2 fixes the two things people will compare us against, and uses both to define the wedge:

1. **Canvas parity with Obsidian Canvas.** Connections are unreliable, edges look like wires instead of arrows, motion is jittery, and there is no alignment feedback during drag. People who have used Obsidian Canvas notice within thirty seconds. Until that gap closes, every other feature is shouting from inside a worse room.
2. **AI conversation rescue.** The reason to choose Hypratia over Obsidian Canvas is *not* that we draw nicer rectangles — it is that we ingest ChatGPT / Claude conversations into a canvas without manual copy-paste-arrange labor. The slogan is **Capture → Distill → Map → Export.** We should not try to be a smarter LLM; we should be the place where LLM output lands and survives.

## Product thesis (v1.2)

> Hypratia is a **conversation rescue tool** with a canvas attached. Obsidian Canvas is a manual diagramming surface. We are the **AI conversation archaeologist** — we extract knowledge from chat sessions you have already paid for, structure it locally, and only spend tokens where structure cannot. The canvas is the display, not the product.

Hypratia's real adversary is not Obsidian — it is the over-viscous texture of AI replies. Two complementary motions: **Laconic View** (in plan 51) compresses the verbatim message in place; **Capture → Distill → Map → Export** (the rest of Track B) turns the conversation into a structured canvas. Together: *Laconic View turns verbose AI answers into reusable thought.*

Two tracks ship in parallel because each is useless without the other:

- **Track A — Canvas feel.** Without this, no one stays long enough to use the rescue features.
- **Track B — Capture / Distill / Map / Export.** Without this, we are a worse Obsidian Canvas.

## Cost philosophy

We deliberately push as much work as possible *down* the stack:

| Layer | Cost | Used for |
| ----- | ---- | -------- |
| **L1 — Local parse** | $0 | Markdown structure, TODO/Decision/Question keywords, segmentation, role split, paragraph chunking, layout |
| **L2 — Cheap model** | cents | Title / tag / 3-line summary / importance score |
| **L3 — Premium model** | dollars | Argument structuring, contradictions, multi-conversation merge, memory updates — opt-in only |

A user who never enables L2/L3 should still get a usable Hypratia. That rules out the lazy "pipe everything to GPT-4" architecture that would burn API budget and create the wrong dependency.

## Track A — Canvas feel

Files:

- [36 — Directional arrow edges](36-canvas-edge-arrows.md)
- [37 — Connection UX (bigger targets, magnetic radius, reconnect)](37-canvas-connection-ux.md)
- [38 — Alignment guides + snap during drag](38-canvas-alignment-guides.md)
- [39 — Motion polish (60 fps pan/zoom, edge enter, reduced-motion)](39-canvas-motion-perf.md)
- [40 — Default-to-edit posture](40-canvas-default-editing.md)

## Track B — Capture / Distill / Map / Export

Files:

- [41 — Paste-to-Canvas (P0 capture)](41-capture-paste-to-canvas.md)
- [42 — Clipboard watcher / Inbox](42-capture-clipboard-watcher.md)
- [43 — ChatGPT export importer (`conversations.json`)](43-capture-chatgpt-export-import.md)
- [44 — Distill L1: local heuristics](44-distill-local-heuristics.md)
- [45 — Distill L2: cheap-model titles + tags + summaries](45-distill-cheap-llm.md)
- [46 — Distill L3: premium re-structure (opt-in)](46-distill-premium-llm.md)
- [47 — Map: auto-layout templates](47-map-auto-layout.md)
- [48 — Export: JSON Canvas (Obsidian-compatible)](48-export-jsoncanvas-obsidian.md)
- [52 — Vault sync + sidecar metadata (one-way Hypratia → Obsidian)](52-vault-sync-and-sidecars.md)
- [53 — Obsidian companion plugin (DEFERRED to v1.3+)](53-obsidian-companion-plugin.md)

## Cross-cutting

- [49 — Cost tiering & budget UI](49-cost-tiering-and-budgets.md)
- [50 — Half-automation: suggestions, never edicts](50-half-automation-suggestions.md)
- [51 — Laconic View (non-destructive compression of AI replies)](51-laconic-view.md)

## Order of work

P0 (ship first — addresses the live complaint):

1. **36 + 37 + 38** — Canvas connection / arrow / alignment fixes. These directly answer "edges fail to attach" and "Obsidian feels nicer."
2. **41 + 44** — Paste-to-Canvas with local heuristics. Smallest possible Capture→Distill→Map slice. No API calls required.
3. **51 (local-only path)** — Laconic View backed by the local compressor. Demonstrates the "verbose AI → reusable thought" motion on day one and feeds Map-ready bodies into the canvas.

P1 (define the category):

4. **43** — ChatGPT export importer. Killer feature; one drag-and-drop rescues years of conversation.
5. **47** — Auto-layout. Without this, imported nodes pile on each other.
6. **48** — JSON Canvas export. Stops us from being framed as Obsidian's enemy.
7. **51 (LLM upgrade path)** — opt-in cheap-LLM Laconic, gated by the budget UI from 49.

P2 (depth + polish):

8. **42, 45, 46, 49, 50, 39, 40.**

## Acceptance for v1.2 as a whole

1. Connecting two nodes by drag succeeds on the **first** attempt in 95%+ of trials in a standard test set, without aiming for a small dot.
2. Edges render with arrowheads and animate cleanly when newly created or hovered.
3. Dragging a node shows alignment guides against neighbors and snaps when within ~6 px.
4. Pasting a copied ChatGPT conversation onto the canvas produces a populated set of candidate nodes (decisions / tasks / questions / claims) within 1 second, with **zero** outbound network calls.
5. A user can drop an OpenAI export `.zip` and browse, search, and selectively import their entire ChatGPT history.
6. A canvas can be exported to a `.canvas` file that opens in Obsidian Canvas with nodes and edges intact.
7. Toggling Laconic View on a verbose assistant message yields a noticeably shorter version (≥ 35% reduction across the fixture corpus) without losing code, numbers, named entities, or explicit caveats; original is preserved byte-for-byte.
8. Canvas nodes created from assistant messages display Laconic by default with the original reachable in one click.
9. No feature requires an API key to demonstrate value. L2/L3 enrichment is opt-in and budgeted.

## Non-goals

- Replacing ChatGPT/Claude with our own model.
- Round-trip parity with arbitrary diagramming tools (TLDraw, Excalidraw, Miro).
- Auto-merging multiple conversations without explicit user action.
- Cloud sync.
- Telemetry-driven layout. Layout is deterministic given inputs.

## Status

Drafted 2026-05-02 in response to direct user feedback that (a) edge-making is brittle vs. Obsidian Canvas and (b) the differentiation must come from AI conversation rescue, not from being a prettier canvas.
