# Local Markdown Knowledge Base

## Purpose

The history sidebar should expose the app's local Markdown storage as a compact knowledge-base file tree, not only as an internal conversation list. Saved chat Markdown files and user-created notes live under the selected Markdown storage directory and can be opened, edited, and saved in place.

## Root

- Use `settings.markdownStorageDir` when configured.
- Otherwise use the existing default from `resolveMarkdownStorageDir`: `<appData>/LLM-Conversations`.
- The root is created on first access if it does not exist.
- Frontend file operations pass the resolved root to Rust commands.

## Tree

- Show folders and `.md` files.
- Hide dotfiles and non-Markdown files.
- Sort folders before files, then alphabetically within each group.
- Use compact rows, ellipsis for long names, and a subtle selected-file highlight.
- Folders expand/collapse locally in the sidebar.

## Operations

- Refresh tree.
- Create new Markdown note.
- Create new folder.
- Open Markdown file.
- Rename file/folder.
- Delete file/folder with two confirmations.
- Reveal file/folder in Finder.
- Reveal root in Finder from the empty tree context menu.
- Reveal the active file/folder, or root when nothing is active, from a visible header button.

## Reveal in Finder

Reveal is implemented through a Tauri command, not direct arbitrary shell access.

- Frontend passes `rootPath` plus a relative tree path.
- Rust canonicalizes both values and rejects paths outside the Markdown root.
- Empty path means the root.
- On macOS:
  - file path uses Finder reveal/highlight behavior.
  - folder path opens the folder.
- Errors are surfaced in the tree as a visible inline error.

Context menu labels:

- File: `Open`, `Rename`, `Reveal in Finder`, `Delete`.
- Folder: `New Note`, `New Folder`, `Rename`, `Reveal in Finder`, `Delete`.
- Empty tree/root: `New Note`, `New Folder`, `Refresh`, `Reveal Root in Finder`.

## Editor

- Opening a Markdown file replaces the canvas surface with a document-like editor.
- The editor is a full-height writing surface with minimal chrome, centered text width, generous line height, breadcrumb, saved/unsaved state, and word/character count.
- Phase 1 uses the existing platform stack and a styled `<textarea>` to avoid adding dependencies under restricted network conditions.
- Cmd+S / Ctrl+S writes the file back to disk.

## Path Safety

Rust owns filesystem writes. Every command resolves the requested path under the selected root:

- Relative paths are interpreted relative to the Markdown root.
- Empty paths refer to the root.
- Absolute paths are accepted only if their canonical path is inside the root.
- File creation names cannot contain path separators.
- Markdown file read/write/create commands are restricted to `.md`.

## Commands

- `list_markdown_tree(rootPath)`
- `read_markdown_file(rootPath, path)`
- `write_markdown_file(rootPath, path, content)`
- `create_markdown_file(rootPath, parentPath, fileName)`
- `create_folder(rootPath, parentPath, folderName)`
- `rename_path(rootPath, path, newName)`
- `delete_path(rootPath, path)`
- `reveal_markdown_path(rootPath, path)`

## Non-Goals

- No backlinks, graph view, tags, WYSIWYG, plugin system, or file watching in this file-tree task.
- Do not change detached-window layout semantics.
- Do not migrate existing chat or canvas storage.
