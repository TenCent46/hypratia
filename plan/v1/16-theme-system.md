# 16 — Theme system

**Goal:** swap among ≥4 themes via a single `[data-theme]` attribute, with all colors, spacing, typography, and component tokens flowing from one source. Light + dark + sepia + high-contrast on day one.

**Depends on:** MVP step 15 (CSS already exists; this refactors it onto Tailwind v4 tokens).

## Stack

- `tailwindcss@4` + `@tailwindcss/vite` (no separate config file in v4 — `@theme` block lives in CSS).
- Three-layer token system: **raw → semantic → component**.
- React Flow node styles read from CSS vars (already do, just rename).

## Token shape

```css
@theme {
  /* raw — colors, spacing, fonts, radii */
  --color-stone-50: #fafaf9;
  --color-ink-900: #1c1c1c;
  --color-accent-500: #4a7da3;
  /* …palette full */
}

[data-theme='light'] {
  /* semantic */
  --bg: var(--color-stone-50);
  --text: var(--color-ink-900);
  --border: var(--color-stone-200);
  --accent: var(--color-accent-500);
}
[data-theme='dark'] { /* … */ }
[data-theme='sepia'] { /* … */ }
[data-theme='high-contrast'] { /* … */ }

/* component tokens reference semantic */
.markdown-node {
  background: var(--surface-card);
  border-color: var(--border);
}
```

## Implementation

1. `pnpm add -D tailwindcss@^4 @tailwindcss/vite` and add `@tailwindcss/vite` to `vite.config.ts`.
2. Replace existing `App.css` with `styles/index.css` containing `@import "tailwindcss"; @theme { … }` + per-theme blocks + component tokens.
3. Add `Theme` type + `setTheme(theme)` to store (`ui.theme`).
4. Apply on boot: `document.documentElement.setAttribute('data-theme', settings.theme)`.
5. Settings UI dropdown — added to step 20.
6. Reactflow — its built-in colors should follow `--accent`, `--border`. Override `.react-flow__edge-path` etc. in our CSS.

## Acceptance

- `setTheme('dark')` repaints in <16 ms (one frame).
- All four themes pass WCAG AA contrast for body text.
- Markdown nodes, edges, modals, search palette, command palette, PDF viewer chrome — all theme-aware.
- No hard-coded hex outside the `@theme` block.

## Risks

- Tailwind v4 is recent — lock a minor version; check React Flow CSS doesn't break under purge.
- Sepia is the easiest to get wrong — test with real Markdown, not lorem ipsum.
- "Brand" theme later (CEO decision 1) drops in as a 5th `[data-theme]`; no architectural work needed.
