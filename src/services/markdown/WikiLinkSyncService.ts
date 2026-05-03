/**
 * WikiLinkSyncService — vault-fs wrappers around the pure wikilink helpers
 * in `./wikilinks.ts`. The pure module produces strings; this module reads
 * and writes the user's markdown to keep links bidirectionally up to date.
 *
 * Plan v1.2 follow-up. The legacy `[[node-{id}|Title]]` pattern is gone;
 * the displayed link is always `[[Title]]` (or `[[path|Title]]` on title
 * collision). Stable identity stays in the target's frontmatter as
 * `hypratia_id` (read via `readFrontmatterIdentity`) and in the sidecar
 * JSON next to the file.
 */

import type { CanvasNode } from '../../types';
import { markdownFiles } from '../storage/MarkdownFileService';
import {
  appendWikiLink,
  deriveTitleFromPath,
  readFrontmatterIdentity,
  wikiTitle,
  type WikilinkTarget,
} from './wikilinks';

// Re-export the pure helpers so callers have a single import surface for
// "I need wikilink stuff." Tests import from `./wikilinks` directly to
// avoid pulling in the storage-coupled fs ops.
export {
  appendWikiLink,
  buildNaturalWikilink,
  buildTitleCounts,
  deriveTitleFromPath,
  mergeAliases,
  pathForWikilink,
  readFrontmatterIdentity,
  sanitizeTitleForWikilink,
  wikiTitle,
} from './wikilinks';
export type { FrontmatterIdentity, WikilinkTarget } from './wikilinks';

/**
 * Walk the vault tree and build a title→targets index. Used by writers
 * that don't have a full snapshot in memory but still want collision-
 * aware wikilinks. Each `.md` is parsed via `gray-matter` (cheap — stops
 * after the closing `---`), so this scales to thousands of files.
 */
export async function indexVaultTitles(
  rootPath: string,
): Promise<Map<string, WikilinkTarget[]>> {
  const tree = await markdownFiles.listTree(rootPath);
  const index = new Map<string, WikilinkTarget[]>();
  await walk(tree, '', async (relPath) => {
    let text: string;
    try {
      text = await markdownFiles.readFile(rootPath, relPath);
    } catch {
      return;
    }
    const identity = readFrontmatterIdentity(text);
    const title = identity.title ?? deriveTitleFromPath(relPath);
    const target: WikilinkTarget = {
      title,
      path: relPath,
      hypratiaId: identity.hypratiaId ?? identity.legacyId,
    };
    const list = index.get(title) ?? [];
    list.push(target);
    index.set(title, list);
  });
  return index;
}

/**
 * Resolve a `hypratia_id` (or legacy `id`) to its on-disk file. The match
 * is by frontmatter, NOT by filename — that's why renaming a file in
 * Obsidian doesn't break Hypratia's link tracking.
 */
export async function resolveByHypratiaId(
  rootPath: string,
  hypratiaId: string,
): Promise<{ path: string; title: string } | null> {
  const tree = await markdownFiles.listTree(rootPath);
  let hit: { path: string; title: string } | null = null;
  await walk(tree, '', async (relPath) => {
    if (hit) return;
    let text: string;
    try {
      text = await markdownFiles.readFile(rootPath, relPath);
    } catch {
      return;
    }
    const identity = readFrontmatterIdentity(text);
    const id = identity.hypratiaId ?? identity.legacyId;
    if (id === hypratiaId) {
      hit = {
        path: relPath,
        title: identity.title ?? deriveTitleFromPath(relPath),
      };
    }
  });
  return hit;
}

/**
 * Append a back-and-forth wikilink between two nodes' Markdown files.
 * Refactored to use the natural-wikilink builder; the `## Canvas Links`
 * section pattern stays the same.
 */
export async function syncWikiLinkBetweenNodes(
  rootPath: string,
  source: CanvasNode,
  target: CanvasNode,
  titleCounts?: ReadonlyMap<string, number>,
): Promise<void> {
  if (!source.mdPath || !target.mdPath) return;

  const sourceContent = await markdownFiles.readFile(rootPath, source.mdPath);
  const sourceNext = appendWikiLink(
    sourceContent,
    {
      title: wikiTitle(target),
      path: target.mdPath,
      hypratiaId: target.id,
    },
    titleCounts,
  );
  if (sourceNext !== sourceContent) {
    await markdownFiles.writeFile(rootPath, source.mdPath, sourceNext);
  }

  const targetContent = await markdownFiles.readFile(rootPath, target.mdPath);
  const targetNext = appendWikiLink(
    targetContent,
    {
      title: wikiTitle(source),
      path: source.mdPath,
      hypratiaId: source.id,
    },
    titleCounts,
  );
  if (targetNext !== targetContent) {
    await markdownFiles.writeFile(rootPath, target.mdPath, targetNext);
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type TreeNode = Awaited<ReturnType<(typeof markdownFiles)['listTree']>>;

async function walk(
  node: TreeNode,
  prefix: string,
  onFile: (relPath: string) => Promise<void> | void,
): Promise<void> {
  if (!node) return;
  const isFile = !Array.isArray(node.children);
  const here = prefix
    ? `${prefix}/${node.name}`.replace(/^\/+/, '')
    : node.name;
  if (isFile) {
    if (/\.(md|markdown)$/i.test(node.name)) {
      await onFile(here);
    }
    return;
  }
  for (const child of node.children ?? []) {
    const nextPrefix = node.name ? here : prefix;
    await walk(child as TreeNode, nextPrefix, onFile);
  }
}
