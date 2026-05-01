# 16 — Knowledge Base: Search & Context Actions

## Why

Now that chat history is mirrored into Markdown (see spec 15), the
Knowledge Base file tree fills up quickly. Users need a fast way to find a
file by name or content, and a small set of actions per file so the
Knowledge Base feels like a usable memory layer rather than a passive
tree.

## Header controls

The Knowledge Base header carries the existing New Note / New Folder /
Refresh / Reveal buttons plus a new **Sync now** button (`↻`) that
dispatches `mc:knowledge-sync-request`. The persistence layer listens for
that event, cancels any pending debounced sync, and runs the mirror
immediately. The button is disabled while a sync is in flight.

Sync results emit a transient toast (4 s) inside the section; errors use
a danger style, success uses an accent style.

## Search input

A single text input lives in the Knowledge Base header, above the tree.

- Case-insensitive substring match.
- Matches **filename** and **path** synchronously against the already-loaded
  tree.
- A debounced (200 ms) async pass also searches **file contents** by
  reusing `services/markdown/MarkdownSearchService.searchMarkdownFiles`
  with `scope: 'all'`. Results merge into the same list.
- Empty query → tree falls back to the regular hierarchical view.

Result row layout:

```
<file name>            <small badge if mirrored>
<path>
<snippet — only when content matched>
```

Clicking a result opens the file in the Markdown editor (same path as
clicking a tree row).

Phase 1 caps search results at 80 (the existing service cap). Pagination
is a follow-up.

## Context-menu actions

Right-click on a Markdown file row exposes:

| Action               | Behaviour                                                                  |
|----------------------|----------------------------------------------------------------------------|
| Open                 | Opens the file in the Markdown editor (existing behaviour).                |
| Open in Canvas       | Creates a Markdown canvas node bound to `mdPath` and switches to canvas.    |
| Ask with this file   | Opens the existing AI Palette pre-loaded with the file content as the selection. |
| Reveal in Finder     | Existing behaviour, kept.                                                  |
| Copy Obsidian Link   | Copies an `[[<filename>]]` wikilink (without the `.md`) to the clipboard.  |
| Delete               | Existing two-step confirm + delete (kept).                                 |

Folder rows still expose only New Note / New Folder / Rename / Reveal /
Delete.

### Open in Canvas

- Reads the file via `markdownFiles.readFile`.
- Resolves the active conversation (`ensureConversation` semantics).
- Calls `addNode({ kind: 'markdown', mdPath, contentMarkdown, … })`.
- Dispatches `mc:open-markdown-file` with empty path so the canvas pane is
  shown.

### Ask with this file

Phase 1 implementation: opens the AI Palette via
`useStore.getState().openAiPalette(content, 'kb-file:<path>')`. The user
can then run any preset (summarise, extract, custom prompt) against the
file content.

If the file is large (> 64 KB) we truncate to the first 64 KB and append a
`…[truncated]` marker so the palette stays responsive. A toast records the
truncation.

### Copy Obsidian Link

`navigator.clipboard.writeText(\`[[${stem}]]\`)` where `stem` is the file
name without the `.md` extension. The user can paste the result into any
Obsidian-compatible editor.

## Out of scope (Phase 1)

- Semantic / vector search.
- Tag / frontmatter filters.
- Multi-select bulk actions.
- Full text indexing in a sqlite-style cache. Today every content search
  re-reads files; that is fine at hundreds of files and is the easiest
  thing that works.

## Acceptance

1. The Knowledge Base header has a search input.
2. Typing a query filters the tree by filename / path immediately.
3. Content matches arrive within ~200 ms after the user stops typing and
   include a snippet.
4. Right-clicking a file shows the new actions; each action either runs
   end-to-end or reports a console error without crashing the explorer.
5. Existing folder operations (New Note / Rename / Delete / Reveal) still
   work.
