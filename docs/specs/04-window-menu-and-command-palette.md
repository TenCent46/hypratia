# 04 — Window Menu & Command Palette

## Purpose

Provide accessible, deterministic ways to manipulate panels and windows from outside the panels themselves: native menu on macOS and the command palette (`⌘P`).

## Product Rule

There is one persistent panel state model:

```ts
type PanelId = 'chat' | 'canvas' | 'sidebar';
type PanelState = 'shown' | 'hidden';
```

Temporary edge pop-outs are derived from hover/focus state. They are not menu states, command states, or persisted states.

## Native Menu

```
Window
├── Chat
│   ├── Show Chat            (✓ when chatPanelState === 'shown')
│   ├── Hide Chat
│   ├── Open New Chat Window
│   └── Auto-Hide Chat Tabs  (✓ when enabled)
├── Canvas
│   ├── Show Canvas          (✓ when canvasPanelState === 'shown')
│   ├── Hide Canvas
│   └── Open New Canvas Window
└── Sidebar
    ├── Show Sidebar         (✓ when sidebarPanelState === 'shown')
    └── Hide Sidebar

Show All Panels
```

Menu IDs:

| Menu item              | `MenuId` value             |
|------------------------|----------------------------|
| Show Chat              | `view:show-chat`           |
| Hide Chat              | `view:hide-chat`           |
| Open New Chat Window   | `chat:new-window`          |
| Auto-Hide Chat Tabs    | `view:toggle-tabs-autohide`|
| Show Canvas            | `view:show-canvas`         |
| Hide Canvas            | `view:hide-canvas`         |
| Open New Canvas Window | `canvas:new-window`        |
| Show Sidebar           | `view:show-sidebar`        |
| Hide Sidebar           | `view:hide-sidebar`        |
| Show All Panels        | `view:show-all-panels`     |

The Rust side emits a `menu` event with a payload string; the frontend dispatches in `useMenu`.

## Command Palette

Section: **View**.

- `show-chat` / `Show Chat` → sets `chatPanelState = 'shown'`
- `hide-chat` / `Hide Chat` → sets `chatPanelState = 'hidden'`
- `toggle-chat` / `Toggle Chat` → flips chat between `shown` and `hidden`
- `show-canvas` / `Show Canvas` → sets `canvasPanelState = 'shown'`
- `hide-canvas` / `Hide Canvas` → sets `canvasPanelState = 'hidden'`
- `toggle-canvas` / `Toggle Canvas` → flips canvas between `shown` and `hidden`
- `show-sidebar` / `Show Sidebar` → sets `sidebarPanelState = 'shown'`
- `hide-sidebar` / `Hide Sidebar` → sets `sidebarPanelState = 'hidden'`
- `toggle-sidebar` / `Toggle Sidebar` → flips sidebar between `shown` and `hidden`
- `show-all-panels` / `Show All Panels` → restores all panels
- `Open New Chat Window` → spawn a chat-focused full-app window for the active conversation
- `Open New Canvas Window` → spawn a canvas-focused full-app window for the active conversation
- `Toggle Auto-Hide Chat Tabs` → flips the persisted tab-strip setting

## Checkbox Semantics

- `Show Chat` is checked iff `chatPanelState === 'shown'`.
- `Show Canvas` is checked iff `canvasPanelState === 'shown'`.
- `Show Sidebar` is checked iff `sidebarPanelState === 'shown'`.
- `Auto-Hide Chat Tabs` is checked iff `settings.chatTabsAutoHide === true`.

The frontend pushes check state into the macOS menu via the `set_menu_check` IPC. The Rust side keeps a `HashMap<MenuId, CheckMenuItem>` for registered checkable items and calls `set_checked` on the matching item; unknown ids are ignored.

## Event Model

The command palette commands dispatch `mc:layout-action` events with clean panel actions:

```ts
window.dispatchEvent(new CustomEvent('mc:layout-action', {
  detail: { action: 'show-chat' }, // 'hide-chat' | 'toggle-chat'
                                   // | 'show-canvas' | 'hide-canvas' | 'toggle-canvas'
                                   // | 'show-sidebar' | 'hide-sidebar' | 'toggle-sidebar'
                                   // | 'show-all-panels'
                                   // | 'open-chat-window' | 'open-canvas-window'
                                   // | 'toggle-tabs-autohide'
}));
```

`App` listens for these events and runs the corresponding callback.

## Acceptance

1. `⌘P` then typing "Show Chat" runs the action and dismisses the palette.
2. `⌘P` then typing "Toggle Canvas" flips the canvas panel through the same state model.
3. Native menu checkmarks reflect the focused window's `shown` / `hidden` state.
4. `Open New Chat Window` opens a real, full-app window, with the chat panel shown and the canvas hidden.
5. `Open New Canvas Window` opens the symmetric window.
6. `Toggle Auto-Hide Chat Tabs` flips only the tab-strip setting.
7. `Show All Panels` restores chat, canvas, and sidebar to usable widths.

## Implementation Notes

- `services/menu/index.ts`: owns clean `MenuId` values and `setMenuCheck(id, checked)`.
- `services/commands/useMenu.ts`: routes native Show/Hide Chat, Canvas, and Sidebar menu events to layout-control callbacks.
- `services/commands/useCommands.ts`: registers palette commands with clean action IDs.
- Rust (`src-tauri/src/lib.rs`) builds the Chat / Canvas / Sidebar submenus and registers only `Show Chat`, `Show Canvas`, `Show Sidebar`, and `Auto-Hide Chat Tabs` as checkable items.
- `App.tsx` runs an effect on `(chatPanelState, canvasPanelState, sidebarPanelState, chatTabsAutoHide)` and calls `setMenuCheck`.
