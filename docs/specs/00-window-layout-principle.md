# 00 — Window & Layout Principle

## Purpose

Establish the single mental model the rest of the specs build on: there is **one full app**. Windows differ only in which panels are shown, hidden, or temporarily opened from an edge — not in capability or identity.

## Current problem

The codebase had three user-facing labels — `Chat Focus`, `Canvas Focus`, `Workspace` — surfaced in a `WorkspaceWindowHeader` shown in detached windows. That implied a separate "mode" per window and worked against the goal of detached windows being indistinguishable full apps.

`isFocusedWindow` also suppressed the sidebar in detached windows, treating them as second-class.

## Desired behaviour

- Every window loads the same React app. There is no separate "chat-only" or "canvas-only" component tree.
- Windows differ only by their initial layout (`layoutPreset`) and the conversation that opens active (`tabId`).
- The user sees no labels named "Chat Focus", "Canvas Focus", or "Workspace".
- Once open, a window can show or hide either panel; capability is symmetric.
- Sidebar (history / projects), command palette, settings, search, and shortcuts are present in every window. Sidebar may *boot* in collapsed mode for focused presets, but it is never structurally absent and is always restorable through menu / palette / left-edge hover.

## State model

```ts
type LayoutPreset = 'main' | 'chatFocused' | 'canvasFocused';
// Only used to seed the initial layout when a window is created.
// Never displayed.

type Layout = 'split' | 'canvas-only' | 'chat-only';
// Runtime layout state in the React tree. Mutated by user actions.
// 'split'        — both panels visible
// 'canvas-only'  — chat hidden; chat can temporarily open from the right edge
// 'chat-only'    — canvas hidden; canvas can temporarily open from the left edge
```

Mapping:

| `layoutPreset` URL param | initial `layout` |
|--------------------------|------------------|
| `main` (default)         | `split`          |
| `chatFocused`            | `chat-only`      |
| `canvasFocused`          | `canvas-only`    |

## UI behaviour

- The `App` shell is identical for every window.
- Chrome (sidebar, header, palettes) renders unconditionally.
- The split container reads `layout` and renders one or both panels.
- Detached windows are addressable by their conversation id and layout preset, but those are URL-level details, never UI labels.

## Acceptance

1. No element labelled `Chat Focus`, `Canvas Focus`, or `Workspace` appears in the UI.
2. A detached window has the same chrome (sidebar, palettes, modals, header) as the source.
3. Switching layouts inside a detached window works the same way as in the source.
4. The user cannot tell from the UI alone which window was the "original".

## Implementation notes

- `getInitialLayoutPreset()` continues to read the URL; the result seeds `useState`. The preset is not stored long-term.
- Drop the `WorkspaceWindowHeader` component (or its render path).
- Drop `isFocusedWindow` gating on `<Sidebar />`. If sidebar density is the concern, that's a future *Compact Sidebar* setting, not a window-mode distinction.
