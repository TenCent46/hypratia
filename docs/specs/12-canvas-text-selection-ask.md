# 12 — Canvas Text Selection Ask

## Purpose

Research questions should start from selected passages on the canvas and produce
new durable notes on the same canvas, instead of becoming buried in a vertical
chat log.

## Workflow

1. User selects text inside a Markdown node preview.
2. User right-clicks the selected passage.
3. Context menu offers `Ask`, `Search`, `Copy`, and `Open Markdown`.
4. `Ask` opens a small modal titled `Ask about selection`.
5. Submit sends a context packet to the existing chat/LLM system.
6. The assistant answer becomes a new Markdown canvas node near the source node.
7. The source node and answer node are connected by an edge.

## Context Packet

```ts
type CanvasSelectionAskContext = {
  selectedText: string;
  sourceNodeId: string;
  sourceNodeTitle: string;
  sourceMdPath?: string;
  sourceMarkdownContent: string;
  selectionStartOffset: number;
  selectionEndOffset: number;
  connectedNodeSummaries: string[];
  userQuestion: string;
};
```

## Rules

- This is canvas-native. Do not open a separate research tool.
- The generated answer is also logged to chat history.
- The generated answer is saved as Markdown and linked to the answer node.
- Initial search can use ordinary Markdown full-text search.

## Acceptance

1. Selecting text and right-clicking shows `Ask`.
2. `Ask` opens a question modal with a compact selected-text preview.
3. Submitting creates an answer node near the source node.
4. The answer is saved as Markdown and appears in chat/history/file tree.
5. Source and answer are connected by an edge.
