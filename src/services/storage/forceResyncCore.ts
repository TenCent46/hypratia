/**
 * Pure orchestrator for "Force re-sync now". Lives separate from
 * `ForceResync.ts` so acceptance tests can import it without pulling in
 * the Zustand store or the `@tauri-apps/*` plugin chain that
 * `VaultSync.ts` reaches for at module load. Generic over the summary
 * shape — the orchestrator only routes vault path / state / timestamp
 * and never inspects the summary.
 */

import type { Conversation, CanvasNode, Edge } from '../../types';

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
