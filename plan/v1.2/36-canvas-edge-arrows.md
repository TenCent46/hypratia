# 36 — Directional arrow edges

**Goal:** edges look like *relationships*, not stray wires. A → B should be visually distinguishable from B → A at a glance, and edges should animate enough to feel alive without becoming noisy.

**Depends on:** v1.1 canvas (`features/canvas/CanvasPanel.tsx`, `FlexibleEdge`).

## Why

Today edges are flat curves with no marker. Obsidian Canvas ships with arrowed edges by default and that single visual makes the whole canvas read more like a thinking surface. The fix is small but high-leverage.

## Scope

- Arrowhead at the target end by default; configurable per edge to *none*, *open*, *filled*, or *both*.
- Hover and selection states for edges (slight thickening, accent color, animated dash on selection).
- New-edge creation: a 250 ms "draw-in" animation from source to target so the user *sees* the connection complete.
- Color: edges inherit the source node's hue at low saturation; selected edges go to `--accent`.
- Reduced-motion users get a static end state — never animation looping.

## Implementation

In `CanvasPanel.tsx`:

- Import `MarkerType` from `@xyflow/react`. Set `defaultEdgeOptions={{ type: 'flexible', markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 } }}`.
- Extend `FlexibleEdgeData` with `arrow: 'none' | 'end' | 'both'` (default `'end'`). `FlexibleEdge` reads the field and renders `markerStart` / `markerEnd` accordingly.
- Add `<svg defs>` once at the canvas root with two custom markers (filled + outline) so they pick up CSS variables and theme correctly. React Flow's defaults are not theme-aware.
- New CSS in `App.css`:
  - `.react-flow__edge-path { transition: stroke 120ms ease, stroke-width 120ms ease; }`
  - `.react-flow__edge.selected .react-flow__edge-path { stroke-width: 2.25px; stroke: var(--accent); }`
  - `.react-flow__edge.flexible-just-created .react-flow__edge-path { stroke-dasharray: 4 6; animation: edgeDrawIn 250ms ease-out forwards; }`
  - `@keyframes edgeDrawIn` runs `stroke-dashoffset` from path length to 0.
  - Wrap the keyframe in `@media (prefers-reduced-motion: no-preference) { ... }`.
- On `onConnect`, tag the new edge with a transient `justCreated: true`; remove the flag after 300 ms via `setTimeout` so the CSS class clears.

## Acceptance

1. A new connection animates from source to target on creation.
2. Default edge has an arrowhead pointing at the target node.
3. Selected edges read in the accent color and slightly thicker.
4. Edge color follows the source-node hue at rest (subtle, not garish).
5. With `prefers-reduced-motion: reduce`, edges appear in their final state with no animation.
6. No regression in `FlexibleEdge` routing — the existing `markerAnchorPoint` math still aligns the arrow to the source marker rectangle when present.

## Risks

- Custom SVG markers require careful viewBox / `refX` math, otherwise the arrowhead overshoots the node. Test at multiple zoom levels.
- React Flow re-renders edges aggressively; do not allocate marker definitions per edge — define once at the canvas root.
- Hue from source node can clash on dark themes — clamp lightness in `hueFromId` or special-case the dark theme.
