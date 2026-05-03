/**
 * Plan 48 — Export Hypratia canvases to Obsidian's `.canvas` format
 * (JSON Canvas spec). Pure transform first (`toJsonCanvas`) so it is
 * unit-testable; the side-effecting `writeCanvasFile` is a thin Tauri
 * shim on top.
 *
 * We deliberately do NOT stuff Hypratia metadata into the canvas JSON.
 * The spec is intentionally conservative; sidecar Markdown frontmatter
 * (long-body nodes) carries the Hypratia-specific fields per plan 52.
 */
import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { CanvasNode, Edge } from '../../types';
import { mergeMarkdownWithHypratia } from './frontmatter';

export type JsonCanvasNode =
  | {
      id: string;
      type: 'text';
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      color?: string;
    }
  | {
      id: string;
      type: 'file';
      x: number;
      y: number;
      width: number;
      height: number;
      file: string;
      color?: string;
    }
  | {
      id: string;
      type: 'group';
      x: number;
      y: number;
      width: number;
      height: number;
      label?: string;
      color?: string;
    };

export type JsonCanvasEdge = {
  id: string;
  fromNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toNode: string;
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  label?: string;
  color?: string;
  toEnd?: 'arrow' | 'none';
};

export type JsonCanvas = {
  nodes: JsonCanvasNode[];
  edges: JsonCanvasEdge[];
};

const TEXT_NODE_INLINE_LIMIT = 280;

/**
 * Build a JSON Canvas blob from a Hypratia canvas snapshot.
 *
 * Long markdown bodies are written to sidecar files (under `notesDir`) and
 * referenced as `file` nodes; short bodies stay inline as `text` nodes.
 * The caller is responsible for writing both the `.canvas` and the sidecar
 * `.md` files; we only return the data here.
 */
export function toJsonCanvas(
  nodes: CanvasNode[],
  edges: Edge[],
  options: {
    /** Vault-relative path to where node sidecar `.md` files live. */
    notesDir: string;
    /** Vault-relative path to attachments. */
    attachmentsDir?: string;
  },
): {
  canvas: JsonCanvas;
  sidecars: { id: string; relPath: string; patch: Record<string, unknown>; body: string }[];
} {
  const out: JsonCanvas = { nodes: [], edges: [] };
  const sidecars: {
    id: string;
    relPath: string;
    patch: Record<string, unknown>;
    body: string;
  }[] = [];

  for (const n of nodes) {
    const w = n.width ?? 280;
    const h = n.height ?? 160;
    const baseGeom = {
      id: n.id,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      width: Math.round(w),
      height: Math.round(h),
    };

    if (n.kind === 'theme') {
      out.nodes.push({
        ...baseGeom,
        type: 'group',
        label: n.title,
      });
      continue;
    }

    const md = n.contentMarkdown ?? '';
    if (md.length <= TEXT_NODE_INLINE_LIMIT) {
      // Short content stays inline as text node — easier to read in Obsidian
      // when nothing else is going on.
      out.nodes.push({
        ...baseGeom,
        type: 'text',
        text: titleAndBody(n.title, md),
      });
    } else {
      const fileRel = `${options.notesDir}/${sanitize(n.id)}.md`;
      out.nodes.push({
        ...baseGeom,
        type: 'file',
        file: fileRel,
      });
      const { patch, body } = buildSidecarPatchAndBody(n);
      sidecars.push({ id: n.id, relPath: fileRel, patch, body });
    }
  }

  for (const e of edges) {
    out.edges.push({
      id: e.id,
      fromNode: e.sourceNodeId,
      toNode: e.targetNodeId,
      ...(e.label ? { label: e.label } : {}),
      // Default arrowhead at the target — matches our in-app rendering.
      toEnd: 'arrow',
    });
  }

  return { canvas: out, sidecars };
}

function titleAndBody(title: string, body: string): string {
  if (!body.trim()) return title || '';
  if (!title.trim()) return body;
  // If the body already starts with the title heading, don't duplicate it.
  if (/^\s*#{1,6}\s+/.test(body)) return body;
  return `# ${title}\n\n${body}`;
}

/**
 * Compute the Hypratia frontmatter patch and the body Markdown for a node.
 * Heavy / Hypratia-only data (selectionMarkers, embedding, theme cluster,
 * derivative views) does NOT live in the patch — it goes to the sidecar
 * JSON. The frontmatter stays small so the file reads naturally in
 * Obsidian's Properties UI.
 */
function buildSidecarPatchAndBody(n: CanvasNode): {
  patch: Record<string, unknown>;
  body: string;
} {
  const patch: Record<string, unknown> = {
    hypratia_id: n.id,
    hypratia_kind: n.kind ?? 'note',
    hypratia_conversation: n.conversationId,
    hypratia_created: n.createdAt,
    hypratia_updated: n.updatedAt,
  };
  // User-owned `tags` only get set when we have something to set — never
  // clobber to empty when the node has no tags, and don't touch the value
  // at all for hypratia_-prefixed-only patches (mergeMarkdownWithHypratia
  // ignores non-hypratia keys, so this is informational).
  if (n.tags && n.tags.length > 0) {
    patch.tags = n.tags;
  }
  const body = bodyWithTitle(n.title, n.contentMarkdown ?? '');
  return { patch, body };
}

function bodyWithTitle(title: string, content: string): string {
  if (/^\s*#{1,6}\s+/.test(content) || !title) return content;
  return `# ${title}\n\n${content}`;
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Write a `.canvas` file plus any required sidecar `.md` notes. The caller
 * supplies an absolute `vaultPath`; we always work inside `${vaultPath}/Hypratia`
 * so we never touch user files outside that subtree.
 */
export async function writeCanvasFile(opts: {
  vaultPath: string;
  conversationId: string;
  conversationTitle: string;
  nodes: CanvasNode[];
  edges: Edge[];
}): Promise<{ canvasPath: string; sidecarPaths: string[] }> {
  const { vaultPath, conversationId, conversationTitle, nodes, edges } = opts;
  const root = `${vaultPath}/Hypratia`;
  const notesDir = 'Hypratia/notes';
  const canvasName = `${slug(conversationTitle) || sanitize(conversationId)}.canvas`;
  const { canvas, sidecars } = toJsonCanvas(nodes, edges, { notesDir });

  // Ensure dirs exist by attempting writes; @tauri-apps/plugin-fs's
  // writeTextFile is path-based, but parent dirs must exist. We rely on the
  // existing ObsidianExporter path having already created `Hypratia/`; for
  // first-run safety, callers should ensureDir beforehand. To keep this
  // module side-effect-light we don't import `mkdir` here.

  const canvasesDir = `${root}/canvases`;
  const notesAbs = `${vaultPath}/${notesDir}`;
  await ensureDir(root);
  await ensureDir(canvasesDir);
  if (sidecars.length > 0) await ensureDir(notesAbs);

  const canvasPath = `${canvasesDir}/${canvasName}`;
  await writeTextFile(canvasPath, JSON.stringify(canvas, null, 2));

  const sidecarPaths: string[] = [];
  for (const s of sidecars) {
    const path = `${vaultPath}/${s.relPath}`;
    let existing = '';
    if (await exists(path)) {
      try {
        existing = await readTextFile(path);
      } catch {
        existing = '';
      }
    }
    // Merge keeps user-defined frontmatter (title, tags, aliases, plugin
    // keys, Properties UI values…) intact and only updates the
    // `hypratia_*` namespace. The body is replaced wholesale because we
    // currently treat Hypratia as the source of truth for node content
    // (one-way export — full bidirectional editing is plan v1.3+).
    const next = mergeMarkdownWithHypratia(existing, s.patch, s.body);
    await writeTextFile(path, next);
    sidecarPaths.push(path);
  }
  return { canvasPath, sidecarPaths };
}

async function ensureDir(p: string): Promise<void> {
  if (!(await exists(p))) await mkdir(p, { recursive: true });
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
