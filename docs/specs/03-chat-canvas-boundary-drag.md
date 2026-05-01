# 03 — Chat ↔ Canvas Boundary Drag

## Purpose

Detail the splitter behaviour: numbers, gestures, edge cases.

## Current problem

The previous splitter clamped `splitPercent` to `[35, 82]` and snapped to `canvas-only` the moment chat width fell below 300 px. There was no resistance band, so a small overshoot triggered an unintended collapse.

## Desired behaviour

### Constants

```ts
const CHAT_MIN_PX = 300;
const CANVAS_MIN_PX = 300;
const COLLAPSE_RESIST_PX = 120;
const RESTORE_DEFAULT_PX = 400;
```

### Phases during a single drag

Let `wsW` = workspace width, `chatPx` = `wsW * (1 - splitPercent/100)`, `canvasPx` = `wsW * splitPercent/100`.

| Cursor position | Outcome |
|-----------------|---------|
| chat side has room                                | width follows cursor |
| `chatPx < CHAT_MIN_PX` but `> CHAT_MIN_PX - COLLAPSE_RESIST_PX` | clamp `splitPercent` so chatPx == 300; splitter "sticks" |
| `chatPx ≤ CHAT_MIN_PX - COLLAPSE_RESIST_PX`       | `setLayout('canvas-only')`, end drag |
| `canvasPx < CANVAS_MIN_PX` but resistance not exceeded | clamp; splitter sticks |
| `canvasPx ≤ CANVAS_MIN_PX - COLLAPSE_RESIST_PX`   | `setLayout('chat-only')`, end drag |

The clamp branch updates `splitPercent` to the boundary value; the cursor can wobble within the resist band without further effect.

### Restore

When the layout flips back to `split` (via menu, palette, or Show action), `restorePane` checks the saved `splitPercent`:

- If the resulting panel pixel width would still be `< MIN_PX`, set `splitPercent` so the appearing panel is `RESTORE_DEFAULT_PX` wide.
- Otherwise keep the user's saved `splitPercent`.

Restoration only widens the appearing panel; it never shrinks the other side below its own min.

### Double-click

Double-clicking the splitter resets `splitPercent` to `70` (canvas 70%, chat 30%).

## State model

`splitPercent` and `layout` are local to `App`. No Zustand store changes.

## UI behaviour

- Splitter is `width: 6px`, hover/drag highlight via CSS.
- Inside the resist band, splitter gets a `.resisting` class for a subtle shading change.
- Cursor remains `col-resize` for the whole drag; no special cursor changes — the resistance is entirely positional.

## Acceptance

1. Slowly dragging chat down: the chat side stops shrinking at 300 px even while the cursor continues moving.
2. Continuing to drag past 300 + 120 = 420 px deeper: layout snaps to `canvas-only`.
3. Releasing inside the resist band leaves the panel at 300 px.
4. The same numbers apply mirrored for canvas.
5. After a snap-collapse, restoring through any path produces a usable layout (≥ 400 px on the appearing side, never below either min).
6. Double-clicking the splitter restores `splitPercent = 70`.

## Implementation notes

- All math lives in `App.tsx::onSplitterPointerDown`'s `onMove` and the `restoreChatPane` / `restoreCanvasPane` helpers.
- The constants are exported (or at least colocated) so `useCommands` / `useMenu` can rely on the same definitions when wiring `Show All Panels`.
- `splitRef.current?.getBoundingClientRect().width` is the source of truth for `wsW` — it's always the splittable area, not the whole window (the sidebar is outside).
