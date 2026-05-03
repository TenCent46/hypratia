/**
 * Pure JSON Canvas serialization. No fs, no Tauri imports — testable from
 * Node and reusable from the canvas autosave runner. The file-side
 * counterpart (`writeCanvasFile`) lives in `JsonCanvasExport.ts`.
 *
 * We deliberately keep Hypratia metadata OUT of the canvas JSON — the
 * spec is conservative; sidecar Markdown frontmatter carries everything
 * Hypratia-specific.
 */

import type { CanvasNode, Edge } from '../../types';

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

export type SidecarPayload = {
  id: string;
  /** Vault-relative target path for the sidecar `.md`. */
  relPath: string;
  /** Hypratia frontmatter patch — fed through `mergeMarkdownWithHypratia`. */
  patch: Record<string, unknown>;
  /** The Markdown body (without frontmatter). */
  body: string;
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
): { canvas: JsonCanvas; sidecars: SidecarPayload[] } {
  const out: JsonCanvas = { nodes: [], edges: [] };
  const sidecars: SidecarPayload[] = [];

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
  if (/^\s*#{1,6}\s+/.test(body)) return body;
  return `# ${title}\n\n${body}`;
}

function bodyWithTitle(title: string, content: string): string {
  if (/^\s*#{1,6}\s+/.test(content) || !title) return content;
  return `# ${title}\n\n${content}`;
}

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
  if (n.tags && n.tags.length > 0) {
    patch.tags = n.tags;
  }
  const body = bodyWithTitle(n.title, n.contentMarkdown ?? '');
  return { patch, body };
}

export function sanitizeCanvasId(id: string): string {
  return sanitize(id);
}

export function slugifyCanvasName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Vault-relative `Hypratia/Canvases/<slug>.canvas`. */
export const CANVAS_DIR = 'Hypratia/Canvases';
export const NOTES_DIR = 'Hypratia/Notes';

export function canvasFilenameForConversation(
  conversationId: string,
  conversationTitle: string,
): string {
  return `${slugifyCanvasName(conversationTitle) || sanitize(conversationId)}.canvas`;
}
