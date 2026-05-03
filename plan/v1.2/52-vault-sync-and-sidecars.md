# 52 — Vault sync + sidecar metadata

**Goal:** turn plan 48's one-shot export into an ongoing, deliberate flow into the user's Obsidian vault. **One direction first** (Hypratia → Vault). Bidirectional editing is deferred to v1.3 because conflict resolution on `.canvas` JSON does not have a human-friendly merge story.

**Depends on:** 48 (JSON Canvas export), `services/storage/`, `services/dialog/`.

## What "sync" means in v1.2

Strict, opinionated, one-way:

- Hypratia owns `Hypratia/` inside the vault. It writes there.
- Hypratia **never** modifies files outside `Hypratia/` and **never** deletes vault files outside it.
- When the user re-runs sync on a canvas, Hypratia overwrites *its own* outputs and leaves anything else alone.
- The user's edits to `Hypratia/`-owned files are preserved across re-syncs as long as the file's `hypratia_id` frontmatter still matches; otherwise Hypratia treats the file as orphaned and renames it `*.user-edit.md` rather than overwriting.

This is not "sync" in the iCloud sense; it is reproducible, idempotent export with a stable layout.

## UX

1. Settings → Vault → "Hypratia subfolder" (default: `Hypratia/`). Validate it lives inside the configured vault.
2. Per-canvas action: **Sync to Vault** (one click; default keybinding `⌘⇧E`).
3. First-time sync prompts a one-screen explanation: "We will create `{vault}/Hypratia/` and write `.canvas` + `.md` files there. Nothing outside that folder is touched." Includes a dry-run that lists files that *would* be written.
4. After sync, surface a banner: "Synced 1 canvas, 14 notes, 2 attachments → `Hypratia/canvases/hypratia-positioning.canvas`. **Open in Obsidian.**" Click → `obsidian://open?vault=…&file=…` URI.
5. Auto-sync is **off by default** in v1.2. A toggle in Settings → Vault → "Sync after every canvas change (debounced 30 s)" can be enabled by users who want it; it is still one-way.

## File layout (recap from plan 48)

```
{vault}/Hypratia/
  conversations/{conversationId}.md          ← raw transcript; Original View only
  notes/{nodeId}.md                          ← per-node Markdown sidecar (long bodies)
  canvases/{conversationId}.canvas           ← the JSON Canvas file
  canvases/{conversationId}.hypratia.json    ← optional sidecar for Hypratia-only metadata
  attachments/                                ← copied from app-data on demand
  _index.json                                 ← Hypratia's manifest of what it owns
```

`_index.json` is the source of truth for "what does Hypratia own in this vault?" Used to detect orphans, drift, and renames between sync runs.

## Frontmatter convention (canonical)

```yaml
---
hypratia_id: <stable id, never reused>
hypratia_kind: conversation | note | decision | task | question | claim | source
hypratia_source: chatgpt | claude | manual | paste | import
hypratia_view: original | laconic | outline | actions
hypratia_conversation: <conversationId>
hypratia_message: <messageId>
hypratia_created: <ISO date>
hypratia_updated: <ISO date>
hypratia_provider: anthropic | openai | google | …
hypratia_model: <ModelRef>
tags: [hypratia, ai-conversation, …user tags]
---
```

All Hypratia-owned keys are prefixed `hypratia_` to avoid collision with user / community-plugin frontmatter conventions. Extra user-added keys above the `tags:` line are preserved on re-sync.

## Conflict handling

On re-sync of `Hypratia/notes/{nodeId}.md`:

1. If the file does not exist → write.
2. If the file exists and its `hypratia_id` matches and the body has not been edited (hash check on body-only, frontmatter-aware) → overwrite.
3. If the file exists, `hypratia_id` matches, and the body **has** been edited by the user in Obsidian → write the new content as `{nodeId}.hypratia-update.md` next to the user's file and surface a "User-edited file kept; new draft alongside" entry in the post-sync banner. Never silently overwrite user edits.
4. If `hypratia_id` is missing or mismatched → treat as user-owned, do not overwrite, log warning.

For `.canvas` files: always overwrite (Hypratia owns canvas geometry). If the user has manually edited the `.canvas` in Obsidian, snapshot the previous version to `canvases/.previous/{conversationId}-{epoch}.canvas` before overwrite, and link to it from the banner.

## Implementation

New service `src/services/export/VaultSync.ts`:

```ts
export type SyncPlan = {
  writes: { path: string; bytes: number; reason: 'new' | 'overwrite' | 'side-by-side' }[];
  skips: { path: string; reason: 'user-edited' | 'orphan' | 'unchanged' }[];
  snapshots: { path: string; previousVersionPath: string }[];
};

export async function planVaultSync(canvasId: ID, vaultPath: string): Promise<SyncPlan>;
export async function applyVaultSync(plan: SyncPlan): Promise<void>;
```

- Build the plan in-memory first; show it to the user as a dry run on the first sync; subsequent syncs apply silently unless conflicts arise.
- All file writes go through the existing atomic-write helper (`*.tmp` → rename).
- Use `services/dialog` to confirm the `Hypratia/` folder location once and persist it to settings.

`obsidian://` URI scheme for the "Open in Obsidian" link uses `services/dialog/openWithSystem`.

## Acceptance

1. Running Sync to Vault on a canvas with 14 nodes produces the expected file tree and the canvas opens in Obsidian with all references resolved.
2. Editing a note in Obsidian and re-running sync does **not** overwrite the user edit; a `.hypratia-update.md` sibling is written instead.
3. Re-running sync with no changes is a no-op (no file writes, no snapshots).
4. `_index.json` accurately lists every Hypratia-owned file in the vault after sync.
5. With auto-sync off (default), no background filesystem writes occur.
6. Hypratia never writes outside the configured `Hypratia/` subfolder; verified by a path-allowlist check in `applyVaultSync`.

## Out of scope (v1.3+)

- Reading `.canvas` back into Hypratia (round-trip).
- Reading `.md` notes back as new canvas nodes.
- File-watcher-driven realtime sync.
- Resolving merge conflicts on `.canvas` geometry. JSON-level merge is too lossy.

## Risks

- Vault writes are user-visible and durable; a buggy sync can be loud. Dry run on first sync; opt-in for auto-sync; full undo via the `.previous/` snapshots.
- Path validation: refuse to sync if the configured `Hypratia/` resolves outside the chosen vault root (symlink escape).
- Frontmatter parser must be stable (use `gray-matter`, already in the stack).
- Obsidian indexing pause — large bulk writes can spike Obsidian's CPU; throttle writes to ~50/sec.
