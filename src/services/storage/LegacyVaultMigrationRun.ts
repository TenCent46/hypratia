/**
 * Tauri-side runner for the legacy-vault migration. Mirrors the Node CLI in
 * `scripts/migrate-legacy-vault.ts` but uses `@tauri-apps/plugin-fs` so it
 * can be invoked from inside the running app (Settings → Migrate legacy
 * folders). Lives in `services/storage/` so the `@tauri-apps/*` import
 * allowlist accepts the dependency.
 *
 * The pure planner from `services/migration/legacyVaultMigration.ts` is
 * unchanged — this module just supplies a different filesystem adapter.
 */

import {
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  rename,
  stat,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import {
  ALL_LEGACY_FOLDERS,
  buildManifest,
  planMigration,
  type LegacyFile,
  type MigrationInput,
  type MigrationPlan,
  type ExistingTarget,
  type SidecarSeed,
} from '../migration/legacyVaultMigration';
import { readFrontmatterIdentity } from '../markdown/wikilinks';
import { parseSidecar } from '../sidecar/schema';

export type InAppMigrationOptions = {
  vaultPath: string;
  apply: boolean;
  archiveOld?: boolean;
};

export type InAppMigrationResult = {
  plan: MigrationPlan;
  applied: boolean;
  archivedTo?: string;
  manifestPath?: string;
};

/**
 * Plan + (optionally) apply the legacy → Hypratia migration. Always
 * returns the plan so the UI can summarize what would change in dry-run.
 */
export async function runLegacyVaultMigration(
  opts: InAppMigrationOptions,
): Promise<InAppMigrationResult> {
  const { vaultPath, apply, archiveOld } = opts;
  const generatedAt = new Date().toISOString();

  const legacy = await readLegacy(vaultPath);
  const existingTargets = await readExistingTargets(vaultPath);
  const existingSidecars = await readExistingSidecars(vaultPath);

  const input: MigrationInput = {
    vaultRoot: vaultPath,
    legacy,
    existingTargets,
    existingSidecars,
    generatedAt,
  };
  const plan = planMigration(input);

  if (!apply) return { plan, applied: false };

  for (const step of plan.steps) {
    if (step.kind === 'skip') continue;
    const dest = await join(vaultPath, step.to);
    await ensureParentDir(dest);
    if (step.kind === 'write-md') {
      await writeTextFile(dest, step.mergedMarkdown);
    } else if (step.kind === 'write-canvas') {
      await writeTextFile(dest, step.rewrittenJson);
    } else if (step.kind === 'copy-attachment') {
      const src = await join(vaultPath, step.from);
      await copyFile(src, dest);
    } else if (step.kind === 'write-sidecar') {
      await writeTextFile(dest, step.json);
    }
  }

  // Manifest.
  const manifest = buildManifest(plan, generatedAt);
  const slug = `legacy-folder-migration-${generatedAt.replace(/[:.]/g, '-')}.json`;
  const manifestPath = await join(
    vaultPath,
    'Hypratia',
    '.hypratia',
    'migrations',
    slug,
  );
  await ensureParentDir(manifestPath);
  await writeTextFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  let archivedTo: string | undefined;
  if (archiveOld) {
    const stamp = generatedAt.replace(/[:.]/g, '-');
    const dest = await join(
      vaultPath,
      'Hypratia',
      '.hypratia',
      'backups',
      `legacy-llm-folders-${stamp}`,
    );
    await ensureDir(dest);
    for (const folder of ALL_LEGACY_FOLDERS) {
      const src = await join(vaultPath, folder);
      if (await exists(src)) {
        await rename(src, await join(dest, folder));
      }
    }
    archivedTo = `Hypratia/.hypratia/backups/legacy-llm-folders-${stamp}`;
  }

  return { plan, applied: true, manifestPath, archivedTo };
}

// ---- internal: filesystem readers ----------------------------------------

async function readLegacy(vaultPath: string): Promise<LegacyFile[]> {
  const out: LegacyFile[] = [];
  for (const folder of ALL_LEGACY_FOLDERS) {
    const folderAbs = await join(vaultPath, folder);
    if (!(await exists(folderAbs))) continue;
    await walk(folderAbs, vaultPath, async (relPath, name, ext) => {
      const stem = name.replace(/\.[^.]+$/, '');
      if (folder === 'LLM-Attachments' || ext === '') {
        out.push({ kind: 'attachment', path: relPath, name, stem });
        return;
      }
      if (ext === '.md' || ext === '.markdown') {
        const text = await readTextFile(await join(vaultPath, relPath));
        const identity = readFrontmatterIdentity(text);
        out.push({ kind: 'md', path: relPath, name, stem, text, identity });
        return;
      }
      if (ext === '.canvas') {
        const text = await readTextFile(await join(vaultPath, relPath));
        out.push({ kind: 'canvas', path: relPath, name, stem, text });
        return;
      }
      out.push({ kind: 'attachment', path: relPath, name, stem });
    });
  }
  return out;
}

async function readExistingTargets(
  vaultPath: string,
): Promise<ExistingTarget[]> {
  const out: ExistingTarget[] = [];
  const hypratiaRoot = await join(vaultPath, 'Hypratia');
  if (!(await exists(hypratiaRoot))) return out;
  for (const sub of ['Notes', 'Canvases', 'Daily', 'Attachments']) {
    const subAbs = await join(hypratiaRoot, sub);
    if (!(await exists(subAbs))) continue;
    await walk(subAbs, vaultPath, async (relPath, _name, ext) => {
      if (ext === '.md' || ext === '.markdown') {
        const text = await readTextFile(await join(vaultPath, relPath));
        out.push({
          path: relPath,
          identity: readFrontmatterIdentity(text),
          text,
        });
      } else {
        out.push({ path: relPath });
      }
    });
  }
  return out;
}

async function readExistingSidecars(
  vaultPath: string,
): Promise<SidecarSeed[]> {
  const out: SidecarSeed[] = [];
  const sidecarDir = await join(vaultPath, 'Hypratia', '.hypratia', 'sidecars');
  if (!(await exists(sidecarDir))) return out;
  const entries = await readDir(sidecarDir);
  for (const entry of entries) {
    if (!entry.isFile || !entry.name.endsWith('.json')) continue;
    const id = entry.name.replace(/\.json$/, '');
    try {
      const text = await readTextFile(await join(sidecarDir, entry.name));
      const parsed = parseSidecar(text, id);
      if (parsed) out.push({ hypratiaId: parsed.hypratia_id, existing: parsed });
    } catch {
      /* unreadable — skip; planner will mint a fresh one */
    }
  }
  return out;
}

async function walk(
  dirAbs: string,
  vaultRoot: string,
  onFile: (vaultRelPath: string, name: string, ext: string) => Promise<void>,
): Promise<void> {
  const entries = await readDir(dirAbs);
  for (const entry of entries) {
    const childAbs = await join(dirAbs, entry.name);
    if (entry.isDirectory) {
      await walk(childAbs, vaultRoot, onFile);
      continue;
    }
    if (entry.isFile) {
      // Compute vault-relative by stripping the vaultRoot prefix.
      const relPath = relativeFrom(vaultRoot, childAbs);
      const ext = extOf(entry.name);
      await onFile(relPath, entry.name, ext);
    }
  }
  // Avoid an "unused" lint on `stat` while keeping the shape stable for
  // future "skip very large files" thresholds.
  void stat;
}

function relativeFrom(root: string, abs: string): string {
  // Both paths are absolute. Tauri returns POSIX-style paths on macOS;
  // strip the `${root}/` prefix and normalize.
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
