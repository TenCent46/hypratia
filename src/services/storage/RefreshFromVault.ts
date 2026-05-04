/**
 * Manual "Refresh from Vault" pass — pull markdown body changes from
 * `<vault>/Hypratia/Notes/*.md` and `<vault>/Hypratia/Conversations/*.md`
 * back into the in-app store. Match is by `hypratia_id` frontmatter
 * (never filename) so an Obsidian rename still finds the node.
 *
 * Conflict-aware (v1.2): for each matched note we hash the vault body
 * and compare against the store body + the `lastSyncedBodyHash`
 * baseline. The pure planner in `services/sync/refreshFromVaultCore`
 * handles classification; this shim does the disk walk and dispatches
 * the resulting actions.
 *
 *   - vault-changed-only      → apply (overwrite store body, stamp
 *                               new `lastSyncedBodyHash`)
 *   - hypratia-changed-only   → skip (Hypratia has unsynced edits)
 *   - conflict                → skip + add to `conflictDetails` for UI
 *   - unchanged               → no-op
 *
 * Pull-only and explicit. Never writes the vault. Live file watching
 * is intentionally deferred to v1.3+.
 *
 * Lives under `services/storage/` so the `@tauri-apps/*` import is in
 * the architectural allowlist.
 */

import { exists, readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import matter from 'gray-matter';
import { useStore } from '../../store';
import { readFrontmatterIdentity } from '../markdown/wikilinks';
import {
  applyRefreshActions,
  planRefreshActions,
  type RefreshScannedFile,
  type RefreshStoreNode,
} from '../sync/refreshFromVaultCore';
import type { ConflictDetail } from '../sync/conflictClassifier';

export type RefreshSummary = {
  scanned: number;
  matched: number;
  /** vault-changed-only entries actually applied. */
  updated: number;
  /** Anything matched-but-not-updated EXCEPT conflicts (unchanged +
   *  hypratia-changed-only) plus read failures. Conflicts get their
   *  own bucket so the UI can route attention. */
  skipped: number;
  conflicts: number;
  conflictDetails: ConflictDetail[];
  unmatched: { path: string; reason: 'no-id' | 'unknown-id' }[];
};

export async function refreshFromVault(
  vaultPath: string,
): Promise<RefreshSummary> {
  const subfolders = ['Hypratia/Notes', 'Hypratia/Conversations'];

  // Disk walk → list of `RefreshScannedFile`. We do NOT classify here —
  // the pure planner owns that decision so the test suite can exercise
  // every branch without booting the store.
  const files: RefreshScannedFile[] = [];
  const readFailures: string[] = [];
  for (const sub of subfolders) {
    const root = await join(vaultPath, sub);
    if (!(await exists(root))) continue;
    await walkMarkdown(root, vaultPath, async (relPath, absPath) => {
      let text: string;
      try {
        text = await readTextFile(absPath);
      } catch {
        readFailures.push(relPath);
        return;
      }
      const identity = readFrontmatterIdentity(text);
      const id = identity.hypratiaId ?? identity.legacyId ?? null;
      const { content: body } = matter(text);
      files.push({
        path: relPath,
        text,
        hypratiaId: id,
        body,
      });
    });
  }

  const state = useStore.getState();
  const storeNodes: RefreshStoreNode[] = state.nodes.map((n) => ({
    id: n.id,
    title: n.title,
    contentMarkdown: n.contentMarkdown,
    syncMeta: n.syncMeta,
  }));
  const plan = planRefreshActions({ files, storeNodes });

  const conflictDetails: ConflictDetail[] = [];
  const unmatched: RefreshSummary['unmatched'] = [];
  for (const action of plan.actions) {
    if (action.kind === 'conflict') conflictDetails.push(action.detail);
    else if (action.kind === 'unmatched') {
      unmatched.push({ path: action.path, reason: action.reason });
    }
  }

  const syncedAt = new Date().toISOString();
  applyRefreshActions(plan.actions, {
    updateNodeBody: (nodeId, body) =>
      useStore.getState().updateNode(nodeId, { contentMarkdown: body }),
    recordSyncedHash: (nodeId, hash, at) =>
      useStore.getState().setNodeSyncMeta(nodeId, {
        lastSyncedBodyHash: hash,
        lastSyncedAt: at,
      }),
    syncedAt,
  });

  return {
    scanned: plan.counts.scanned,
    matched: plan.counts.matched,
    updated: plan.counts.updated,
    // `skipped` mirrors the planner counts plus read-time failures.
    // The planner already counts unchanged + hypratia-changed-only +
    // unmatched as skipped-equivalent buckets; we add disk read errors
    // (which never reach the planner) on top.
    skipped: plan.counts.skipped + readFailures.length,
    conflicts: plan.counts.conflicts,
    conflictDetails,
    unmatched,
  };
}

async function walkMarkdown(
  dirAbs: string,
  vaultRoot: string,
  onFile: (relPath: string, absPath: string) => Promise<void>,
): Promise<void> {
  const entries = await readDir(dirAbs);
  for (const entry of entries) {
    const childAbs = await join(dirAbs, entry.name);
    if (entry.isDirectory) {
      await walkMarkdown(childAbs, vaultRoot, onFile);
      continue;
    }
    if (!entry.isFile) continue;
    if (!/\.(md|markdown)$/i.test(entry.name)) continue;
    const rel = relativeFrom(vaultRoot, childAbs);
    await onFile(rel, childAbs);
  }
}

function relativeFrom(root: string, abs: string): string {
  if (abs.startsWith(root)) {
    return abs.slice(root.length).replace(/^\/+/, '');
  }
  return abs;
}
