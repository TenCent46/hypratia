# 31 — Direct manipulation chat-to-canvas

**Goal:** dragging completed chat messages to the canvas is the primary path for making nodes. Buttons become secondary or disappear.

**Depends on:** v1.0 chat, canvas, and persistence.

## Scope

- Make message drag/drop reliable in Tauri WebView.
- Use a custom MIME payload plus a `text/plain` JSON fallback.
- Show a small drag affordance on draggable messages.
- Remove the visible "Add to canvas" action from message rows.
- Convert copy/delete to icon-only buttons with `aria-label` and `title`.
- Preserve keyboard-accessible alternatives through the command palette later if needed.

## Implementation

1. Add payload helpers in `features/canvas/dnd.ts`.
2. On drag start, write custom message id, JSON payload, and plain-text fallback.
3. On canvas drop, accept all supported payload shapes and resolve the message id.
4. Create the node at the drop position and keep source message metadata.
5. Tighten message action UI: icon-only copy/delete, accessible names, no "Add to canvas" button.

## Acceptance

- Dragging an assistant message creates a Markdown node at the cursor.
- Dragging a user message also works.
- Streaming/system messages are not draggable.
- Copy works via icon button and has an accessible label.
- No visible "Add to canvas" button remains in the chat row.

## Risks

- WebView drag/drop can strip custom MIME types. The plain-text fallback is required.
- Dragging from text selection inside Markdown may conflict with message dragging. If it feels bad, move the drag affordance to a dedicated handle.
