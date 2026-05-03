/**
 * "Force re-sync now" — the single user-facing way to push every Hypratia
 * canvas + sidecar + transcript stub into the vault, regardless of what
 * the autosave debouncer is doing right now. Replaces the older split of
 * "Export as Obsidian Canvas" (per-conversation) and "Sync all canvases
 * to Vault" (everything) so users have one obvious button to press when
 * they want certainty.
 *
 * This is the Tauri-aware shim: it wires the live Zustand store + real
 * `syncToVault` into the pure `runForceResync` orchestrator. The
 * orchestrator + `formatLastSync` live in `./forceResyncCore.ts` so the
 * acceptance suite can exercise them without booting the store.
 *
 * One-way only (Hypratia → vault). For pulling Obsidian edits back, see
 * `RefreshFromVault.ts`.
 */

import { useStore } from '../../store';
import { syncToVault, type SyncSummary } from '../export/VaultSync';
import {
  formatLastSync,
  NoVaultConfiguredError,
  runForceResync,
  type ForceResyncOutcome,
} from './forceResyncCore';

export { formatLastSync, NoVaultConfiguredError };
export type ForceResyncResult = ForceResyncOutcome<SyncSummary>;

/**
 * Real-world entry: pull state from the live store, hit the real
 * `syncToVault`. The canvas-pane menu, Settings, and ⌘⇧R all funnel
 * here.
 */
export async function forceResyncNow(): Promise<ForceResyncResult> {
  return runForceResync<SyncSummary>({
    getSnapshot: () => {
      const state = useStore.getState();
      return {
        vaultPath: state.settings.obsidianVaultPath,
        conversations: state.conversations,
        nodes: state.nodes,
        edges: state.edges,
      };
    },
    syncFn: syncToVault,
    recordLastSync: (iso) => useStore.getState().setLastResyncAt(iso),
  });
}
