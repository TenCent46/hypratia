# Memory Canvas

A local-first AI thinking workspace. Streaming chat on the right, infinite spatial canvas on the left. Drop PDFs, highlight text, spawn linked cards. Bring your own API keys. Exports cleanly to Obsidian.

macOS first. Windows next. Web last.

## Quick start

```bash
pnpm install
pnpm tauri dev          # desktop dev
```

Open Settings → Providers, paste an API key, click Test. Chat starts streaming.

## Build

```bash
pnpm tauri build        # produces .app + .dmg in src-tauri/target/release/bundle/macos/
pnpm tsc --noEmit       # type check
pnpm lint               # ESLint
```

For signed + notarized release builds, see `.github/workflows/release.yml` and `plan/v1/29-distribution.md`.

## Shortcuts

| Action | Shortcut |
|---|---|
| Command palette | ⌘P |
| Search | ⌘K |
| AI palette on selection | ⌘J |
| Today's daily note | ⌘D |
| Quick capture (Inbox) | ⌘⇧Space |
| All shortcuts | ⌘? |
| Settings | ⌘, |
| New conversation | ⌘N |
| Add empty node | ⌘E |
| Toggle Current/Global map | ⌘G |
| Center viewport | ⌘0 |
| Select tool | V |
| Hand/Pan tool | H |
| Toggle Inspect/Chat | ⌘⇧I |
| Export to vault | ⌘⇧E |
| Send / Stop | ⌘↵ / ⌘⌫ |

## Where data lives

- `<appData>/conversations.json`, `messages.json`, `nodes.json`, `edges.json`, `settings.json`, `attachments.json`
- `<appData>/attachments/YYYY-MM/<nanoid>.<ext>` — image/PDF blobs
- `<appData>/secrets.json` — API keys, FileVault-protected at rest (will move to OS keychain in v1.0 final)
- Vault export (`⌘⇧E`): `LLM-Conversations/`, `LLM-Daily/`, `LLM-Nodes/`, `LLM-Maps/`, `LLM-Attachments/`

## Stack

- **Shell:** Tauri 2 (native webview, no Electron)
- **UI:** React 19 + TypeScript + Vite
- **Canvas:** `@xyflow/react` (React Flow)
- **State:** Zustand
- **Markdown:** `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `rehype-highlight` + custom callout/wikilink/transclusion preprocess
- **AI:** Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/openai-compatible`)
- **PDF:** `react-pdf` + `pdfjs-dist`
- **Command palette:** `cmdk`
- **Persistence:** per-entity JSON files via Tauri's `appDataDir()`, atomic writes, debounced 300 ms

See [CLAUDE.md](CLAUDE.md) for architectural rules and [plan/v1/](plan/v1/README.md) for the build plan.

## Privacy

No telemetry. Network traffic is limited to (1) the AI provider whose key you configured, and (2) update checks against the public GitHub release endpoint when the updater is enabled.

## License

TBD.
