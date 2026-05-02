# 38 — Alignment guides + snap during drag

**Goal:** moving a node feels deliberate. The user sees center / edge alignment lines against neighboring nodes and feels a subtle click when the node lands flush. This is the single most "Obsidian-like" feature missing today.

**Depends on:** `applyNodeChanges` flow in `CanvasPanel.tsx`, the existing `NodeChange` pipeline.

## Scope

1. **Helper lines** while dragging: render horizontal and vertical guide lines when the dragged node's left / center / right edge or top / center / bottom edge aligns with another node.
2. **Soft snap** (~6 px threshold): if the drag position lands within threshold of a guide, position is corrected to the exact alignment so the user feels a click.
3. **Grid snap** (optional, off by default): when Cmd is held, snap to a 16 px grid.
4. Guides are only drawn for the *closest* matching node per axis to avoid visual noise.
5. Guides fade in over 60 ms and out over 120 ms — never instant flicker.

## Implementation

Lift logic from React Flow's `helper-lines` example, adapted to our store:

Create `src/services/canvas/HelperLines.ts`:

- `getHelperLines(change: NodeChange, nodes: RfNode[]): { horizontal?: number; vertical?: number; snap: { x?: number; y?: number } }`.
- Computes for the dragged node's six anchor lines (left/center/right × top/center/bottom) the nearest other-node line per axis within `SNAP_THRESHOLD = 6`.
- Returns the y for a horizontal guide, the x for a vertical guide, and a snap correction in node coordinates.

In `CanvasPanel.tsx`:

- Wrap the existing `onNodesChange` with a helper that:
  - Detects `position`-change events with `dragging: true`.
  - Calls `getHelperLines`, applies the snap correction to `change.position`, and stores `helperLines` (the two guide values) in component state.
  - On drag stop, clears `helperLines`.
- Render a `<HelperLinesOverlay horizontal={…} vertical={…} />` SVG that draws the two guide lines across the visible viewport.
- Cmd-held grid snap: in `onNodesChange`, if `event.metaKey` is true, round the position to the nearest 16 px multiple. Surface this in the canvas hint ("Cmd-drag = grid snap").

## Acceptance

1. Dragging a node so its left edge is within 6 px of another node's left edge snaps to alignment, and a vertical guide line appears between them.
2. Dragging a node so its vertical center is within 6 px of another node's vertical center snaps and shows a horizontal guide line.
3. Multi-node drag respects guides for the dragged group's bounding box.
4. Holding Cmd snaps to a 16 px grid (off by default).
5. Guides do not appear during pan, zoom, or marquee selection — only node drag.
6. With > 200 nodes, drag remains 60 fps (helper-line search must early-exit on axis distance).

## Risks

- O(n) per drag tick across all nodes can stutter at high node counts; index nodes by quadrant or pre-bucket by viewport for the dragging session.
- Snap can fight free-form layout; users should be able to disable it (Settings → Canvas → "Snap to alignment").
- Multi-node drags need the bounding-box anchors, not the lead node's anchors, or the group teleports.
