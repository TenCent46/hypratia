# 43 — ChatGPT export importer (`conversations.json`)

**Goal:** the user drops their OpenAI data export `.zip` (or `conversations.json` directly) onto Hypratia. Hypratia reads every past conversation, indexes them locally, lets the user search/browse, and selectively imports any conversation as a canvas. **Killer feature — rescues years of conversation with no API calls.**

**Depends on:** 41 (Paste-to-Canvas pipeline reused), 47 (auto-layout for incoming nodes), 48 (export to Obsidian Canvas to round-trip).

## What ChatGPT exports

OpenAI's data export ZIP contains `conversations.json` with an array of conversations. Each has:
- `id`, `title`, `create_time`, `update_time`.
- `mapping`: a tree of nodes keyed by id, each with a `message` object containing `author.role`, `content.parts`, `create_time`.

Claude exports differ; see plan 43-extension below — implement the OpenAI shape first as P0.

## UX

1. **Drop zone on the Capture screen** ("Drop ChatGPT export here or click to choose…").
2. App parses the zip / json, lists all conversations sorted by date, with title, message count, model used, and a snippet from the first user turn.
3. Search box at top: substring match across titles + content (local index, no network).
4. Click a conversation → preview pane shows the full thread with role attribution.
5. **Import** button → runs the same Distiller as plan 41 → Capture Preview → user accepts → nodes land on a *new* canvas (project = "Imported from ChatGPT" by default).
6. Bulk import: select N conversations, "Import all" creates N projects (or one project with N canvases if user picks "single project").
7. Imported conversations are stored as Markdown under `LLM-Conversations/imported/{conversation-id}.md`.

## Scope

- Read `.zip` (using a JS unzip lib like `fflate`) or a raw `.json` drop.
- Build an in-memory index for search; persist a slim version under app-data so reopening the importer is fast.
- Map `mapping` tree to a flat ordered list of turns by walking the parent/child links from the root.
- Strip system messages by default; toggle to include them.
- Show progress while indexing (spinner with N/total).

## Implementation

New `src/services/capture/ChatgptImporter.ts`:

```ts
export type ImportedConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model?: string;
  turns: { role: 'user' | 'assistant' | 'system'; content: string; createdAt: string }[];
};
export async function readChatgptExport(file: File): Promise<ImportedConversation[]>;
export function indexConversations(convos: ImportedConversation[]): SearchIndex;
```

New screen `src/features/capture/ImportChatgptPanel.tsx` accessible from Settings → Capture or a new top-level "Import" entry.

Reuse:
- `Distiller` from plan 41.
- Capture Preview UI for accept/reject loop.
- Auto-layout from plan 47 to position the imported nodes.

## Acceptance

1. Dropping a real OpenAI export `.zip` on the import screen shows all conversations in under 5 s for a typical 1–2 GB export.
2. Search across titles + message content returns matches with the matching turn highlighted in the preview.
3. Importing one conversation produces a populated canvas (raw conversation saved as Markdown, candidate nodes via local Distiller).
4. Bulk-importing 10 conversations creates 10 canvases (or one merged one) without freezing the UI.
5. No network requests during import.
6. Re-opening the import screen is instant — index persisted.

## Risks

- Export schemas change. Keep the parser tolerant: read what we recognize, skip the rest, log unknown shapes.
- Large exports can exceed memory if loaded all at once — stream `conversations.json` (it's a JSON array; consider `oboe.js`-style streaming or chunk by manual scan).
- Privacy: export contains the user's entire history. Make the import path clearly local and never offer "send to cloud" options here.

## Extension — Claude export

Claude offers JSON export from the data settings page. Schema is different but conceptually equivalent. Add a second adapter in v1.3 once OpenAI is solid.
