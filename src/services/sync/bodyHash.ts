/**
 * Pure body-hash helpers for Hypratia ↔ vault conflict detection.
 *
 * The classifier needs a deterministic fingerprint of a Markdown note's
 * *body only* — the YAML frontmatter must NOT contribute, otherwise
 * Hypratia's own writes (which update `hypratia_*` keys) would look
 * like external edits and trigger spurious conflicts.
 *
 * Choice of hash: FNV-1a 32-bit. Crypto-grade collision resistance is
 * not required (we're detecting "did this change since last sync,"
 * not authenticating bytes). FNV-1a is fast, pure-JS, deterministic
 * across Node and the browser, and runs synchronously — important
 * because the classifier sits inside a per-file scan loop.
 *
 * Body normalization mirrors what the existing Refresh equality check
 * already does (`trimEnd` + LF line endings) so a vault file written
 * on Windows and read on macOS doesn't oscillate between conflict and
 * unchanged on every refresh.
 */

const FRONTMATTER_RE = /^---\s*\n[\s\S]*?\n---\s*\n?/;

/** Strip a leading `---\n…\n---` YAML frontmatter block, if present. */
export function stripFrontmatter(text: string): string {
  const m = text.match(FRONTMATTER_RE);
  if (!m) return text;
  return text.slice(m[0].length);
}

/**
 * Normalize body text before hashing:
 *
 *   1. CRLF → LF             — cross-platform stability
 *   2. strip leading newlines — `mergeMarkdownWithHypratia` injects a
 *                                blank line between frontmatter and
 *                                body, and the frontmatter stripper
 *                                regex eats it back out greedily on
 *                                read. Stripping leading `\n`s here
 *                                keeps the round-trip stable so the
 *                                first refresh after Force Re-sync
 *                                doesn't see a phantom diff.
 *   3. trimEnd                — same trailing-whitespace tolerance the
 *                                existing Refresh equality already used.
 *
 * Internal whitespace is preserved — that IS a meaningful edit.
 */
export function normalizeBody(body: string): string {
  return body.replace(/\r\n/g, '\n').replace(/^\n+/, '').trimEnd();
}

/** FNV-1a 32-bit, returned as 8-character lowercase hex. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Hash the Markdown body only — the public surface used by the
 * conflict classifier. Always strips frontmatter and applies
 * normalization first so callers don't have to remember the order.
 */
export function hashMarkdownBody(text: string): string {
  return fnv1a(normalizeBody(stripFrontmatter(text)));
}
