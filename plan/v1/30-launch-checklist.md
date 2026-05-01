# 30 — Launch checklist

**Goal:** every claim in the success criteria of `plan/v1/README.md` is verified by hand.

**Depends on:** 29.

## Manual flow audit

The 10 success-criteria flows from the master README, each tested on:
- A clean macOS user account (no leftover keychain entries).
- The signed `.dmg` from the production CI pipeline (not `pnpm tauri dev`).

| # | Flow | Notes |
|---|---|---|
| 1 | Launch — no Gatekeeper warning | clean keychain |
| 2 | Settings → paste OpenAI key → Test → ✅ | <2s |
| 3 | Type chat → streaming response | OpenAI |
| 4 | Drag response → node | mouse drop on canvas |
| 5 | Paste image from clipboard | screenshot, then ⌘V on chat input AND on canvas |
| 6 | Drop PDF → render → highlight → linked card | use a real research paper, ~30 pages |
| 7 | ⌘P → every command findable | inspect cheat sheet alignment |
| 8 | ⌘J on selection → "Summarize this" → node lands | check edge to origin |
| 9 | Export to vault → Obsidian shows graph + links | use a fresh empty vault |
| 10 | Quit, relaunch → state intact | including viewport + selection |

If any flow fails, fix the underlying issue (no patch hacks), re-build, re-test from #1.

## Cross-provider smoke test

- Send identical message under OpenAI / Anthropic / Groq / Mistral / Ollama.
- Each must stream, finalize, abort cleanly.
- Switching mid-conversation works.

## Theme audit

- Light / dark / sepia / high-contrast: every screen looks intentional.
- Markdown rendering: code, math, mermaid, callouts, quotes, tables, footnotes, wikilinks, transclusion. Each in each theme.
- Selection highlight color readable in dark + sepia.

## Performance

- Cold start to first paint <1.5s.
- Cold start to interactive (after hydration) <2.5s.
- Conversation switch <100 ms.
- Theme swap <50 ms.
- 1000-node canvas pan/zoom holds 60 fps.
- 200-page PDF opens within 3s; page scroll is smooth.

## Documentation deliverables

- Updated `README.md` at repo root: install, dev, build.
- Updated `CLAUDE.md`: stack additions reflected, hard rules updated for new services.
- `CHANGELOG.md`: v1.0 release notes.
- In-app **Help** modal: shortcut chart, "What is Memory Canvas?", privacy note.
- Public-facing changelog: GitHub Release body.

## Pre-tag sanity

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm tauri build` produces a signed .dmg.
- All acceptance criteria across plans 16-29 met.

## Tag and release

```bash
git tag v1.0.0 -m "Memory Canvas 1.0"
git push origin v1.0.0
```

CI takes over from there.

## Post-launch (week 1)

- Monitor GitHub issues. Triage to v1.0.1 vs v1.1.
- Watch for unsigned-cert errors (would mean notarization failed silently).
- Watch for keychain access denials (different macOS versions behave differently).
- If five users report the same bug → patch v1.0.1.
