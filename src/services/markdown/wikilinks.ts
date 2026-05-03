/**
 * Pure wikilink helpers — no fs, no Tauri, no DOM. Lives separately from
 * `WikiLinkSyncService.ts` so the assertion test script can import these
 * without dragging the storage-coupled wrappers (and their `@tauri-apps/*`
 * imports) into Node.
 */

import matter from 'gray-matter';
import type { CanvasNode } from '../../types';

const SECTION_HEADING = '## Canvas Links';

export type WikilinkAnchor =
  | { kind: 'heading'; text: string }
  | { kind: 'block'; id: string };

/**
 * Split a wikilink target into a file part and an optional anchor. Mirrors
 * Obsidian's syntax:
 *   `Note#Heading`    → heading anchor
 *   `Note#^block-id`  → block-id anchor
 */
export function parseWikilinkTarget(target: string): {
  file: string;
  anchor: WikilinkAnchor | null;
} {
  const trimmed = target.trim();
  const hash = trimmed.indexOf('#');
  if (hash === -1) return { file: trimmed, anchor: null };
  const file = trimmed.slice(0, hash);
  const rest = trimmed.slice(hash + 1);
  if (rest.startsWith('^')) {
    return { file, anchor: { kind: 'block', id: rest.slice(1).trim() } };
  }
  return { file, anchor: { kind: 'heading', text: rest.trim() } };
}

export type WikilinkTarget = {
  title: string;
  path?: string;
  hypratiaId?: string;
};

export type FrontmatterIdentity = {
  /** Canonical Hypratia identity. New writes must use this key. */
  hypratiaId?: string;
  /** Legacy identity carried by `LLM-*` exports — read for backwards-compat. */
  legacyId?: string;
  title?: string;
  aliases?: string[];
};

/**
 * Render the human-visible title for a node. Strips characters that would
 * confuse the wikilink parser (`[`, `]`, newlines).
 */
export function wikiTitle(node: Pick<CanvasNode, 'title' | 'mdPath'>): string {
  const fromTitle = node.title?.trim();
  if (fromTitle) {
    return sanitizeTitleForWikilink(fromTitle);
  }
  const file = node.mdPath?.split('/').filter(Boolean).pop();
  return (file ?? 'Untitled').replace(/\.md$/i, '');
}

export function sanitizeTitleForWikilink(title: string): string {
  return title
    .split('[')
    .join(' ')
    .split(']')
    .join(' ')
    .replace(/\n|\r/g, ' ')
    .trim();
}

/**
 * Strip `.md` (and `.markdown`) for the path component of a path-form
 * wikilink. Obsidian resolves `[[Folder/Name]]` to `Folder/Name.md`.
 */
export function pathForWikilink(mdPath: string): string {
  return mdPath.replace(/\.(md|markdown)$/i, '');
}

function escapeAlias(alias: string): string {
  return alias.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\]/g, '');
}

/**
 * Title→count map. Pass to `buildNaturalWikilink` so it knows when it must
 * fall back to a path-form link to disambiguate. Counts are computed once
 * per export run, not per emitted link.
 */
export function buildTitleCounts(
  targets: readonly Pick<CanvasNode, 'title' | 'mdPath'>[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of targets) {
    const title = wikiTitle(t);
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  return counts;
}

/**
 * Build a natural Obsidian wikilink. Decision rule:
 *   - Title is unique in `titleCounts` (or `titleCounts` is omitted) →
 *     emit `[[Title]]`.
 *   - Title collides AND we have a `path` → emit `[[path|Title]]` so
 *     Obsidian can disambiguate while the visible alias stays the title.
 *   - Title collides but no `path` is available → emit `[[Title]]` anyway
 *     (caller's responsibility; the writer logs a warning elsewhere).
 *
 * NEVER emits `[[node-{id}|Title]]`. The `id` namespace is reserved for
 * frontmatter / sidecar identity.
 */
export function buildNaturalWikilink(
  target: WikilinkTarget,
  titleCounts?: ReadonlyMap<string, number>,
): string {
  const title = sanitizeTitleForWikilink(target.title || 'Untitled');
  const collides = (titleCounts?.get(title) ?? 0) > 1;
  if (collides && target.path) {
    return `[[${pathForWikilink(target.path)}|${escapeAlias(title)}]]`;
  }
  return `[[${escapeAlias(title)}]]`;
}

export function appendWikiLink(
  content: string,
  target: WikilinkTarget,
  titleCounts?: ReadonlyMap<string, number>,
): string {
  const link = buildNaturalWikilink(target, titleCounts);
  if (content.includes(link)) return content;
  const line = `- ${link}`;
  const sectionIndex = content.lastIndexOf(SECTION_HEADING);
  if (sectionIndex === -1) {
    const trimmed = content.trimEnd();
    return `${trimmed}${trimmed ? '\n\n' : ''}${SECTION_HEADING}\n\n${line}\n`;
  }
  const before = content.slice(0, sectionIndex);
  const section = content.slice(sectionIndex).trimEnd();
  return `${before}${section}\n${line}\n`;
}

/**
 * Read identity from a Markdown file's YAML frontmatter. Tolerant — never
 * throws; missing keys come back as `undefined`. Recognizes both the new
 * `hypratia_id` and the legacy `id` so older exports keep working.
 */
export function readFrontmatterIdentity(text: string): FrontmatterIdentity {
  let data: Record<string, unknown>;
  try {
    data = matter(text).data as Record<string, unknown>;
  } catch {
    return {};
  }
  const identity: FrontmatterIdentity = {};
  if (typeof data.hypratia_id === 'string') {
    identity.hypratiaId = data.hypratia_id;
  }
  if (typeof data.id === 'string') {
    identity.legacyId = data.id;
  }
  if (typeof data.title === 'string') {
    identity.title = data.title;
  }
  const aliases = data.aliases ?? data.alias;
  if (Array.isArray(aliases)) {
    identity.aliases = aliases.filter((v): v is string => typeof v === 'string');
  } else if (typeof aliases === 'string') {
    identity.aliases = [aliases];
  }
  return identity;
}

/**
 * Merge an alias list — preserves user-defined aliases, adds the title if
 * not already present. Returns a new array; never mutates input.
 *
 * Per the wikilink contract: "Preserve existing Obsidian aliases and user
 * frontmatter." Hypratia adds its title-as-alias so Obsidian can resolve
 * `[[Title]]` without our help, but never strips what the user wrote.
 */
export function mergeAliases(
  existing: readonly string[] | undefined,
  titleToAdd: string,
): string[] {
  const sanitized = sanitizeTitleForWikilink(titleToAdd);
  if (!sanitized) return Array.from(existing ?? []);
  const merged = Array.from(existing ?? []);
  if (!merged.some((a) => a.trim() === sanitized)) merged.push(sanitized);
  return merged;
}

export function deriveTitleFromPath(relPath: string): string {
  const base = relPath.split('/').filter(Boolean).pop() ?? 'Untitled';
  return base.replace(/\.(md|markdown)$/i, '');
}
