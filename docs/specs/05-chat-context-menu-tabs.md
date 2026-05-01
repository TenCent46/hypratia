# 05 — Chat Panel Context Menu & Auto-Hide Tabs

## Purpose

Add a polished, macOS-style right-click menu to the chat panel and a checkable "Auto-Hide Tabs" mode that compresses the right-pane tab strip without fully hiding the panel.

## Current problem

- Right-clicking inside the chat panel falls through to the OS / browser default menu, which looks generic.
- There is no concept of "auto-hide tabs" — the right-pane tab strip is always full-size.

## Desired behaviour

### Triggering the context menu

- Right-click on an empty area of the chat panel — specifically on the panel container, the tab strip, or the message-list background (not on a textarea, button, attachment, or message bubble).
- Mouse pointer position seeds the menu placement.
- The menu is suppressed when right-clicking on text input fields so the user can still get the OS clipboard menu.

### Menu layout

```
┌─────────────────────────────────┐
│  New Chat Tab               ⌘N  │
│  Reopen Closed Chat Tab     ⇧⌘T │
│  ──────────────────────────────  │
│  New Group                       │
│  ──────────────────────────────  │
│  Show Tabs in Sidebar      ✓     │
│  Auto-Hide Tabs            ✓     │
└─────────────────────────────────┘
```

- macOS-like floating rounded menu.
- Soft shadow.
- Compact rows (~28 px tall, 13 px font).
- Checkable items show a leading ✓.
- Shortcut labels right-aligned.
- Hover highlight, separators.

### Item behaviour

| Item                     | Action                                                                                              |
|--------------------------|-----------------------------------------------------------------------------------------------------|
| New Chat Tab             | `createConversation` + `setActiveConversation`                                                      |
| Reopen Closed Chat Tab   | `reopenLastClosedConversation` — pops the most recent entry off the ring buffer; disabled when empty |
| New Group                | Creates a new project ("New group") and moves the active conversation into it                       |
| Show Tabs in Sidebar     | Toggles `settings.chatTabsInSidebar`. Checked = sidebar lists chats. Unchecked = chats appear in the top `ChatTabBar` strip and the sidebar hides chat rows. |
| Auto-Hide Tabs           | Toggles `settings.chatTabsAutoHide`                                                                  |

### Auto-Hide Tabs effect

`Auto-Hide Tabs = true` is **not** the same as full collapse:

- The chat panel stays visible.
- The right-pane tab strip (`.right-tabs`) gets a `.compact` modifier.
- In `.compact`:
  - height shrinks (from ~36 px to 22 px),
  - font drops to 11 px,
  - icons shrink,
  - inspect/chat/detach/close buttons remain functional.

`Auto-Hide Tabs = false` returns the strip to its default size.

A *strong drag* of the splitter beyond the resistance band still fully hides the panel — auto-hide-tabs and full collapse are orthogonal:

| Scenario                                               | Tab strip            | Panel        |
|--------------------------------------------------------|----------------------|--------------|
| Auto-hide off, normal                                   | full size            | visible      |
| Auto-hide on                                            | compact              | visible      |
| Auto-hide off, panel collapsed                          | n/a                  | hidden       |
| Auto-hide on, panel collapsed                           | n/a (still hidden)   | hidden       |

## State model

`Settings` (persisted):

```ts
chatTabsAutoHide: boolean;        // default false
chatTabsInSidebar: boolean;       // default true
recentlyClosedConversations: Array<{
  id: string;
  title: string;
  projectId?: string;
  closedAt: string;
}>;                               // capped to last 10; FIFO
```

The ring buffer is updated inside `removeConversation` so every code path (sidebar context menu, conversation delete command, palette) feeds it consistently. Only the conversation shell (title + project + close timestamp) is recoverable; the messages and nodes were already discarded by `removeConversation`. The user-visible note in the menu copy makes this explicit.

Local UI state:

```ts
const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
```

The menu component:

```tsx
<ChatPanelContextMenu
  x={contextMenu.x} y={contextMenu.y}
  onClose={() => setContextMenu(null)}
/>
```

## UI behaviour

- Menu component is custom React (no native `<menu>`).
- Closes on:
  - any document `mousedown` outside the menu,
  - `Escape`,
  - selection of any item.
- Repositions if the natural placement would clip below or to the right of the viewport.
- The context-menu styling matches the composer-menu (radius, shadow, item padding) so the visual language is consistent.

## Acceptance

1. Right-clicking the chat panel background opens the context menu at the cursor.
2. Right-clicking inside the chat textarea does **not** open it (OS menu wins).
3. Items render as described, with shortcut labels and ✓ where applicable.
4. `Auto-Hide Tabs` toggles `settings.chatTabsAutoHide`.
5. With auto-hide on, the right-pane tab strip is visibly more compact.
6. The setting persists after restart.
7. A strong drag of the splitter still fully collapses the panel regardless of the auto-hide-tabs flag.
8. Clicking outside the menu, or pressing Escape, closes it.
9. The menu does not clip off-screen at the bottom-right corner.

## Implementation notes

- New file: [`components/ChatPanel/ChatPanelContextMenu.tsx`](../../src/components/ChatPanel/ChatPanelContextMenu.tsx).
- The right-pane attaches `onContextMenu` to its container and the tab strip; the chat composer textarea does *not* swallow the event.
- Settings added: `Settings.chatTabsAutoHide?: boolean`, `Settings.chatTabsInSidebar?: boolean`, `Settings.recentlyClosedConversations?: RecentlyClosedConversation[]`.
- Store actions added: `setChatTabsAutoHide`, `setChatTabsInSidebar`, `reopenLastClosedConversation` (returns the new conversation id or null).
- `removeConversation` now pushes a `{id, title, projectId, closedAt}` entry onto the ring buffer (capped at 10) before deleting.
- New component [`features/chat/ChatTabBar.tsx`](../../src/features/chat/ChatTabBar.tsx) renders only when `chatTabsInSidebar === false`. The sidebar gets a `chats-out` class that hides chat-row lists in CSS.
- New Group: calls `createProject('New group')` and `setConversationProject(activeId, newProjectId)`.
- CSS: `.app-context-menu` block in `App.css` mirroring the `.composer-menu` look. ChatTabBar styles live in the same file.
