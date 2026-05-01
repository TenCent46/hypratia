# 13 — UI polish

**Goal:** the app feels calm, intellectual, spatial. Not a startup dashboard.

**Depends on:** all features built (steps 01–12).

## Visual language

- Palette: white, near-white, two greys, dark text, **one** calm accent (a muted teal or warm grey-blue).
- Typography:
  - Serif for node titles (system serif: `ui-serif, "Iowan Old Style", "Georgia", serif`).
  - Sans for chrome and body (system stack).
  - No Google Fonts. No font downloads.
- Node card: white surface, 1 px subtle grey border, generous padding, soft shadow on hover.
- Selected node: 2 px accent border, no glow.
- Edges: thin grey, slight curve, accent on hover.

## Empty states

- Empty canvas: **"Drag a thought here."**
- Empty chat: **"Start a conversation."**
- No search results: **"No matching memory found."**

## Interaction polish

- Drag-from-chat cue: chat row dims to ~60%, canvas shows a faint dashed outline.
- Search results: matched text in accent.
- Buttons: text + subtle hover surface, no bold borders.
- Hover/selected states clear but quiet.

## Animation budget

- Transitions ≤ 150 ms ease-out.
- No bouncing, no scaling beyond 1.02.
- No spinner gradients.

## Out of scope (defer)

- Dark mode.
- Iconography overhaul.
- Custom fonts.

## Acceptance

- Open the app cold → first impression is "calm".
- Empty states are present everywhere they should be.
- Nothing flashes, jitters, or scales unexpectedly.
