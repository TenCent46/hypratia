import { markdownFiles } from '../../../services/storage/MarkdownFileService';
import { flattenMarkdownTree } from '../../../services/markdown/MarkdownContextResolver';

export type OutlineEntry = {
  id: string;
  text: string;
  level: number;
  line: number; // 1-based
};

/**
 * Walk a Markdown document and produce a heading outline. We only
 * recognise ATX headings (`#`), which is what the rest of the codebase
 * emits, and we skip headings inside fenced code blocks so the outline
 * isn't polluted by sample syntax.
 */
export function extractOutline(doc: string): OutlineEntry[] {
  const lines = doc.split('\n');
  const out: OutlineEntry[] = [];
  let inFence = false;
  let fenceMarker = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s*(```|~~~)/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    out.push({
      id: `${i + 1}-${text.slice(0, 32)}`,
      text,
      level,
      line: i + 1,
    });
  }
  return out;
}

export type BacklinkEntry = {
  path: string;
  stem: string;
  snippet: string;
  line: number;
};

/** Strip frontmatter so backlink scanning ignores YAML keys. */
function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  return content.slice(end + 4);
}

/**
 * Scan the entire KB for `[[<currentStem>]]`, `[[<currentPath>]]`, or
 * an alias of either, and return the locations. Phase 1 reads files
 * lazily — fine for hundreds of notes, deliberately not a search
 * index. Pagination / indexing is on the deferred list.
 */
export async function findBacklinks(
  rootPath: string,
  currentPath: string,
): Promise<BacklinkEntry[]> {
  if (!rootPath || !currentPath) return [];
  const stem = (currentPath.split('/').pop() ?? '').replace(/\.md$/i, '');
  const tree = await markdownFiles.listTree(rootPath);
  const files = flattenMarkdownTree(tree);
  const re = new RegExp(
    `\\[\\[\\s*(?:${escapeRegExp(stem)}|${escapeRegExp(currentPath)})(?:#[^\\]|\\n]*)?(?:\\|[^\\]\\n]*)?\\s*\\]\\]`,
    'i',
  );
  const out: BacklinkEntry[] = [];
  for (const file of files) {
    if (file.path === currentPath) continue;
    let content: string;
    try {
      content = await markdownFiles.readFile(rootPath, file.path);
    } catch {
      continue;
    }
    const body = stripFrontmatter(content);
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (!re.test(lines[i])) continue;
      const start = Math.max(0, i - 0);
      const text = lines[start].trim();
      out.push({
        path: file.path,
        stem: file.name.replace(/\.md$/i, ''),
        snippet: text.length > 200 ? `${text.slice(0, 200)}…` : text,
        line: i + 1,
      });
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Locate a position inside `doc` that matches a wikilink anchor. Returns
 * the 1-based line number, or `null` if the anchor cannot be resolved.
 */
export function findAnchorLine(
  doc: string,
  anchor: { kind: 'heading'; text: string } | { kind: 'block'; id: string },
): number | null {
  const lines = doc.split('\n');
  if (anchor.kind === 'block') {
    const needle = `^${anchor.id}`;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].includes(needle)) return i + 1;
    }
    return null;
  }
  const text = anchor.text.toLowerCase();
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    if (m[1].trim().toLowerCase() === text) return i + 1;
  }
  return null;
}
