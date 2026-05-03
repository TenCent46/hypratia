/**
 * One-shot migration from Hypratia's legacy `LLM-*` export tree into the
 * canonical `Hypratia/` layout.
 *
 *   LLM-Conversations/  → Hypratia/Notes/
 *   LLM-Nodes/          → Hypratia/Notes/
 *   LLM-Maps/           → Hypratia/Canvases/
 *   LLM-Daily/          → Hypratia/Daily/
 *   LLM-Attachments/    → Hypratia/Attachments/
 *
 * **Pure planner.** Takes an in-memory snapshot of the vault and emits a
 * `MigrationPlan` describing what should change. The CLI script
 * (`scripts/migrate-legacy-vault.ts`) handles the actual filesystem work,
 * so this module is testable without a real disk.
 *
 * Two non-negotiable rules:
 *
 *   1. **Preserve user frontmatter.** Only `hypratia_*` keys are owned by
 *      Hypratia; everything else (tags, aliases, cssclasses, plugin keys,
 *      created/updated, …) survives verbatim. We delegate the merge to
 *      `mergeMarkdownWithHypratia` from `services/export/frontmatter`.
 *
 *   2. **Idempotency.** Running twice produces the same vault state. A
 *      legacy file with `hypratia_id: abc` whose target already exists
 *      with the same id is re-merged in place; a target with a
 *      *different* id triggers a disambiguated filename and a recorded
 *      conflict — never a silent overwrite.
 */

import { mergeMarkdownWithHypratia } from '../export/frontmatter.ts';
import {
  mergeAliases,
  type FrontmatterIdentity,
} from '../markdown/wikilinks.ts';
import {
  mergeSidecarData,
  serializeSidecar,
  SIDECAR_DIR,
  type HypratiaSidecar,
} from '../sidecar/schema.ts';

// ---------------------------------------------------------------------------
// Folder mapping
// ---------------------------------------------------------------------------

export type LegacyFolder =
  | 'LLM-Conversations'
  | 'LLM-Nodes'
  | 'LLM-Maps'
  | 'LLM-Daily'
  | 'LLM-Attachments';

export const LEGACY_TO_NEW: Record<LegacyFolder, string> = {
  'LLM-Conversations': 'Hypratia/Notes',
  'LLM-Nodes': 'Hypratia/Notes',
  'LLM-Maps': 'Hypratia/Canvases',
  'LLM-Daily': 'Hypratia/Daily',
  'LLM-Attachments': 'Hypratia/Attachments',
};

export const ALL_LEGACY_FOLDERS: LegacyFolder[] = [
  'LLM-Conversations',
  'LLM-Nodes',
  'LLM-Maps',
  'LLM-Daily',
  'LLM-Attachments',
];

/** Legacy → new prefix substitution for paths inside `.canvas` JSON. */
export function rewriteVaultPathPrefix(p: string): string {
  for (const legacy of ALL_LEGACY_FOLDERS) {
    if (p === legacy || p.startsWith(`${legacy}/`)) {
      return p.replace(legacy, LEGACY_TO_NEW[legacy]);
    }
  }
  return p;
}

/**
 * Rewrite every `nodes[].file` path inside a JSON Canvas blob from a
 * legacy folder to the new Hypratia folder. Falls back to the original
 * text on parse failure so a malformed canvas is never destroyed.
 */
export function rewriteCanvasFilePaths(canvasText: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canvasText);
  } catch {
    return canvasText;
  }
  if (!parsed || typeof parsed !== 'object') return canvasText;
  const obj = parsed as { nodes?: unknown[]; edges?: unknown[] };
  let touched = false;
  if (Array.isArray(obj.nodes)) {
    for (const n of obj.nodes) {
      if (!n || typeof n !== 'object') continue;
      const node = n as { type?: string; file?: string };
      if (node.type === 'file' && typeof node.file === 'string') {
        const rewritten = rewriteVaultPathPrefix(node.file);
        if (rewritten !== node.file) {
          node.file = rewritten;
          touched = true;
        }
      }
    }
  }
  return touched ? `${JSON.stringify(parsed, null, 2)}\n` : canvasText;
}

// ---------------------------------------------------------------------------
// Plan / step types
// ---------------------------------------------------------------------------

export type LegacyMdFile = {
  kind: 'md';
  /** Vault-relative source path, e.g. `LLM-Nodes/foo.md`. */
  path: string;
  name: string;
  /** Filename without extension. */
  stem: string;
  text: string;
  identity: FrontmatterIdentity;
};
export type LegacyCanvasFile = {
  kind: 'canvas';
  path: string;
  name: string;
  stem: string;
  text: string;
};
export type LegacyAttachmentFile = {
  kind: 'attachment';
  path: string;
  name: string;
  stem: string;
};

export type LegacyFile = LegacyMdFile | LegacyCanvasFile | LegacyAttachmentFile;

/** A file already living under `Hypratia/` — used for collision detection. */
export type ExistingTarget = {
  /** Vault-relative path under `Hypratia/`. */
  path: string;
  /** Identity for `.md` targets; absent for canvases / attachments. */
  identity?: FrontmatterIdentity;
  /** When known, the existing markdown body so we can `mergeMarkdownWithHypratia`. */
  text?: string;
};

export type SidecarSeed = {
  hypratiaId: string;
  /** Existing sidecar JSON we should merge into, if any. */
  existing?: HypratiaSidecar;
};

export type MigrationInput = {
  /** Absolute path to the user's vault root. Stored on the manifest only. */
  vaultRoot: string;
  legacy: LegacyFile[];
  existingTargets: ExistingTarget[];
  /** Existing sidecars Hypratia owns (loaded by the CLI). */
  existingSidecars: SidecarSeed[];
  /** ISO timestamp captured by the CLI; injected for deterministic tests. */
  generatedAt: string;
};

export type MigrationStep =
  | {
      kind: 'write-md';
      from: string;
      to: string;
      hypratiaId: string;
      mergedMarkdown: string;
    }
  | {
      kind: 'write-canvas';
      from: string;
      to: string;
      rewrittenJson: string;
    }
  | {
      kind: 'copy-attachment';
      from: string;
      to: string;
    }
  | {
      kind: 'write-sidecar';
      hypratiaId: string;
      to: string;
      json: string;
    }
  | {
      kind: 'skip';
      from: string;
      reason: string;
    };

export type MigrationConflict = {
  from: string;
  intendedTo: string;
  resolvedTo?: string;
  reason: 'target-exists-different-id' | 'malformed-source' | 'unknown-folder';
};

export type MigrationPlan = {
  vaultRoot: string;
  generatedAt: string;
  steps: MigrationStep[];
  conflicts: MigrationConflict[];
  summary: {
    md: number;
    canvas: number;
    attachments: number;
    sidecars: number;
    skipped: number;
    conflicts: number;
  };
};

export type MigrationManifest = {
  $schema: 'hypratia.migration.v1';
  vaultRoot: string;
  appliedAt: string;
  moved: { from: string; to: string; hypratiaId?: string }[];
  skipped: { from: string; reason: string }[];
  conflicts: MigrationConflict[];
};

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

/**
 * Turn a snapshot of the vault into a `MigrationPlan`. No side effects —
 * the caller (the CLI) decides whether to print or apply.
 */
export function planMigration(input: MigrationInput): MigrationPlan {
  const targetsByPath = new Map<string, ExistingTarget>();
  for (const t of input.existingTargets) targetsByPath.set(t.path, t);
  const sidecarsById = new Map<string, HypratiaSidecar>();
  for (const s of input.existingSidecars) {
    if (s.existing) sidecarsById.set(s.hypratiaId, s.existing);
  }

  const steps: MigrationStep[] = [];
  const conflicts: MigrationConflict[] = [];
  let mdCount = 0;
  let canvasCount = 0;
  let attachmentCount = 0;
  let sidecarCount = 0;
  let skipped = 0;
  /** Track which target paths we'll have written so two legacy files
   *  destined for the same target disambiguate against each other. */
  const claimedTargets = new Set<string>(targetsByPath.keys());

  for (const file of input.legacy) {
    const folder = legacyFolderOf(file.path);
    if (!folder) {
      conflicts.push({
        from: file.path,
        intendedTo: '',
        reason: 'unknown-folder',
      });
      steps.push({
        kind: 'skip',
        from: file.path,
        reason: 'not under a legacy LLM-* folder',
      });
      skipped += 1;
      continue;
    }
    const intendedTo = `${LEGACY_TO_NEW[folder]}/${file.name}`;

    if (file.kind === 'md') {
      const id = file.identity.hypratiaId ?? file.identity.legacyId ??
        fallbackHypratiaId(file.path);
      const resolved = resolveTargetPath(intendedTo, id, targetsByPath, claimedTargets, file.identity);
      if (resolved.conflict) conflicts.push(resolved.conflict);

      // Merge markdown: keep user keys + bump hypratia_*; merge aliases
      // additively so the title-as-alias trick from the wikilink rewrite
      // still works post-migration.
      const aliases = mergeAliases(
        file.identity.aliases,
        file.identity.title ?? file.stem,
      );
      const targetExisting = targetsByPath.get(resolved.path);
      const mergedMarkdown = mergeMarkdownWithHypratia(
        targetExisting?.text ?? file.text,
        {
          hypratia_id: id,
          hypratia_kind: hypratiaKindFor(folder),
          hypratia_migrated_from: file.path,
          hypratia_migrated_at: input.generatedAt,
        },
        // body taken from the legacy file (Hypratia owns the body for
        // migrated entities — bidirectional editing comes in a later plan).
        bodyForMd(file.text, aliases, file.identity.title ?? file.stem),
      );

      steps.push({
        kind: 'write-md',
        from: file.path,
        to: resolved.path,
        hypratiaId: id,
        mergedMarkdown: applyAliasesToFrontmatter(mergedMarkdown, aliases),
      });
      mdCount += 1;
      claimedTargets.add(resolved.path);

      // Sidecar: carry over selectionMarkers / theme_cluster / embedding_ref
      // when the user already had one; otherwise mint a minimal sidecar
      // recording the migration timestamp.
      const sidecarPath = `${SIDECAR_DIR}/${sanitizeId(id)}.json`;
      const next = mergeSidecarData(sidecarsById.get(id) ?? null, id, {
        last_distilled_at: input.generatedAt,
      });
      // Stamp where the entity used to live so we can audit later.
      (next as Record<string, unknown>).hypratia_migrated_from = file.path;
      (next as Record<string, unknown>).hypratia_migrated_at = input.generatedAt;
      steps.push({
        kind: 'write-sidecar',
        hypratiaId: id,
        to: sidecarPath,
        json: serializeSidecar(next),
      });
      sidecarCount += 1;
      continue;
    }

    if (file.kind === 'canvas') {
      const resolved = resolveTargetPath(intendedTo, undefined, targetsByPath, claimedTargets);
      if (resolved.conflict) conflicts.push(resolved.conflict);
      const rewrittenJson = rewriteCanvasFilePaths(file.text);
      steps.push({
        kind: 'write-canvas',
        from: file.path,
        to: resolved.path,
        rewrittenJson,
      });
      canvasCount += 1;
      claimedTargets.add(resolved.path);
      continue;
    }

    // attachment
    const resolved = resolveTargetPath(intendedTo, undefined, targetsByPath, claimedTargets);
    if (resolved.conflict) conflicts.push(resolved.conflict);
    steps.push({
      kind: 'copy-attachment',
      from: file.path,
      to: resolved.path,
    });
    attachmentCount += 1;
    claimedTargets.add(resolved.path);
  }

  return {
    vaultRoot: input.vaultRoot,
    generatedAt: input.generatedAt,
    steps,
    conflicts,
    summary: {
      md: mdCount,
      canvas: canvasCount,
      attachments: attachmentCount,
      sidecars: sidecarCount,
      skipped,
      conflicts: conflicts.length,
    },
  };
}

/**
 * Build a manifest from an applied plan. The CLI strips `mergedMarkdown`
 * and `rewrittenJson` to keep the manifest compact (those blobs are
 * already on disk under the new paths).
 */
export function buildManifest(
  plan: MigrationPlan,
  appliedAt: string,
): MigrationManifest {
  const moved: MigrationManifest['moved'] = [];
  const skipped: MigrationManifest['skipped'] = [];
  for (const s of plan.steps) {
    if (s.kind === 'skip') {
      skipped.push({ from: s.from, reason: s.reason });
    } else if (s.kind !== 'write-sidecar') {
      moved.push({
        from: s.from,
        to: s.to,
        hypratiaId: s.kind === 'write-md' ? s.hypratiaId : undefined,
      });
    }
  }
  return {
    $schema: 'hypratia.migration.v1',
    vaultRoot: plan.vaultRoot,
    appliedAt,
    moved,
    skipped,
    conflicts: plan.conflicts,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function legacyFolderOf(p: string): LegacyFolder | null {
  for (const folder of ALL_LEGACY_FOLDERS) {
    if (p.startsWith(`${folder}/`)) return folder;
  }
  return null;
}

function hypratiaKindFor(folder: LegacyFolder): string {
  switch (folder) {
    case 'LLM-Nodes':
      return 'note';
    case 'LLM-Conversations':
      return 'conversation';
    case 'LLM-Daily':
      return 'daily';
    case 'LLM-Maps':
      return 'canvas';
    case 'LLM-Attachments':
      return 'attachment';
  }
}

function resolveTargetPath(
  intendedTo: string,
  hypratiaId: string | undefined,
  targets: ReadonlyMap<string, ExistingTarget>,
  claimed: ReadonlySet<string>,
  identity?: FrontmatterIdentity,
): { path: string; conflict?: MigrationConflict } {
  const existing = targets.get(intendedTo);
  if (!existing && !claimed.has(intendedTo)) {
    return { path: intendedTo };
  }
  // Same Hypratia owner → idempotent: keep the same path. The frontmatter
  // merge will handle the actual content.
  if (
    hypratiaId &&
    existing?.identity &&
    (existing.identity.hypratiaId === hypratiaId ||
      existing.identity.legacyId === hypratiaId)
  ) {
    return { path: intendedTo };
  }
  // A claimed target without a stored identity is one we just emitted in
  // this same run — still safe to reuse if it's the same id.
  if (hypratiaId && claimed.has(intendedTo) && !existing) {
    // We can't tell here whether the prior step matched; bias toward
    // disambiguation so the second file lands separately.
  }
  // Otherwise: disambiguate. Suffix the filename with a short id-derived
  // hash so re-runs reach the same disambiguated target.
  const suffix = (hypratiaId ?? 'mig').slice(0, 6);
  const dot = intendedTo.lastIndexOf('.');
  const base = dot === -1 ? intendedTo : intendedTo.slice(0, dot);
  const ext = dot === -1 ? '' : intendedTo.slice(dot);
  const resolvedTo = `${base}-${suffix}${ext}`;
  void identity;
  return {
    path: resolvedTo,
    conflict: {
      from: '',
      intendedTo,
      resolvedTo,
      reason: 'target-exists-different-id',
    },
  };
}

function bodyForMd(text: string, _aliases: string[], _title: string): string {
  // gray-matter (used by `mergeMarkdownWithHypratia`) treats anything before
  // the first `---` as body if frontmatter is malformed. Strip a leading
  // frontmatter block from the legacy text so the merger sees the real body.
  const m = text.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
  if (m) return text.slice(m[0].length);
  return text;
}

/**
 * `mergeMarkdownWithHypratia` only updates `hypratia_*` keys (by design).
 * The migration also wants to surface the title as an Obsidian alias so
 * `[[Title]]` resolves in Obsidian; we splice the merged `aliases:` line
 * in here as a deliberate exception, additively.
 */
function applyAliasesToFrontmatter(
  markdown: string,
  aliases: string[],
): string {
  if (aliases.length === 0) return markdown;
  const fmMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!fmMatch) return markdown;
  const fmBody = fmMatch[1];
  const aliasLineRe = /^aliases:\s.*$/m;
  const merged = [...new Set(aliases.map((a) => a.trim()).filter(Boolean))];
  const aliasLine = `aliases: [${merged.map(yamlInlineString).join(', ')}]`;
  const nextFmBody = aliasLineRe.test(fmBody)
    ? fmBody.replace(aliasLineRe, aliasLine)
    : `${fmBody}\n${aliasLine}`;
  return markdown.replace(
    /^---\s*\n[\s\S]*?\n---\s*\n?/,
    `---\n${nextFmBody}\n---\n`,
  );
}

function yamlInlineString(s: string): string {
  if (/^[A-Za-z0-9_/:-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

function sanitizeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * Stable hypratia_id for a legacy file that has no frontmatter id at all.
 * Deterministic so re-runs land the same id; not cryptographic.
 */
export function fallbackHypratiaId(legacyPath: string): string {
  let h = 5381;
  for (let i = 0; i < legacyPath.length; i += 1) {
    h = ((h << 5) + h + legacyPath.charCodeAt(i)) | 0;
  }
  return `migrated_${(h >>> 0).toString(36)}`;
}
