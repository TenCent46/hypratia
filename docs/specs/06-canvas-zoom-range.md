# 06 — Canvas Zoom Range

## Purpose

Define the zoom behaviour for the canvas surface.

## Requirement

Canvas zoom must feel spatial and unconstrained. Users should be able to zoom
far in for detailed card work and far out for map-level navigation.

The app must not use a narrow artificial zoom clamp such as `0.25–4` or
`0.5–3`.

## Effective Range

The implementation may keep broad technical guardrails to avoid rendering
crashes:

```ts
const MIN_CANVAS_ZOOM = 0.01;
const MAX_CANVAS_ZOOM = 100;
```

These values are intentionally broad and should not be reduced unless a
specific rendering bug is reproduced.

## Interaction Rules

- Trackpad pinch, mouse wheel zoom, and any zoom controls must use the same
  range.
- Zoom should remain centred around the same cursor / viewport point as the
  existing canvas implementation.
- Panning must continue to work at very small and very large zoom values.
- Dropped chat cards and files must still use `screenToFlowPosition`, so card
  placement remains correct after pan and zoom.

## Implementation Notes

- React Flow owns the pan/zoom transform.
- The canvas sets `minZoom={0.01}` and `maxZoom={100}` on `<ReactFlow>`.
- Do not add separate zoom clamp logic in command handlers or toolbar buttons;
  they should delegate to the same React Flow viewport model.

## Acceptance

1. Zoom-in does not stop at the old small maximum.
2. Zoom-out does not stop at the old small minimum.
3. Wheel, pinch, and zoom controls share the broad range.
4. Pan/drag remains usable.
5. Chat-to-canvas drag/drop still lands at the correct canvas coordinate after
   zooming.
