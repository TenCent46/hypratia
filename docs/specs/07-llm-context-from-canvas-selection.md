# LLM Context From Canvas Selection

## Goal

Selected canvas nodes should become active LLM context. The user selects spatial knowledge objects, chooses Ask, enters a question, and the chat answer uses the selected Markdown files and edge relationships.

## Context Packet

For selected nodes and edges, resolve:

- node ids
- node titles
- canonical Markdown paths
- Markdown contents
- edge ids
- source and target node ids
- edge labels
- existing `[[wikilinks]]` among selected notes

## Canonical Markdown Source

Every selected markdown node must resolve to one canonical Markdown file.

- If a node already has `mdPath`, read that file.
- If it has no `mdPath`, create a file under `Canvas Nodes/` in the local Markdown root, write the node content, and store the resulting path back on the node.
- This avoids hidden divergent copies.

## Ask Flow

- Context menu item: `Ask`.
- Opens `Ask selected context` modal.
- Modal shows selected note/link counts.
- User submits a question.
- The visible chat message shows only the user question and a compact context chip.
- The hidden LLM history includes a system context block containing selected file contents and edge relationships.
- The active chat tab is used by default, matching existing app behavior.

## Chat Display

Messages may carry:

```ts
contextSummary?: {
  fileCount: number;
  edgeCount: number;
  fileNames: string[];
}
```

The message list renders this as a compact context chip above the visible content.

## Non-Goals

- No connector/skill system.
- No vector retrieval.
- No ugly pasted raw context in the visible user message.
