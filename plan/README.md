# Build plan

One file per step. Number prefixes are stable. Each file declares Goal / Depends on / Scope / Implementation / Acceptance / Risks.

## How to use

- Tick each step below as you finish it.
- When starting a step, paste its path into the chat: `@plan/05-drag-drop.md`.
- If a step's scope changes, edit that file. Don't move history into other files.

## Order

- [x] [00 — Architecture decision](00-architecture.md)
- [x] [01 — Scaffold Tauri + React + Vite](01-scaffold.md)
- [x] [02 — Data model and local persistence](02-data-model-persistence.md)
- [x] [03 — Layout shell and chat panel](03-shell-and-chat.md)
- [x] [04 — Canvas with React Flow + "Add to canvas"](04-canvas.md)
- [x] [05 — Drag-and-drop from chat to canvas](05-drag-drop.md)
- [x] [06 — Manual edges + node inspector](06-edges-inspector.md)
- [x] [07 — Multiple conversations + global graph](07-multi-conversation.md)
- [x] [08 — Obsidian Markdown export](08-obsidian-export.md)
- [x] [09 — Local search](09-search.md)
- [x] [10 — Mock summarizer (provider abstraction)](10-summarizer.md)
- [x] [11 — Heuristic similarity suggestions](11-similarity.md)
- [x] [12 — Embedding provider scaffolding (mock only)](12-embeddings-prep.md)
- [x] [13 — UI polish](13-ui-polish.md) — minimal pass; deeper polish welcome later
- [x] [14 — Test and fix audit](14-test-fix.md) — automated; manual flow checklist documented
- [x] [15 — macOS packaging](15-package-macos.md) — `.app` + unsigned `.dmg` shipped

## Ruthless MVP

**Tier 0 = steps 01–08.** If chat → drag → save → export works, the product exists. Everything else is ornament.

## Tiers

- **Tier 0** (steps 01–08): must work or it's not a product. ✅
- **Tier 1** (steps 09–13): only after Tier 0 is solid — search, summarizer, similarity, polish. ✅
- **Tier 2** (deferred): real LLM summarization, real local embeddings (ONNX / WebGPU), web port, code signing, auto-update.

## v1.0 — ready-to-ship

Steps 16–30 live in [v1/](v1/README.md). The MVP proved the metaphor; v1.0 turns it into a product.

## Conventions

- Each plan file is the **contract** for that step. Don't expand scope mid-step; edit the file or open a new one.
- Keep CLAUDE.md focused on what the repo *is*. Plans are *what we're going to do* — they belong here.
