# 17 — Markdown stack v2

**Goal:** Markdown rendering that matches Obsidian's expressivity, plus streaming-safe tokenization for live AI responses.

**Depends on:** 16.

## Stack decision

Two viable paths; pick **B** for v1.0:

- **A. `streamdown`** (Vercel) — drop-in, streaming-aware, GFM + Shiki + KaTeX + interactive Mermaid built-in. Smallest engineering cost.
- **B. `react-markdown` + plugins** — `remark-gfm`, `remark-math`, `rehype-katex`, `rehype-shiki`, `mermaid` (lazy), custom `remark-callouts`, custom `remark-wikilink`, custom `remark-transclusion`. More control, easier to extend.

**Choosing B** because we need custom remark plugins for wikilinks `[[…]]`, transclusion `![[…]]`, and callouts `> [!note]`. `streamdown` doesn't expose its remark pipeline.

## Features in scope

- GFM (already have).
- **Math** — KaTeX inline `$x$` and block `$$…$$`.
- **Syntax highlighting** — Shiki, dual-theme (light + dark) via CSS vars from step 16.
- **Mermaid** — lazy import on first encounter; ```mermaid block.
- **Callouts** — Obsidian syntax `> [!note] Title\n> body`, with `note | info | tip | warning | danger | quote | example | success`, foldable.
- **Footnotes** — `[^1]` references, definitions at the bottom of a node render as a small list.
- **Wikilinks** — `[[node-id]]` and `[[node-id|alias]]` resolve to local nodes; click navigates.
- **Transclusion** — `![[node-id]]` embeds the target node's content inline (clipped to ~200 chars + "open").
- **Streaming-safe** — when content is mid-token (`$x` without closing `$`, unclosed code fence), the renderer must not throw. Use a guard that strips obviously-incomplete trailing tokens.

## Files

- `src/services/markdown/MarkdownRenderer.tsx` — single component, props `{ markdown, streaming?, onWikilinkClick?, onTransclusion? }`.
- `src/services/markdown/plugins/remark-callouts.ts`
- `src/services/markdown/plugins/remark-wikilink.ts`
- `src/services/markdown/plugins/remark-transclusion.ts`
- `src/services/markdown/streaming.ts` — incomplete-token guard.
- Replace `react-markdown` direct usage in `MarkdownNode.tsx` and chat messages with `<MarkdownRenderer />`.

## Acceptance

- A node containing `$E=mc^2$`, a Mermaid diagram, a Shiki-highlighted ts code block, a `> [!warning]` callout, a `[[other-node]]` wikilink, and `![[other-node]]` transclusion all render correctly.
- A streaming chat message paints incrementally without flicker or thrown errors when tokens are mid-stream.
- Switching theme (16) re-tones syntax highlight without re-mount (Shiki dual-theme via CSS).
- Lazy chunks: Mermaid + KaTeX don't appear in `dist/assets/index-*.js`; they ship as separate chunks loaded on first use.

## Risks

- Mermaid is ~600 kB gzipped — must be lazy.
- KaTeX font files (cmaps) need to be served from `public/`. Forgetting them = no math.
- Shiki dual-theme adds ~200 kB; acceptable.
- Streaming-safe guard is the trickiest part — easy to mis-strip valid trailing characters.
- Wikilink/transclusion only resolve within the current vault state; if target is missing, render as red broken-link `[[node-id]]?`.
