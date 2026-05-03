/**
 * Tauri-side runner for the library-markdown backfill. Walks
 * `<libraryRoot>/**\/*.md` (excluding the destination subtree),
 * builds a `BackfillPlan` from the pure planner, optionally applies it,
 * and writes a manifest.
 *
 * Lives in `services/storage/` so the `@tauri-apps/*` import is in the
 * architectural allowlist.
 */

import {
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { useStore } from '../../store';
import { readFrontmatterIdentity } from '../markdown/wikilinks';
import { parseSidecar } from '../sidecar/schema';
import {
  buildBackfillManifest,
  planLibraryMdBackfill,
  type BackfillInput,
  type BackfillPlan,
  type ExistingTarget,
  type LibraryMdFile,
  type SidecarSeed,
  type StoreNodeRef,
} from '../migration/libraryMarkdownBackfill';

export type RunBackfillOptions = {
  libraryRoot: string;
  vaultRoot: string;
  apply: boolean;
  archiveOriginals?: boolean;
};

export type RunBackfillResult = {
  plan: BackfillPlan;
  applied: boolean;
  archivedTo?: string;
  manifestPath?: string;
};

const HYPRATIA_DIR = 'Hypratia';
const NOTES_DIR = `${HYPRATIA_DIR}/Notes`;
const SIDECARS_DIR = `${HYPRATIA_DIR}/.hypratia/sidecars`;
const MIGRATIONS_DIR = `${HYPRATIA_DIR}/.hypratia/migrations`;
const BACKUPS_DIR = `${HYPRATIA_DIR}/.hypratia/backups`;

export async function runLibraryMdBackfill(
  opts: RunBackfillOptions,
): Promise<RunBackfillResult> {
  const { libraryRoot, vaultRoot, apply, archiveOriginals } = opts;
  if (!libraryRoot || !vaultRoot) {
    throw new Error('libraryRoot and vaultRoot are required');
  }
  const generatedAt = new Date().toISOString();

  const files = await readLibraryFiles(libraryRoot);
  const existingTargets = await readExistingNoteTargets(vaultRoot);
  const existingSidecars = await readExistingSidecars(vaultRoot);
  const storeNodes: StoreNodeRef[] = useStore
    .getState()
    .nodes.map((n) => ({
      id: n.id,
      conversationId: n.conversationId,
      title: n.title,
      mdPath: n.mdPath,
      contentMarkdown: n.contentMarkdown,
    }));

  const input: BackfillInput = {
    libraryRoot,
    vaultRoot,
    files,
    storeNodes,
    existingTargets,
    existingSidecars,
    generatedAt,
  };
  const plan = planLibraryMdBackfill(input);

  if (!apply) return { plan, applied: false };

  // Apply file writes.
  for (const step of plan.steps) {
    if (step.kind === 'write-md') {
      const dest = await join(vaultRoot, step.to);
      await ensureParentDir(dest);
      await writeTextFile(dest, step.mergedMarkdown);
    } else if (step.kind === 'write-sidecar') {
      const dest = await join(vaultRoot, step.to);
      await ensureParentDir(dest);
      await writeTextFile(dest, step.json);
    } else if (step.kind === 'update-node-mdpath') {
      // Update store; this also persists via the regular store
      // subscriber in `persistence.ts`.
      useStore.getState().updateNode(step.nodeId, { mdPath: step.to });
    }
    // 'skip' steps are informational only — nothing to apply.
  }

  // Archive sources (optional). Performed AFTER successful writes so a
  // failed write never strands the user without their original files.
  const archived: { from: string; to: string }[] = [];
  let archivedTo: string | undefined;
  if (archiveOriginals) {
    const stamp = generatedAt.replace(/[:.]/g, '-');
    const archiveDir = `${BACKUPS_DIR}/library-md-backfill-${stamp}`;
    archivedTo = archiveDir;
    for (const step of plan.steps) {
      if (step.kind !== 'write-md') continue;
      const src = await join(libraryRoot, step.from);
      const destRel = `${archiveDir}/${step.from}`;
      const destAbs = await join(vaultRoot, destRel);
      try {
        if (await exists(src)) {
          await ensureParentDir(destAbs);
          await copyFile(src, destAbs);
          await remove(src);
          archived.push({ from: step.from, to: destRel });
        }
      } catch (err) {
        console.warn('[library-backfill] archive failed', step.from, err);
      }
    }
  }

  // Manifest.
  const manifest = buildBackfillManifest(plan, generatedAt, archived);
  const slug = `library-md-backfill-${generatedAt.replace(/[:.]/g, '-')}.json`;
  const manifestPath = await join(vaultRoot, MIGRATIONS_DIR, slug);
  await ensureParentDir(manifestPath);
  await writeTextFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return { plan, applied: true, archivedTo, manifestPath };
}

// ---- internal: filesystem readers ----------------------------------------

async function readLibraryFiles(libraryRoot: string): Promise<LibraryMdFile[]> {
  const out: LibraryMdFile[] = [];
  if (!(await exists(libraryRoot))) return out;
  await walk(libraryRoot, libraryRoot, async (relPath, name, ext) => {
    if (ext !== '.md' && ext !== '.markdown') return;
    // Don't suck the destination tree back in if libraryRoot === vaultRoot.
    // The planner also skips these, but stopping the read avoids opening
    // every file unnecessarily.
    if (
      relPath.startsWith(`${HYPRATIA_DIR}/`) ||
      relPath.startsWith('.hypratia/')
    ) {
      return;
    }
    let text: string;
    try {
      text = await readTextFile(await join(libraryRoot, relPath));
    } catch {
      return;
    }
    out.push({
      relPath,
      name,
      stem: name.replace(/\.[^.]+$/, ''),
      text,
      identity: readFrontmatterIdentity(text),
    });
  });
  return out;
}

async function readExistingNoteTargets(
  vaultRoot: string,
): Promise<ExistingTarget[]> {
  const out: ExistingTarget[] = [];
  const dir = await join(vaultRoot, NOTES_DIR);
  if (!(await exists(dir))) return out;
  await walk(dir, vaultRoot, async (relPath, _name, ext) => {
    if (ext !== '.md' && ext !== '.markdown') return;
    let text: string;
    try {
      text = await readTextFile(await join(vaultRoot, relPath));
    } catch {
      return;
    }
    out.push({
      path: relPath,
      identity: readFrontmatterIdentity(text),
      text,
    });
  });
  return out;
}

async function readExistingSidecars(
  vaultRoot: string,
): Promise<SidecarSeed[]> {
  const out: SidecarSeed[] = [];
  const dir = await join(vaultRoot, SIDECARS_DIR);
  if (!(await exists(dir))) return out;
  const entries = await readDir(dir);
  for (const entry of entries) {
    if (!entry.isFile || !entry.name.endsWith('.json')) continue;
    const id = entry.name.replace(/\.json$/, '');
    try {
      const text = await readTextFile(await join(dir, entry.name));
      const parsed = parseSidecar(text, id);
      if (parsed) out.push({ hypratiaId: parsed.hypratia_id, existing: parsed });
    } catch {
      /* corrupt sidecar — planner will mint a fresh one */
    }
  }
  return out;
}

async function walk(
  dirAbs: string,
  vaultRoot: string,
  onFile: (relPath: string, name: string, ext: string) => Promise<void>,
): Promise<void> {
  const entries = await readDir(dirAbs);
  for (const entry of entries) {
    const childAbs = await join(dirAbs, entry.name);
    if (entry.isDirectory) {
      await walk(childAbs, vaultRoot, onFile);
      continue;
    }
    if (!entry.isFile) continue;
    const rel = relativeFrom(vaultRoot, childAbs);
    const ext = extOf(entry.name);
    await onFile(rel, entry.name, ext);
  }
}

function relativeFrom(root: string, abs: string): string {
  if (abs.startsWith(root)) {
    return abs.slice(root.length).replace(/^\/+/, '');
  }
  return abs;
}

function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx).toLowerCase();
}

async function ensureDir(p: string): Promise<void> {
  if (!(await exists(p))) await mkdir(p, { recursive: true });
}

async function ensureParentDir(absFile: string): Promise<void> {
  const idx = absFile.lastIndexOf('/');
  if (idx <= 0) return;
  await ensureDir(absFile.slice(0, idx));
}
