# 40 — Default-to-edit posture

**Goal:** the canvas treats nodes as primarily *editable*, not primarily *draggable*. Obsidian Canvas's win is that double-click always opens the editor and single-click is a no-op; the user does not feel like they are operating a graph tool.

**Depends on:** v1.1 inline editor (`33-note-like-editor.md`).

## Scope

1. **Double-click anywhere on a node opens the editor.** Today this is wired on title only; expand to body and image alt area.
2. **Single-click selects** — no preview popover, no inspector flicker.
3. **Click outside commits** the editor (auto-save on blur, debounce 300 ms — already exists; verify edge cases).
4. **Esc cancels edit** without losing focus position on the canvas.
5. **New empty node lands in edit mode** (cursor in title, ready to type).
6. **Header and body share the same editor** — pressing Tab from title moves to body (already in markdown editor; just wire keyboard).
7. **Quiet chrome.** Hide non-essential affordances (handles, hover tooltips) until pointer-over, so the canvas reads as a writing surface at rest.

## Implementation

- Add a `defaultEditOnCreate: true` flag to the node-create flow in the store. When the flag is set, mark the just-created node as `detachedEditorNodeId` (existing behavior) so the editor opens.
- Audit `MarkdownNode.tsx` to ensure `onDoubleClick` on the entire `.markdown-node` body opens the editor (currently scoped to header / content — verify and unify).
- Esc handling: extend the existing keydown listener; when an editor is open, Esc closes it and restores canvas focus on the node so subsequent shortcuts (Cmd+A, see plan 38) work.
- Visual: handles / drag affordances `opacity: 0` at rest, `1` on hover (already partially true). Audit and harmonize with plan 37 (which keeps handles fully visible during connection drag).

## Acceptance

1. Double-clicking a node body (not just the header) opens the inline editor.
2. Esc cancels the edit and returns focus to the node selection.
3. A new empty memo (Cmd+K → "New node" or `+ Add memo`) opens with the cursor inside the title field.
4. Tabbing from title moves the cursor into the body field.
5. Connection handles are invisible at rest; hovering a node reveals them within 80 ms.
6. No regression in drag-to-move — pointerdown on the body still drags the node.

## Risks

- Double-click vs. click-and-drag detection is fragile; rely on React Flow's onNodeDoubleClick rather than synthesizing it from clicks.
- Hiding handles at rest can confuse new users who don't know how to start a connection — pair with the plan 37 perimeter rim so connection initiation is discoverable.
