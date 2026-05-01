# 23 — AI palette on selection

**Goal:** select text anywhere (chat message, node, PDF highlight) → press ⌘J → small popover with preset prompts and a free-form box. Output streams into a new node, into the inspector, or replaces the selection — user picks.

**Depends on:** 21, 22.

## Why this UX

Reflect's biggest delighter is exactly this: AI is invoked on selected content, not as a free-floating chatbot. It anchors the AI to the work the user is already doing, which keeps prompts good and outputs short.

## Preset prompts (v1.0)

- **Improve writing** — clarify, tighten.
- **Summarize** — into 3 bullets.
- **Expand** — add detail and examples.
- **Translate to…** (submenu).
- **Ask a question about this** — opens a free-form box pre-filled with the selection.
- **Make a node from this** — extracts atom-of-thought, lands as a node on the canvas with edge back to source.
- **Find related** — runs the similarity service (step 11) and shows top-5.
- **Custom prompt…** — free text; remembered as a quick-action if the user pins it.

Each preset is a `Command` (registered with the command palette in 19) so ⌘J is the discoverability path; ⌘P → "Improve writing" is the alternate path.

## Files

- `src/features/ai-palette/AIPalette.tsx`
- `src/features/ai-palette/prompts.ts` — preset prompt templates as functions of `(selection, context)`.
- `src/features/ai-palette/useSelection.ts` — global hook that reads window/document selection, tags it with origin (`chat-message:<id>`, `node-content:<id>`, `pdf-highlight:<pdfId>:<page>`).

## Implementation

1. Hook `selectionchange` → store `ui.selection: { text, origin }` (debounced).
2. ⌘J keymap → if selection present, open palette anchored near the selection; otherwise open with empty input.
3. Run prompt → stream response → user picks a destination:
   - **Replace selection** (only safe in editable contexts).
   - **Append to inspector node**.
   - **New node on canvas** (with edge back to origin if origin is a node).
4. Output uses the user's currently selected model (chat header).
5. Track usage in the same cost meter from 22.

## Acceptance

- Highlight text in a chat message → ⌘J → "Summarize" → a node appears on the canvas containing the streamed summary, edge connects from origin message's node (if present) or just lands centered.
- Highlight text in a node's body → ⌘J → "Make a node from this" → new linked node on the canvas.
- Custom prompt → typed → enter → streams.
- Cancel mid-stream returns the focus cleanly.
- All preset prompts are listed in the cheat sheet (19).

## Risks

- Selection in a `react-pdf` page is non-trivial — handled in 25.
- Restoring focus after the palette closes — track `previouslyFocused` and `.focus()` it back.
- "Replace selection" in non-editable contexts (chat history) is invalid; gate the option.
- Long selections explode token budget — clip to first 4 k chars with a "selection was clipped" notice.
