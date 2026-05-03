/**
 * One-shot backfill: copy existing Library `.md` files into the canonical
 * `Hypratia/Notes/` layout, mint sidecars, and (when a matching node
 * exists in the Zustand store) update its `mdPath` so future writes flow
 * through the new path.
 *
 * Distinct from `legacyVaultMigration`:
 *   - That tool moves vault-rooted `LLM-*` folders.
 *   - This tool moves *Library-rooted* markdown (the live storage from
 *     pre-1.2 Hypratia, typically under `<appData>/LLM-Conversations/`)
 *     and rewires the in-app store to point at the new vault paths.
 *
 * **Pure planner.** Takes an in-memory snapshot of the source library +
 * the destination vault + the Zustand store, returns a `BackfillPlan`.
 * The Tauri runner (`LibraryMarkdownBackfillRun.ts`) does the actual
 * filesystem work + manifest write + archive.
 *
 * Two non-negotiable rules:
 *
 *   1. **Preserve user frontmatter.** Only `hypratia_*` keys are owned
 *      by Hypratia; everything else (tags, aliases, cssclasses, plugin
 *      keys, created/updated, …) survives via `mergeMarkdownWithHypratia`.
 *      Aliases are merged additively so the title-as-alias is added
 *      *without* dropping any user-set aliases on either side.
 *
 *   2. **Idempotency.** Running twice produces the same plan. The
 *      planner consults the existing target file (via `existingTargets`)
 *      so a re-run merges in place rather than creating a `-suffix`
 *      duplicate.
 */

import {
  applyAliasesToFrontmatter,
  mergeMarkdownWithHypratia,
} from '../export/frontmatter.ts';
import type { FrontmatterIdentity } from '../markdown/wikilinks.ts';
import { mergeAliases } from '../markdown/wikilinks.ts';
import {
  mergeSidecarData,
  serializeSidecar,
  SIDECAR_DIR,
  type HypratiaSidecar,
} from '../sidecar/schema.ts';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A markdown file scanned from the source library. */
export type LibraryMdFile = {
  /** Path relative to `libraryRoot`, e.g. `default/canvas/foo.md`. */
  relPath: string;
  /** Filename only (`foo.md`). */
  name: string;
  /** Filename without extension. */
  stem: string;
  /** Raw markdown text including frontmatter. */
  text: string;
  /** Parsed frontmatter (caller hands this in via `readFrontmatterIdentity`). */
  identity: FrontmatterIdentity;
};

/** Reference to a Hypratia node in the Zustand store. */
export type StoreNodeRef = {
  id: string;
  conversationId: string;
  title: string;
  mdPath?: string;
  contentMarkdown?: string;
};

/** A file already living under `Hypratia/Notes/` — for collision detection. */
export type ExistingTarget = {
  /** Vault-relative path. */
  path: string;
  identity: FrontmatterIdentity;
  text: string;
};

export type SidecarSeed = {
  hypratiaId: string;
  existing?: HypratiaSidecar;
};

export type BackfillInput = {
  /** Absolute path of the source library (for the manifest). */
  libraryRoot: string;
  /** Absolute path of the destination vault (for the manifest). */
  vaultRoot: string;
  files: LibraryMdFile[];
  storeNodes: StoreNodeRef[];
  existingTargets: ExistingTarget[];
  existingSidecars: SidecarSeed[];
  /** ISO timestamp the runner injects so dry-run + apply share an id. */
  generatedAt: string;
};

export type BackfillStep =
  | {
      kind: 'write-md';
      from: string;
      to: string;
      hypratiaId: string;
      mergedMarkdown: string;
    }
  | {
      kind: 'write-sidecar';
      hypratiaId: string;
      to: string;
      json: string;
    }
  | {
      kind: 'update-node-mdpath';
      nodeId: string;
      from: string | undefined;
      to: string;
    }
  | {
      kind: 'skip';
      from: string;
      reason: string;
    };

export type BackfillConflict = {
  from: string;
  intendedTo: string;
  resolvedTo?: string;
  reason: 'target-exists-different-id' | 'multiple-store-matches';
};

export type BackfillPlan = {
  libraryRoot: string;
  vaultRoot: string;
  generatedAt: string;
  steps: BackfillStep[];
  conflicts: BackfillConflict[];
  summary: {
    md: number;
    sidecars: number;
    nodeUpdates: number;
    skipped: number;
    conflicts: number;
  };
};

export type BackfillManifest = {
  $schema: 'hypratia.library-md-backfill.v1';
  libraryRoot: string;
  vaultRoot: string;
  appliedAt: string;
  moved: { from: string; to: string; hypratiaId: string }[];
  nodeUpdates: { nodeId: string; from: string | undefined; to: string }[];
  archived: { from: string; to: string }[];
  skipped: { from: string; reason: string }[];
  conflicts: BackfillConflict[];
};

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

const HYPRATIA_NOTES_DIR = 'Hypratia/Notes';

export function planLibraryMdBackfill(input: BackfillInput): BackfillPlan {
  const targetByPath = new Map<string, ExistingTarget>();
  for (const t of input.existingTargets) targetByPath.set(t.path, t);
  const sidecarsById = new Map<string, HypratiaSidecar>();
  for (const s of input.existingSidecars) {
    if (s.existing) sidecarsById.set(s.hypratiaId, s.existing);
  }
  const nodesByMdPath = new Map<string, StoreNodeRef[]>();
  for (const n of input.storeNodes) {
    if (!n.mdPath) continue;
    if (!nodesByMdPath.has(n.mdPath)) nodesByMdPath.set(n.mdPath, []);
    nodesByMdPath.get(n.mdPath)!.push(n);
  }

  const steps: BackfillStep[] = [];
  const conflicts: BackfillConflict[] = [];
  let md = 0;
  let sidecars = 0;
  let nodeUpdates = 0;
  let skipped = 0;
  // Track filenames we've claimed in this pass so two source files heading
  // for the same destination disambiguate against each other.
  const claimedTargets = new Set<string>(targetByPath.keys());

  for (const file of input.files) {
    // Files already inside the canonical layout don't need backfilling —
    // emit a `skip` step so the manifest records the visit and move on.
    if (
      file.relPath.startsWith(`${HYPRATIA_NOTES_DIR}/`) ||
      file.relPath === HYPRATIA_NOTES_DIR
    ) {
      steps.push({
        kind: 'skip',
        from: file.relPath,
        reason: 'already in canonical Hypratia/Notes/ layout',
      });
      skipped += 1;
      continue;
    }

    // ----- 1. Resolve hypratia_id -------------------------------------
    const matched = nodesByMdPath.get(file.relPath) ?? [];
    let storeMatch: StoreNodeRef | undefined;
    if (matched.length === 1) {
      storeMatch = matched[0];
    } else if (matched.length > 1) {
      // Multiple nodes claim the same mdPath — recoverable but worth
      // surfacing. Pick the first; record a conflict for the manifest.
      storeMatch = matched[0];
      conflicts.push({
        from: file.relPath,
        intendedTo: '',
        reason: 'multiple-store-matches',
      });
    }
    const hypratiaId =
      file.identity.hypratiaId ??
      storeMatch?.id ??
      file.identity.legacyId ??
      fallbackBackfillId(input.libraryRoot, file.relPath);

    // ----- 2. Compute target path -------------------------------------
    const titleForSlug =
      file.identity.title ??
      storeMatch?.title ??
      file.stem;
    const baseSlug = sanitizeFilenameStem(titleForSlug || file.stem);
    const intendedTo = `${HYPRATIA_NOTES_DIR}/${baseSlug}.md`;
    const resolved = resolveTargetPath(
      intendedTo,
      hypratiaId,
      targetByPath,
      claimedTargets,
    );
    if (resolved.conflict) {
      conflicts.push({ ...resolved.conflict, from: file.relPath });
    }
    const targetPath = resolved.path;
    claimedTargets.add(targetPath);

    // ----- 3. Build merged markdown -----------------------------------
    const existingTarget = targetByPath.get(targetPath);
    const existingTargetText = existingTarget?.text ?? '';
    const targetIdentity = existingTarget?.identity ?? {};
    const titleAlias = (file.identity.title ?? storeMatch?.title ?? baseSlug)
      .trim();
    // Union of aliases from (existing target) ∪ (source file) ∪ (title)
    let aliases = mergeAliases(targetIdentity.aliases, titleAlias);
    if (file.identity.aliases) {
      for (const a of file.identity.aliases) aliases = mergeAliases(aliases, a);
    }

    const sourceBody = stripFrontmatterBlock(file.text);
    const patch: Record<string, unknown> = {
      hypratia_id: hypratiaId,
      hypratia_kind: 'note',
      hypratia_migrated_from: file.relPath,
      hypratia_migrated_at: input.generatedAt,
    };
    if (storeMatch?.conversationId) {
      patch.hypratia_conversation = storeMatch.conversationId;
    }
    // Pick the starting frontmatter:
    //   - target exists  → use target's (so Obsidian user edits survive)
    //   - target absent  → use source's (so source-side user keys aren't
    //                      silently dropped on first migration)
    // `mergeMarkdownWithHypratia` only touches `hypratia_*` keys regardless,
    // so any non-hypratia user keys present on the chosen base pass through.
    const startingPoint = existingTargetText || file.text;
    let merged = mergeMarkdownWithHypratia(startingPoint, patch, sourceBody);
    merged = applyAliasesToFrontmatter(merged, aliases);
    steps.push({
      kind: 'write-md',
      from: file.relPath,
      to: targetPath,
      hypratiaId,
      mergedMarkdown: merged,
    });
    md += 1;

    // ----- 4. Sidecar -------------------------------------------------
    const sidecarPath = `${SIDECAR_DIR}/${sanitizeId(hypratiaId)}.json`;
    const existingSidecar = sidecarsById.get(hypratiaId) ?? null;
    const nextSidecar = mergeSidecarData(existingSidecar, hypratiaId, {
      last_distilled_at: input.generatedAt,
    });
    (nextSidecar as Record<string, unknown>).hypratia_migrated_from =
      file.relPath;
    (nextSidecar as Record<string, unknown>).hypratia_migrated_at =
      input.generatedAt;
    steps.push({
      kind: 'write-sidecar',
      hypratiaId,
      to: sidecarPath,
      json: serializeSidecar(nextSidecar),
    });
    sidecars += 1;

    // ----- 5. Node mdPath update --------------------------------------
    if (storeMatch && storeMatch.mdPath !== targetPath) {
      steps.push({
        kind: 'update-node-mdpath',
        nodeId: storeMatch.id,
        from: storeMatch.mdPath,
        to: targetPath,
      });
      nodeUpdates += 1;
    }
  }

  return {
    libraryRoot: input.libraryRoot,
    vaultRoot: input.vaultRoot,
    generatedAt: input.generatedAt,
    steps,
    conflicts,
    summary: {
      md,
      sidecars,
      nodeUpdates,
      skipped,
      conflicts: conflicts.length,
    },
  };
}

/**
 * Build a manifest from an applied plan. The runner appends the `archived`
 * list separately because that decision is made at apply time.
 */
export function buildBackfillManifest(
  plan: BackfillPlan,
  appliedAt: string,
  archived: { from: string; to: string }[],
): BackfillManifest {
  const moved: BackfillManifest['moved'] = [];
  const nodeUpdates: BackfillManifest['nodeUpdates'] = [];
  const skipped: BackfillManifest['skipped'] = [];
  for (const s of plan.steps) {
    if (s.kind === 'write-md') {
      moved.push({ from: s.from, to: s.to, hypratiaId: s.hypratiaId });
    } else if (s.kind === 'update-node-mdpath') {
      nodeUpdates.push({ nodeId: s.nodeId, from: s.from, to: s.to });
    } else if (s.kind === 'skip') {
      skipped.push({ from: s.from, reason: s.reason });
    }
  }
  return {
    $schema: 'hypratia.library-md-backfill.v1',
    libraryRoot: plan.libraryRoot,
    vaultRoot: plan.vaultRoot,
    appliedAt,
    moved,
    nodeUpdates,
    archived,
    skipped,
    conflicts: plan.conflicts,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTargetPath(
  intendedTo: string,
  hypratiaId: string,
  targets: ReadonlyMap<string, ExistingTarget>,
  claimed: ReadonlySet<string>,
): { path: string; conflict?: BackfillConflict } {
  const existing = targets.get(intendedTo);
  if (!existing && !claimed.has(intendedTo)) {
    return { path: intendedTo };
  }
  // Same Hypratia owner → idempotent: keep the path; the merge handles
  // content.
  const existingId =
    existing?.identity.hypratiaId ?? existing?.identity.legacyId;
  if (existing && existingId === hypratiaId) {
    return { path: intendedTo };
  }
  // Disambiguate. Suffix derived from id so re-runs reach the same name.
  const suffix = sanitizeId(hypratiaId).slice(0, 6);
  const dot = intendedTo.lastIndexOf('.');
  const base = dot === -1 ? intendedTo : intendedTo.slice(0, dot);
  const ext = dot === -1 ? '' : intendedTo.slice(dot);
  const resolvedTo = `${base}-${suffix}${ext}`;
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

function stripFrontmatterBlock(text: string): string {
  const m = text.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
  return m ? text.slice(m[0].length) : text;
}

/**
 * Stable id for a Library file lacking any frontmatter id. Deterministic
 * over `(libraryRoot, relPath)` so re-runs reach the same id; not
 * cryptographic.
 */
export function fallbackBackfillId(
  libraryRoot: string,
  relPath: string,
): string {
  let h = 5381;
  const s = `${libraryRoot}::${relPath}`;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `library_${(h >>> 0).toString(36)}`;
}

function sanitizeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function sanitizeFilenameStem(input: string): string {
  // Match the live-storage `sanitizeFileBase` shape (no extension, no
  // path-meta chars, capped length, falls back to "Untitled" on empty).
  const stripped = input
    .replace(/[#*`[\]<>:"/\\|?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return stripped || 'Untitled';
}
