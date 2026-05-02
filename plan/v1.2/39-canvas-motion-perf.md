# 39 — Motion polish (60 fps pan/zoom, edge enter, reduced-motion)

**Goal:** the canvas *feels* fast. Pan / zoom never drops frames. New nodes and edges appear with a 200–250 ms motion that signals where they came from. Old motion is removed where it is just delay.

**Depends on:** 36, 37, 38.

## Scope

1. Profile the current canvas at 50 / 200 / 1000 nodes; fix any obvious frame drops in node/edge rendering.
2. Replace any `setTimeout`-based animations with CSS transitions or the Web Animations API so they share the compositor.
3. Add purposeful, brief enter animations:
   - New node: scale `0.92 → 1.0`, opacity `0 → 1`, 200 ms ease-out.
   - New edge: see plan 36 (draw-in).
   - Focus on click (`mc:focus-canvas-node`): smooth `setCenter` with `duration: 220` instead of 300 (300 feels sluggish in this context).
4. Remove gratuitous animation:
   - Selection rings should be instant (no fade).
   - Hover effects on edges < 100 ms.
5. Respect `prefers-reduced-motion: reduce` everywhere — animations resolve to their end state with no transition.

## Implementation

- Create `src/styles/motion.css` with shared motion tokens (`--motion-fast: 120ms`, `--motion-default: 220ms`, `--easing-out: cubic-bezier(0.2, 0.8, 0.2, 1)`).
- Wrap any keyframes in `@media (prefers-reduced-motion: no-preference)`.
- Use Chrome DevTools Performance to record a 5 s pan/zoom on a 200-node canvas before and after; commit a `docs/perf-canvas.md` with the before/after frame chart.
- Audit React re-renders: ensure `nodeTypes` and `edgeTypes` are module-level constants (already true in `CanvasPanel.tsx`), and memoize per-node selectors so hover does not re-render the whole list.

## Acceptance

1. With 200 nodes, sustained pan + zoom holds ≥ 58 fps on a M1 Mac.
2. Newly added nodes scale-fade-in over ~200 ms; selection rings do not fade.
3. Reduced-motion users see no animation at all on node/edge create or focus.
4. Focus-jump (`setCenter`) duration reads as snappy, not floaty.

## Risks

- Profiling can suggest premature optimization; only fix verified hotspots.
- Animations stacked on selection state can double-paint; gate them behind `[data-just-created]` attributes that auto-clear.
