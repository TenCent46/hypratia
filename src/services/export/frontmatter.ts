import matter from 'gray-matter';

/**
 * Build a Markdown file with YAML frontmatter.
 *
 * Implementation note — we don't use `matter.stringify` because
 * `gray-matter`'s stringify path pulls in `js-yaml`'s binary-type
 * branch which references Node's `Buffer` global. WKWebView (Tauri 2
 * on macOS) doesn't ship that global, so every mirror write threw
 * `ReferenceError: Can't find variable: Buffer` and the entire
 * Knowledge-Base mirror silently produced zero files. The serializer
 * below covers exactly the shapes the mirror actually emits — primitive
 * scalars, string arrays, plain objects (positions, sizes) — without
 * touching `Buffer`.
 *
 * Parsing (`matter(text)`) ALSO touches `Buffer.from` via
 * `gray-matter/lib/to-file.js`, contrary to an earlier comment that
 * claimed the parse path was safe. The fix lives at the app entry
 * points: `src/lib/bufferPolyfill.ts` installs a minimal `Buffer`
 * shim before any module that imports gray-matter loads.
 */
export function buildMarkdown(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const fmText = stringifyFrontmatter(frontmatter);
  const head = fmText ? `---\n${fmText}\n---\n` : '';
  if (!body) return head;
  return body.startsWith('\n') ? `${head}${body}` : `${head}\n${body}`;
}

export function readFrontmatterId(text: string): string | null {
  try {
    const parsed = matter(text);
    const id = (parsed.data as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/**
 * Splice (or replace) the `aliases:` line in a Markdown frontmatter block
 * with the given list, deduped. Used by migrations that need the
 * title-as-alias to land in the file so Obsidian resolves `[[Title]]`
 * even if Hypratia stores the file under a slug-based filename.
 *
 * `mergeMarkdownWithHypratia` deliberately ignores non-`hypratia_*` keys
 * for safety, so this is a separate, opt-in surgical edit. Callers should
 * pre-merge any user aliases (e.g., via `mergeAliases`) before passing.
 */
export function applyAliasesToFrontmatter(
  markdown: string,
  aliases: readonly string[],
): string {
  if (aliases.length === 0) return markdown;
  const fmMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!fmMatch) return markdown;
  const fmBody = fmMatch[1];
  const aliasLineRe = /^aliases:\s.*$/m;
  const merged = Array.from(
    new Set(aliases.map((a) => a.trim()).filter(Boolean)),
  );
  if (merged.length === 0) return markdown;
  const aliasLine = `aliases: [${merged.map(yamlInlineString).join(', ')}]`;
  const nextFmBody = aliasLineRe.test(fmBody)
    ? fmBody.replace(aliasLineRe, aliasLine)
    : `${fmBody}\n${aliasLine}`;
  return markdown.replace(
    /^---\s*\n[\s\S]*?\n---\s*\n?/,
    `---\n${nextFmBody}\n---\n`,
  );
}

function yamlInlineString(s: string): string {
  if (/^[A-Za-z0-9_/:-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

/**
 * Hypratia-managed entries that live OUTSIDE the `hypratia_*` namespace
 * because Obsidian (and its plugin ecosystem) reads them by their
 * unprefixed names — `title` is what Front Matter Title displays in
 * the file explorer, `aliases` is what the wikilink resolver matches,
 * `id` is the public-facing identity. Hypratia owns the *values* but
 * the *keys* belong to the public schema.
 *
 *   - `set` keys are overwritten on every sync (Hypratia is the source
 *     of truth). Pass `undefined` to remove a key.
 *   - `ensureAliases` entries are MERGED into the existing aliases
 *     list, preserving user-added aliases. Duplicates are deduped.
 */
export type PublicPatch = {
  set?: Record<string, unknown>;
  ensureAliases?: string[];
};

/**
 * Merge a Hypratia-owned frontmatter patch into an existing Markdown file
 * **without** touching user-defined keys. The two-namespace rule:
 *
 *   - Keys prefixed `hypratia_` belong to Hypratia. They get replaced by
 *     the patch (or removed when the patch sets the key to `undefined`).
 *   - Every other key is user-owned (tags, plugin keys, Properties UI
 *     values…). Those pass through verbatim — UNLESS the optional
 *     `publicPatch` argument explicitly opts them in via `set` or
 *     `ensureAliases`. The `publicPatch` mechanism exists so Hypratia
 *     can also manage well-known Obsidian keys (`id`, `title`,
 *     `aliases`, `hypratiaType`) without giving up the namespace
 *     safety on everything else.
 *
 * `body` is optional. When `undefined`, the existing body is preserved —
 * which is what most callers want (we are updating provenance metadata,
 * not the prose). Pass an explicit string to replace the body.
 *
 * The hypratia patch can carry only `hypratia_*` keys; non-prefixed
 * entries are dropped silently so accidental misuse can't corrupt the
 * user's vault.
 */
export function mergeMarkdownWithHypratia(
  existingMarkdown: string,
  hypratiaPatch: Record<string, unknown>,
  body?: string,
  publicPatch?: PublicPatch,
): string {
  const parsed = matter(existingMarkdown ?? '');
  const userData: Record<string, unknown> = { ...parsed.data };

  // Apply the hypratia_* patch in place. We deliberately keep keys that
  // appear in `userData` but not in `hypratiaPatch` — drift between
  // releases (e.g. a key we used to write but no longer set) is ignored
  // rather than scrubbed, so old data survives a downgrade.
  for (const [key, value] of Object.entries(hypratiaPatch)) {
    if (!key.startsWith('hypratia_')) continue;
    if (value === undefined) {
      delete userData[key];
    } else {
      userData[key] = value;
    }
  }

  // Apply the public patch. `set` overwrites because the value is
  // Hypratia-derived (e.g. the current node title). `ensureAliases`
  // merges so the user's own aliases survive a sync.
  if (publicPatch?.set) {
    for (const [key, value] of Object.entries(publicPatch.set)) {
      if (value === undefined) {
        delete userData[key];
      } else {
        userData[key] = value;
      }
    }
  }
  if (publicPatch?.ensureAliases && publicPatch.ensureAliases.length > 0) {
    userData.aliases = mergeAliases(userData.aliases, publicPatch.ensureAliases);
  }

  const nextBody = body !== undefined ? body : parsed.content;
  return buildMarkdown(userData, nextBody);
}

/**
 * Combine an existing aliases value (string, string[], or absent) with
 * a list of Hypratia-required entries. Returns a deduped `string[]`,
 * preserving the original order of user-added entries first.
 */
function mergeAliases(
  existing: unknown,
  ensure: readonly string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  function push(s: unknown) {
    if (typeof s !== 'string') return;
    const trimmed = s.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  }
  if (Array.isArray(existing)) {
    for (const v of existing) push(v);
  } else if (typeof existing === 'string') {
    push(existing);
  }
  for (const v of ensure) push(v);
  return out;
}

// ---- internal -----------------------------------------------------------

function stringifyFrontmatter(fm: Record<string, unknown>): string {
  const entries = Object.entries(fm).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  return entries
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join('\n');
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return formatString(value);
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return formatArray(value);
  if (typeof value === 'object') return formatObject(value as Record<string, unknown>);
  return formatString(String(value));
}

function formatString(value: string): string {
  if (value === '') return '""';
  // Conservative quoting — when in doubt, double-quote. The cost is one
  // extra pair of quotes; the cost of NOT quoting a value that the YAML
  // parser then mis-reads is a frontmatter that gets rejected forever.
  if (
    /^[\s]/.test(value) ||
    /[\s]$/.test(value) ||
    /[:#&*!|>'"%@`{}[\],\n\r\t]/.test(value) ||
    /^(?:true|false|null|~|-?\d|\.\d|yes|no|on|off)$/i.test(value)
  ) {
    return `"${value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')}"`;
  }
  return value;
}

function formatArray(arr: unknown[]): string {
  if (arr.length === 0) return '[]';
  // Flow-style inline array. Our callers only ever store arrays of
  // primitives (tag lists, message ids) — the JSON fallback inside
  // `formatObject` covers any future weird-shape values.
  return `[${arr.map(formatValue).join(', ')}]`;
}

function formatObject(obj: Record<string, unknown>): string {
  // JSON is a valid YAML subset for our shapes (positions, sizes,
  // simple records), and using JSON here keeps the serializer free of
  // any YAML library dependency.
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    safe[k] = v;
  }
  return JSON.stringify(safe);
}
