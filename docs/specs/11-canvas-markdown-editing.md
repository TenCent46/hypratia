# 11 — Canvas Markdown Editing

## Purpose

Canvas cards are editable Markdown documents, not static chat excerpts. The
canvas remains the primary learning surface while Markdown files remain the
canonical durable source.

## Model

Every Markdown canvas node has a stable Markdown source:

```ts
type CanvasNode = {
  id: string;
  mdPath?: string;
  title: string;
  contentMarkdown: string; // cached preview of the canonical file
  position: { x: number; y: number };
  width?: number;
  height?: number;
};
```

`mdPath` points to the canonical `.md` file under the configured Markdown
storage root. `contentMarkdown` is a local cache used for canvas rendering and
is refreshed on save.

## Interaction

- Double-click a Markdown node to enter edit mode.
- Edit mode renders a Markdown textarea inside the node.
- `Cmd/Ctrl+Enter` saves.
- Blur saves.
- `Escape` cancels local edits and restores the previous preview.

## Rules

- If a node has no `mdPath`, create its canonical Markdown file before saving.
- Saving writes the Markdown file and updates the node cache.
- Do not create divergent duplicate Markdown content.
- Text editing must not trigger canvas tool shortcuts, marquee selection, node
  dragging, or hand panning.

## Acceptance

1. User can edit Markdown inside a canvas node.
2. Edits are saved to the linked `.md` file.
3. Markdown preview updates after save.
4. Existing drag/drop, selection, node resizing, panning, and zooming still work.
