# 22 — Editor Wikilinks & Autocomplete

## Why

Spec 21 swaps the textarea for a CodeMirror surface. To feel Obsidian-like,
that surface needs `[[wikilink]]` autocomplete and reading-mode navigation
to the linked file. The existing `MarkdownRenderer` already handles
`[[id|alias]]` against canvas-node ids; here we add the second meaning
of wikilinks — references to **Knowledge Base files**.

## Two meanings of `[[...]]`

The codebase has two wikilink shapes:

| Shape                       | Resolves to        | Owned by                       |
|-----------------------------|--------------------|--------------------------------|
| `[[node-<id>]]` / `[[<id>]]`| canvas node by id  | `MarkdownRenderer` + `preprocess.ts` |
| `[[Note Title]]`            | KB Markdown file   | new `kb-link` resolver (this spec) |

The disambiguator in reading mode is the prefix: any target starting with
`node-` keeps its existing canvas-node behaviour; everything else is
treated as a KB file reference.

## Source-mode autocomplete

CodeMirror autocomplete source. Trigger conditions:

- The character just typed is `[` and the previous character is also `[`,
  or
- The cursor sits inside an in-progress `[[…` that has not yet been
  closed by `]]`.

Implementation: a single `CompletionSource` that calls
`context.matchBefore(/\[\[[^\]]*$/)`. If null, no completion. Otherwise
the captured tail (`[[<query>`) is the user's filter.

Source data:
- The Knowledge Base tree (already loaded by the explorer).
- Cached in a small module-level `lastTreeSnapshot` keyed by root path.
- Refreshed whenever `mc:knowledge-tree-refresh` fires.

The completion list:
- File stem (filename without `.md`) is the label.
- Sort: best `startsWith` match first, then `includes`, then everything
  else; alphabetical inside each band.
- Inserted text is `[[<stem>]]` and the cursor lands after the closing
  `]]`.
- Selecting a folder inserts `[[<relative/path>]]` if the user typed a
  `/`. Otherwise we insert just the stem.

Aliases: typing `|` after the autocomplete-inserted target switches to
"alias mode" — the user can type a label freely; no second autocomplete
runs.

## Click-to-open in source mode

Decoration: scan the visible viewport for `[[…]]` tokens (skipping ones
inside fenced code). Each match becomes a `Decoration.mark` with the
`cm-kb-wikilink` class and a stored target. Clicking the decoration with
`metaKey` (or plain click on the rendered link in reading mode) dispatches
`mc:open-markdown-file` with the resolved path.

Resolution rules for an editor click:
1. If the target contains `/`, treat as a path under the KB root and try
   `<root>/<target>.md` (append `.md` if missing).
2. Otherwise look up `lastTreeSnapshot` for a file whose stem (or
   filename) equals the target.
3. If no match, the link renders with the `cm-kb-wikilink-broken` class
   and a click offers to **create** the note: a new file under
   `<root>/<target>.md` is created via `markdownFiles.createFile` and
   then opened.

## Reading-mode rendering

A new `KbReadingView` component reuses the existing `MarkdownRenderer`
machinery but with a custom preprocessor that converts:

- `![[<target>]]` → fall through to the existing transclusion handler
  if the target looks like a node id; otherwise render a small "embed
  not supported here" placeholder. Phase 1 punts on file embeds.
- `[[<target>|<alias>]]` where `<target>` does **not** start with
  `node-` → `[<alias or target>](mc:kb-link/<encoded>)`.
- `[[node-<id>|<alias>]]` (or any id-shaped target) → existing
  `mc:wikilink/<id>` handler. No regression here.

The renderer's `a` override gains a third branch: `mc:kb-link/<encoded>`
calls `dispatchEvent('mc:open-markdown-file', { path: <resolved> })`.
Resolution uses the same rules as the source-mode click handler.

## Tags

Phase 1 tag support is intentionally minimal:

- The CodeMirror Markdown grammar already tags `#tag` tokens; we add a
  `kbTag` highlight rule and a `cm-tag` class so they look like Obsidian
  pill chips.
- A second autocompletion source fires inside a `#…` token. The list is
  the union of:
  - Tags found in the current document (regex `/(?:^|\s)#([\w/-]+)/g`).
  - Tags from `state.nodes[].tags` so canvas-node tags surface here too.
- Reading mode renders `#tag` as a styled span. Clicking is a no-op for
  Phase 1 (tag search lives in the existing global search).

## Commands

Added to `useCommands.ts`, in the new `Editor` section:

- `editor.insert-wikilink` — opens autocomplete with `[[` pre-inserted at
  the cursor.
- `editor.open-link-under-cursor` — resolves and opens the wikilink under
  the cursor.
- `editor.create-note-from-link` — runs the create flow on an unresolved
  link.

These commands are gated by the editor having focus (the dispatcher
checks for an editor instance registered in module state).

## Acceptance

1. Typing `[[` opens the autocomplete dropdown.
2. The list contains stems of KB Markdown files.
3. Selecting an item inserts `[[Stem]]` and closes the popup.
4. Cmd-clicking a `[[Note Title]]` token in source mode opens the file in
   the editor.
5. Reading-mode `[[Note Title]]` renders as a clickable link that opens
   the same file.
6. Reading-mode `[[node-<id>]]` still routes through the canvas-node
   wikilink path — no regression.
7. An unresolved link is visually distinct and offers to create the note.
8. `#tag` tokens have a tag class in the editor and reading view.
