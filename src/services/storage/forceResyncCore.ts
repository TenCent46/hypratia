/**
 * Pure orchestrator for "Force re-sync now". Lives separate from
 * `ForceResync.ts` so acceptance tests can import it without pulling in
 * the Zustand store or the `@tauri-apps/*` plugin chain that
 * `VaultSync.ts` reaches for at module load. Generic over the summary
 * shape — the orchestrator only routes vault path / state / timestamp
 * and never inspects the summary.
 */

import type { Conversation, CanvasNode, Edge } from '../../types';
import { hashMarkdownBody } from '../sync/bodyHash.ts';

export class NoVaultConfiguredError extends Error {
  constructor() {
    super('No Obsidian vault configured');
    this.name = 'NoVaultConfiguredError';
  }
}

export type ForceResyncSnapshot = {
  vaultPath?: string;
  conversations: Conversation[];
  nodes: CanvasNode[];
  edges: Edge[];
};

export type ForceResyncDeps<S> = {
  getSnapshot: () => ForceResyncSnapshot;
  syncFn: (input: {
    vaultPath: string;
    conversations: Conversation[];
    nodes: CanvasNode[];
    edges: Edge[];
  }) => Promise<S>;
  recordLastSync: (iso: string) => void;
  /**
   * Optional per-node sync-meta recorder. Called once per synced
   * node AFTER `syncFn` resolves with the node's body hash + the
   * sync timestamp. Refresh from Vault uses these values as the
   * baseline for conflict detection on the next pull. Omitting this
   * dep is supported (older callers without conflict tracking).
   */
  recordNodeSyncMeta?: (
    nodeId: string,
    bodyHash: string,
    syncedAt: string,
  ) => void;
  now?: () => Date;
};

export type ForceResyncOutcome<S> = {
  syncedAt: string;
  summary: S;
};

/**
 * Run a complete vault re-sync. Throws `NoVaultConfiguredError` when
 * the snapshot has no vault path so callers can surface a "Pick a
 * vault first" toast instead of failing silently.
 */
export async function runForceResync<S>(
  deps: ForceResyncDeps<S>,
): Promise<ForceResyncOutcome<S>> {
  const snap = deps.getSnapshot();
  if (!snap.vaultPath) {
    throw new NoVaultConfiguredError();
  }
  const summary = await deps.syncFn({
    vaultPath: snap.vaultPath,
    conversations: snap.conversations,
    nodes: snap.nodes,
    edges: snap.edges,
  });
  const syncedAt = (deps.now?.() ?? new Date()).toISOString();
  deps.recordLastSync(syncedAt);
  // Stamp every synced node with its current body hash + the sync
  // timestamp. This is the baseline Refresh from Vault uses to tell
  // "vault changed since we last agreed" from "Hypratia changed since
  // we last agreed" — without it, conflict classification has no
  // anchor and falls back to the safe-default "conflict."
  if (deps.recordNodeSyncMeta) {
    for (const node of snap.nodes) {
      deps.recordNodeSyncMeta(
        node.id,
        hashMarkdownBody(node.contentMarkdown),
        syncedAt,
      );
    }
  }
  return { syncedAt, summary };
}

/**
 * Format a timestamp for the "Last synced X" label. Pure helper — kept
 * here so the UI and Tauri shim can both reach for it without re-
 * implementing.
 */
export function formatLastSync(
  iso: string | undefined,
  now = Date.now(),
): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'recently';
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
