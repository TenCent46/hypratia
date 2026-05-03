/**
 * One-shot CLI that migrates a Hypratia vault from the legacy `LLM-*`
 * folder layout into the canonical `Hypratia/` layout. Pure planner lives
 * in `src/services/migration/legacyVaultMigration.ts`; this script does
 * the actual filesystem work using Node's `fs` so it runs under
 * `node --experimental-strip-types`.
 *
 * Usage (idempotent — safe to re-run):
 *
 *   pnpm migrate:legacy-vault -- --vault /path/to/vault --dry-run
 *   pnpm migrate:legacy-vault -- --vault /path/to/vault --apply
 *   pnpm migrate:legacy-vault -- --vault /path/to/vault --apply --archive-old
 *
 * The migration *never* deletes legacy folders by default. With
 * `--archive-old` they are renamed into
 * `Hypratia/.hypratia/backups/legacy-llm-folders-<timestamp>/` so a
 * subsequent run starts from a clean state.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import {
  ALL_LEGACY_FOLDERS,
  buildManifest,
  planMigration,
  type LegacyFile,
  type MigrationInput,
  type MigrationPlan,
  type ExistingTarget,
  type SidecarSeed,
} from '../src/services/migration/legacyVaultMigration.ts';
import { readFrontmatterIdentity } from '../src/services/markdown/wikilinks.ts';
import { parseSidecar } from '../src/services/sidecar/schema.ts';

export type RunOptions = {
  vaultRoot: string;
  dryRun?: boolean;
  apply?: boolean;
  archiveOld?: boolean;
  /** Override the timestamp the planner records (used by tests). */
  now?: string;
  /** Suppress console output (used by tests). */
  silent?: boolean;
};

export type RunResult = {
  plan: MigrationPlan;
  applied: boolean;
  archived?: string;
  manifestPath?: string;
};

export async function runMigration(opts: RunOptions): Promise<RunResult> {
  const vault = path.resolve(opts.vaultRoot);
  if (!existsSync(vault) || !statSync(vault).isDirectory()) {
    throw new Error(`vault not found: ${vault}`);
  }
  const generatedAt = opts.now ?? new Date().toISOString();
  const log = (msg: string) => {
    if (!opts.silent) console.log(msg);
  };

  // 1. Read the legacy snapshot.
  const legacy: LegacyFile[] = [];
  for (const folder of ALL_LEGACY_FOLDERS) {
    const abs = path.join(vault, folder);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
    walkDir(abs, vault, (relPath, name, ext) => {
      const stem = name.replace(/\.[^.]+$/, '');
      if (folder === 'LLM-Attachments' || ext === '') {
        legacy.push({ kind: 'attachment', path: relPath, name, stem });
        return;
      }
      if (ext === '.md' || ext === '.markdown') {
        const text = readFileSync(path.join(vault, relPath), 'utf8');
        const identity = readFrontmatterIdentity(text);
        legacy.push({ kind: 'md', path: relPath, name, stem, text, identity });
        return;
      }
      if (ext === '.canvas') {
        const text = readFileSync(path.join(vault, relPath), 'utf8');
        legacy.push({ kind: 'canvas', path: relPath, name, stem, text });
        return;
      }
      legacy.push({ kind: 'attachment', path: relPath, name, stem });
    });
  }

  // 2. Read existing Hypratia/ targets (so collisions are detected).
  const existingTargets: ExistingTarget[] = [];
  const hypratiaRoot = path.join(vault, 'Hypratia');
  if (existsSync(hypratiaRoot)) {
    for (const sub of ['Notes', 'Canvases', 'Daily', 'Attachments']) {
      const subAbs = path.join(hypratiaRoot, sub);
      if (!existsSync(subAbs)) continue;
      walkDir(subAbs, vault, (relPath, name, ext) => {
        if (ext === '.md' || ext === '.markdown') {
          const text = readFileSync(path.join(vault, relPath), 'utf8');
          existingTargets.push({
            path: relPath,
            identity: readFrontmatterIdentity(text),
            text,
          });
        } else {
          existingTargets.push({ path: relPath });
        }
      });
    }
  }

  // 3. Read existing sidecars so we don't overwrite distilled data.
  const existingSidecars: SidecarSeed[] = [];
  const sidecarDir = path.join(hypratiaRoot, '.hypratia/sidecars');
  if (existsSync(sidecarDir)) {
    for (const entry of readdirSync(sidecarDir)) {
      if (!entry.endsWith('.json')) continue;
      const id = entry.replace(/\.json$/, '');
      try {
        const text = readFileSync(path.join(sidecarDir, entry), 'utf8');
        const parsed = parseSidecar(text, id);
        if (parsed) existingSidecars.push({ hypratiaId: parsed.hypratia_id, existing: parsed });
      } catch {
        /* corrupted sidecar — skip; the planner will mint a fresh one */
      }
    }
  }

  // 4. Plan.
  const input: MigrationInput = {
    vaultRoot: vault,
    legacy,
    existingTargets,
    existingSidecars,
    generatedAt,
  };
  const plan = planMigration(input);

  log(formatPlanSummary(plan, legacy.length));

  // 5. Apply (if asked).
  if (!opts.apply || opts.dryRun) {
    return { plan, applied: false };
  }

  for (const step of plan.steps) {
    if (step.kind === 'skip') continue;
    const dest = path.join(vault, step.kind === 'write-sidecar' ? step.to : step.to);
    mkdirSync(path.dirname(dest), { recursive: true });
    if (step.kind === 'write-md') {
      writeFileSync(dest, step.mergedMarkdown, 'utf8');
    } else if (step.kind === 'write-canvas') {
      writeFileSync(dest, step.rewrittenJson, 'utf8');
    } else if (step.kind === 'copy-attachment') {
      copyFileSync(path.join(vault, step.from), dest);
    } else if (step.kind === 'write-sidecar') {
      writeFileSync(dest, step.json, 'utf8');
    }
  }

  // 6. Manifest.
  const manifest = buildManifest(plan, generatedAt);
  const manifestDir = path.join(hypratiaRoot, '.hypratia/migrations');
  mkdirSync(manifestDir, { recursive: true });
  const manifestSlug = `legacy-folder-migration-${generatedAt.replace(/[:.]/g, '-')}.json`;
  const manifestPath = path.join(manifestDir, manifestSlug);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  log(`✓ wrote manifest ${path.relative(vault, manifestPath)}`);

  // 7. Optional archive.
  let archived: string | undefined;
  if (opts.archiveOld) {
    const stamp = generatedAt.replace(/[:.]/g, '-');
    const dest = path.join(hypratiaRoot, `.hypratia/backups/legacy-llm-folders-${stamp}`);
    mkdirSync(dest, { recursive: true });
    for (const folder of ALL_LEGACY_FOLDERS) {
      const src = path.join(vault, folder);
      if (existsSync(src)) {
        renameSync(src, path.join(dest, folder));
      }
    }
    archived = path.relative(vault, dest);
    log(`✓ archived legacy folders to ${archived}`);
  }

  return { plan, applied: true, archived, manifestPath };
}

function walkDir(
  dirAbs: string,
  vaultRoot: string,
  onFile: (vaultRelPath: string, name: string, ext: string) => void,
): void {
  for (const entry of readdirSync(dirAbs)) {
    const abs = path.join(dirAbs, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walkDir(abs, vaultRoot, onFile);
    } else if (st.isFile()) {
      const rel = path.relative(vaultRoot, abs);
      const ext = path.extname(entry).toLowerCase();
      onFile(rel, entry, ext);
    }
  }
}

function formatPlanSummary(plan: MigrationPlan, sourceCount: number): string {
  const lines: string[] = [];
  lines.push(`Hypratia legacy-vault migration plan`);
  lines.push(`  vault:        ${plan.vaultRoot}`);
  lines.push(`  scanned:      ${sourceCount} legacy file(s)`);
  lines.push(
    `  will write:   ${plan.summary.md} markdown · ${plan.summary.canvas} canvas · ${plan.summary.attachments} attachment · ${plan.summary.sidecars} sidecar`,
  );
  lines.push(`  conflicts:    ${plan.summary.conflicts}`);
  lines.push(`  skipped:      ${plan.summary.skipped}`);
  if (plan.conflicts.length > 0) {
    lines.push('');
    lines.push('  conflicts (resolved with disambiguated paths):');
    for (const c of plan.conflicts.slice(0, 10)) {
      lines.push(`    ${c.from} → ${c.intendedTo}  →→  ${c.resolvedTo ?? '(skipped)'}  (${c.reason})`);
    }
    if (plan.conflicts.length > 10) {
      lines.push(`    … and ${plan.conflicts.length - 10} more`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): RunOptions & { showHelp?: boolean } {
  const out: RunOptions & { showHelp?: boolean } = { vaultRoot: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--vault') {
      out.vaultRoot = argv[++i] ?? '';
    } else if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--apply') {
      out.apply = true;
    } else if (a === '--archive-old') {
      out.archiveOld = true;
    } else if (a === '--help' || a === '-h') {
      out.showHelp = true;
    }
  }
  return out;
}

const isDirect =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('migrate-legacy-vault.ts');

if (isDirect) {
  const args = parseArgs(process.argv);
  if (args.showHelp || !args.vaultRoot) {
    console.log(
      [
        'Usage:',
        '  pnpm migrate:legacy-vault -- --vault <path> --dry-run',
        '  pnpm migrate:legacy-vault -- --vault <path> --apply [--archive-old]',
      ].join('\n'),
    );
    process.exit(args.showHelp ? 0 : 1);
  }
  if (!args.dryRun && !args.apply) {
    args.dryRun = true;
  }
  runMigration(args).catch((err: unknown) => {
    console.error('migration failed:', err);
    process.exit(1);
  });
}
