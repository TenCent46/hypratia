import { markdownFiles } from '../../../services/storage/MarkdownFileService';
import { flattenMarkdownTree } from '../../../services/markdown/MarkdownContextResolver';

const TAG_RE = /(?:^|\s)#([\w/-]+)/g;
const FRONTMATTER_TAGS = /^tags:\s*(.*)$/im;

const cache = new Map<string, { ts: number; tags: { tag: string; count: number }[] }>();
const CACHE_TTL_MS = 30_000;

/**
 * Aggregate `#tag` mentions across the Knowledge Base. Tags from
 * `frontmatter.tags` (string list or comma-separated) count too.
 *
 * We cache the result for 30 seconds; the side panel re-reads on demand
 * but does not block the UI.
 */
export async function aggregateTags(rootPath: string): Promise<{ tag: string; count: number }[]> {
  if (!rootPath) return [];
  const cached = cache.get(rootPath);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.tags;
  const tree = await markdownFiles.listTree(rootPath);
  const files = flattenMarkdownTree(tree);
  const counts = new Map<string, number>();
  for (const file of files) {
    let content: string;
    try {
      content = await markdownFiles.readFile(rootPath, file.path);
    } catch {
      continue;
    }
    // Frontmatter tags.
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (fm) {
      const tagLine = fm[1].match(FRONTMATTER_TAGS);
      if (tagLine) {
        const raw = tagLine[1].trim();
        if (raw.startsWith('[')) {
          const inner = raw.slice(1, raw.length - 1);
          for (const t of inner.split(',')) {
            const cleaned = t.replace(/['"]/g, '').trim();
            if (cleaned) counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
          }
        } else {
          for (const t of raw.split(',')) {
            const cleaned = t.replace(/['"]/g, '').trim();
            if (cleaned) counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
          }
        }
      }
    }
    // Inline #tags.
    const body = fm ? content.slice(fm[0].length) : content;
    let m: RegExpExecArray | null;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(body)) !== null) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
  }
  const out = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  cache.set(rootPath, { ts: Date.now(), tags: out });
  return out;
}

/** Invalidate the tag cache — called when the KB tree refreshes. */
export function invalidateTagCache(): void {
  cache.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('mc:knowledge-tree-refresh', invalidateTagCache);
}
