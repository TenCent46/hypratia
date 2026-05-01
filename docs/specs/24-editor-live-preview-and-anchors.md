# 24 — Live Preview Decorations & Wikilink Anchors

## Why

Spec 21 shipped a "live preview that styles markers" — markers stay visible
even when the cursor leaves the line. That falls short of Obsidian's actual
Live Preview, where `**bold**` reads as bold (no asterisks) until you put
the caret on the line. Spec 22 also covered only flat `[[Note]]` targets;
Obsidian additionally supports `[[Note#Heading]]` and `[[Note#^block-id]]`.
This spec fills both gaps.

## Live preview marker fold

- A new CodeMirror plugin walks the markdown syntax tree and produces
  `Decoration.replace` ranges over `HeaderMark`, `EmphasisMark`,
  `StrongMark`, `StrikethroughMark`, `LinkMark`, and `URL` nodes.
- A range is **kept visible** when it sits on a line that contains any
  selection range (cursor or selection endpoint). Otherwise the range is
  collapsed to width zero.
- Code blocks (`FencedCode`, `CodeBlock`, `InlineCode`) are skipped so
  developer prose keeps reading correctly.
- The plugin is enabled only in `live-preview` mode; in `source` mode the
  enable lambda short-circuits to an empty decoration set, so swapping
  between modes does not rebuild the editor.

We do **not** swap visible content for rendered HTML; this is "hide the
markup" rather than "render the markup". That is enough for the typical
"reads like a clean note" feel without the structural tax of full
WYSIWYG.

## Heading & block anchors

- `parseWikilinkTarget(target)` splits on the first `#`. A leading `^`
  on the right side flips the anchor kind from `heading` to `block`.
- `resolveKbWikilink(rootPath, target)` returns
  `{ path, anchor }`; existing callers that only want the path use the
  thin wrapper `resolveKbWikilinkTarget`.
- The Cmd-click handler in `wikilinkDecorations` dispatches
  `mc:open-markdown-file` with `{ path, anchor }`.
- `MarkdownDocumentEditor` listens for that event. If the path is the
  file already open, it resolves the anchor against the current document
  via `findAnchorLine` and calls `editorRef.current.jumpToLine(...)`.
  When the path is a different file, `App.tsx` continues to handle the
  open — the new editor mounts, then receives the same anchor event
  during its own listener registration and scrolls into view.

`findAnchorLine` is intentionally tolerant: heading lookups are
case-insensitive on the heading text; block lookups search for `^id` as
a substring on any line. Block IDs that do not exist resolve to "no
jump" rather than failing the open.

## Acceptance

1. In live-preview mode, `**bold**` text shows the asterisks only when
   the cursor is on the same line.
2. Switching to source mode reveals all markers and disables the fold.
3. `[[Note#Heading]]` clicked with Cmd-click opens the file and scrolls
   to that heading.
4. `[[Note#^id]]` clicked with Cmd-click opens the file and scrolls to
   the block containing `^id`.
5. Anchor scrolling works both within the currently open file and after
   navigating to a different file.
