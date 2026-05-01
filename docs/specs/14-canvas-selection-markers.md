# 14 — Canvas Selection Markers

## Purpose

When the user asks about a passage, that passage becomes a persistent blue
marker linked to the generated answer node.

## Model

Markers are persisted with the source node:

```ts
type CanvasSelectionMarker = {
  markerId: string;
  sourceNodeId: string;
  sourceMdPath?: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  answerNodeId: string;
  question: string;
  createdAt: string;
};
```

Offsets are preferred over selected text alone because repeated text can exist.

## Behaviour

- Render markers as blue highlights inside the Markdown preview.
- Multiple markers per node are allowed.
- Clicking a marker selects/focuses the answer node and may pan the viewport.
- Avoid exact duplicate markers for the same source offsets, answer, and question.

## Acceptance

1. Asked text becomes blue after Ask completes.
2. Blue markers persist after reload.
3. Clicking a marker selects and focuses the generated answer node.
