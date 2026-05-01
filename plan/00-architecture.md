# 00 — Architecture decision

**Status:** decided.

## Choice

React 18 + TypeScript + Vite + Tauri 2.

## Why not React Native

Canvas/graph libraries (React Flow, tldraw, Cytoscape) are DOM-based. RN forces WebView shims or rewrites — exact opposite of "minimal native". RN is mobile-first; the web/desktop story is bolted on.

## Why not Electron

~100 MB Chromium per app, slower startup, no scoping primitive for FS. Tauri's native webview + Rust core ships ~5–10 MB and starts sub-second.

## Why Tauri 2

- Native webview (WKWebView / WebView2 / WebKitGTK).
- Rust core stays empty for MVP — only official plugins (`fs`, `dialog`, `path`).
- Capabilities system scopes FS access without runtime checks.
- Same Vite/React build later ships as web by swapping one storage adapter.

## Portability invariant

Only `services/storage/` and `services/export/` import `@tauri-apps/*`. Web port = write `WebOpfsStorage.ts` + an OPFS-based exporter. No component changes.

## Locked-in choices

| Concern | Choice |
|---|---|
| Shell | Tauri 2 |
| UI | React 18 + TS |
| Bundler | Vite |
| Canvas | `@xyflow/react` |
| State | Zustand |
| Markdown render | `react-markdown` + `remark-gfm` |
| Frontmatter | `gray-matter` |
| Persistence | per-entity JSON in `appDataDir()` |
| IDs | `nanoid` |
| Folder picker | `@tauri-apps/plugin-dialog` |
| FS | `@tauri-apps/plugin-fs` |

## Deferred

- SQLite — only when JSON load times exceed a few hundred ms.
- Custom Rust commands — only when official plugins are insufficient.
- Web port — Tier 2.
- Code signing / notarization — out of MVP.
