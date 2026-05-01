# 02 — Detached Windows

## Purpose

Guarantee that opening a chat or canvas in a separate OS window produces a real, full-app instance — not a stripped-down child view.

## Current problem

- `WorkspaceWindowHeader` rendered "Chat Focus / Canvas Focus / Workspace" labels in detached windows, suggesting they were a different mode.
- `isFocusedWindow` suppressed `<Sidebar />` in detached windows.
- The visible difference caused the user to think detached = simplified.

## Desired behaviour

A detached window:

- Loads the same `App` component the source window loaded.
- Has the same chrome: sidebar (history / projects), palettes, modals, header, command palette.
- Has the same workspace data (Zustand store is hydrated from the same JSON files; cross-window updates broadcast over the existing `mc:broadcast` channel).
- Differs from the source only by:
  1. The OS window label.
  2. The initial layout it boots with (`?layoutPreset=chatFocused | canvasFocused`).
  3. The initial sidebar mode (focused presets boot with `sidebarCollapsed = true`; the user can re-expand it from the command palette or menu at any time).
  4. Optionally an active conversation (`?chatId=...`).

**The sidebar is never omitted from a detached window.** Removing it would destroy access to history and projects and break the "same full app" promise. The default-collapsed state of focused presets is purely a focus heuristic, not a structural restriction.

## State model

URL query string (the **only** distinction between windows):

| Param          | Values                                      | Effect on boot                               |
|----------------|---------------------------------------------|----------------------------------------------|
| `layoutPreset` | `main` (default), `chatFocused`, `canvasFocused` | Seeds initial `layout`                  |
| `chatId`       | conversation id                             | Pins the active conversation in this window  |
| `windowId`     | Tauri-issued                                | Internal book-keeping; opaque                |

Inside the React tree, after boot the `layoutPreset` is consumed once and forgotten. From that point the user manipulates panels via the same controls as the source window.

## UI behaviour

- Same `App.tsx` render path. No conditional simplification.
- Right-pane "detach" buttons (`⧉`) call `openChatWindow` / `openCanvasWorkspaceWindow` and then `Hide Chat` / `Hide Canvas` on the source — equivalent to "I want to keep working over there".
- Sidebar is visible in every window. Conversation switching, project navigation, search work the same.
- Cross-window store sync (existing): each Zustand mutation in any window broadcasts; the others apply the patch.

## Acceptance

1. Opening a chat in a new window: the new window has a sidebar (collapsed by default), a header, the same chat composer, the same canvas panel — but starts in `chat-only` layout.
2. Opening a canvas in a new window: same, but starts in `canvas-only` layout.
3. The sidebar is structurally present in every detached window; collapsing is the default for focused presets, but the user can run `Show Sidebar` from the command palette to expand it.
4. Inside the detached window, "Show Chat" / "Show Canvas" / "Open New Chat Window" / "Open New Canvas Window" / "Show Sidebar" / "Hide Sidebar" all work.
5. Closing the source window does not affect detached windows beyond OS-level focus changes.
6. Editing a conversation in any window propagates to the others.
7. Detached windows never display "Chat Focus" / "Canvas Focus" / "Workspace" labels.
8. No detached window is a reduced or blank component.

## Implementation notes

- Frontend: `App.tsx` reads `getInitialLayoutPreset()`, seeds `layout`, then drops the URL param.
- On boot, if the preset is non-`main`, `App` calls `setSidebarCollapsed(true)` once. This sets the per-window `ui.sidebarCollapsed` flag to its compact form. `ui` is **not** broadcast across windows (see `store/persistence.ts::SliceName`), so each window keeps its own sidebar mode.
- The "detach" button in `RightPane` and the canvas toolbar already invoke `openChatWindow` / `openCanvasWorkspaceWindow` from `services/window/index.ts`. No change to those functions.
- Rust side already opens a window pointing to the same `index.html` with extra query params (see `detach_tab_to_window` Tauri command). No backend change is required to satisfy this spec.
- The previous `WorkspaceWindowHeader` component and `focused-workspace-window` CSS class are removed.
- `isFocusedWindow` gating on `<Sidebar />` is removed.

## Known follow-ups

- *Cosmetic*: a future patch may add an OS-window-level "Focused" treatment (e.g. tighter header) — but that must remain a stylistic option, never a UI label or a feature gate.
- *Performance*: every window boots the full app. If startup becomes slow on detach, consider lazy-loading heavy features (PDF viewer, command palette) per-window. Not in scope here.
