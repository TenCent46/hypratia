import { useStore } from '../../store';
import type { CanvasNode, Edge, ID } from '../../types';
import {
  markdownFiles,
  resolveMarkdownRoot,
  type MarkdownTreeNode,
} from '../storage/MarkdownFileService';
import { wikiTitle } from './WikiLinkSyncService';

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

async function createCanonicalFile(
  rootPath: string,
  node: CanvasNode,
): Promise<string> {
  const folder = 'Canvas Nodes';
  try {
    await markdownFiles.createFolder(rootPath, '', folder);
  } catch {
    // Folder already exists or was created by another window.
  }
  const base = sanitizeFileBase(node.title || 'Untitled');
  let lastErr: unknown = null;
  for (let i = 0; i < 100; i += 1) {
    const name = i === 0 ? `${base}.md` : `${base}-${i + 1}.md`;
    try {
      const path = await markdownFiles.createFile(rootPath, folder, name);
      const content = node.contentMarkdown || `# ${node.title || base}\n`;
      await markdownFiles.writeFile(rootPath, path, content);
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
  if (node.mdPath) return node.mdPath;
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
    if (!path) continue;
    const content = await markdownFiles.readFile(rootPath, path);
    files.push({
      nodeId,
      title: wikiTitle({ ...node, mdPath: path }),
      path,
      content,
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

  const fileBlocks = files.map(
    (f) => `### ${f.title}\nPath: ${f.path}\nNode: ${f.nodeId}\n\n${f.content}`,
  );

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
