/**
 * Pure resolvers for the Conflict Review modal.
 *
 * Each user choice (Use Vault / Keep Hypratia / Skip) is expressed as
 * an async function that takes a conflict + injected I/O deps. Splitting
 * the logic this way keeps the Tauri shim thin and lets the acceptance
 * suite verify "what gets called, with what arguments" without booting
 * the store or touching `@tauri-apps/*`.
 *
 * Resolution semantics in v1.2:
 *
 *   - Use Vault version       → re-read the vault file, overwrite
 *                                 `node.contentMarkdown`, stamp the
 *                                 fresh body hash as the new baseline.
 *                                 Re-read (vs. using a scan-time
 *                                 snapshot) so the user's choice
 *                                 reflects what's actually on disk
 *                                 right now.
 *   - Keep Hypratia version   → read the current store body, write it
 *                                 back to the vault preserving user
 *                                 frontmatter, stamp the new baseline.
 *                                 Re-read (vs. using the scan-time
 *                                 hash) so any in-flight Hypratia
 *                                 edits land too.
 *   - Skip                    → no-op. Returned as a separate
 *                                 function for symmetry; callers may
 *                                 still want to log or track skips.
 *
 * Auto-merge is intentionally absent — review-then-pick first, fancy
 * 3-way merge much later.
 */

import { hashMarkdownBody } from './bodyHash.ts';
import type { ConflictDetail } from './conflictClassifier.ts';

/** Tauri-side I/O the Tauri shim wires up. The pure resolver doesn't
 *  care which backing store these talk to — only that they exist and
 *  are awaited in order. */
export type ResolveDeps = {
  /** Read the current vault file body (frontmatter already stripped)
   *  and its hash. Used by Use Vault. */
  readVaultBody: (relPath: string) => Promise<{ body: string; hash: string }>;
  /** Read the current Hypratia in-store body for a node. Used by
   *  Keep Hypratia so the resolver picks up edits made between scan
   *  and resolve. */
  readStoreBody: (nodeId: string) => string;
  /** Replace `node.contentMarkdown` with the chosen body. */
  updateNodeBody: (nodeId: string, body: string) => void;
  /** Write a body back to the vault, preserving user frontmatter
   *  via `mergeMarkdownWithHypratia`. Used by Keep Hypratia. */
  writeVaultBody: (relPath: string, body: string) => Promise<void>;
  /** Stamp the agreed body hash + timestamp on the node's syncMeta. */
  recordSyncedHash: (nodeId: string, hash: string, syncedAt: string) => void;
  /** ISO timestamp the resolver stamps on each successful resolution.
   *  Pinned at the start of a Review session so all conflicts in one
   *  session share a single `lastSyncedAt`. */
  syncedAt: string;
};

export type ResolutionOutcome = {
  hypratiaId: string;
  action: 'use-vault' | 'keep-hypratia' | 'skip';
  newHash?: string;
};

/**
 * "Use Vault version" — overwrite the in-store body with what's
 * currently on disk and stamp the new baseline.
 */
export async function resolveUseVault(
  detail: ConflictDetail,
  deps: ResolveDeps,
): Promise<ResolutionOutcome> {
  const { body, hash } = await deps.readVaultBody(detail.path);
  deps.updateNodeBody(detail.hypratiaId, body);
  deps.recordSyncedHash(detail.hypratiaId, hash, deps.syncedAt);
  return { hypratiaId: detail.hypratiaId, action: 'use-vault', newHash: hash };
}

/**
 * "Keep Hypratia version" — push the current in-store body back to
 * the vault and stamp the new baseline. Re-reads from the store so
 * any edits made between scan and resolve are honoured.
 */
export async function resolveKeepHypratia(
  detail: ConflictDetail,
  deps: ResolveDeps,
): Promise<ResolutionOutcome> {
  const body = deps.readStoreBody(detail.hypratiaId);
  await deps.writeVaultBody(detail.path, body);
  const hash = hashMarkdownBody(body);
  deps.recordSyncedHash(detail.hypratiaId, hash, deps.syncedAt);
  return { hypratiaId: detail.hypratiaId, action: 'keep-hypratia', newHash: hash };
}

/**
 * "Skip for now" — no-op. Both sides retain their current state and
 * the conflict is preserved for the next review session.
 */
export function resolveSkip(detail: ConflictDetail): ResolutionOutcome {
  return { hypratiaId: detail.hypratiaId, action: 'skip' };
}

// ---------------------------------------------------------------------------
// View-model helpers — pure transforms the modal renders against. Kept
// here (vs. inside the React component) so the same logic can be
// asserted by the acceptance suite.
// ---------------------------------------------------------------------------

export type ConflictRow = {
  hypratiaId: string;
  title: string;
  path: string;
  /** True iff `reason === 'conflict-no-baseline'`. Drives the
   *  "No previous sync baseline exists" warning copy in the modal. */
  baselineMissing: boolean;
  /** Short hashes for display. Already 8-character FNV-1a hex from
   *  `hashMarkdownBody`; we keep them as-is rather than sha256-style
   *  truncating because a full hash IS short. */
  vaultBodyHash: string;
  storeBodyHash: string;
  lastSyncedBodyHash?: string;
};

/** Produce one render-ready row per conflict. */
export function conflictRowsFromDetails(details: ConflictDetail[]): ConflictRow[] {
  return details.map((d) => ({
    hypratiaId: d.hypratiaId,
    title: d.title || '(untitled)',
    path: d.path,
    baselineMissing: d.reason === 'conflict-no-baseline',
    vaultBodyHash: d.vaultBodyHash,
    storeBodyHash: d.storeBodyHash,
    lastSyncedBodyHash: d.lastSyncedBodyHash,
  }));
}

/**
 * Copy the modal shows under each conflict, varying by reason. Pure
 * so the test can lock the wording and the modal stays declarative.
 */
export function warningCopyFor(row: Pick<ConflictRow, 'baselineMissing'>): string {
  return row.baselineMissing
    ? 'No previous sync baseline exists. Choose which version should become the source of truth.'
    : 'Both Hypratia and Obsidian changed this note since the last sync. Pick the one to keep.';
}
