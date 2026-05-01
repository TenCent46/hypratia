# 19 — Command palette + shortcut audit

**Goal:** ⌘P opens a fuzzy-search palette listing every action in the app. Every reasonable action also has a keyboard shortcut.

**Depends on:** 18.

## Stack

- `cmdk` (Vercel) — accessible, headless, fuzzy-search built in.
- A tiny `commands` registry in the store: `Command = { id; title; shortcut?; section; run() }`.

## Commands to register (v1.0)

| Section | Command | Shortcut |
|---|---|---|
| Conversation | New conversation | ⌘N |
| Conversation | Rename current conversation | (palette only) |
| Conversation | Delete current conversation | (palette only) |
| Conversation | Switch to next / previous conversation | ⌘] / ⌘[ |
| Canvas | Add empty node at viewport center | ⌘E |
| Canvas | Center viewport | ⌘0 |
| Canvas | Toggle Current/Global map | ⌘G |
| Canvas | Garbage collect orphan attachments | (palette only) |
| AI | Open AI palette on selection | ⌘J |
| AI | Create summary node | (palette only) |
| Chat | Send message | ⌘↵ |
| Chat | Switch model | (palette only, opens submenu) |
| Search | Open search | ⌘K |
| View | Toggle theme | (palette only, opens submenu) |
| View | Toggle Inspect / Chat tab | ⌘⇧I |
| File | Open Settings | ⌘, |
| File | Choose vault | (palette only) |
| File | Export to Markdown | ⌘⇧E |
| File | Reveal app data folder | (palette only) |
| Help | Keyboard shortcuts | ⌘? |
| Help | What's new | (palette only) |

## Files

- `src/services/commands/CommandRegistry.ts`
- `src/components/CommandPalette/CommandPalette.tsx`
- `src/lib/keymap.ts` — central keydown router (replaces the inline `keydown` listeners in `App.tsx`).

## Implementation

1. Define `Command` type. Build a `useCommands()` hook returning the live list (some are conditional — Inspect tab only available when a node is selected).
2. Wire `CommandPalette` into `App.tsx` next to `SearchPalette`.
3. `useKeymap()` hook — single `keydown` listener that maps shortcut → `command.id` → `run()`.
4. Add `?` (shift-/) on its own opens the shortcuts cheat sheet (a static modal listing all shortcuts).

## Acceptance

- ⌘P opens the palette; typing fuzzy-narrows the list; Enter runs.
- Every shortcut in the table works from anywhere except inside `<input>` / `<textarea>` (those are excluded so typing `?` in the chat doesn't open help).
- New commands need only one entry in `CommandRegistry` to appear in the palette **and** in the cheat sheet.

## Risks

- Conflicts with browser/Tauri default shortcuts (⌘W close window — leave alone). Document.
- Cheat-sheet drift — generate from registry, never from a hand-written list.
- `cmdk` has its own focus management; pair it with the SearchPalette so they don't fight each other (only one open at a time).
