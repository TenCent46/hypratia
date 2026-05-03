/**
 * Manual "Refresh from Vault" pass: pull markdown body changes from
 * `<vault>/Hypratia/Notes/*.md` back into the in-app store. The match is
 * by `hypratia_id` frontmatter — never by filename — so a note the user
 * renamed in Obsidian still finds its node.
 *
 * Pull-only and explicit. No file watching, no clobbering of node
 * positions or sidecar data. The user clicks a button; the function
 * scans, diffs, and updates `contentMarkdown` for changed nodes.
 *
 * Lives under `services/storage/` so the `@tauri-apps/*` import is in
 * the architectural allowlist.
 */

import { exists, readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { useStore } from '../../store';
import { readFrontmatterIdentity } from '../markdown/wikilinks';
import matter from 'gray-matter';

export type RefreshSummary = {
  scanned: number;
  matched: number;
  updated: number;
  skipped: number;
  unmatched: { path: string; reason: 'no-id' | 'unknown-id' }[];
};

/**
 * Scan `Hypratia/Notes/*.md` and `Hypratia/Conversations/*.md` for files
 * whose frontmatter `hypratia_id` matches a node in the store; update
 * `contentMarkdown` (body only, frontmatter stripped) when the body
 * differs. Returns a structured summary the UI can show as a toast.
 */
export async function refreshFromVault(
  vaultPath: string,
): Promise<RefreshSummary> {
  const summary: RefreshSummary = {
    scanned: 0,
    matched: 0,
    updated: 0,
    skipped: 0,
    unmatched: [],
  };

  const subfolders = ['Hypratia/Notes', 'Hypratia/Conversations'];
  const state = useStore.getState();
  const updateNode = state.updateNode;
  const nodesById = new Map(state.nodes.map((n) => [n.id, n]));

  for (const sub of subfolders) {
    const root = await join(vaultPath, sub);
    if (!(await exists(root))) continue;
    await walkMarkdown(root, vaultPath, async (relPath) => {
      summary.scanned += 1;
      let text: string;
      try {
        text = await readTextFile(await join(vaultPath, relPath));
      } catch {
        summary.skipped += 1;
        return;
      }
      const identity = readFrontmatterIdentity(text);
      const id = identity.hypratiaId ?? identity.legacyId;
      if (!id) {
        summary.unmatched.push({ path: relPath, reason: 'no-id' });
        summary.skipped += 1;
        return;
      }
      const node = nodesById.get(id);
      if (!node) {
        summary.unmatched.push({ path: relPath, reason: 'unknown-id' });
        summary.skipped += 1;
        return;
      }
      summary.matched += 1;
      // Strip the YAML frontmatter; we only mirror body changes back.
      const { content: body } = matter(text);
      const incoming = body.trimEnd();
      const current = (node.contentMarkdown ?? '').trimEnd();
      if (incoming === current) return;
      updateNode(node.id, { contentMarkdown: incoming });
      summary.updated += 1;
    });
  }
  return summary;
}

async function walkMarkdown(
  dirAbs: string,
  vaultRoot: string,
  onFile: (relPath: string) => Promise<void>,
): Promise<void> {
  const entries = await readDir(dirAbs);
  for (const entry of entries) {
    const childAbs = await join(dirAbs, entry.name);
    if (entry.isDirectory) {
      await walkMarkdown(childAbs, vaultRoot, onFile);
      continue;
    }
    if (!entry.isFile) continue;
    if (!/\.(md|markdown)$/i.test(entry.name)) continue;
    const rel = relativeFrom(vaultRoot, childAbs);
    await onFile(rel);
  }
}

function relativeFrom(root: string, abs: string): string {
  if (abs.startsWith(root)) {
    return abs.slice(root.length).replace(/^\/+/, '');
  }
  return abs;
}
