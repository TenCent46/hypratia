/**
 * Pure 3-way conflict classifier for Hypratia ↔ vault refresh.
 *
 * Inputs are body hashes (frontmatter-stripped, normalized — see
 * `bodyHash.ts`). The classifier decides what Refresh from Vault
 * should do for one note, given:
 *
 *   - vaultBodyHash         — what the file in Obsidian currently is
 *   - storeBodyHash         — what Hypratia has in memory
 *   - lastSyncedBodyHash    — the hash both sides agreed on at last
 *                              successful sync (Force Re-sync or a
 *                              prior Refresh pull)
 *
 * The matrix:
 *
 *   vault === store                                → unchanged
 *   vault changed, store unchanged                 → vault-changed-only (apply)
 *   vault unchanged, store changed                 → hypratia-changed-only (skip)
 *   vault changed AND store changed AND vault≠store → conflict (skip + report)
 *
 * When `lastSyncedBodyHash` is undefined (the very first refresh
 * after Hypratia learned about a node, e.g. a freshly imported one
 * the user has never re-synced), we have no baseline. In that case
 * `vault === store` still resolves cleanly to `unchanged`; otherwise
 * we cannot tell which side changed and the safe default is
 * `conflict`. The user resolves by running Force Re-sync, which seeds
 * `lastSyncedBodyHash` to the current Hypratia body — after that the
 * classifier has a baseline to reason from.
 */

export type ConflictKind =
  | 'unchanged'
  | 'vault-changed-only'
  | 'hypratia-changed-only'
  /** Both sides differ AND a baseline existed — true Hypratia↔Obsidian
   *  divergence after the last sync. */
  | 'conflict'
  /** Sides differ but Hypratia has no `lastSyncedBodyHash` to anchor
   *  attribution. Common on first refresh after opening an existing
   *  vault — the user hasn't run Force Re-sync yet, so we treat it as
   *  a conflict but tag it differently so the UI can show
   *  "No previous sync baseline exists" instead of "you both
   *  changed this." */
  | 'conflict-no-baseline';

export type ClassifyInput = {
  vaultBodyHash: string;
  storeBodyHash: string;
  lastSyncedBodyHash?: string;
};

/**
 * Per-conflict record retained on the RefreshSummary so a future UI
 * (out of scope for this PR) can render a side-by-side resolution
 * picker. Today the structure is consumed only by the result toast,
 * but the shape is the contract the UI will read against.
 */
export type ConflictDetail = {
  hypratiaId: string;
  path: string;
  title: string;
  vaultBodyHash: string;
  storeBodyHash: string;
  lastSyncedBodyHash?: string;
  /** Why this entry is in the conflicts list. Today only `'conflict'`
   *  reaches here; `hypratia-changed-only` is silently skipped (it's
   *  still a valid local edit, not a conflict). Kept open for v1.3
   *  when we may surface skipped local edits too. */
  reason: ConflictKind;
};

/** Classify one note. Pure — same inputs always produce the same output. */
export function classifyConflict(input: ClassifyInput): ConflictKind {
  const { vaultBodyHash, storeBodyHash, lastSyncedBodyHash } = input;
  if (vaultBodyHash === storeBodyHash) return 'unchanged';
  // Beyond this point: vault and store differ.
  if (lastSyncedBodyHash === undefined) {
    // No baseline → we can't attribute the divergence to one side.
    // Tagged separately so the UI can suggest "establish a baseline"
    // (Force Re-sync) rather than "both sides changed."
    return 'conflict-no-baseline';
  }
  const vaultDirty = vaultBodyHash !== lastSyncedBodyHash;
  const storeDirty = storeBodyHash !== lastSyncedBodyHash;
  if (vaultDirty && !storeDirty) return 'vault-changed-only';
  if (!vaultDirty && storeDirty) return 'hypratia-changed-only';
  // Both dirty AND vault !== store (already established above).
  return 'conflict';
}
