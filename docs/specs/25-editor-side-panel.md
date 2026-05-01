# 25 — Editor Side Panel: Outline, Backlinks, Tags

## Why

A real Obsidian-like editor needs at-a-glance navigation on three axes:
where am I in this document (outline), who points at this document
(backlinks), and what tags exist across my vault (tag pane). All three
fit on one collapsible side panel attached to the editor.

## Layout

The Markdown editor surface becomes a 2-column layout:

```
+-----------------------------+--------+
| editor (CM6 or reading)     |  side  |
|                             |  panel |
+-----------------------------+--------+
```

- The side panel is 240px wide. A small ☰ button replaces it when the
  user collapses it; the editor expands to fill.
- Three tabs across the top of the panel: **Outline**, **Backlinks**,
  **Tags**.
- Tabs are not lazy-mounted — the body re-renders per active tab. Data
  for backlinks and tags is fetched on demand and cached in module
  state.

## Outline

`extractOutline(doc)` parses the live document for ATX headings,
ignoring fenced code blocks. Output is `{ id, text, level, line }[]`.
Clicking an entry calls `editorRef.jumpToLine(line)`. The list visually
indents by heading level via `padding-left`.

## Backlinks

`findBacklinks(rootPath, currentPath)` reads every Markdown file in the
KB and grep-scans for `[[<stem>]]` or `[[<currentPath>]]` (with optional
`#anchor` and `|alias`). Hits return `{ path, stem, snippet, line }`.
The panel renders one entry per hit — clicking opens the file at the
hit line.

Performance: this is intentionally not indexed. The vault is expected
to be in the hundreds of files at most for Phase 2; we'll add an
incremental index when usage demands it (see TODO list).

## Tags

`aggregateTags(rootPath)` reads every KB file once per 30 seconds and
returns `{ tag, count }[]`, descending by count. Sources:
- Inline `#tag` tokens.
- Frontmatter `tags:` key (string list, comma-separated, or YAML
  array).

The cache invalidates automatically on `mc:knowledge-tree-refresh` so
new mirrors / created notes are reflected next time the user opens the
Tags tab.

## Acceptance

1. The editor surface includes a side panel by default.
2. The Outline tab shows the document's headings, clickable.
3. Clicking a heading scrolls the editor to that line.
4. The Backlinks tab lists files that mention the current note, with a
   snippet per hit.
5. Clicking a backlink opens the file at the matching line.
6. The Tags tab shows aggregated `#tag` counts across the KB.
7. The panel can collapse to a small button without losing state.
