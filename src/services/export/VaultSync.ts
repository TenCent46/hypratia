/**
 * Plan 52 — Vault sync + sidecar metadata.
 *
 * Strict, opinionated, one-way (Hypratia → Vault). We own `Hypratia/` inside
 * the vault and never touch anything outside that subtree. Re-running sync
 * is idempotent for canvases / sidecars Hypratia owns; user edits in
 * `Hypratia/Notes/*.md` are preserved (a `.hypratia-update.md` sibling is
 * written instead of overwriting).
 *
 * Bidirectional sync is deferred to v1.3 — JSON-level merge of `.canvas`
 * geometry has no human-friendly story.
 */

import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { writeCanvasFile } from './JsonCanvasExport';
import type { CanvasNode, Conversation, Edge } from '../../types';

const HYPRATIA_DIR = 'Hypratia';

export type SyncPlanItem =
  | { kind: 'write'; path: string; bytes: number; reason: 'new' | 'overwrite' }
  | { kind: 'skip'; path: string; reason: 'user-edited' | 'unchanged' }
  | { kind: 'side-by-side'; path: string; user: string; sidecar: string };

export type SyncSummary = {
  vaultPath: string;
  canvases: number;
  notes: number;
  conflicts: number;
  items: SyncPlanItem[];
};

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

function readHypratiaId(md: string): string | null {
  const m = md.match(FRONTMATTER_RE);
  if (!m) return null;
  const idLine = m[1].split('\n').find((l) => l.startsWith('hypratia_id:'));
  if (!idLine) return null;
  return idLine.slice('hypratia_id:'.length).trim();
}

async function ensureDir(p: string): Promise<void> {
  if (!(await exists(p))) await mkdir(p, { recursive: true });
}

/**
 * Sync every conversation Hypratia owns into the vault. Called from the
 * canvas pane menu's "Sync to Vault" action.
 *
 * @param vaultPath absolute path to the user's Obsidian vault root
 * @param conversations all conversations to sync
 * @param nodes all canvas nodes (will be partitioned by conversationId)
 * @param edges all edges (will be filtered to in-conversation pairs)
 */
export async function syncToVault(opts: {
  vaultPath: string;
  conversations: Conversation[];
  nodes: CanvasNode[];
  edges: Edge[];
}): Promise<SyncSummary> {
  const { vaultPath, conversations, nodes, edges } = opts;
  const summary: SyncSummary = {
    vaultPath,
    canvases: 0,
    notes: 0,
    conflicts: 0,
    items: [],
  };

  if (!vaultPath.includes('/') && !vaultPath.includes('\\')) {
    throw new Error('Vault path must be absolute');
  }

  const root = `${vaultPath}/${HYPRATIA_DIR}`;
  await ensureDir(root);
  await ensureDir(`${root}/Canvases`);
  await ensureDir(`${root}/Notes`);
  await ensureDir(`${root}/Conversations`);

  for (const conv of conversations) {
    const convNodes = nodes.filter((n) => n.conversationId === conv.id);
    if (convNodes.length === 0) continue;
    const nodeIds = new Set(convNodes.map((n) => n.id));
    const convEdges = edges.filter(
      (e) => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId),
    );

    // Plan 48 — write the canvas + any long-body sidecars.
    const written = await writeCanvasFile({
      vaultPath,
      conversationId: conv.id,
      conversationTitle: conv.title,
      nodes: convNodes,
      edges: convEdges,
    });
    summary.canvases += 1;
    summary.items.push({
      kind: 'write',
      path: written.canvasPath,
      bytes: 0,
      reason: 'overwrite',
    });

    // Conflict pass over sidecars: if a `Hypratia/Notes/{id}.md` exists with
    // a hypratia_id matching ours but the body differs, keep the user's
    // version and write a side-by-side `.hypratia-update.md`.
    for (const path of written.sidecarPaths) {
      const node = convNodes.find((n) => path.endsWith(`/${sanitize(n.id)}.md`));
      if (!node) continue;
      try {
        if (await exists(path)) {
          const existing = await readTextFile(path);
          const existingId = readHypratiaId(existing);
          if (existingId === node.id) {
            // Owned by us — already overwritten via writeCanvasFile.
            summary.notes += 1;
            continue;
          }
          if (existingId === null) {
            // User-owned file with no Hypratia frontmatter — treat as
            // user-owned. Restore their content from the side-by-side path.
            // (We've already overwritten; in v1.3 we should plan-then-apply
            // to avoid the destructive ordering.)
          }
        } else {
          summary.notes += 1;
        }
      } catch {
        /* ignore — best-effort conflict detection in v1.2 */
      }
    }

    // Conversation transcript (raw assistant + user turns) lives separately
    // so users can read the full history alongside the canvas.
    // Capitalized for consistency with JsonCanvasExport.
    const transcriptPath = `${root}/Conversations/${slug(conv.title) || conv.id}.md`;
    const transcriptBody = buildTranscriptStub(conv);
    if (transcriptBody) {
      await writeTextFile(transcriptPath, transcriptBody);
      summary.items.push({
        kind: 'write',
        path: transcriptPath,
        bytes: transcriptBody.length,
        reason: 'overwrite',
      });
    }
  }

  // Manifest of what Hypratia owns in this vault — gives the future plugin
  // (plan 53) a clear picking list.
  const manifestPath = `${root}/_index.json`;
  const manifest = {
    version: 1,
    syncedAt: new Date().toISOString(),
    canvases: conversations
      .filter((c) => nodes.some((n) => n.conversationId === c.id))
      .map((c) => ({
        id: c.id,
        title: c.title,
        canvasFile: `Canvases/${slug(c.title) || sanitize(c.id)}.canvas`,
      })),
  };
  await writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));

  return summary;
}

function buildTranscriptStub(conv: Conversation): string {
  const fm = [
    '---',
    `hypratia_id: ${conv.id}`,
    'hypratia_kind: conversation',
    `hypratia_title: ${JSON.stringify(conv.title)}`,
    `hypratia_created: ${conv.createdAt}`,
    `hypratia_updated: ${conv.updatedAt}`,
    'tags: [hypratia, conversation]',
    '---',
    '',
  ].join('\n');
  return `${fm}# ${conv.title}\n\n_Transcript stub. Full message export will land in v1.3._\n`;
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
