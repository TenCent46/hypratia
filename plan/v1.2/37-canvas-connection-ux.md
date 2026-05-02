# 37 — Connection UX (bigger targets, magnetic radius, reconnect)

**Goal:** dragging from one node to another always works on the first try. No aiming at a 9-pixel dot. No "the handle didn't appear so the drag did nothing." Match or exceed Obsidian Canvas.

**Depends on:** existing `NodeHandles` (8 handles per node) and `mc-handle` styling.

## The current pain (what users hit today)

- Handles only become visible on hover/selection (`opacity: 0` otherwise). If the cursor isn't *exactly* over the node, the user starts a drag in empty space.
- Handles are 9×9 px. At zoom < 1.0, that is sub-pixel.
- React Flow's default `connectionRadius` is small. Releasing close to a node — but not on a handle — drops the connection.
- No magnetic feedback. The user can't tell whether release will succeed.

## Scope

1. **Larger effective hit area** on every handle (visual size unchanged, hit area ~24 px) using a transparent expansion box.
2. **Always-on edge zone.** A subtle, full-perimeter "rim" on every node, 12 px thick, that initiates a connection drag from any side. Mirror Obsidian's "anywhere on the border works" feel.
3. **Magnetic snap.** Set `connectionRadius={ 60 }` and add a `connectionMode='loose'` (any handle can be source or target). The cursor inside the radius shows the candidate node highlighted.
4. **Connection-line preview** that visually anticipates the snap: when the cursor is within radius, the in-flight line bends into the candidate handle and the candidate node gets a `.connection-target` class (animated outline).
5. **Reconnect existing edges** by grabbing either endpoint and dragging it to a new node — wired via `onReconnect` / `onReconnectStart` / `onReconnectEnd`.
6. **Cancel ergonomics.** Esc cancels an in-flight connection; releasing on empty canvas offers a "create node here" affordance (defer detail to plan 47).

## Implementation

`CanvasPanel.tsx`:

- Add to `<ReactFlow>`: `connectionRadius={60}`, `connectionMode="loose"`, `connectOnClick={false}`.
- Provide a custom `ConnectionLineComponent` that renders the same curve style as `FlexibleEdge`, plus a faint glow when within snap radius.
- Implement `onConnectStart` / `onConnectEnd` to manage a `connectingFrom` store flag; combined with `onNodeMouseEnter`, set a `.connection-target` class on the candidate node while dragging.
- Implement `onReconnectStart`, `onReconnect`, `onReconnectEnd`. On reconnect, update the edge's `sourceNodeId` / `targetNodeId` in the store atomically.
- Track an "edge handle being dragged" cursor (`cursor: crosshair`) so users know they are in connection mode.

`NodeHandles.tsx`:

- Keep the 4 source + 4 target handles, but wrap each with a transparent `padding` box: `position: absolute; inset: -8px;`. Visual unchanged, hit-test much larger.
- Add a *node-perimeter rim* element that sits behind content and is also a `Handle` (or proxies to one). Hover state on the rim shows a subtle accent halo and triggers connection on pointerdown.
- Increase visible handle size to 11×11 with thicker border (2 px) on hover so the user sees the magnetic target.

`App.css`:

- `.react-flow__node.connection-target { outline: 2px solid var(--accent); outline-offset: 4px; transition: outline-color 100ms ease; }`
- `.connection-line-glow { filter: drop-shadow(0 0 6px var(--accent)); }`
- `.markdown-node:hover .mc-handle { opacity: 1; }` (full opacity, not 0.9, so the user is sure the target is hot).

## Acceptance

1. With the cursor anywhere over a node and Shift+drag (or rim-drag), a connection starts.
2. With `connectionRadius=60`, releasing within ~60 px of any node attaches to it. No need to land on the handle dot.
3. While dragging a connection, the candidate target node visibly highlights before release.
4. Grabbing an existing edge endpoint and dragging it to a new node moves the connection (does not create a duplicate).
5. Esc cancels any in-flight connection cleanly with no orphaned state.
6. Test set: 20 random pairs at zoom 0.5 / 1.0 / 1.5 each — first-try connection success ≥ 95%.

## Risks

- `connectionMode='loose'` lets a user wire source-to-source. Validate in `isValidConnection` to forbid self-loops and degenerate cases (same node, already-connected pair) so users don't accidentally accumulate junk edges.
- Larger hit areas can swallow drag-to-pan gestures. Keep node-body drag intact by pointerdown bubbling: only the rim/handle initiates a connection, the node body initiates a move.
- React Flow handle event ordering changed across minor versions; pin `@xyflow/react` and add a smoke test.
