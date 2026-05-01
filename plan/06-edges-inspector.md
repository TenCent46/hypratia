# 06 — Manual edges + node inspector

**Goal:** users can connect nodes with edges and edit node content.

**Depends on:** 05.

## Edges

- Enable connection handles (`<Handle type="source" />` / `<Handle type="target" />`) on `MarkdownNode`.
- `onConnect` → create `Edge`, push to store.
- Edge selection + Backspace deletes; right-click also deletes.
- Deleting a node cascades: remove edges referencing the node id.
- Edge style: thin grey, slight curve, accent on hover/select.

## Node inspector (`src/components/NodeInspector/`)

- On node click, open a right-side inspector panel. Replace the chat panel via tabs at the top of the right pane: **Chat** / **Inspect**.
- Fields: `title`, `contentMarkdown` (textarea + preview toggle), `tags` (comma input).
- Save on blur, debounced 300 ms. Update `updatedAt`.
- "Delete node" button at the bottom (with confirm).

## Acceptance

- Drag from one node's handle to another → edge persists across reload.
- Edit node title in inspector → reflected in graph immediately.
- Delete a node → its edges are gone from store and from React Flow.
- Tab switching between Chat and Inspect doesn't lose state.

## Risks

- Forgetting to cascade delete → orphan edges that React Flow can't render. Always clean up edges on node removal.
- Inspector ↔ chat tab fight: pick tabs over split-pane at MVP — simpler and avoids a second resize.
- Markdown textarea losing focus on every store update → keep local state for the textarea, push to store on blur or debounce.
