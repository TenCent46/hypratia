/**
 * Sync Doctor — read-only diagnostics for the Hypratia ↔ vault sync
 * pipeline. Answers the question users ask when something feels off:
 * "is autosave actually running? does my vault have the right
 * folders? are there leftover LLM-* dirs from the v1.1 layout?"
 *
 * Strictly read-only: this module never writes, renames, or migrates
 * anything. It probes the filesystem, reads the live store, and hands
 * raw observations to the pure formatter in `syncDoctorCore.ts`.
 *
 * Lives in `services/storage/` so the `@tauri-apps/*` imports are in
 * the architectural allowlist.
 */

import { exists, readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { useStore } from '../../store';
import { readFrontmatterIdentity } from '../markdown/wikilinks';
import {
  buildSyncDoctorReport,
  isLegacyTopLevelFolder,
  type SyncDoctorObservations,
  type SyncDoctorReport,
} from './syncDoctorCore';

/** Sub-paths Sync Doctor probes inside the vault root. */
const NOTES_REL = ['Hypratia', 'Notes'];
const CANVASES_REL = ['Hypratia', 'Canvases'];
const SIDECARS_REL = ['Hypratia', '.hypratia', 'sidecars'];

/**
 * Run the full diagnostic scan. Cheap: filesystem probes are
 * directory-existence checks, not deep walks, except for the library
 * backfill count which lists `.md` files outside `Hypratia/`.
 *
 * Errors during fs probes are swallowed — a missing directory is data
 * for the report, not an exception.
 */
export async function runSyncDoctor(): Promise<SyncDoctorReport> {
  const state = useStore.getState();
  const vaultPath = state.settings.obsidianVaultPath;
  const libraryRoot = state.settings.markdownStorageDir;

  const vaultProbes = await probeVault(vaultPath);
  const legacyFolders = await readLegacyFolders(vaultPath);
  const libraryPendingCount = await countLibraryBackfillCandidates(libraryRoot);

  const observations: SyncDoctorObservations = {
    vaultPath,
    libraryRoot,
    vaultProbes,
    legacyFolders,
    libraryPendingCount,
    lastResyncAt: state.settings.lastResyncAt,
    lastCanvasAutosaveAt: state.settings.lastCanvasAutosaveAt,
    now: Date.now(),
  };
  return buildSyncDoctorReport(observations);
}

async function probeVault(
  vaultPath: string | undefined,
): Promise<SyncDoctorObservations['vaultProbes']> {
  if (!vaultPath) {
    return {
      notesDirExists: false,
      canvasesDirExists: false,
      sidecarsDirExists: false,
    };
  }
  const [notes, canvases, sidecars] = await Promise.all([
    safeExists(await join(vaultPath, ...NOTES_REL)),
    safeExists(await join(vaultPath, ...CANVASES_REL)),
    safeExists(await join(vaultPath, ...SIDECARS_REL)),
  ]);
  return {
    notesDirExists: notes,
    canvasesDirExists: canvases,
    sidecarsDirExists: sidecars,
  };
}

async function readLegacyFolders(vaultPath: string | undefined): Promise<string[]> {
  if (!vaultPath) return [];
  try {
    if (!(await exists(vaultPath))) return [];
    const entries = await readDir(vaultPath);
    const out: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      if (isLegacyTopLevelFolder(entry.name)) out.push(entry.name);
    }
    out.sort();
    return out;
  } catch {
    return [];
  }
}

/**
 * Count `.md` files in the library that have a Hypratia identity
 * (`hypratia_id` frontmatter) but live outside the canonical
 * `Hypratia/` subtree. Without identity we'd over-count user notes
 * the backfill won't touch — keep the metric truthful.
 *
 * Returns `null` when no library is configured. Cap at 500 entries
 * scanned so a giant vault doesn't freeze Settings.
 */
async function countLibraryBackfillCandidates(
  libraryRoot: string | undefined,
): Promise<number | null> {
  if (!libraryRoot) return null;
  try {
    if (!(await exists(libraryRoot))) return 0;
    let count = 0;
    let visited = 0;
    const SCAN_CAP = 500;
    await walkMarkdown(libraryRoot, libraryRoot, async (text) => {
      visited += 1;
      const identity = readFrontmatterIdentity(text);
      if (identity?.hypratiaId) count += 1;
      return visited < SCAN_CAP;
    });
    return count;
  } catch {
    return null;
  }
}

async function walkMarkdown(
  dirAbs: string,
  rootAbs: string,
  onFile: (text: string, relPath: string) => Promise<boolean>,
): Promise<boolean> {
  const entries = await readDir(dirAbs);
  for (const entry of entries) {
    const childAbs = await join(dirAbs, entry.name);
    if (entry.isDirectory) {
      // Skip the destination subtree — those files are already canonical.
      const rel = relativeFrom(rootAbs, childAbs);
      if (
        rel.startsWith('Hypratia/') ||
        rel === 'Hypratia' ||
        rel.startsWith('.hypratia/')
      ) {
        continue;
      }
      const keepGoing = await walkMarkdown(childAbs, rootAbs, onFile);
      if (!keepGoing) return false;
      continue;
    }
    if (!entry.isFile) continue;
    if (!/\.(md|markdown)$/i.test(entry.name)) continue;
    let text: string;
    try {
      text = await readTextFile(childAbs);
    } catch {
      continue;
    }
    const rel = relativeFrom(rootAbs, childAbs);
    const keepGoing = await onFile(text, rel);
    if (!keepGoing) return false;
  }
  return true;
}

function relativeFrom(root: string, abs: string): string {
  if (abs.startsWith(root)) {
    return abs.slice(root.length).replace(/^\/+/, '');
  }
  return abs;
}

async function safeExists(p: string): Promise<boolean> {
  try {
    return await exists(p);
  } catch {
    return false;
  }
}
