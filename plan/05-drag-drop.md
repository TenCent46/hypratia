# 05 — Drag-and-drop from chat to canvas

**Goal:** drag a chat message onto the canvas; node appears at the drop point.

**Depends on:** 04.

## Implementation

- HTML5 DnD, no extra library.
- On message row:
  - `draggable={true}`
  - `onDragStart` sets `dataTransfer.setData('application/x-mc-message', messageId)` and a custom drag image.
- On canvas wrapper:
  - `onDragOver` calls `e.preventDefault()` (required to allow drop).
  - `onDrop` reads the message id, computes flow position via `screenToFlowPosition({ x: e.clientX, y: e.clientY })`, creates a `CanvasNode` with `sourceMessageId` set.
- Visual cue while dragging:
  - Source row dims to ~60% opacity.
  - Canvas shows a thin dashed outline.

## Fallback

Keep the "Add to canvas" button from step 04. Drag is the soul; the button is the lifeline.

## Acceptance

- Drag a message → node appears under the cursor at drop time.
- Button still works.
- Dropping outside the canvas does nothing.

## Risks

- `screenToFlowPosition` outside `<ReactFlowProvider>` → throws. Ensure provider wraps both the canvas and the drop handler.
- Default browser drag ghost is ugly; replace via `setDragImage` with a small custom element or transparent 1×1 image.
- Drop while panning → guard with an `isDragging` ref if needed.
- DnD type collision with browser-native data: use a custom MIME (`application/x-mc-message`).
