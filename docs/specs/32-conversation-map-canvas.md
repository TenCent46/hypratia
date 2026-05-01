# 32 — Conversation Map (canvas pivot)

## Why

The canvas is being repositioned. Until now it has been a working surface
for full Markdown documents — long scrollable cards holding research
notes, chat copies, and edited Markdown sources. We are pivoting it to a
**compact navigation map** of the user's conversation history. Each node
is a *theme*, *ask*, *insight*, or *decision*; the right pane is the
chat where the underlying messages live. Clicking a node jumps the chat
to that message. The canvas becomes a memory map, not a reader.

The Obsidian-style local Markdown editor (specs 21–28) is **not**
affected by this pivot. Editing a `.md` file inside the knowledge-base
explorer continues to use the dedicated editor surface; only the canvas
node-rendering changes.

## Scope of this spec

- New compact node kind on the canvas: `theme`.
- Auto-create a node every time the user sends a chat message.
- Edge taxonomy: `parent` (within a theme tree) and `related`
  (cross-theme association).
- Click a node → chat panel scrolls/jumps to the source message.
- Persist via the existing `nodes.json` / `edges.json` files; no new
  storage surface.
- AI-assisted classification of an ask into theme / new-theme /
  insight / decision; heuristic fallback when no LLM key is set.

## Out of scope

- Removing or migrating existing `markdown` / `image` / `pdf` /
  `artifact` nodes. They keep working alongside `theme` nodes. A
  later spec can prune or visually downsize them once the new map is
  the default reading surface.
- Cross-conversation related-topic edges via embeddings. Only
  parent-child edges are auto-created in v1; `related` edges exist as
  a kind but are user-drawn for now.
- Editing the Markdown file referenced by a theme node from the
  canvas. The user opens it in the Markdown editor as today.

## Data model

The user's spec'd `GraphNode` and `GraphEdge` map onto the existing
`CanvasNode` / `Edge` shape — no new tables. The mapping:

| GraphNode field   | CanvasNode location                                   |
| ----------------- | ------------------------------------------------------ |
| id                | `id`                                                   |
| type              | `kind` (extended with `'theme'`)                       |
| title             | `title`                                                |
| summary           | `contentMarkdown` (1-line plain text in this kind)     |
| conversationId    | `conversationId`                                       |
| messageId         | `sourceMessageId`                                      |
| parentId          | derived from a `parent` edge whose target is this node |
| themeId           | new field on `CanvasNode`: `themeId?: ID`              |
| tags              | `tags`                                                 |
| importance        | new field: `importance?: 1 \| 2 \| 3 \| 4 \| 5`        |
| createdAt         | `createdAt`                                            |
| x, y              | `position.x`, `position.y`                             |

`Edge` gains a `kind?: 'parent' | 'related'` field. Untyped legacy
edges remain valid and render as the existing line style.

`CanvasNodeKind` extends to:

```ts
export type CanvasNodeKind =
  | 'markdown'
  | 'image'
  | 'pdf'
  | 'artifact'
  | 'theme'; // new
```

`themeKind` on a theme node further classifies it without extending
`CanvasNodeKind`:

```ts
type ThemeKind = 'theme' | 'ask' | 'insight' | 'decision';
// Stored as a tag on the node: `themeKind:ask` etc.
```

## Visual

A `theme` node renders as a flat compact card — Obsidian-like, single
row of typography:

- Width: `200px` default, resizable.
- Height: auto from content (~64–88px typical).
- Title: 14px serif, max 1 line, ellipsized.
- Summary: 12px sans, max 1 line, muted.
- Optional kind glyph in the top-right corner (`?` for ask, `!` for
  insight, `✓` for decision; theme parent has none).
- Optional importance dot (1..5) in the top-left, color-mixed with
  the conversation hue.

No body, no scroll, no Markdown render. Click anywhere on the node
fires the jump; right-click reuses the existing
`NodeContextMenu`.

## Auto-create on user ask

Hook the chat send flow at the same point that already calls
`appendMessage` for the user's text. After the user message is
persisted (so we have its `messageId`):

1. Call `themes.classify({ conversationId, message, recentNodes })`.
2. Receive `{ themeId, isNew, themeTitle, askSummary, themeKind,
   importance }`.
3. If `isNew`: create a `theme` node (no `themeId` of its own; it
   *is* the theme root) at a fresh canvas slot, tagged
   `themeKind:theme`.
4. Always create an `ask` node for this user message (tagged
   `themeKind:ask`), linked to the theme root via a `parent` edge.
5. Persist position via the existing `placeChildNodeNear` placement
   helper to keep the tree readable.

Assistant replies do **not** auto-create nodes. They are reachable
through the chat side; if the user wants to pin a particular reply as
an `insight` or `decision`, they invoke an existing canvas action
(`Pin to map` — added as a chat-message context-menu item, see UI
section).

## Classification

`services/themes/Classifier.ts` exposes:

```ts
export interface Classifier {
  classify(input: {
    conversationId: ID;
    message: string;
    recentNodes: Pick<CanvasNode, 'id' | 'title' | 'contentMarkdown' | 'tags'>[];
  }): Promise<{
    themeId: ID | null;
    isNew: boolean;
    themeTitle: string;
    askSummary: string;
    themeKind: ThemeKind;
    importance: 1 | 2 | 3 | 4 | 5;
  }>;
}
```

Two implementations:

1. **HeuristicClassifier** (offline, default fallback)
   - If `recentNodes` is empty for the conversation → new theme.
   - Else attach to the most recent theme root in the same
     conversation; reuse its `themeId`.
   - `themeTitle`: first 60 chars of the message, sentence-cased.
   - `askSummary`: first 80 chars, ellipsized.
   - `themeKind`: `ask`.
   - `importance`: 3 (neutral).

2. **LLMClassifier** (when an Anthropic or OpenAI key is set)
   - One short call: "Given the user's new message and these recent
     theme summaries (id + title), return JSON
     `{ themeId | null, isNew, themeTitle, askSummary, themeKind,
     importance }`."
   - Routes through `services/llm/`. Uses the conversation's current
     model. ~200 input tokens, ~120 output tokens — cheap.
   - Falls back to the heuristic on any error.

The classifier choice is decided per-call: if the active provider has
a verified key, use the LLM path; else heuristic. The user can hard
force the heuristic via `settings.themes.classifier = 'heuristic'`.

## Click-to-jump

Clicking a `theme` / `ask` / `insight` / `decision` node:

1. The canvas dispatches a custom DOM event:
   `window.dispatchEvent(new CustomEvent('mc:scroll-to-message',
   { detail: { conversationId, messageId } }))`.
2. `ChatPanel` mounts a listener: if the event's
   `conversationId` matches the active conversation, it
   `scrollIntoView({ behavior: 'smooth', block: 'center' })` on the
   element with `data-message-id={messageId}`. Otherwise it switches
   conversation first via `setActiveConversation`, then defers the
   scroll until the new messages mount (one `requestAnimationFrame`
   tick).
3. The target message gets a temporary highlight class
   (`message--flash`) for 1.2s.

Existing markdown / image / pdf / artifact nodes ignore the click-jump
path; they keep their existing double-click-to-edit behavior.

## Edges

| Kind     | Visual                | Auto-created                                          |
| -------- | --------------------- | ----------------------------------------------------- |
| parent   | solid 1px line        | yes — `theme` ↔ `ask` (and any future `insight`)      |
| related  | dashed 1px line       | no — user draws via the existing connect handle       |
| (no kind)| existing default      | legacy edges keep working                             |

Stored on the existing `Edge` row as `kind?: 'parent' | 'related'`.
The edge renderer in `CanvasPanel.tsx` reads `edge.kind` and applies
`strokeDasharray` for `'related'`.

## Persistence

No new files. The existing `nodes.json` and `edges.json` (per-app-data)
absorb the new fields. `CanvasNode.themeId` and `CanvasNode.importance`
are optional, so old saves load unchanged. Edge `kind` is optional.

`schemaVersion` does **not** bump — pure additive change.

## UI surface

- Canvas: new node type `theme` registered in
  `CanvasPanel.tsx::nodeTypes`. Component lives in
  `src/features/canvas/ThemeNode.tsx`.
- Chat panel: each `<MessageRow>` gets a `data-message-id` attribute so
  the scroll-to-message handler can find it.
- Chat-message context menu (existing): adds a `Pin to map →
  insight | decision` submenu so users can mint nodes from
  assistant replies.
- Settings: a new row under Canvas (or a new section): "Theme
  classifier — Auto / Heuristic only / LLM only".

## Hard rules

- Auto-creating a node never blocks the chat send. The user message
  appears immediately; the classification runs after, and the node
  pops in when ready.
- A failed classifier call falls back to the heuristic silently.
- Theme nodes are 1 line of summary; the renderer truncates with
  `text-overflow: ellipsis`. No multi-line bodies, no Markdown
  render in this node kind.
- The canvas pivot does not touch the Markdown editor or knowledge
  base. `MarkdownNode` stays as the rendering surface for legacy
  document nodes; the editor side panel (specs 21–28) is unchanged.

## Acceptance

1. `pnpm tsc --noEmit` clean.
2. Sending a user message in chat produces a `theme` node on the
   canvas. Subsequent messages in the same conversation become `ask`
   children of that theme. Starting a new conversation produces a
   new theme root.
3. Clicking a theme node scrolls the chat panel to that user
   message and flashes it.
4. With no API key configured, the heuristic classifier still
   produces sensible parent/child placement.
5. Existing `markdown` / `image` / `pdf` / `artifact` nodes
   continue to render and edit as before; the Markdown editor
   panel is unaffected.
6. Reload preserves theme nodes, ask nodes, and parent/related
   edges.
7. Drawing a manual edge between two theme roots and tagging it
   `related` renders a dashed line.

## Migration / follow-ups

- A separate spec will decide whether to convert legacy
  `markdown` nodes into `theme` summaries, hide them by default, or
  keep coexistence permanent.
- Embedding-based related-topic edge inference belongs in a
  follow-up that reuses the existing `services/embeddings/` plumbing.
- A "rewrite theme title" command will let the user rename a theme
  root without losing its `themeId` linkage.
