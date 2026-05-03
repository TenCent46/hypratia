/**
 * Plan 48 — Export Hypratia canvases to Obsidian's `.canvas` format
 * (JSON Canvas spec). Pure transform lives in `./jsonCanvasFormat`; this
 * module is the thin Tauri shim that handles the actual file writes.
 *
 * We deliberately do NOT stuff Hypratia metadata into the canvas JSON.
 * The spec is intentionally conservative; sidecar Markdown frontmatter
 * (long-body nodes) carries the Hypratia-specific fields per plan 52.
 */
import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { CanvasNode, Edge } from '../../types';
import { mergeMarkdownWithHypratia } from './frontmatter';
import {
  CANVAS_DIR,
  NOTES_DIR,
  canvasFilenameForConversation,
  toJsonCanvas,
} from './jsonCanvasFormat';

// Re-export the pure surface so existing callers don't need to chase the
// new file. New callers should import from `./jsonCanvasFormat` directly.
export {
  CANVAS_DIR,
  NOTES_DIR,
  canvasFilenameForConversation,
  sanitizeCanvasId,
  slugifyCanvasName,
  toJsonCanvas,
} from './jsonCanvasFormat';
export type {
  JsonCanvas,
  JsonCanvasEdge,
  JsonCanvasNode,
  SidecarPayload,
} from './jsonCanvasFormat';

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
  const canvasName = canvasFilenameForConversation(conversationId, conversationTitle);
  const { canvas, sidecars } = toJsonCanvas(nodes, edges, {
    notesDir: NOTES_DIR,
  });

  const canvasesDir = `${vaultPath}/${CANVAS_DIR}`;
  const notesAbs = `${vaultPath}/${NOTES_DIR}`;
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
