# Changelog

## v1.1.0-beta.1 — unreleased

### Added
- Improved user experience pass: reliable direct message drag-to-canvas, compact message action icons, workspace rename, richer Markdown editor, AI mode controls, regenerate response, and calmer modern chrome.

### Notes
- Search and deep research modes are explicit UI modes now. Live web/source fetching remains behind the planned search-provider boundary and the app will not pretend it browsed when no provider is wired.

## v1.0.0-beta.1

### Added
- Multi-provider streaming chat: OpenAI, Anthropic, Google (Gemini), Mistral, Groq, OpenAI-compatible, Ollama (Vercel AI SDK).
- Per-conversation model override + token-usage rollup + cost meter (`services/llm/costEstimator.ts`).
- AI palette on selection (`⌘J`) — Improve / Summarize / Expand / Extract / Question + custom prompt → makes a node.
- Command palette (`⌘P`) backed by `cmdk`, single command registry, exhaustive keyboard shortcut audit, cheat-sheet modal (`⌘?`).
- File-based attachment service (`services/attachments/`) — drag-drop and paste images / PDFs into canvas or chat; assets live under `<appData>/attachments/YYYY-MM/`. Vault export mirrors them into `LLM-Attachments/`.
- Image and PDF canvas node types. PDF viewer with text-layer selection → highlight-to-card with `pdfRef` frontmatter and a labeled back-edge.
- Daily notes (`⌘D`), Inbox quick-capture (`⌘⇧Space`, in-app), template variable substitution (`{{date}}`, `{{title}}`, …).
- Wikilinks `[[id|alias]]` and transclusion `![[id]]` with cycle detection.
- Editable free-form frontmatter on every node (Inspector → Frontmatter).
- 4-direction handles on every canvas node (top / right / bottom / left).
- Theme system: light (warm beige + orange) / dark / sepia / high-contrast, all `[data-theme]` driven.
- Onboarding modal on first launch + curated empty states + `prefers-reduced-motion` honored.

### Architecture
- New platform-boundary services: `services/attachments/`, `services/llm/`, `services/secrets/` — only paths allowed to import `@tauri-apps/*`.
- `services/markdown/MarkdownRenderer.tsx` is the single Markdown render surface; remark/rehype use is local to it.
- Per-entity JSON files in app data dir; atomic writes via tmp-file + rename, debounced 300 ms.

### Deferred
- OS keychain for secrets — using FileVault-protected plaintext (documented v1.0-beta path); will swap to `tauri-plugin-keyring` in v1.0 final.
- Mermaid + Shiki — current Markdown stack uses KaTeX and `rehype-highlight`.
- Tailwind v4 token migration — current implementation uses CSS custom properties with the same three-layer (raw / semantic / component) intent.
- OS-level global shortcut for quick capture (`⌘⇧Space` works in-app; cross-app needs `tauri-plugin-global-shortcut`).
- PDF page virtualization (`react-window`).
- Auto-updater plugin (config in `tauri.conf.json` is scaffolded but `active: false`).
- Apple Developer signing — CI workflow ready, secrets must be provisioned.
- Telemetry — none; reserved for v1.1.
