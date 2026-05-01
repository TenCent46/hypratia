# 14 — Test and fix audit

**Goal:** the app actually works on a clean machine.

**Depends on:** 13.

## Automated checks

- `pnpm tsc --noEmit` — zero errors.
- `pnpm lint` — ESLint configured with at minimum:
  - `no-restricted-imports`: forbid `@tauri-apps/*` outside `services/storage/` and `services/export/`.
  - React hooks rules.
- `pnpm tauri dev` — opens, no console errors.

## Manual flows (run all)

- Type messages → reload → messages persist.
- Add to canvas (button) → reload → node persists.
- Drag from chat → drop → node at drop point.
- Drag node → reload → position preserved.
- Connect two nodes → reload → edge persists.
- Delete node → its edges are gone; reload confirms.
- Switch conversations → state isolates correctly; viewport restores.
- Global map → cross-conversation edges visible.
- Search → all three result types navigate correctly; ⌘K opens.
- Choose vault → export → vault contains the three subfolders with valid Markdown + frontmatter.
- Open exported vault in Obsidian → graph view shows links.
- Re-export with no changes → byte-identical.
- Mock summarizer → produces a node visibly marked as mock.
- "Suggest links" → returns sensible results on a 30-node corpus; no auto-edges.

## Crash safety

- Kill the app mid-save (`kill -9` while dragging) → relaunch, no data corruption (atomic rename did its job).

## Output

- Fix every error. Don't suppress.
- Record any deferred issues in `plan/known-issues.md` (create if needed).

## Acceptance

- Every checklist item passes.
- A second person can clone, `pnpm install`, `pnpm tauri dev`, and use the app inside 2 minutes.
