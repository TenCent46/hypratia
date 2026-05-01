# 02 — Data model and local persistence

**Goal:** store entities locally, reload them on startup, never lose a node position.

**Depends on:** 01.

## Types

Implement the canonical types from CLAUDE.md in `src/types/index.ts`:
- `Conversation`, `Message`, `CanvasNode`, `Edge`, `Settings`.
- `CanvasNode.position: { x: number; y: number }` is non-optional.
- `Settings.viewportByConversation` records pan/zoom per conversation.

## Storage adapter

- `src/services/storage/StorageAdapter.ts` — interface:
  ```ts
  interface StorageAdapter {
    loadAll(): Promise<{ conversations; messages; nodes; edges; settings }>;
    save<T>(file: StorageFile, data: T): Promise<void>;
  }
  ```
- `src/services/storage/TauriJsonStorage.ts` — implementation using `@tauri-apps/plugin-fs`.
  - Files: `conversations.json`, `messages.json`, `nodes.json`, `edges.json`, `settings.json`.
  - Atomic write: write `${file}.tmp`, then rename.
  - Missing file = empty array / default settings.
  - Use `appDataDir()` from `@tauri-apps/plugin-path`.

## Store

Zustand. One slice per entity + a settings slice. Combined store. Custom persistence middleware that:
1. Subscribes per slice.
2. Debounces 300 ms per file.
3. Hydrates from the storage adapter before first render.

Don't use `zustand/persist` directly — it's too coarse and writes the whole blob on any change.

## App boot

- Render a brief splash while hydrating.
- After hydration: render the app.

## Acceptance

- Add a node, close the app, reopen → node is back, with same position.
- `appDataDir()` shows the five JSON files; opening them in any text editor is human-readable.
- Killing the app mid-save (`kill -9` while dragging) leaves the previous good file intact.

## Risks

- Subscribing too aggressively → write storms. Debounce per file.
- Forgetting to await hydration before first render → blank canvas flash. Splash gates render.
- macOS sandbox path differences — always go through `appDataDir()`, never hardcode.
- Schema evolution: bump `Settings.schemaVersion` from day one so future migrations have a hook.
