# 21 — Obsidian-like Markdown Editor

## Why

The previous Knowledge Base editor was a single `<textarea>` styled with a
serif font. It worked for reading and saving, but every Markdown affordance
the user expects from Obsidian was absent: no syntax colouring, no live
preview, no clickable wikilinks, no smart selection wrapping, no real
context menu, no clean way back to the canvas. With chat history now
mirrored into the Knowledge Base (specs 15/16), the editor became the main
surface for working with that memory layer. It needs to feel like a real
editor.

## What

Replace the textarea with a CodeMirror 6 surface and put a thin React
shell around it. Add three modes (Live Preview / Source / Reading), smart
selection wrapping, wikilink autocomplete, and a real context menu — but
do **not** rebuild Obsidian. Specifically out of scope: graph view, plugin
system, full WYSIWYG, drag-drop attachment ingestion, two-way Markdown →
chat sync.

## Stack additions

```
@uiw/react-codemirror
@codemirror/lang-markdown
@codemirror/view
@codemirror/state
@codemirror/commands
@codemirror/search
@codemirror/autocomplete
@codemirror/language
```

We do not pull `@codemirror/closebrackets` separately — auto-pairing is
implemented as a small input handler so we can apply Obsidian's "wrap
selection" semantics (see §Smart wrapping) instead of the default
"insert empty pair" behaviour.

## Modes

The user picks a mode from a compact top-right switcher. The current mode
persists in `Settings.editorMode`.

| Mode          | What it shows                                                          |
|---------------|------------------------------------------------------------------------|
| Live Preview  | CodeMirror with Markdown syntax styling + Obsidian-feel typography. Phase 1 stops short of Obsidian's "fold the markup" trick — markers stay visible — but headings, bold, italic, links, code, checkboxes, tags get distinct visual styles inside the editor. |
| Source        | Same CodeMirror surface, monospace font, no typographic flourish — the reliable fallback. |
| Reading       | The existing `MarkdownRenderer` rendered into the document column. Not editable. Wikilinks are clickable and route through `mc:kb-link/<encoded>` handlers (see spec 22). |

Default: `live-preview`. If the user picks Source or Reading once, that
choice sticks across sessions (per-app, not per-file).

## CodeMirror extensions

We assemble the editor from these extensions, in order:

1. `markdown({ codeLanguages: [...] })` for syntax + nested code-block
   highlighting.
2. `history()` + `historyKeymap` for undo/redo.
3. `EditorView.lineWrapping` — wrap long lines visually.
4. `search({ top: true })` — Cmd/Ctrl+F opens an inline panel.
5. `autocompletion({ override: [wikilinkSource] })` — wikilink + tag
   autocomplete (spec 22).
6. `keymap.of([defaultKeymap, historyKeymap, searchKeymap, ...wrapBindings])`
   — wrapBindings adds Cmd/Ctrl+B/I/E/H.
7. `EditorView.inputHandler.of(smartWrapInputHandler)` — typed-character
   wrapping when there is a non-empty selection.
8. `frontmatterFold()` — turns leading `---` … `---` block into a single
   collapsible "Properties" widget.
9. `kbHighlightStyle` — colours bold, italic, headings, links, code,
   checkboxes, tags, wikilinks.
10. `kbThemeExtension(theme)` — picks light/dark CSS variables from the
    app theme.

The editor passes its current text to the React owner via `onChange`.

## Smart wrapping

When the user types into a non-empty selection, the input handler picks an
action by character:

| Typed | Wraps as           | Notes                                         |
|-------|--------------------|-----------------------------------------------|
| `*`   | `**sel**`          | Per the spec — Obsidian-style bold.           |
| `_`   | `*sel*`            | Italic. We map underscores onto asterisks for consistency with the rest of the codebase (preprocessor uses `*`). |
| `` ` ``| `` `sel` ``        | Inline code.                                  |
| `"`   | `"sel"`            |                                               |
| `'`   | `'sel'`            |                                               |
| `(`   | `(sel)`            |                                               |
| `[`   | `[sel]`            |                                               |
| `{`   | `{sel}`            |                                               |
| `=`   | `==sel==`          | Highlight (`==text==`).                       |

If the selection is **already wrapped** in the same delimiters (e.g.
`**hi**` wrapped again with `*`), we strip rather than re-wrap, so a second
press unwraps. With an empty selection we let the keystroke pass through
to the editor's normal behaviour — including the auto-pair side from
`smartPairOnEmpty` for `(`, `[`, `{`, `"`, `'`. We do not auto-pair `*`,
`_`, `` ` ``, or `=` because they're more useful as single-character
markers when the user is typing prose.

Keymap commands:
- `Mod-b` — toggle `**bold**` around the current selection or cursor word.
- `Mod-i` — toggle `*italic*` around the current selection or cursor word.
- `Mod-e` — toggle `` `code` ``.
- `Mod-Shift-h` — toggle `==highlight==`.

## Frontmatter / Properties

If the document opens with a YAML frontmatter block (`---\n…\n---`), a
small "Properties" header appears at the very top of the document line.
The block itself is folded by default; clicking the header expands it for
raw YAML editing in the same CodeMirror surface. We do **not** build a
typed property editor in Phase 1 — preserving the frontmatter exactly is
the only contract.

Implementation: a `RangeSetBuilder` that produces a `Decoration.replace`
spanning the leading frontmatter range when collapsed, with a
`WidgetType` that renders the header. State (collapsed / expanded) lives
in a small `StateField` keyed by the editor instance.

## Header chrome

The top bar carries:
- Breadcrumb path + filename.
- Mode switcher (`Live` / `Source` / `Read`) — a 3-segment toggle.
- Save state pill (`Saved` / `Unsaved` / `Saving…`).
- Save button.
- Close button (returns to canvas — see spec 23).

The footer keeps the path + word/char count.

## Persistence integration (unchanged contract)

- `Cmd/Ctrl+S` saves; on save, canvas nodes whose `mdPath` matches
  receive a `contentMarkdown` update.
- The mirror banner (see spec 15) still appears for `source: internal-chat`
  files.
- Errors fall into the existing inline error strip.

## Acceptance

1. The editor uses CodeMirror 6, not a textarea.
2. Markdown syntax is coloured in Source / Live modes.
3. Reading mode renders through the existing `MarkdownRenderer`.
4. Mode switcher is compact and sits in the header.
5. Cmd/Ctrl+S still saves, dirty/save state still works, canvas-node
   propagation still works.
6. Smart wrapping behaves as listed above.
7. Cmd/Ctrl+B / +I / +E / +Shift-H toggle wrap commands.
8. Cmd/Ctrl+F opens the editor's search panel and does not hijack
   the global app search.
9. Frontmatter renders as a foldable "Properties" header.

## Out of scope (Phase 1)

- WYSIWYG-style "fold the markdown markers" behaviour Obsidian shows in
  its real Live Preview.
- Drag-and-drop attachments into the editor (left as a TODO).
- Plugin / extension system.
- Backlinks pane, outline / TOC sidebar, graph view.
