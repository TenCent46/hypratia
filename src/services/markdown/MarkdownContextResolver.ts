import { useStore } from '../../store';
import type { CanvasNode, Edge, ID } from '../../types';
import {
  markdownFiles,
  resolveMarkdownRoot,
  ensureFolderPath,
  type MarkdownTreeNode,
} from '../storage/MarkdownFileService';
import { isMirrorManagedPath } from '../knowledge/knowledgeBaseLayout';
import { buildMarkdown } from '../export/frontmatter';
import { wikiTitle } from './WikiLinkSyncService';

/**
 * Canonical folder for canvas-node markdown bodies. **One single location**
 * regardless of project — project membership lives in frontmatter
 * (`hypratia_project`) so the vault stays a flat, Obsidian-readable
 * structure. Aligns with `services/export/VaultSync` and
 * `services/migration/legacyVaultMigration`.
 */
const CANVAS_NOTES_DIR = 'Hypratia/Notes';

export type MarkdownContextFile = {
  nodeId: ID;
  title: string;
  path: string;
  content: string;
};

export type MarkdownContextPacket = {
  rootPath: string;
  files: MarkdownContextFile[];
  edges: Edge[];
  systemContext: string;
  summary: {
    fileCount: number;
    edgeCount: number;
    fileNames: string[];
  };
};

function sanitizeFileBase(title: string): string {
  const base = title
    .replace(/[#*`[\]<>:"/\\|?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return base || 'Untitled';
}

function canvasFolderForNode(_node: CanvasNode): string {
  // Single canonical location. Per-project organization is preserved as
  // `hypratia_project` frontmatter so Obsidian sees a flat `Hypratia/Notes/`
  // tree without weird nested folders.
  return CANVAS_NOTES_DIR;
}

/** Build the initial Markdown body for a freshly-created canvas note —
 *  Hypratia frontmatter + (optional) user content. The frontmatter is what
 *  makes the file resolvable from `[[Title]]` clicks later (via the
 *  `aliases` line) and identifiable across renames (via `hypratia_id`). */
function buildHypratiaCanonicalMarkdown(
  node: CanvasNode,
  body: string,
): string {
  const state = useStore.getState();
  const conv = state.conversations.find((c) => c.id === node.conversationId);
  const project = conv?.projectId
    ? state.projects.find((p) => p.id === conv.projectId)
    : undefined;
  const title = (node.title || 'Untitled').trim();
  // If body already starts with frontmatter, strip it — we're emitting our own.
  const cleanBody = body.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
  const fm: Record<string, unknown> = {
    hypratia_id: node.id,
    hypratia_kind: node.kind ?? 'note',
    hypratia_conversation: node.conversationId,
    hypratia_created: node.createdAt,
    hypratia_updated: node.updatedAt,
    aliases: [title],
  };
  if (project) fm.hypratia_project = project.id;
  if (node.tags && node.tags.length > 0) fm.tags = node.tags;
  return buildMarkdown(fm, cleanBody);
}

async function createCanonicalFile(
  rootPath: string,
  node: CanvasNode,
): Promise<string> {
  const folder = canvasFolderForNode(node);
  await ensureFolderPath(rootPath, folder);
  const base = sanitizeFileBase(node.title || 'Untitled');
  let lastErr: unknown = null;
  for (let i = 0; i < 100; i += 1) {
    const name = i === 0 ? `${base}.md` : `${base}-${i + 1}.md`;
    try {
      const path = await markdownFiles.createFile(rootPath, folder, name);
      const body = node.contentMarkdown || `# ${node.title || base}\n`;
      await markdownFiles.writeFile(
        rootPath,
        path,
        buildHypratiaCanonicalMarkdown(node, body),
      );
      return path;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Could not create canonical Markdown file: ${String(lastErr)}`);
}

export async function ensureNodeMarkdownPath(
  rootPath: string,
  nodeId: ID,
): Promise<string | null> {
  const state = useStore.getState();
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  // A pre-existing mdPath that points at a mirror-managed location is
  // treated as unset: writing user content there would clobber the
  // mirror's frontmatter and produce "not owned" errors. Leave the bad
  // path off the node and mint a fresh canonical one under canvas/.
  if (node.mdPath && !isMirrorManagedPath(node.mdPath)) return node.mdPath;
  if (node.kind && node.kind !== 'markdown') return null;
  const path = await createCanonicalFile(rootPath, node);
  state.updateNode(node.id, { mdPath: path });
  return path;
}

export async function resolveMarkdownContext(
  nodeIds: ID[],
  edgeIds: ID[],
): Promise<MarkdownContextPacket> {
  const state = useStore.getState();
  const rootPath = await resolveMarkdownRoot(state.settings.markdownStorageDir);
  const uniqueNodeIds = Array.from(new Set(nodeIds));
  const files: MarkdownContextFile[] = [];

  for (const nodeId of uniqueNodeIds) {
    const node = useStore.getState().nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    const path = await ensureNodeMarkdownPath(rootPath, nodeId);
    if (path) {
      const content = await markdownFiles.readFile(rootPath, path);
      files.push({
        nodeId,
        title: wikiTitle({ ...node, mdPath: path }),
        path,
        content,
      });
      continue;
    }
    // No resolvable vault file (theme/image/pdf/artifact node, or a
    // markdown node not yet flushed to disk). Fall back to the in-memory
    // body so the LLM still sees the selection — silently dropping these
    // produced "Context: 0 files" even when the user picked 7 nodes.
    const inlineBody = node.contentMarkdown ?? '';
    if (!inlineBody && !node.title) continue;
    files.push({
      nodeId,
      title: node.title || `Node ${nodeId}`,
      path: '',
      content: inlineBody,
    });
  }

  const fileNodeSet = new Set(files.map((f) => f.nodeId));
  const selectedEdges = state.edges.filter(
    (e) =>
      edgeIds.includes(e.id) ||
      (fileNodeSet.has(e.sourceNodeId) && fileNodeSet.has(e.targetNodeId)),
  );

  const nodeTitle = new Map(files.map((f) => [f.nodeId, f.title]));
  const edgeLines = selectedEdges.map((e) => {
    const source = nodeTitle.get(e.sourceNodeId) ?? e.sourceNodeId;
    const target = nodeTitle.get(e.targetNodeId) ?? e.targetNodeId;
    return `- ${source} -> ${target}${e.label ? ` (${e.label})` : ''}`;
  });

  const fileBlocks = files.map((f) => {
    const header = f.path
      ? `### ${f.title}\nPath: ${f.path}\nNode: ${f.nodeId}`
      : `### ${f.title}\nNode: ${f.nodeId} (in-memory)`;
    return `${header}\n\n${f.content}`;
  });

  return {
    rootPath,
    files,
    edges: selectedEdges,
    systemContext: [
      'Use the following local Markdown files and canvas relationships as source context. Prefer this context over guesses.',
      '',
      'Selected canvas links:',
      edgeLines.length ? edgeLines.join('\n') : '- None',
      '',
      'Selected Markdown files:',
      fileBlocks.join('\n\n---\n\n'),
    ].join('\n'),
    summary: {
      fileCount: files.length,
      edgeCount: selectedEdges.length,
      fileNames: files.map((f) => f.title),
    },
  };
}

export function flattenMarkdownTree(node: MarkdownTreeNode): MarkdownTreeNode[] {
  const out: MarkdownTreeNode[] = [];
  if (node.kind === 'file') out.push(node);
  for (const child of node.children ?? []) out.push(...flattenMarkdownTree(child));
  return out;
}
