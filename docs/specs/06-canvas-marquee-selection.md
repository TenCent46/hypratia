# Canvas Marquee Selection

## Goal

Canvas selection must support spatial work: the user can drag a rectangle over empty canvas space and select multiple nodes plus the edges between them.

## Behavior

- Pointer down on empty canvas starts a potential marquee.
- Movement under 6 px is treated as a click.
- Movement beyond the threshold draws a translucent selection rectangle.
- Pointer up selects all visible nodes intersecting the marquee rectangle.
- Edges are selected when both endpoints are selected.
- Shift adds to the existing selection.
- No modifier replaces the current selection.
- Clicking empty canvas without dragging clears selection.

## Coordinate Model

- Screen coordinates are converted through React Flow `screenToFlowPosition`.
- Hit testing uses canvas/world coordinates, not screen coordinates.
- Node bounds use stored position and current measured/default dimensions.
- Selection works after pan and zoom because the marquee start/end points are stored in world coordinates.

## State

Store state:

```ts
selectedNodeIds: ID[]
selectedEdgeIds: ID[]
```

The legacy `selectedNodeId` remains as the primary inspected node for existing inspector behavior.

## UI

- Selected nodes use the existing selected node styling.
- Selected edges use a highlighted stroke.
- The marquee rectangle is a subtle translucent overlay.

## Non-Goals

- No lasso/freeform selection.
- No semantic grouping.
- Do not break node dragging, resizing, connecting, pan, zoom, or drop-to-canvas.
