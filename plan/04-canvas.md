# 04 — Canvas with React Flow + "Add to canvas"

**Goal:** chat messages can be turned into draggable nodes; positions persist.

**Depends on:** 03.

## Canvas (`src/features/canvas/`)

- Mount `<ReactFlow>` in the left pane, wrapped in `<ReactFlowProvider>`.
- Background: `<Background variant="dots" gap={24} size={1} />`.
- Custom node type `MarkdownNode` rendering `react-markdown` + `remark-gfm`. Disable raw HTML.
- Wire `onNodesChange` / `onEdgesChange` (from `useNodesState` / `useEdgesState`) to write back to the Zustand store.
- Persist viewport per conversation (`onMoveEnd` → `settings.viewportByConversation[currentId]`).
- Restore viewport on conversation switch.

## Add-to-canvas button

- Each `MessageList` row gets a small "Add to canvas" button.
- Click → create `CanvasNode`:
  - `sourceMessageId = message.id`
  - `contentMarkdown = message.content`
  - `title = ""` (or first line, trimmed to ~40 chars)
  - `position = screenToFlowPosition(viewportCenter)`
- Use `useReactFlow().screenToFlowPosition`.

## Acceptance

- Messages become nodes that render Markdown.
- Drag a node, reload, node is in the same place.
- Two messages → two distinct nodes.
- Pan/zoom persists across reload per conversation.

## Risks

- React Flow strict-mode double-render warnings — fine, but ensure node ids are stable (use `nanoid` once at creation; never index).
- Markdown content with `<script>` — `react-markdown` is safe by default, but explicitly disable raw HTML to be sure.
- Forgetting `<ReactFlowProvider>` → `screenToFlowPosition` throws.
