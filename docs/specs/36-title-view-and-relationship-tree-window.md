# 36 — Title-Only Map View & Synced Relationship-Tree Window

## Purpose

Two related features that give the user "zoom-out" surfaces without rebuilding
the canvas data model:

1. **Title-only map view.** A third view mode (alongside *Current Map* and
   *Global Map*) that renders every node as a large title only. Edges,
   positions, and selections are unchanged — only the body content is
   hidden. Lets the user scan a dense canvas like a poster.

2. **Synced relationship-tree window.** A separate detached Tauri window
   that draws nodes as fixed-size title cards laid out by an automatic
   tree layouter. Clicking a node in the tree window selects + zooms to
   the corresponding node in the main canvas window. Both windows stay
   live-synced through the existing cross-window broadcast.

## Background

The canvas (React Flow / `@xyflow/react`) is a **free-form spatial
graph**: positions are user-controlled and edges have flexible lengths.
That is great for thinking, bad for getting an overview when:
- a project has dozens of theme clusters scattered across the workspace,
- a single cluster has 20 ask/insight children that overflow the
  viewport,
- the user wants to *navigate by structure* (parent → child) without
  hunting for nodes by position.

The canvas already encodes parent-child structure via `Edge.kind === 'parent'`
([types/index.ts:117](../../src/types/index.ts#L117)) and
`CanvasNode.themeId` ([useChatStream.ts:177](../../src/features/chat/useChatStream.ts#L177)).
That tree structure is what powers the cluster-select gesture
([CanvasPanel.tsx mc:select-theme-cluster handler](../../src/features/canvas/CanvasPanel.tsx)),
so we already have the data we need — what's missing is a **second projection**
of that data.

## Feature 1 — Title-only map view

### UX

- Toggle in `ViewModeToggle` ([components/ViewModeToggle/](../../src/components/ViewModeToggle/ViewModeToggle.tsx)):
  `Current Map | Global Map | Titles`
- Persisted via `settings.lastViewMode` so the choice sticks across
  sessions (today only `'current' | 'global'` is persisted via `ui.viewMode`;
  no settings change required if we just promote it to the existing slot).
- All keybindings, selection, marquee, drag, right-click menus continue
  to work — only the *render* of each node body changes.

### Render rules

When `ui.viewMode === 'titles'`:

| Node kind | Render |
|---|---|
| `theme` (root + ask/insight/decision) | Big title (≥ 18pt), no summary, no glyph border |
| `markdown` | Big title (≥ 18pt), no body, no preview |
| `pdf` / `image` / `artifact` | Big title (≥ 18pt), no thumbnail/preview |

Edges render as in the current view (no styling change).

### State model

No new persisted state. We extend the existing `ViewMode` union:

```ts
// src/store/index.ts
export type ViewMode = 'current' | 'global' | 'titles';
```

Components read `ui.viewMode` and branch their render based on it. The
existing global-map / current-map filtering logic is orthogonal and
runs as before — `'titles'` is layered on top of either base view.

### Implementation slice

| File | Change |
|---|---|
| [store/index.ts](../../src/store/index.ts) | Extend `ViewMode` union; default stays `'current'`. |
| [ViewModeToggle.tsx](../../src/components/ViewModeToggle/ViewModeToggle.tsx) | Add a third tab. |
| [MarkdownNode.tsx](../../src/features/canvas/MarkdownNode.tsx) | Read `ui.viewMode`; when `'titles'` render only the title in a `.titles-only` class. |
| [ThemeNode.tsx](../../src/features/canvas/ThemeNode.tsx) | Same. |
| [PdfNode.tsx / ArtifactNode.tsx](../../src/features/canvas/) | Same. |
| `App.css` | New `.canvas-titles-only .react-flow__node` rule that scales the title and hides body/preview elements. |

No new dependencies.

### Acceptance

1. Toggle to *Titles* — every node visibly compacts to its title at a
   larger font size; positions and edges are unchanged.
2. Selection, drag, edit, right-click menus work the same as in
   *Current Map*.
3. Reload the app — the view mode persists.
4. *Titles* respects the current/global filter; switching to *Global*
   from *Titles* re-applies the global filter without losing the
   title-only render.

## Feature 2 — Synced relationship-tree window

### UX

- Command palette: **Open Relationship Tree Window**.
- Macos menu: **Window → Open Relationship Tree** (after Canvas / Chat
  detach entries).
- On open, a new Tauri window appears with the title `Relationship Tree`,
  empty toolbar, and a tree view of the active conversation's nodes.
- Each node is a **fixed-size** card (180 × 36 px), title-only, with a
  thin border.
- Edges are **auto-laid by dagre** using fixed node spacing (rank
  separation 60 px, node separation 20 px). The user cannot drag nodes —
  the tree re-lays whenever the underlying data changes.
- Single-click on a node in the tree window:
  1. Selects that node in the tree window (subtle highlight).
  2. Sends a cross-window broadcast `focus-canvas-node` carrying
     `{ nodeId, conversationId }`.
  3. The main canvas window receives the broadcast, calls
     `setCanvasSelection([nodeId], [])`, and `flow.setCenter(node.position.x,
     node.position.y, { zoom: 1.2, duration: 250 })`.
- Double-click in the tree window mirrors the existing canvas behavior
  (jump to the chat message that minted the node, if any).
- Right-click on a tree-window node → identical context menu to the
  main canvas (Ask / Search / Open Markdown / Copy Link / etc.) — the
  selection is shared across both windows so the existing menu just
  works once the broadcast wiring is in.

### Layout — library choice

Two real options:

| Library | Size | Why / Why not |
|---|---|---|
| **`@dagrejs/dagre`** | ~70 kB gzipped | Sync, simple API, ideal for tree-shaped graphs. Recommended by the [React Flow docs](https://reactflow.dev/examples/layout/dagre). Maintained fork of the original `dagre`. |
| **`elkjs`** | ~400 kB gzipped, runs in a worker | Far more configurable but heavyweight, async, and overkill for our tree shape. |
| **`d3-hierarchy`** | ~12 kB | Pure-tree only; we have shared parent edges but also some cross-cluster `related` edges. Doesn't handle DAG. |

**Pick `@dagrejs/dagre`.** Tree-shaped data, sync API, well-supported.
Cross-cluster `related` edges are simply not fed into the layouter (or
fed in as low-weight edges that dagre can route around).

### Window plumbing

Re-uses the existing cross-window infrastructure:

- **Window creation** — extend
  [services/window/index.ts](../../src/services/window/index.ts) with
  `openRelationshipTreeWindow(chatId?: string)`. It calls
  `detachViewToWindow('tree', chatId)`. Add `'tree'` to the `view`
  union and to the Rust `detach_tab_to_window` command's accepted
  values.
- **Initial state** — the tree window's URL gets `?view=tree&tabId=<id>`.
  `getInitialView()` in `services/window` returns `'tree'`. App.tsx
  branches on `'tree'` to render `<TreePanel />` instead of the
  workspace.
- **Store sync** — the new window calls `hydrateAndWire()` like every
  other detached window, so it sees the same nodes/edges/conversations
  via the existing broadcast channel.
- **Selection sync** — already works via store-patch broadcast: when
  the tree window calls `setCanvasSelection`, every other window's
  store updates. The main canvas window's existing render reflects
  the new selection automatically.
- **Zoom-to-node** — new broadcast kind:
  ```ts
  // services/window/index.ts
  export type Broadcast =
    | { kind: 'store-patch'; data: unknown }
    | { kind: 'drag-message-start'; messageId: string }
    | { kind: 'drag-message-end'; messageId: string }
    | { kind: 'focus-canvas-node'; nodeId: string; conversationId: string }
  ```
  The main canvas window's existing `mc:focus-canvas-node` listener
  ([CanvasPanel.tsx around line 1254](../../src/features/canvas/CanvasPanel.tsx))
  already does the zoom; we plumb it from the broadcast handler so
  cross-window focus reuses the same code path.

### Render — `TreePanel.tsx`

```tsx
// src/features/tree-view/TreePanel.tsx
const nodeTypes = { tree: TreeNode };

function TreePanel() {
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const allNodes = useStore((s) => s.nodes);
  const allEdges = useStore((s) => s.edges);
  // Filter to active conversation, build dagre graph, run layout.
  const { rfNodes, rfEdges } = useMemo(
    () => layoutTree(allNodes, allEdges, conversationId),
    [allNodes, allEdges, conversationId],
  );
  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, n) => {
        broadcast({
          kind: 'focus-canvas-node',
          nodeId: n.id,
          conversationId,
        });
      }}
      fitView
    >
      <Background gap={24} />
    </ReactFlow>
  );
}
```

The dagre helper:

```ts
import dagre from '@dagrejs/dagre';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 36;

export function layoutTree(nodes, edges, conversationId) {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 20, ranksep: 60 });
  const own = nodes.filter((n) => n.conversationId === conversationId);
  for (const n of own) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) {
    if ((e.kind ?? 'parent') !== 'parent') continue;
    if (!g.hasNode(e.sourceNodeId) || !g.hasNode(e.targetNodeId)) continue;
    g.setEdge(e.sourceNodeId, e.targetNodeId);
  }
  dagre.layout(g);
  // Map back to React Flow nodes/edges with the laid-out positions.
  ...
}
```

### Implementation slice

| File | Change |
|---|---|
| `package.json` | Add `@dagrejs/dagre` (and `@types/dagre`). |
| [services/window/index.ts](../../src/services/window/index.ts) | Add `'tree'` view kind, `openRelationshipTreeWindow()`, new broadcast type. |
| `src-tauri/src/lib.rs` | Accept `view: 'tree'` in `detach_tab_to_window`; add a `Window → Open Relationship Tree` menu item. |
| New: `src/features/tree-view/TreePanel.tsx` | The new view. |
| New: `src/features/tree-view/TreeNode.tsx` | The fixed-size title card. |
| New: `src/features/tree-view/layout.ts` | Dagre helper. |
| [App.tsx](../../src/App.tsx) | Branch on `getInitialView() === 'tree'` → render `<TreePanel />`. |
| [store/persistence.ts](../../src/store/persistence.ts) | Subscribe to broadcast; on `focus-canvas-node`, dispatch `mc:focus-canvas-node` to the local window so the existing CanvasPanel handler runs. |
| [services/commands/useCommands.ts](../../src/services/commands/useCommands.ts) | New command `tree.open`. |

### Acceptance

1. Open the tree window from the command palette → a new window
   appears with a top-down dagre layout of the active conversation's
   parent-edge tree.
2. Each node card is exactly 180 × 36 px, shows only the title.
3. Cross-cluster `related` edges are not drawn (or shown faintly,
   non-routed).
4. Add a new chat message → both the main canvas and the tree window
   pick up the new node within ~700 ms (existing mirror debounce).
5. Click a node in the tree window → the main canvas window selects
   the same node and zooms to it. Tree-window selection highlight
   stays.
6. Double-click → existing "jump to chat message" behavior fires in
   the main window.
7. Right-click on a node → existing canvas context menu appears in
   the tree window with all the same options (Ask / Search / Open
   Markdown / Copy Link).
8. Closing the tree window does not affect the main canvas. Re-opening
   the tree window restores it for the same active conversation.

## Out of scope

- Editing the tree shape from the tree window (drag-to-reparent). The
  tree is a *projection*; structural edits go through the main canvas.
- A tree view inside the main workspace (instead of detached). The
  user explicitly asked for a synced *separate* window. A docked-panel
  variant could be added later by reusing `<TreePanel />` inline.
- Layouting non-tree (DAG) shapes. We feed only `parent` edges to
  dagre; cross-cluster `related` edges are out of scope.
- Persisting tree-window position / zoom across sessions. React Flow's
  fit-view at startup is sufficient for v1.

## Risks / mitigations

- **Dagre bundle size** (~70 kB) — only loaded when the tree window
  opens, via a dynamic `import('@dagrejs/dagre')` inside `layout.ts`.
  Main canvas startup is unaffected.
- **Layout flicker on every store change** — useMemo over the
  filtered nodes/edges so re-layout only runs when the relevant slice
  actually changes; debounce the dagre call by 100 ms to coalesce
  rapid-fire chat updates.
- **Cross-window selection feedback loop** — the broadcast handler
  must check `if (e.payload.sender === SENDER_TAG) return;` (already
  done in `services/window/index.ts:199`).
- **Buffer / Node-only deps in dagre** — `@dagrejs/dagre` is browser-
  pure (no `Buffer`, no `process`); verified before committing the
  dependency.

## Build order

1. Spec → review.
2. Title-only view (~half day) — small, no deps, validates that the
   render branch works without breaking selection.
3. Tree window scaffold — new window kind, empty `<TreePanel />`,
   menu/command entry. (~half day)
4. Dagre layout + fixed-size nodes. (~half day)
5. Cross-window focus broadcast. (~half day)
6. Polish: right-click menu reuse, keyboard nav, tests. (~half day)

Sources:
- [React Flow — Dagre Tree example](https://reactflow.dev/examples/layout/dagre)
- [React Flow — Elkjs Tree example](https://reactflow.dev/examples/layout/elkjs)
- [React Flow — Auto Layout overview](https://reactflow.dev/learn/layouting/layouting)
- [@dagrejs/dagre on npm](https://www.npmjs.com/package/@dagrejs/dagre)
