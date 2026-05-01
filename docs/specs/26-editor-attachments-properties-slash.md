# 26 — Editor Attachments, Properties, and Slash Palette

This spec covers three smaller surfaces shipped together because they
all hang off the editor view: drag-drop attachments, the Properties UI
for frontmatter, and the in-editor slash command palette.

## Drag-and-drop attachments

`attachmentDrop()` is an `EditorView.domEventHandlers` extension that
intercepts `dragover` / `drop` / `paste` events containing files.

Flow:

1. Compute the drop position via `view.posAtCoords` (or the caret for
   pastes).
2. Insert one placeholder per file: `![[uploading: <name>]]`.
3. For each file, call `attachments.ingest({ kind: 'bytes', ... })`,
   which writes the file under `attachments/YYYY-MM/` and returns an
   `Attachment` record.
4. Replace each placeholder with the final reference:
   - `![[<filename>]]` for images.
   - `[[<filename>]]` for everything else.
5. The `Attachment` record is added to the Zustand store via
   `addAttachment` so it shows up in the canvas / chat references too.

We accept multi-file drops: placeholders are space-separated and each
file ingests independently. A failed ingest leaves an HTML comment in
place of the placeholder so the user can see why.

## Properties UI

`PropertiesEditor` renders above the editor when frontmatter exists.

- Collapsed by default — header reads "Properties (N)".
- Expanded, each scalar key becomes a typed input:
  - `string` → `<input type="text">`
  - `number` → `<input type="number">`
  - `boolean` → `<input type="checkbox">`
  - array of scalars → comma-separated text input
  - anything else (nested objects, dates we haven't typed) → read-only
    JSON code, so we never round-trip lossily.
- On change we re-emit the full document via `gray-matter.stringify`.
  The editor's existing change handler picks it up and the save path
  works unchanged.
- The Phase 1 frontmatter-fold gutter from spec 21 still functions for
  users who prefer raw YAML.

## Slash command palette

`slashCommandAutocomplete()` registers a CodeMirror `CompletionSource`
that matches `/<query>` only at the start of a (whitespace-only) line.
Selecting an option either:

- Inserts a snippet (heading, list, task, callout, code block, table,
  wikilink scaffold) and places the cursor at a sensible offset, or
- Erases the `/<query>` token and dispatches a window event such as
  `mc:editor-toggle-mode` / `mc:editor-save` / `mc:editor-close` so the
  editor's existing event listeners run the action.

The palette is intentionally a fixed registry, not plugin-driven, so
it can stay synchronous and bounded. The plugin API stub (spec 27) is
the hook for future expansion.

## Acceptance

1. Dropping a file on the editor inserts an Obsidian-style reference
   and saves the bytes under `attachments/YYYY-MM/`.
2. Pasting an image from the OS clipboard works the same way.
3. Frontmatter `properties:` are editable from the panel above the
   editor.
4. Typing `/h2` at line start surfaces the Heading 2 snippet; selecting
   it inserts `## ` at the caret.
5. `/save` and `/close` run the corresponding editor commands.
