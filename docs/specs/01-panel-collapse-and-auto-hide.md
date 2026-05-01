# 01 — Panel Collapse, Drag Resistance & Auto-Hide

## Purpose

Define how the chat ↔ canvas split bar behaves when the user drags one panel toward zero, and how a hidden panel becomes reachable again without leaving an ugly restore button.

## Current problem

- The drag handler used `Math.min(82, Math.max(35, raw))` clamps; under sufficiently narrow workspaces a panel could still be too small to use.
- An earlier patch added "snap to collapsed when chat < 300px" but did so on the very first move under threshold — panels disappeared by accident.
- A vertical "Chat" / "Canvas" button appeared on the relevant edge after collapse, breaking the clean canvas surface.

## Desired behaviour

### Drag resistance

The user must explicitly choose to collapse, not drift into it.

1. Normal drag: width tracks the cursor.
2. Approaching minimum: width clamps to `MIN_PX`, the splitter stops following the cursor, but the panel does not collapse.
3. Past the resistance threshold: the panel fully collapses to the corresponding `*-only` layout.

Numbers (constants in [`App.tsx`](../../src/App.tsx)):

```ts
const CHAT_MIN_PX = 300;
const CANVAS_MIN_PX = 300;
const COLLAPSE_RESIST_PX = 120; // extra over-drag required to collapse
```

Pseudo-code:

```ts
const chatPx = workspaceWidth * (1 - splitPercent / 100);

if (chatPx < CHAT_MIN_PX - COLLAPSE_RESIST_PX) {
  setLayout('canvas-only');
  endDrag();
} else if (chatPx < CHAT_MIN_PX) {
  setSplitPercent(percentForChatPx(CHAT_MIN_PX)); // clamp
} else {
  setSplitPercent(raw);
}
```

The same logic mirrors for the canvas side.

### Auto-hide pop-out overlays

Each panel uses exactly one persistent dock state:

```ts
type PanelState = 'shown' | 'hidden';
```

Panel meanings:

- `shown`: panel is fixed open and remains visible after cursor leaves.
- `hidden`: panel is not fixed open, occupies no normal layout space, and can temporarily pop out from the boundary.

Temporary pop-out is derived from hover/focus state, not stored as persistent panel state:

```ts
const shouldShowPanel =
  panelState === 'shown' ||
  (panelState === 'hidden' &&
    (isHoveringEdge || isHoveringPanel || isInteractingInsidePanel));
```

Transitions:

- hidden + boundary hover → temporary pop-out renders
- mouse leaves boundary/panel and focus leaves → temporary pop-out disappears
- hidden + `Show Panel` → `shown`
- shown + `Hide Panel` → `hidden`
- `Show Panel` → `shown`
- strong drag collapse → `hidden`

The chat overlay appears from the right edge when chat is hidden. The canvas and sidebar overlays appear from the left edge when hidden. Temporary pop-outs do not push layout.

## State model

```ts
// Layout
type Layout = 'split' | 'canvas-only' | 'chat-only';

// Local to App (not persisted)
const [layout, setLayout] = useState<Layout>(...);
const [splitPercent, setSplitPercent] = useState<number>(70); // % canvas
const [chatPanelState, setChatPanelState] = useState<PanelState>('shown');
const [canvasPanelState, setCanvasPanelState] = useState<PanelState>('shown');
const [sidebarPanelState, setSidebarPanelState] = useState<PanelState>('shown');
```

`splitPercent` is preserved across collapses so restoring through any path returns to the user's last layout. If the saved `splitPercent` would yield a panel smaller than `MIN_PX`, restore widens to a sensible default of 400 px on the appearing panel (`restoreChatPane`, `restoreCanvasPane`).

`layout` is still used as the grid renderer's implementation detail. The dock state is the user-facing panel state machine and `layout` derives from it:

- chat hidden, canvas shown → `layout = 'canvas'`
- canvas hidden, chat shown → `layout = 'right'`
- both shown → `layout = 'split'`

## UI behaviour

- Splitter cursor changes to `col-resize` while hovering.
- During clamp at `MIN_PX`, the splitter element gets a `.resisting` class for a subtle visual cue (slight bg colour shift).
- Temporary pop-out slides in from the edge with a 180 ms ease.
- Temporary pop-out sits **above** the canvas (overlay; doesn't push layout) so the canvas doesn't re-flow constantly.
- Temporary pop-out closes with the same 180 ms slide-out.

## Acceptance

1. Dragging the chat side narrower clamps at 300 px instead of disappearing.
2. Continuing the drag past 300 px requires +120 px of additional motion before the panel fully collapses.
3. Releasing the splitter inside the resist band leaves the panel at 300 px (does not collapse).
4. After collapse, the canvas occupies the full workspace; no vertical "Chat" button is rendered.
5. Hovering the right edge in `canvas-only` slides the chat overlay in.
6. Moving the cursor away closes the overlay after a short delay.
7. Choosing `Show Chat` changes persistent state from `hidden` to `shown`.
8. Choosing `Hide Chat` changes persistent state from `shown` to `hidden`.
9. The same behaviour mirrors for canvas and sidebar.

## Implementation notes

- The drag handler lives in `App.tsx::onSplitterPointerDown`.
- The chat pop-out is a thin wrapper around `<RightPane />` rendered inside a fixed-position container; it reuses the existing pane content.
- Slide animation: CSS `transform: translateX(...)` + transition. No JS animation.
- The hot zones are `<div className="edge-hot-zone right" aria-hidden="true" />` siblings of the split container, not children of the panels — they exist in the layer above the canvas.
- The collapse threshold and resist constants live as module-level `const` so they can be tuned from one place.
