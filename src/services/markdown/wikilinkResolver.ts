/**
 * Hypratia-side wikilink click resolution.
 *
 * Closes the loop on the natural-wikilink rewrite: the writer emits clean
 * `[[Title]]` / `[[path|Title]]`, this module decides what to *do* when
 * the user clicks one. Identity is by frontmatter (`hypratia_id`), not by
 * filename — so renames in Obsidian don't break the trail.
 *
 * Pure-ish: takes `ctx` instead of touching the vault directly. The thin
 * wrapper in `wikilinkResolverFs.ts` (imports the storage service and the
 * Zustand store) is what callers actually invoke; that wrapper builds
 * `ctx` and forwards.
 */

import {
  deriveTitleFromPath,
  parseWikilinkTarget,
  type FrontmatterIdentity,
  type WikilinkAnchor,
} from './wikilinks.ts';

// Re-export for callers that hand-build a ctx in tests.
export { parseWikilinkTarget };
export type { WikilinkAnchor };

/**
 * Dispatch CustomEvents on the global event target. Browser path uses
 * `window`; Node test scripts can install a stub on `globalThis.window`
 * so this dispatcher is testable without a DOM. Anything outside those
 * two is silently dropped — Hypratia is desktop-only.
 */
function dispatch(type: string, detail: Record<string, unknown>): void {
  const target =
    typeof globalThis !== 'undefined'
      ? (globalThis as { window?: EventTarget; dispatchEvent?: EventTarget['dispatchEvent'] }).window
      : undefined;
  if (target && typeof target.dispatchEvent === 'function') {
    target.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

export type FileEntry = { path: string; stem: string; name: string };
export type NodeRef = {
  id: string;
  conversationId: string;
  title: string;
  mdPath?: string;
};

export type WikilinkResolverContext = {
  /** Vault-relative `.md` paths (with `stem` = filename without extension). */
  files: readonly FileEntry[];
  /** Hypratia nodes currently in the store, indexed by id. */
  nodes: ReadonlyMap<string, NodeRef>;
  /**
   * Read the frontmatter identity for a vault-relative path. The wrapper
   * uses `markdownFiles.readFile` + `readFrontmatterIdentity`; tests pass
   * an in-memory map.
   */
  readFrontmatter: (path: string) => Promise<FrontmatterIdentity | null>;
};

export type WikilinkCandidate = {
  path: string;
  title: string;
  hypratiaId?: string;
  /** When the candidate maps to a known Hypratia node, this is its id. */
  nodeId?: string;
  conversationId?: string;
};

export type WikilinkResolution =
  | {
      status: 'open-node';
      nodeId: string;
      conversationId: string;
      hypratiaId: string;
      path: string;
      anchor: WikilinkAnchor | null;
    }
  | {
      status: 'open-markdown';
      path: string;
      anchor: WikilinkAnchor | null;
      /** Why we didn't open a Hypratia node — useful for telemetry / UI hints. */
      reason: 'no-frontmatter-id' | 'no-matching-node';
    }
  | {
      status: 'ambiguous';
      query: string;
      candidates: WikilinkCandidate[];
    }
  | {
      status: 'unresolved';
      query: string;
    };

/**
 * Resolve a clicked `[[…]]` target to the action Hypratia should take. The
 * decision tree is:
 *
 *   1. Pathful target (`Folder/Note`) → exact path lookup; classify the
 *      single file we found.
 *   2. Bare title → gather candidate files (filename stem, then alias /
 *      frontmatter-title scan), rank, and:
 *        - 0 candidates  → `unresolved`
 *        - 1 candidate   → classify it
 *        - >1 candidates → break ties on exact title / alias / pathful;
 *                          if a unique winner emerges, classify it; else
 *                          return `ambiguous` so the UI can ask the user.
 *
 * Classifying a single file means: read its frontmatter; if `hypratia_id`
 * (or the legacy `id`) maps to a node in the store, we open that node.
 * Otherwise we fall back to opening the markdown file — the user can
 * import it later.
 */
export async function resolveWikilinkClick(
  target: string,
  ctx: WikilinkResolverContext,
): Promise<WikilinkResolution> {
  const { file, anchor } = parseWikilinkTarget(target);
  if (!file) return { status: 'unresolved', query: target };

  // ----- 1. Pathful target ---------------------------------------------
  if (file.includes('/')) {
    const candidate = file.endsWith('.md') ? file : `${file}.md`;
    const hit = ctx.files.find((f) => f.path === candidate);
    if (!hit) return { status: 'unresolved', query: target };
    return classifySingle(hit.path, anchor, ctx);
  }

  // ----- 2. Bare title --------------------------------------------------
  const candidates = await findCandidates(file, ctx);
  if (candidates.length === 0) {
    return { status: 'unresolved', query: target };
  }
  if (candidates.length === 1) {
    return classifySingle(candidates[0].path, anchor, ctx, candidates[0].identity);
  }

  // ----- 3. Multiple candidates → rank & disambiguate -------------------
  const ranked = rankCandidates(candidates, file);
  const top = ranked[0];
  const second = ranked[1];
  if (!second || top.score > second.score) {
    return classifySingle(top.path, anchor, ctx, top.identity);
  }
  // Truly ambiguous — surface a chooser.
  return {
    status: 'ambiguous',
    query: target,
    candidates: ranked.map((c) => toUserFacingCandidate(c, ctx)),
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type ScannedCandidate = {
  path: string;
  stem: string;
  identity: FrontmatterIdentity;
};
type RankedCandidate = ScannedCandidate & { score: number };

async function findCandidates(
  target: string,
  ctx: WikilinkResolverContext,
): Promise<ScannedCandidate[]> {
  const lc = target.toLowerCase();
  const stemHits = ctx.files.filter(
    (f) => f.stem === target || f.stem.toLowerCase() === lc,
  );
  const fromStems = await readIdentities(stemHits, ctx);
  if (fromStems.length > 0) return fromStems;

  // No stem match — fall back to scanning frontmatter for `aliases:` or
  // `title:` matching the target. This is the path that survives an
  // Obsidian rename: the file is now `Renamed.md` but its frontmatter
  // still carries the original title and aliases.
  //
  // We cap the scan at 200 files so a pathological vault doesn't lock the
  // click. In practice an actual user vault is usually fine; the cap is a
  // safety net.
  const SCAN_LIMIT = 200;
  const slice = ctx.files.slice(0, SCAN_LIMIT);
  const scanned = await readIdentities(slice, ctx);
  return scanned.filter((c) => identityMatchesTitle(c.identity, target));
}

async function readIdentities(
  files: readonly FileEntry[],
  ctx: WikilinkResolverContext,
): Promise<ScannedCandidate[]> {
  const out: ScannedCandidate[] = [];
  await Promise.all(
    files.map(async (f) => {
      try {
        const id = (await ctx.readFrontmatter(f.path)) ?? {};
        out.push({ path: f.path, stem: f.stem, identity: id });
      } catch {
        out.push({ path: f.path, stem: f.stem, identity: {} });
      }
    }),
  );
  return out;
}

function identityMatchesTitle(
  identity: FrontmatterIdentity,
  target: string,
): boolean {
  if (identity.title === target) return true;
  if (identity.aliases?.some((a) => a.trim() === target)) return true;
  return false;
}

function rankCandidates(
  candidates: readonly ScannedCandidate[],
  target: string,
): RankedCandidate[] {
  const lc = target.toLowerCase();
  const ranked = candidates.map((c) => ({ ...c, score: scoreCandidate(c, target, lc) }));
  ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return ranked;
}

function scoreCandidate(
  c: ScannedCandidate,
  target: string,
  lc: string,
): number {
  // Higher = better. Tiers picked so a single tier always wins on its own.
  if (c.identity.title === target) return 100;
  if (c.identity.aliases?.some((a) => a.trim() === target)) return 90;
  if (c.stem === target) return 60;
  if (c.identity.title?.toLowerCase() === lc) return 50;
  if (c.identity.aliases?.some((a) => a.trim().toLowerCase() === lc)) return 40;
  if (c.stem.toLowerCase() === lc) return 30;
  return 0;
}

async function classifySingle(
  path: string,
  anchor: WikilinkAnchor | null,
  ctx: WikilinkResolverContext,
  preloadedIdentity?: FrontmatterIdentity,
): Promise<WikilinkResolution> {
  const identity =
    preloadedIdentity ?? (await ctx.readFrontmatter(path)) ?? {};
  const hypratiaId = identity.hypratiaId ?? identity.legacyId;
  if (!hypratiaId) {
    return { status: 'open-markdown', path, anchor, reason: 'no-frontmatter-id' };
  }
  const node = ctx.nodes.get(hypratiaId);
  if (!node) {
    return { status: 'open-markdown', path, anchor, reason: 'no-matching-node' };
  }
  return {
    status: 'open-node',
    nodeId: node.id,
    conversationId: node.conversationId,
    hypratiaId,
    path,
    anchor,
  };
}

function toUserFacingCandidate(
  c: ScannedCandidate,
  ctx: WikilinkResolverContext,
): WikilinkCandidate {
  const hypratiaId = c.identity.hypratiaId ?? c.identity.legacyId;
  const node = hypratiaId ? ctx.nodes.get(hypratiaId) : undefined;
  return {
    path: c.path,
    title: c.identity.title ?? deriveTitleFromPath(c.path),
    hypratiaId,
    nodeId: node?.id,
    conversationId: node?.conversationId,
  };
}

/**
 * Translate a `WikilinkResolution` into the appropriate window CustomEvents
 * the rest of the app already listens for. Centralized here so the editor
 * and reading-view click handlers stay tiny.
 *
 * Routing:
 *   open-node     → `mc:open-canvas-node` (HIGH-LEVEL; App.tsx ensures the
 *                   canvas pane is visible, switches conversation if needed,
 *                   selects the node, then re-dispatches `mc:focus-canvas-node`
 *                   so the existing CanvasPanel listener centers the viewport)
 *                  + `mc:open-markdown-file` (so the editor follows along)
 *   open-markdown → `mc:open-markdown-file`
 *   ambiguous     → `mc:wikilink-chooser-open`
 *   unresolved    → `mc:create-kb-note`
 *
 * `mc:focus-canvas-node` (the LOW-LEVEL pre-existing event) is intentionally
 * NOT fired here — the high-level handler does that once the pane is shown
 * and the canvas mounted. Existing direct listeners of the low-level event
 * keep working unchanged.
 */
export function dispatchWikilinkResolution(
  resolution: WikilinkResolution,
  rawTarget: string,
): void {
  switch (resolution.status) {
    case 'open-node':
      dispatch('mc:open-canvas-node', {
        nodeId: resolution.nodeId,
        conversationId: resolution.conversationId,
        hypratiaId: resolution.hypratiaId,
        path: resolution.path,
        anchor: resolution.anchor,
      });
      dispatch('mc:open-markdown-file', {
        path: resolution.path,
        anchor: resolution.anchor,
      });
      return;
    case 'open-markdown':
      dispatch('mc:open-markdown-file', {
        path: resolution.path,
        anchor: resolution.anchor,
      });
      return;
    case 'ambiguous':
      dispatch('mc:wikilink-chooser-open', {
        query: resolution.query,
        candidates: resolution.candidates,
      });
      return;
    case 'unresolved':
      dispatch('mc:create-kb-note', {
        name: resolution.query || rawTarget,
      });
      return;
  }
}
