# 23 — Editor Context Menu & Return-to-Canvas

## Why

When the Markdown editor opens it replaces the canvas in the workspace
pane. There is no obvious way back to the canvas. The browser's default
context menu fires inside the editor and offers nothing useful. A user
can edit a file but feels trapped in editor view.

This spec adds a custom right-click menu, a dirty-state guard on close,
and a clean return path to the previous canvas/workspace context.

## Context menu

Right-clicking inside the editor surface opens a custom menu. It
suppresses the browser's default. Items, in order:

1. **Save** — runs the existing save path; disabled when not dirty.
2. **Close Editor / Return to Canvas** — runs the dirty-guarded close
   flow described below.
3. **Reveal in Finder** — calls `markdownFiles.reveal` on the current
   path.
4. **Copy Obsidian Link** — copies `[[<stem>]]` to the clipboard.
5. **Copy Markdown Path** — copies the relative path under the KB root.
6. **Open in Canvas** — adds the current file as a canvas node bound to
   `mdPath` (mirroring the explorer's "Open in Canvas" action) and shows
   the canvas pane.
7. **Toggle Reading View** — switches mode to `reading` (or back to the
   previous mode if already reading).
8. **Toggle Source Mode** — switches mode to `source` (or back to the
   previous mode if already source).
9. *Separator.*
10. **Ask About Selection** — when the editor has a non-empty selection;
    opens the AI Palette with the selected text.
11. **Search Selection** — when the editor has a non-empty selection;
    opens the global search palette pre-loaded with the selection.

The menu component lives in
`src/features/knowledge/editor/EditorContextMenu.tsx`. Closing rules:
click outside, Esc, or selecting an item.

## Return-to-canvas flow

The Markdown editor renders inside `App.tsx` because
`activeMarkdownPath !== null`. Closing means setting that back to `null`,
which causes `App.tsx` to re-render the canvas in the same shell — no new
state, no lost canvas viewport, no detached-window changes.

The Close button, the menu item, and the new `editor.close` command all
call the same `requestClose()` function exposed by
`MarkdownDocumentEditor`:

```
requestClose():
  if (!dirty) return onClose()
  show ConfirmCloseDialog (Save / Discard / Cancel)
    Save → save(); onClose()
    Discard → onClose()
    Cancel → noop
```

The dialog is a small inline modal — not a `confirm()` call — because we
need three options and a non-blocking style.

## Keyboard

- `Mod-S` — save (existing).
- `Mod-W` — close editor (only when an editor instance is mounted; we
  register a window key listener inside the editor that respects focus
  in modals).
- `Esc` — does **not** close the editor by itself; it closes the
  autocomplete popover, the search panel, the context menu, or the
  confirm-close dialog if any of those are open. This avoids accidental
  data loss when the user reaches for Esc to dismiss a popup.

Escape inside an *inline modal we own* (the confirm-close dialog, the
context menu) cancels that modal, not the editor. App-wide modal hotkeys
(e.g. command palette, search palette) still work because they listen at
the window level — the editor does not stopPropagation on any of them.

## Workspace memory

Closing the editor restores the canvas. There is no separate "previous
workspace" snapshot to keep — the canvas state lives in the Zustand
store, the splitter percentage lives in `App.tsx`, and both are
unaffected by the editor being mounted. The only state we explicitly
preserve is `editorMode` (spec 21).

## Commands

In `useCommands.ts`, new section `Editor`:

- `editor.save` — `Mod-S` (gated to when an editor is mounted).
- `editor.close` — closes the editor with the dirty guard.
- `editor.toggle-reading` — toggles reading mode.
- `editor.toggle-source` — toggles source mode.
- `editor.toggle-live-preview` — toggles live preview mode.
- `editor.open-in-canvas` — runs the same Open in Canvas action.

The commands locate the active editor through a small registry in
`src/features/knowledge/editor/editorRegistry.ts` (a simple
module-scoped `currentEditor` variable plus subscribe API). Only one
editor is mounted at a time in Phase 1 so a single-slot registry is
fine.

## Acceptance

1. Right-click in the editor opens a custom menu, not the browser
   default.
2. The menu lists at least: Save, Close, Reveal, Copy Obsidian Link,
   Copy Markdown Path, Open in Canvas, Toggle Reading View, Toggle
   Source Mode.
3. Selection-based items appear only when the editor has a non-empty
   selection.
4. "Close Editor / Return to Canvas" with no unsaved changes returns to
   the canvas.
5. With unsaved changes it prompts Save / Discard / Cancel, and Cancel
   leaves the editor and content untouched.
6. The command palette includes the editor commands listed above.
7. Esc dismisses popups inside the editor without closing the editor
   itself.
