# 35 — Modern visual design pass

**Goal:** make the app feel like a contemporary desktop productivity tool: calmer chrome, clearer hierarchy, polished motion, and no demo-like controls.

**Depends on:** steps 31-34.

## Scope

- Rework chat message density, controls, hover states, and streaming states.
- Refine canvas node cards: resize behavior, selected state, handles, shadows, and title hierarchy.
- Improve header layout and workspace identity.
- Make settings feel like a mature preferences window.
- Audit all empty states and remove instructional clutter from the main work surface.
- Tighten animation timing under `prefers-reduced-motion`.

## Design principles

- Primary surfaces should be quiet and work-focused.
- Controls appear when needed, especially on hover/focus.
- Icon buttons need accessible names and predictable hit targets.
- Cards stay compact and practical; no decorative card nesting.
- Motion should explain state changes, not decorate them.

## Implementation

1. Inventory all buttons and decide: command, icon, toggle, segmented control, or menu.
2. Normalize icon button dimensions and focus rings.
3. Redesign message rows around role, content, status, and compact action rail.
4. Redesign node cards with stable dimensions and better selected/drag states.
5. Run theme pass across light, dark, sepia, high-contrast.
6. Verify text does not overflow at narrow widths.

## Acceptance

- The first screen looks like a product, not a scaffold.
- Main workspace text does not explain keyboard shortcuts or features.
- Hover/focus states are visible in all themes.
- Icon-only controls have labels.
- Reduced motion disables nonessential animation.

## Risks

- Visual polish can hide functionality. Command palette and shortcuts modal must stay discoverable.
