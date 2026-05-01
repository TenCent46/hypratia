# Memory Canvas

Local-first desktop app: a spatial memory layer for LLM conversations. Right pane is a normal chat. Left pane is an infinite canvas where messages drop as draggable nodes. Past conversations save locally as Markdown to an Obsidian-compatible vault.

macOS first. Windows next. Web last (same React build, swap one storage adapter).

## Stack

- **Shell:** Tauri 2 — native webview, Rust core stays empty for MVP
- **UI:** React 18 + TypeScript + Vite
- **Canvas:** `@xyflow/react` (React Flow)
- **State:** Zustand
- **Markdown:** `react-markdown` + `remark-gfm`; `gray-matter` for YAML frontmatter
- **Persistence:** per-entity JSON files in Tauri `appDataDir()`
- **IDs:** `nanoid`
- **Folder picker / FS:** `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-path`

No Electron. No backend. No native code beyond Tauri's official plugins.

## Layout

- 70% canvas (left), 30% chat (right)
- White background, subtle dot grid
- Header: conversation switcher, search, settings/export

## Source layout

```
src-tauri/                       # Rust shell — touch capabilities only
src/
  components/                    # dumb UI primitives
  features/                      # feature-scoped UI + glue
    chat/  canvas/  conversations/  search/  summarization/
  services/                      # platform-coupled, UI-free, testable
    storage/  export/  similarity/  summarize/  embeddings/
  store/                         # Zustand slices + combined store
  types/index.ts                 # all shared types
  lib/  styles/
```

## Hard rules

- **Only `services/storage/`, `services/export/`, `services/dialog/`, `services/secrets/`, `services/attachments/`, `services/llm/`, and `services/shortcut/` may import `@tauri-apps/*`.** Everything else reaches platform APIs through these services. Enforced by ESLint `no-restricted-imports`. The web port is a one-file swap per service.
- **`services/llm/` wraps Vercel AI SDK** and is the only place that imports `@ai-sdk/*` or `ai`. Everything else talks via `ChatProvider`, `Summarizer`, `EmbeddingProvider`.
- **`services/markdown/` is the only place that knows about remark/rehype.** Components render via `<MarkdownRenderer />`; never import `react-markdown` directly.
- **Never put export logic in components.** Once Markdown lives in user vaults, the format is contractual; one service file owns it.
- **Atomic JSON writes:** write to `${file}.tmp`, then rename. Per-entity files. Debounce ~300 ms.
- **Never auto-export to the user's vault.** Export is always a deliberate user action.
- **Wikilinks: `[[node-{id}|{title}]]`.** Stable id target, readable alias.
- **Filename sanitization is centralized** in `services/export/filenames.ts`. Honor reserved Windows names even on macOS.
- **No hardcoded API keys, ever.** Keys live behind `services/secrets/`. v1.0-beta uses a local plaintext file under appData (FileVault-protected); v1.0 final swaps to OS keychain.

## Storage layout

App data dir (`appDataDir()`):
- `conversations.json`
- `messages.json`
- `nodes.json`
- `edges.json`
- `settings.json`
- `attachments.json`
- `secrets.json` (v1.0-beta plaintext, FileVault-protected at rest)
- `attachments/YYYY-MM/<nanoid>.<ext>` — actual file blobs

User-chosen Obsidian vault folder:
- `LLM-Conversations/{conversationId}.md`
- `LLM-Daily/{conversationId}.md` (conversations with `kind: 'daily'`)
- `LLM-Nodes/{nodeId}.md`
- `LLM-Maps/{conversationId}.json`
- `LLM-Attachments/{nanoid}.{ext}` (mirrored from app data on export)

## Commands (after scaffold)

```bash
pnpm install
pnpm tauri dev          # desktop dev
pnpm tauri build        # macOS .app + .dmg → src-tauri/target/release/bundle/macos/
pnpm tsc --noEmit       # type check
pnpm lint               # ESLint
```

## Types (canonical)

```ts
type ID = string; // nanoid

type Conversation = {
  id: ID;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageIds: ID[];
};

type Message = {
  id: ID;
  conversationId: ID;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

type CanvasNode = {
  id: ID;
  conversationId: ID;
  title: string;
  contentMarkdown: string;
  sourceMessageId?: ID;
  position: { x: number; y: number };
  tags: string[];
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
};

type Edge = {
  id: ID;
  sourceNodeId: ID;
  targetNodeId: ID;
  label?: string;
  createdAt: string;
};

type Settings = {
  obsidianVaultPath?: string;
  schemaVersion: number;
  lastConversationId?: ID;
  viewportByConversation?: Record<ID, { x: number; y: number; zoom: number }>;
};
```

## Plan

See [plan/README.md](plan/README.md) for the step-by-step build plan.
