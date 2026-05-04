/**
 * Tauri-side runner for the Conflict Review modal's resolve actions.
 *
 * Exposes two thin entry points the modal calls:
 *
 *   - `runUseVault(vaultPath, detail)`     — re-read the vault file,
 *                                              update the store body,
 *                                              stamp `syncMeta`.
 *   - `runKeepHypratia(vaultPath, detail)` — read the live store body,
 *                                              merge it into the
 *                                              existing vault file
 *                                              (preserving user-owned
 *                                              frontmatter), stamp
 *                                              `syncMeta`.
 *
 * All three "decide what to do" steps live in the pure
 * `services/sync/conflictResolution.ts` — this module just supplies
 * the I/O dependencies (filesystem, store, frontmatter merge). Atomic
 * writes via the standard `<path>.tmp` + rename dance.
 *
 * Lives under `services/storage/` so the `@tauri-apps/*` import is in
 * the architectural allowlist.
 */

import {
  exists,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import matter from 'gray-matter';
import { useStore } from '../../store';
import { mergeMarkdownWithHypratia } from '../export/frontmatter';
import { hashMarkdownBody } from '../sync/bodyHash';
import {
  resolveKeepHypratia,
  resolveUseVault,
  type ResolutionOutcome,
  type ResolveDeps,
} from '../sync/conflictResolution';
import type { ConflictDetail } from '../sync/conflictClassifier';

/**
 * Apply "Use Vault version" for one conflict. Re-reads the file so
 * any edits Obsidian saved between scan and click land too.
 */
export async function runUseVault(
  vaultPath: string,
  detail: ConflictDetail,
  syncedAt: string = new Date().toISOString(),
): Promise<ResolutionOutcome> {
  return resolveUseVault(detail, makeDeps(vaultPath, syncedAt));
}

/**
 * Apply "Keep Hypratia version" for one conflict. Reads the current
 * store body (so in-flight Hypratia edits are picked up), merges it
 * into the existing vault file's frontmatter, writes atomically.
 */
export async function runKeepHypratia(
  vaultPath: string,
  detail: ConflictDetail,
  syncedAt: string = new Date().toISOString(),
): Promise<ResolutionOutcome> {
  return resolveKeepHypratia(detail, makeDeps(vaultPath, syncedAt));
}

// ---------------------------------------------------------------------------
// Shared dep wiring
// ---------------------------------------------------------------------------

function makeDeps(vaultPath: string, syncedAt: string): ResolveDeps {
  return {
    readVaultBody: async (relPath) => {
      const abs = await join(vaultPath, ...relPath.split('/'));
      const text = await readTextFile(abs);
      const { content: body } = matter(text);
      return { body, hash: hashMarkdownBody(body) };
    },
    readStoreBody: (nodeId) => {
      const node = useStore.getState().nodes.find((n) => n.id === nodeId);
      return node?.contentMarkdown ?? '';
    },
    updateNodeBody: (nodeId, body) => {
      useStore.getState().updateNode(nodeId, { contentMarkdown: body });
    },
    writeVaultBody: async (relPath, body) => {
      const abs = await join(vaultPath, ...relPath.split('/'));
      // Preserve every key the user / Obsidian wrote into the
      // frontmatter — we only own the body for this resolution. An
      // empty `hypratia_*` patch means "leave hypratia keys alone";
      // user keys ride through `mergeMarkdownWithHypratia` untouched.
      let existing = '';
      if (await exists(abs)) {
        try {
          existing = await readTextFile(abs);
        } catch {
          existing = '';
        }
      }
      const next = mergeMarkdownWithHypratia(existing, {}, body);
      await atomicWriteText(abs, next);
    },
    recordSyncedHash: (nodeId, hash, at) => {
      useStore.getState().setNodeSyncMeta(nodeId, {
        lastSyncedBodyHash: hash,
        lastSyncedAt: at,
      });
    },
    syncedAt,
  };
}

async function atomicWriteText(absPath: string, content: string): Promise<void> {
  const tmpPath = `${absPath}.tmp`;
  if (await exists(tmpPath)) {
    try {
      await remove(tmpPath);
    } catch {
      /* best-effort — rename would fail loudly anyway */
    }
  }
  await writeTextFile(tmpPath, content);
  await rename(tmpPath, absPath);
}
