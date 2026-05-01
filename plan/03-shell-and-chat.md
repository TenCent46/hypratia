# 03 — Layout shell and chat panel

**Goal:** the visible product skeleton. 70/30 split, white canvas placeholder, working chat input.

**Depends on:** 02.

## Layout

- CSS grid: `grid-template-columns: 7fr 3fr;`. No split-pane library at MVP.
- White background. Dot grid via CSS background image (no asset).
- Header strip across the top: app name, conversation switcher placeholder, settings icon.

## Chat panel (`src/features/chat/`)

- `MessageList` — scrolls, autoscrolls on new message *only if user is already at the bottom*.
- `MessageInput` — textarea, ⌘↵ to send, Enter inserts newline.
- Send → adds a `Message` to the active conversation. If none exists, create one.
- No AI; user is the only speaker for now.

## Canvas placeholder

- Render an empty white area on the left. Real React Flow lands in step 04.
- Show empty state: "Drag a thought here." (placeholder copy, finalised in step 13).

## Acceptance

- Typing and sending shows the message in the list.
- Layout holds at 1280×800 and 1920×1200.
- Reload → messages persist (storage from step 02 is wired).

## Risks

- Autoscroll fighting user scroll-up. Disable autoscroll if user has scrolled away from the bottom; re-enable when they scroll back.
- Long messages wrapping inside narrow chat pane — `word-break: break-word`.
- CSS dot grid with a fractional zoom can shimmer; use 24 px gap, 1 px dot.
