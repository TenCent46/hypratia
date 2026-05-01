# Local Markdown Search

## Goal

Search must work over selected canvas context and the full local Markdown knowledge base.

## Modes

- `Selected context`: searches canonical Markdown files for selected canvas nodes.
- `All Markdown`: searches every `.md` file under the current Markdown root.

## Search Algorithm

Initial implementation uses case-insensitive substring search.

- No embeddings.
- No indexing database.
- No persistence.
- Tree traversal comes from the existing Rust `list_markdown_tree` command.

## Result Shape

```ts
{
  path: string;
  title: string;
  snippet: string;
  nodeId?: string;
}
```

## UI

- Context menu item: `Search`.
- Opens a modal with a query field and segmented target control.
- Results show title, path, snippet.
- Clicking a result opens the Markdown file if possible, or focuses the related canvas node.

## Non-Goals

- No semantic search until full-text search is reliable.
- No file watching or background indexer.
