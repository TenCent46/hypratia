import type { ID } from '../../types';
import {
  markdownFiles,
  resolveMarkdownRoot,
  type MarkdownTreeNode,
} from '../storage/MarkdownFileService';
import {
  ensureNodeMarkdownPath,
  flattenMarkdownTree,
  type MarkdownContextFile,
} from './MarkdownContextResolver';

export type MarkdownSearchScope = 'selected' | 'all';

export type MarkdownSearchResult = {
  path: string;
  title: string;
  snippet: string;
  nodeId?: ID;
};

function titleFromPath(path: string): string {
  return path.split('/').filter(Boolean).pop()?.replace(/\.md$/i, '') ?? path;
}

function snippet(content: string, index: number, len: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + len + 120);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';
  return `${prefix}${content.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

async function filesForAll(rootPath: string): Promise<MarkdownContextFile[]> {
  const tree: MarkdownTreeNode = await markdownFiles.listTree(rootPath);
  const files = flattenMarkdownTree(tree);
  const out: MarkdownContextFile[] = [];
  for (const file of files) {
    try {
      out.push({
        nodeId: '',
        title: titleFromPath(file.path),
        path: file.path,
        content: await markdownFiles.readFile(rootPath, file.path),
      });
    } catch {
      // Ignore unreadable files.
    }
  }
  return out;
}

export async function searchMarkdownFiles(input: {
  query: string;
  scope: MarkdownSearchScope;
  selectedNodeIds: ID[];
  markdownStorageDir?: string;
  selectedFiles?: MarkdownContextFile[];
}): Promise<MarkdownSearchResult[]> {
  const q = input.query.trim().toLowerCase();
  if (!q) return [];
  const rootPath = await resolveMarkdownRoot(input.markdownStorageDir);
  let files = input.selectedFiles;
  if (!files) {
    if (input.scope === 'all') {
      files = await filesForAll(rootPath);
    } else {
      files = [];
      for (const nodeId of input.selectedNodeIds) {
        const path = await ensureNodeMarkdownPath(rootPath, nodeId);
        if (!path) continue;
        const content = await markdownFiles.readFile(rootPath, path);
        files.push({ nodeId, title: titleFromPath(path), path, content });
      }
    }
  }

  return files
    .map((file) => {
      const idx = file.content.toLowerCase().indexOf(q);
      if (idx === -1) return null;
      return {
        path: file.path,
        title: file.title || titleFromPath(file.path),
        snippet: snippet(file.content, idx, q.length),
        ...(file.nodeId ? { nodeId: file.nodeId } : {}),
      } satisfies MarkdownSearchResult;
    })
    .filter((r): r is MarkdownSearchResult => Boolean(r))
    .slice(0, 80);
}
