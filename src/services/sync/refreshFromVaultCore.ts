/**
 * Pure planner for "Refresh from Vault."
 *
 * Lives separate from the Tauri shim (`services/storage/RefreshFromVault.ts`)
 * so the acceptance suite can exercise the classification matrix without
 * booting the store, the dialog plugin, or `@tauri-apps/plugin-fs`. The
 * shim's only job is to walk the disk and call us with raw file
 * observations; we decide what to apply, what to skip, and what to flag
 * as a conflict.
 *
 * The planner is intentionally side-effect-free. Apply happens in a
 * separate pass so the UI can surface conflict counts before any state
 * mutation — and so a later v1.3 UI can present a "review before
 * apply" step without a second scan.
 */

import { hashMarkdownBody } from './bodyHash.ts';
import {
  classifyConflict,
  type ConflictDetail,
  type ConflictKind,
} from './conflictClassifier.ts';

/** Snapshot of one in-store node, just the bits the planner needs. */
export type RefreshStoreNode = {
  id: string;
  title: string;
  contentMarkdown: string;
  /** Hash + timestamp written by the previous successful sync. */
  syncMeta?: {
    lastSyncedBodyHash?: string;
    lastSyncedAt?: string;
  };
};

/** One scanned file from `Hypratia/Notes/` or `Hypratia/Conversations/`. */
export type RefreshScannedFile = {
  /** Vault-relative path, used for UI / conflict reporting. */
  path: string;
  /** Raw file text including any frontmatter — caller does NOT
   *  pre-strip; the planner runs the same hash everyone else does. */
  text: string;
  /** `hypratia_id` extracted from frontmatter. `null` when the file
   *  has no Hypratia identity (e.g. user-authored note inside the
   *  `Hypratia/Notes/` folder). */
  hypratiaId: string | null;
  /** Body without frontmatter — the value the shim will write to
   *  `node.contentMarkdown` when an apply action fires. Pre-computed
   *  here because the shim already runs gray-matter once. */
  body: string;
};

/** What to do with one scanned file after classification. */
export type RefreshAction =
  | {
      kind: 'apply';
      hypratiaId: string;
      path: string;
      newBody: string;
      newHash: string;
    }
  | {
      kind: 'skip';
      hypratiaId: string;
      path: string;
      classification: Extract<ConflictKind, 'unchanged' | 'hypratia-changed-only'>;
    }
  | {
      kind: 'conflict';
      detail: ConflictDetail;
    }
  | {
      kind: 'unmatched';
      path: string;
      reason: 'no-id' | 'unknown-id';
    };

export type RefreshPlan = {
  actions: RefreshAction[];
  /** Counts pre-computed for the result toast. Sum identity:
   *  scanned = updated + skipped + conflicts + unmatched. */
  counts: {
    scanned: number;
    matched: number;
    updated: number;
    skipped: number;
    conflicts: number;
    unmatched: number;
  };
};

export type PlanRefreshInput = {
  files: RefreshScannedFile[];
  storeNodes: RefreshStoreNode[];
};

/**
 * Decide an action per scanned file. Pure: same input → same output.
 * The shim drives the I/O around this; here we just classify.
 */
export function planRefreshActions(input: PlanRefreshInput): RefreshPlan {
  const nodesById = new Map<string, RefreshStoreNode>();
  for (const n of input.storeNodes) nodesById.set(n.id, n);

  const actions: RefreshAction[] = [];
  let matched = 0;
  let updated = 0;
  let skipped = 0;
  let conflicts = 0;
  let unmatched = 0;

  for (const file of input.files) {
    if (!file.hypratiaId) {
      actions.push({ kind: 'unmatched', path: file.path, reason: 'no-id' });
      unmatched += 1;
      continue;
    }
    const node = nodesById.get(file.hypratiaId);
    if (!node) {
      actions.push({ kind: 'unmatched', path: file.path, reason: 'unknown-id' });
      unmatched += 1;
      continue;
    }
    matched += 1;

    const vaultBodyHash = hashMarkdownBody(file.body);
    const storeBodyHash = hashMarkdownBody(node.contentMarkdown);
    const lastSyncedBodyHash = node.syncMeta?.lastSyncedBodyHash;
    const classification = classifyConflict({
      vaultBodyHash,
      storeBodyHash,
      lastSyncedBodyHash,
    });

    if (classification === 'unchanged') {
      actions.push({
        kind: 'skip',
        hypratiaId: file.hypratiaId,
        path: file.path,
        classification: 'unchanged',
      });
      skipped += 1;
      continue;
    }
    if (classification === 'vault-changed-only') {
      actions.push({
        kind: 'apply',
        hypratiaId: file.hypratiaId,
        path: file.path,
        newBody: file.body,
        newHash: vaultBodyHash,
      });
      updated += 1;
      continue;
    }
    if (classification === 'hypratia-changed-only') {
      actions.push({
        kind: 'skip',
        hypratiaId: file.hypratiaId,
        path: file.path,
        classification: 'hypratia-changed-only',
      });
      skipped += 1;
      continue;
    }
    // Conflict — either both sides diverged from a known baseline, or
    // we have no baseline at all. Both buckets surface the same way
    // in the count; the `reason` tag lets the UI render different
    // copy ("baseline missing" vs "both changed").
    actions.push({
      kind: 'conflict',
      detail: {
        hypratiaId: file.hypratiaId,
        path: file.path,
        title: node.title,
        vaultBodyHash,
        storeBodyHash,
        lastSyncedBodyHash,
        reason: classification,
      },
    });
    conflicts += 1;
  }

  return {
    actions,
    counts: {
      scanned: input.files.length,
      matched,
      updated,
      skipped,
      conflicts,
      unmatched,
    },
  };
}

/**
 * Side-effecting follow-up: apply the planner's `apply` actions via
 * the caller's update hooks. Kept tiny and dependency-injected so the
 * Tauri shim can pass real store actions and the test suite can pass
 * spies. `unmatched` and `skip` actions are no-ops here — they only
 * exist for the result counts and a future UI breakdown.
 */
export type ApplyDeps = {
  updateNodeBody: (nodeId: string, body: string) => void;
  recordSyncedHash: (nodeId: string, hash: string, syncedAt: string) => void;
  syncedAt: string;
};

export function applyRefreshActions(
  actions: RefreshAction[],
  deps: ApplyDeps,
): void {
  for (const action of actions) {
    if (action.kind !== 'apply') continue;
    deps.updateNodeBody(action.hypratiaId, action.newBody);
    deps.recordSyncedHash(action.hypratiaId, action.newHash, deps.syncedAt);
  }
}
