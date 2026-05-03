/**
 * Live-vault wrapper around the pure `wikilinkResolver`. Reads the file
 * tree via `markdownFiles` and the node list from the Zustand store.
 *
 * Caches frontmatter reads per (rootPath, path) for the duration of one
 * click. Cache invalidates on every fresh `resolveClickedWikilink` call —
 * the next click reads anew. Cheap; keeps things simple.
 */

import { flattenMarkdownTree } from './MarkdownContextResolver';
import {
  markdownFiles,
  type MarkdownTreeNode,
} from '../storage/MarkdownFileService';
import { useStore } from '../../store';
import { readFrontmatterIdentity } from './wikilinks';
import {
  resolveWikilinkClick,
  type FileEntry,
  type NodeRef,
  type WikilinkResolution,
} from './wikilinkResolver';

export type {
  WikilinkResolution,
  WikilinkCandidate,
  NodeRef,
  FileEntry,
} from './wikilinkResolver';

// Dispatcher lives in the pure resolver module so it's exercisable from
// Node test scripts. Re-exported here for the established import surface.
export { dispatchWikilinkResolution } from './wikilinkResolver';

/**
 * Public entry point used by the editor and reading-view click handlers.
 * Builds a fresh `WikilinkResolverContext` from current vault + store
 * state, then runs the pure resolver.
 */
export async function resolveClickedWikilink(
  rootPath: string,
  target: string,
): Promise<WikilinkResolution> {
  const files = await listMarkdownFiles(rootPath);
  const nodes = nodesIndexFromStore();
  const cache = new Map<string, ReturnType<typeof readFrontmatterIdentity> | null>();
  return resolveWikilinkClick(target, {
    files,
    nodes,
    readFrontmatter: async (path) => {
      const cached = cache.get(path);
      if (cached !== undefined) return cached;
      try {
        const text = await markdownFiles.readFile(rootPath, path);
        const id = readFrontmatterIdentity(text);
        cache.set(path, id);
        return id;
      } catch {
        cache.set(path, null);
        return null;
      }
    },
  });
}

async function listMarkdownFiles(rootPath: string): Promise<FileEntry[]> {
  const tree = await markdownFiles.listTree(rootPath);
  return flattenMarkdownTree(tree)
    .filter((n: MarkdownTreeNode) => n.kind === 'file')
    .filter((n: MarkdownTreeNode) => /\.(md|markdown)$/i.test(n.name))
    .map((n: MarkdownTreeNode) => ({
      path: n.path,
      name: n.name,
      stem: n.name.replace(/\.(md|markdown)$/i, ''),
    }));
}

function nodesIndexFromStore(): Map<string, NodeRef> {
  const state = useStore.getState();
  const out = new Map<string, NodeRef>();
  for (const n of state.nodes) {
    out.set(n.id, {
      id: n.id,
      conversationId: n.conversationId,
      title: n.title,
      mdPath: n.mdPath,
    });
  }
  return out;
}
