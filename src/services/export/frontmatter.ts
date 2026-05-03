import matter from 'gray-matter';

/**
 * Build a Markdown file with YAML frontmatter.
 *
 * Implementation note — we used to delegate to `matter.stringify` here,
 * but `gray-matter`'s stringify path pulls in `js-yaml`'s binary type
 * branch which references Node's `Buffer` global. WKWebView (Tauri 2 on
 * macOS) doesn't ship that global, so every mirror write threw
 * `ReferenceError: Can't find variable: Buffer` and the entire
 * Knowledge-Base mirror silently produced zero files. The serializer
 * below covers exactly the shapes the mirror actually emits — primitive
 * scalars, string arrays, plain objects (positions, sizes) — without
 * touching `Buffer`.
 *
 * Parsing (`matter(text)`) does not hit the binary branch in practice,
 * so reads keep using `gray-matter`. See `readFrontmatterId` below.
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
 * Merge a Hypratia-owned frontmatter patch into an existing Markdown file
 * **without** touching user-defined keys. The two-namespace rule:
 *
 *   - Keys prefixed `hypratia_` belong to Hypratia. They get replaced by
 *     the patch (or removed when the patch sets the key to `undefined`).
 *   - Every other key is user-owned (title, tags, aliases, plugin keys,
 *     Properties UI values…). Those pass through verbatim.
 *
 * `body` is optional. When `undefined`, the existing body is preserved —
 * which is what most callers want (we are updating provenance metadata,
 * not the prose). Pass an explicit string to replace the body.
 *
 * The patch can carry only `hypratia_*` keys; non-prefixed entries are
 * dropped silently so accidental misuse can't corrupt the user's vault.
 */
export function mergeMarkdownWithHypratia(
  existingMarkdown: string,
  hypratiaPatch: Record<string, unknown>,
  body?: string,
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

  const nextBody = body !== undefined ? body : parsed.content;
  return buildMarkdown(userData, nextBody);
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
