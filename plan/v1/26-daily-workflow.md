# 26 — Daily notes, templates, quick capture

**Goal:** match the table-stakes daily-driver UX every Obsidian-class app ships with.

**Depends on:** 19.

## Daily notes

- Settings → Daily notes folder (default `LLM-Daily/`).
- Settings → Daily-note template (path to a `.md` file in the vault, optional).
- Command: **Open today's daily note** (default ⌘D).
- Behaviour: ensures a conversation titled `YYYY-MM-DD` exists, creates with template if missing, switches to it.
- Daily notes are regular conversations under the hood; export folders them under `LLM-Daily/` instead of `LLM-Conversations/`.

## Templates

- Settings → Templates folder (default `<vault>/LLM-Templates/`).
- A template is a `.md` file with frontmatter and body — the body becomes the seed `contentMarkdown`, frontmatter merges into the new node's frontmatter.
- Command: **Insert from template…** (palette → submenu of templates).
- New conversations and new nodes can both be templated.
- Template variables: `{{date}}`, `{{time}}`, `{{title}}`, `{{cursor}}` (cursor placement).

## Quick capture

- macOS global hotkey ⌘⇧Space (configurable).
- Implementation: Tauri `tauri-plugin-global-shortcut`.
- Press → small floating window centered on screen with a textarea. Type, ⌘↵ to save.
- Saves into a special **Inbox** conversation (`Inbox` is auto-created on first capture). User triages later by dragging messages from Inbox onto canvas.
- Inbox is sorted-most-recent in the conversation switcher and visually marked.

## Files

- `src/services/daily/DailyNotes.ts`
- `src/services/templates/Templates.ts`
- `src/components/QuickCapture/QuickCaptureWindow.tsx` — runs in a separate Tauri window.
- `src-tauri/capabilities/quick-capture.json` — capability scoped to the quick-capture window.
- Updates to `tauri.conf.json` for the second window + global shortcut permission.

## Acceptance

- ⌘D from anywhere in the app → today's daily note opens (creates if missing).
- ⌘⇧Space from anywhere on the OS (even with the app hidden) → quick-capture window appears within ~150 ms.
- Captured items land in Inbox; user can drag them onto canvas like any other message.
- A template with `{{date}}` and a frontmatter `tags: [daily]` produces a new conversation/node with the placeholder filled and the tag set.

## Risks

- macOS Accessibility permissions for global shortcut — surface the prompt with a clear "Why" copy ("This lets ⌘⇧Space work even when Memory Canvas isn't focused").
- Two-window architecture is the trickiest macOS bit — quick-capture window must share the store via Tauri events (broadcast `inbox:add`). Don't try to share Zustand directly across windows.
- If global shortcut is already taken (Spotlight, Raycast), let the user rebind in settings.
