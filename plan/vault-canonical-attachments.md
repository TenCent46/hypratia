# Vault-canonical attachments (Phase 1)

**Goal:** stop double-saving **new** attachments. Each newly ingested file lives as one physical blob, in the user's Markdown vault, with no parallel copy under `appData/attachments/`.

This is the first step toward the broader vault-canonical / three-layer architecture (original log + editable Markdown + index). Phase 1 only touches attachments. Conversation Markdown, `messages.json`, and the original event log are explicitly out of scope.

## Scope

- New attachments ingested after this PR ships:
  - Written once, directly into the vault's `raw/` directory (root or project, same selection logic as today's mirror).
  - No copy under `appData/attachments/`.
  - The on-disk filename is the human-readable display name (with collision-suffix), not the `<nanoid>.<ext>` form.
- Existing attachments under `appData/attachments/YYYY-MM/` continue to load and render unchanged.
- The `Attachment` record gains an explicit `storageRoot` discriminator so `relPath` interpretation is never ambiguous.
- Read APIs (`toUrl`, `readBytes`, `resolveAbsolutePath`, `removeByAttachment`) dispatch on `storageRoot`.

## Non-goals (Phase 1)

- **Do not migrate or delete existing `appData/attachments/` files.** They stay where they are. Migration is a follow-up PR with hash verification before deletion.
- No conversation Markdown bidirectional sync.
- No `messages.json` slimming or original event log split.
- No FS watcher / external edit detection for attachments.
- No `external` (in-place reference, no copy) ingestion path. The enum value is reserved but unused.
- No change to `attachments.json` schema beyond the new field.
- No change to the export flow's user-facing behavior. `ObsidianExporter` will branch internally so vault-canonical attachments are not re-copied.

## Type changes

`src/types/index.ts`:

```ts
export type AttachmentStorageRoot = 'vault' | 'appData' | 'external';

export type Attachment = {
  id: ID;
  kind: 'image' | 'pdf' | 'audio' | 'video' | 'file';
  filename: string;
  /**
   * Where `relPath` is rooted. Required for new records.
   * Records written before this field existed are treated as 'appData'.
   */
  storageRoot: AttachmentStorageRoot;
  /**
   * Path relative to the directory implied by `storageRoot`:
   *   'vault'    → relative to the resolved Markdown vault root
   *   'appData'  → relative to appDataDir() (legacy)
   *   'external' → reserved; not yet emitted
   */
  relPath: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  pageCount?: number;
  createdAt: string;
};
```

The field is required on the type, but the JSON load path treats missing `storageRoot` as `'appData'` so existing records load without migration.

## Ingest flow (new)

`TauriAttachmentService.ingest`:

1. Decide canonical destination:
   - If a vault root is resolvable AND mirroring rules permit it (same checks as today's `mirrorRawAttachmentToKnowledgeBase`: respects `incognitoUnprojectedChats`, project vs root raw dir), destination is **vault**.
   - Otherwise destination is **appData** (legacy path, unchanged).
2. Write **once** to the chosen destination:
   - **Vault path:** atomic write (write to `<target>.tmp`, then rename) using the display-name + collision suffix logic already in `uniqueTargetName`. Set `storageRoot: 'vault'`, `relPath: '<rawDir>/<finalName>'`.
   - **AppData path:** existing nanoid-based write under `attachments/YYYY-MM/`. Set `storageRoot: 'appData'`, `relPath: 'attachments/YYYY-MM/<storageName>'`.
3. The current dual-write (`copyFile` to appData + `mirrorRawAttachmentToKnowledgeBase` to vault) is **replaced**, not augmented. There is no second copy in either direction.

`awaitRawMirror` and `forceRawMirror` semantics carry over to "did the vault write succeed?" — same call sites, same observable behavior, just no longer about a *mirror*.

## Read flow

A single helper resolves `Attachment` → absolute path:

```ts
async function attachmentAbsolutePath(att: Attachment): Promise<string> {
  switch (att.storageRoot ?? 'appData') {
    case 'vault':    return absoluteMarkdownPath(await resolveMarkdownRoot(...), att.relPath);
    case 'appData':  return join(await appDataDir(), att.relPath);
    case 'external': throw new Error('external storageRoot not yet supported');
  }
}
```

`toUrl`, `readBytes`, `resolveAbsolutePath`, `removeByAttachment` all go through this helper.

## Edge cases

- **No vault configured at ingest time:** falls back to appData. The attachment record is born with `storageRoot: 'appData'` and stays that way (Phase 1 does not promote records when a vault is later set; that's the migration PR).
- **Vault unreachable at read time** (external drive disconnected, vault folder removed): read fails with a clear error, same UX as any other missing file. No silent fallback to a stale appData copy (because there is no appData copy).
- **Vault root changes between ingest and read:** `att.relPath` is interpreted against the *current* resolved vault root. Moving the vault folder is fine; pointing settings at a totally different vault breaks resolution. Phase 1 accepts this; the migration PR will surface it.
- **Filename collision in vault:** existing `uniqueTargetName` already produces `name (2).ext`, etc.
- **Display name == on-disk name:** with vault-canonical, `att.filename` and the actual filename are identical. Downstream code that assumes `filename` is purely cosmetic (and that the on-disk name is a nanoid) must be reviewed — `ObsidianExporter` is the main one.

## Touched files (estimated)

- `src/types/index.ts` — add `storageRoot`, `AttachmentStorageRoot`.
- `src/services/attachments/TauriAttachmentService.ts` — split ingest, central path resolver, dispatch read APIs.
- `src/services/attachments/AttachmentService.ts` — interface unchanged (transparent to callers).
- `src/services/export/ObsidianExporter.ts` — branch on `storageRoot`: skip the appData→vault copy step for `'vault'` records; keep current behavior for `'appData'` records.
- Storage load path for `attachments.json` — defaulting missing `storageRoot` to `'appData'` (one place).

No store, UI, or canvas changes expected.

## Verification

- Unit / integration:
  - Ingest with vault configured → exactly one file on disk, under `<vault>/<rawDir>/`. No file under `appData/attachments/`.
  - Ingest without vault → exactly one file under `appData/attachments/YYYY-MM/`. No vault write attempted.
  - Loading an `attachments.json` written by the previous version (no `storageRoot` field) → records resolve as `'appData'`, files render.
  - Mixed list (some `'vault'`, some `'appData'`) → both render in chat, canvas, and preview.
- Manual:
  - Drag-and-drop an image into chat: confirm one file in vault, none in appData (use Finder).
  - Open a pre-existing (legacy) attachment from before the upgrade: still renders.
  - Disconnect/move the vault folder: read produces a visible error, app does not crash.
  - Export a conversation containing both vault-canonical and legacy attachments: produces a coherent export, no duplicate copies.
- `pnpm tsc --noEmit` and `pnpm lint` clean.

## Migration plan (deferred — separate PR)

For records with `storageRoot: 'appData'`:

1. Compute SHA-256 of the appData file.
2. Copy to the vault `raw/` directory using the display-name + collision-suffix flow.
3. Compute SHA-256 of the vault file. Verify match.
4. Update the record to `storageRoot: 'vault'` with the new `relPath`. Atomic JSON write.
5. Only after the JSON commit succeeds, remove the appData file.
6. Idempotent: re-running the migration on already-migrated records is a no-op.
7. Surfaced as an explicit user action ("Migrate attachments to vault…") with progress and a per-file failure list. Not auto-run on launch.

## Risks

- **Vault path stability assumption.** Phase 1 trusts that the vault root, once set, isn't randomly repointed. If a user does repoint it, vault-canonical records become unreadable until pointed back. Acceptable for v1.0-beta; the migration PR will add a sanity check on launch (compare a small probe file or stored vault id) and warn.
- **Single point of failure.** Removing the appData copy means losing the vault folder loses the attachment. This is the intended tradeoff (the user's vault is the user's data), but should be called out in release notes alongside the recommendation to back up the vault.
- **Display-name leakage.** On-disk filenames now contain user-supplied text. Existing `safeFilename` and Windows-reserved-name handling already cover this; no new sanitization needed, but worth re-reviewing for path traversal (`..`, leading `/`).
