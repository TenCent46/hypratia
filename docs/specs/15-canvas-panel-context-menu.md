# 15 — Canvas Panel Context Menu (Show/Hide)

## Purpose

Add a panel-level right-click menu to the canvas that mirrors the chat panel's
context menu (spec [05](05-chat-context-menu-tabs.md)). Currently the chat
right-click menu offers `Show Chat` / `Hide Chat`, but the canvas has no
equivalent — right-clicking empty canvas only opens a menu when nodes or edges
are already selected.

The new menu makes panel visibility reachable from the canvas itself, gives the
canvas a polished menu surface consistent with the chat, and is the natural
home for canvas-only switches that today are buried in the command palette.

## Current problem

- Right-clicking an empty canvas with no selection silently does nothing.
  `selectedMenuAt` returns false unless `selectedNodeIds.length > 0` or
  `selectedEdgeIds.length > 0`. See
  [`features/canvas/CanvasPanel.tsx`](../../src/features/canvas/CanvasPanel.tsx)
  near the `selectedMenuAt`, `onPaneContextMenu`, and
  `onNodeContextMenu` handlers.
- `Show Canvas` / `Hide Canvas` are only reachable from the View menu /
  command palette, not from the canvas surface itself.
- The chat panel context menu (`ChatPanelContextMenu`) already exposes
  `Show Chat` / `Hide Chat` with check marks; the canvas side feels broken by
  comparison.

## Desired behaviour

### Triggering the menu

- Right-click on an empty canvas area (the React Flow pane background, the
  dot-grid `Background`, or the canvas-shell pane toolbar margin), at any
  selection state — including no selection.
- Right-click on a node still shows the existing `NodeContextMenu`.
- Right-click on a multi-node/edge selection still shows the existing
  `SelectionContextMenu` (Ask / Search / Open Markdown / Copy Links /
  Add Link / Clear Selection).
- Right-click on a text selection inside a Markdown node still shows the
  existing `TextSelectionContextMenu` (Ask / Search / Copy / Open Markdown).
- Right-click inside an `<input>`, `<textarea>`, or `[contenteditable]` is
  suppressed so the OS clipboard menu wins (same rule as
  [`RightPane.onContextMenu`](../../src/components/RightPane/RightPane.tsx)).

Priority on right-click is therefore:

```
text selection inside a node → TextSelectionContextMenu
node hit (no marquee selection)  → NodeContextMenu
selection set is non-empty       → SelectionContextMenu
otherwise                        → CanvasPanelContextMenu (this spec)
```

### Menu layout

```
┌─────────────────────────────────┐
│  Show Canvas              ✓     │
│  Hide Canvas                    │
│  ──────────────────────────────  │
│  Show Chat                ✓     │
│  Hide Chat                      │
│  ──────────────────────────────  │
│  Reset View                     │
│  Fit Selection / Fit All        │
│  ──────────────────────────────  │
│  Select Tool              V     │
│  Hand Tool                H     │
└─────────────────────────────────┘
```

- macOS-like floating rounded menu, reusing the existing `.app-context-menu`
  styles from spec 05 so chat and canvas menus feel identical.
- Compact rows (~28 px tall, 13 px font), shortcut labels right-aligned.
- Checkable items show a leading ✓.
- Hover highlight, separators, viewport-edge clamping, outside-click and
  Escape close behaviour are inherited from the chat menu pattern.

### Item behaviour

| Item                | Action                                                                                  |
|---------------------|------------------------------------------------------------------------------------------|
| Show Canvas         | Calls `onShowCanvas` → `setCanvasPanelState('shown')`. Checked when `canvasPanelState === 'shown'`. |
| Hide Canvas         | Calls `onHideCanvas` → `setCanvasPanelState('hidden')`. Checked when `canvasPanelState === 'hidden'`. |
| Show Chat           | Calls `onShowChat` → `setChatPanelState('shown')`. Checked when `chatPanelState === 'shown'`. |
| Hide Chat           | Calls `onHideChat` → `setChatPanelState('hidden')`. Checked when `chatPanelState === 'hidden'`. |
| Reset View          | `useReactFlow().setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 })` then persists to `settings.viewportByConversation`. |
| Fit Selection / Fit All | If selection is non-empty: `flow.fitView({ nodes: selectedNodes, padding: 0.2, duration: 200 })`. Otherwise fits all visible nodes. Disabled in global view if there are zero visible nodes. |
| Select Tool / Hand Tool | Toggles `ui.canvasTool`. Already lives in the canvas tool switcher — duplicating it here makes the menu self-contained and discoverable from the right-click. |

`Hide Canvas` is intentionally available from the canvas's own context menu
because the user may have hidden the chat already (in `chat-only` layout the
canvas is gone entirely, so the menu cannot be triggered there). When chat is
also hidden the menu still works because the canvas occupies the full
workspace.

## State model

No new persisted settings. The menu only reads existing state and forwards
existing callbacks:

- `canvasPanelState`, `chatPanelState` — passed in from `App.tsx` (see
  [`App.tsx`](../../src/App.tsx) where the `RightPane` already receives
  `panelState` / `onShow` / `onHide`).
- `ui.canvasTool` from the Zustand store.
- `settings.viewportByConversation` for `Reset View` persistence (already
  written via `setViewport` after `onMoveEnd`).

Local UI state in `CanvasPanel`:

```ts
const [paneMenu, setPaneMenu] = useState<{ x: number; y: number } | null>(null);
```

## UI behaviour

- Menu component is a new file
  `components/CanvasPanel/CanvasPanelContextMenu.tsx`, structured the same way
  as `ChatPanelContextMenu`.
- Mounts inside `CanvasPanel.tsx`, rendered after the existing
  `selectionMenu` / `textSelectionMenu` blocks so it draws above the pane.
- Closes on document `mousedown` outside, `Escape`, or item activation.
- Repositions on `useLayoutEffect` if natural placement would clip below or
  to the right of the viewport (same code path as
  `ChatPanelContextMenu`).
- The pane right-click is dispatched via `onPaneContextMenu`. The decision
  tree (text selection vs node vs selection set vs pane) is implemented in
  `CanvasPanel.tsx` so that only one menu opens at a time.
- The canvas already has an `onContextMenu` on the outer `<main>` wrapper for
  text-selection detection. That handler must short-circuit before the new
  pane menu fires (no double-open).

## Wiring from `App.tsx`

`CanvasPanel` is rendered without props today. The new menu needs the panel
state and toggle callbacks. To keep `CanvasPanel` self-contained:

1. Pass them as props:

   ```tsx
   <CanvasPanel
     canvasPanelState={canvasPanelState}
     chatPanelState={chatPanelState}
     onShowCanvas={showCanvas}
     onHideCanvas={hideCanvas}
     onShowChat={showChat}
     onHideChat={hideChat}
   />
   ```

2. `CanvasPanel` forwards them to `<CanvasPanelContextMenu />`.

This keeps panel visibility state in `App.tsx` where it already lives. No
Zustand changes are required.

## Acceptance

1. Right-clicking on the empty canvas with no selection opens the new menu
   at the cursor.
2. Right-clicking on a node still opens `NodeContextMenu`.
3. Right-clicking with a marquee selection still opens `SelectionContextMenu`.
4. Right-clicking on text inside a Markdown node still opens
   `TextSelectionContextMenu`.
5. The menu shows `Show Canvas` ✓ when canvas is `shown`, and `Hide Canvas` ✓
   when `hidden`. Same for chat.
6. Choosing `Hide Canvas` collapses the canvas (canvas-only → chat-only
   layout) the same way the existing pane-toolbar `×` button does.
7. Choosing `Show Canvas` from the chat side or command palette restores it.
   The new menu's `Show Canvas` row is functionally a no-op when canvas is
   already `shown`, but rendered checked so the user sees the current state.
8. `Reset View` resets the viewport to `(0, 0, 1)` and persists per
   conversation.
9. `Fit Selection / Fit All` zooms to selection when one exists, otherwise to
   all visible nodes.
10. `Select Tool` / `Hand Tool` toggle `ui.canvasTool` and reflect the active
    tool with ✓.
11. Clicking outside the menu, or pressing Escape, closes it.
12. The menu does not clip off-screen at the bottom-right corner.
13. Right-clicking inside an `<input>`, `<textarea>`, or `[contenteditable]`
    inside the canvas (e.g. the Markdown editor textarea) does **not** open
    the new menu — OS clipboard menu wins.

## Implementation notes

- New file:
  [`components/CanvasPanel/CanvasPanelContextMenu.tsx`](../../src/components/CanvasPanel/CanvasPanelContextMenu.tsx).
- Reuse the `Item` and `Separator` styling helpers — extract them out of
  `ChatPanelContextMenu.tsx` into a shared file (e.g.
  `components/ContextMenu/ContextMenuItem.tsx`) so both menus stay visually
  identical and we don't duplicate the keyboard / outside-click logic.
- Wire `<CanvasPanel />` props in `App.tsx` next to the existing
  `RightPane` props (`panelState`, `onShow`, `onHide`).
- `CanvasPanel.tsx::onPaneContextMenu` becomes:

  ```ts
  onPaneContextMenu={(e) => {
    e.preventDefault();
    if (selectedNodeIds.length > 0 || selectedEdgeIds.length > 0) {
      selectedMenuAt(e.clientX, e.clientY);
      return;
    }
    setPaneMenu({ x: e.clientX, y: e.clientY });
  }}
  ```

- `CanvasPanel.tsx::onCanvasContextMenu` already short-circuits when the click
  lands on a text selection inside a Markdown node, so the new pane menu only
  fires when neither of the existing menus claim the event.
- Reset View / Fit View use `useReactFlow()`. The `Fit Selection / Fit All`
  copy is decided at render time (no separate menu items) based on
  `selectedNodeIds.length`.
- No new CSS rules required — `.app-context-menu` already exists from spec 05.

## Out of scope

- A "Reset Canvas" / clear-all-nodes destructive action. Destructive actions
  belong in the View menu with a confirm dialog, not in a casual right-click.
- Conversation switching from the canvas right-click. That is the sidebar's
  job.
- Sidebar visibility from the canvas right-click. The user already has a
  sidebar toggle button and shortcut; adding it here would clutter the menu.
