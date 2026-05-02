// Rehype plugin: detect knowledge_search citations in rendered text and
// rewrite them as `<a href="mc:cite/...">` links. Citation grammar matches
// `citationForChunk` in services/knowledge/projectRetrievalCore.ts:
//
//   [filename.ext, p. 5]
//   [filename.ext, pp. 5-7]
//   [filename.ext, sentences 12-18]
//
// The `mc:cite/` href is consumed by MarkdownRenderer's `a` component
// override, which dispatches an `mc:open-knowledge-citation` event with
// the parsed metadata. App.tsx listens for that event and opens the
// matching knowledge file (with optional pageStart for PDF jump).

type HastText = { type: 'text'; value: string };
type HastElement = {
  type: 'element';
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastChild[];
};
type HastChild = HastText | HastElement | { type: string; [key: string]: unknown };
type HastRoot = { type: 'root'; children: HastChild[] };

const CITATION_RE =
  /\[([^,[\]]+\.[A-Za-z0-9]{1,8}),\s*(?:(pp?\.)\s*(\d+)(?:-(\d+))?|sentences\s+(\d+)-(\d+))\s*\]/g;

// Some model outputs accidentally wrap citations in malformed Markdown
// links, e.g. `[Democracy.pdf, pp. 13-14](''')`. ReactMarkdown then
// emits an <a href="'''"> whose label may no longer include the closing
// bracket. This relaxed parser lets the click handler recover the
// citation from the visible label instead of following the broken href.
const LOOSE_CITATION_RE =
  /\[?\s*([^,[\]]+\.[A-Za-z0-9]{1,8}),\s*(?:(pp?\.)\s*(\d+)(?:-(\d+))?|sentences\s+(\d+)-(\d+))\s*\]?/;

export type ParsedCitation = {
  raw: string;
  filename: string;
  pageStart?: number;
  pageEnd?: number;
  sentenceStart?: number;
  sentenceEnd?: number;
};

function parseMatch(match: RegExpMatchArray): ParsedCitation | null {
  const filename = match[1]?.trim();
  if (!filename) return null;
  if (match[3]) {
    const pageStart = Number(match[3]);
    const pageEnd = match[4] ? Number(match[4]) : pageStart;
    if (!Number.isFinite(pageStart)) return null;
    return { raw: match[0], filename, pageStart, pageEnd };
  }
  if (match[5] && match[6]) {
    const sentenceStart = Number(match[5]);
    const sentenceEnd = Number(match[6]);
    if (!Number.isFinite(sentenceStart) || !Number.isFinite(sentenceEnd)) {
      return null;
    }
    return { raw: match[0], filename, sentenceStart, sentenceEnd };
  }
  return null;
}

export function parseCitationText(text: string): ParsedCitation | null {
  CITATION_RE.lastIndex = 0;
  const match = CITATION_RE.exec(text);
  if (match) return parseMatch(match);
  const loose = LOOSE_CITATION_RE.exec(text);
  return loose ? parseMatch(loose) : null;
}

export function buildCitationHref(c: ParsedCitation): string {
  const params = new URLSearchParams();
  if (c.pageStart !== undefined) params.set('pageStart', String(c.pageStart));
  if (c.pageEnd !== undefined) params.set('pageEnd', String(c.pageEnd));
  if (c.sentenceStart !== undefined)
    params.set('sentenceStart', String(c.sentenceStart));
  if (c.sentenceEnd !== undefined)
    params.set('sentenceEnd', String(c.sentenceEnd));
  const qs = params.toString();
  return `mc:cite/${encodeURIComponent(c.filename)}${qs ? `?${qs}` : ''}`;
}

export function parseCitationHref(href: string): {
  filename: string;
  pageStart?: number;
  pageEnd?: number;
  sentenceStart?: number;
  sentenceEnd?: number;
} | null {
  if (!href.startsWith('mc:cite/')) return null;
  const rest = href.slice('mc:cite/'.length);
  const [encoded, query] = rest.split('?');
  const filename = decodeURIComponent(encoded);
  const params = new URLSearchParams(query ?? '');
  const num = (key: string) => {
    const v = params.get(key);
    if (v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    filename,
    pageStart: num('pageStart'),
    pageEnd: num('pageEnd'),
    sentenceStart: num('sentenceStart'),
    sentenceEnd: num('sentenceEnd'),
  };
}

/**
 * Walk text nodes and split each one around citation matches, emitting
 * `<a href="mc:cite/...">` for each. Skips text inside `<a>`, `<code>`,
 * `<pre>`, `<style>`, `<script>` to avoid double-wrapping or breaking
 * code blocks that happen to contain a similar pattern.
 */
export function rehypeKnowledgeCitations() {
  const SKIP_TAGS = new Set(['a', 'code', 'pre', 'style', 'script']);
  return (tree: HastRoot) => {
    const walk = (parent: HastRoot | HastElement) => {
      const next: HastChild[] = [];
      for (const child of parent.children) {
        if (child.type === 'element') {
          const el = child as HastElement;
          if (!SKIP_TAGS.has(el.tagName)) walk(el);
          next.push(child);
          continue;
        }
        if (child.type !== 'text') {
          next.push(child);
          continue;
        }
        const text = (child as HastText).value;
        CITATION_RE.lastIndex = 0;
        let lastIndex = 0;
        let match: RegExpExecArray | null = CITATION_RE.exec(text);
        if (!match) {
          next.push(child);
          continue;
        }
        while (match) {
          const parsed = parseMatch(match);
          if (!parsed) {
            CITATION_RE.lastIndex = match.index + match[0].length;
            match = CITATION_RE.exec(text);
            continue;
          }
          if (match.index > lastIndex) {
            next.push({
              type: 'text',
              value: text.slice(lastIndex, match.index),
            });
          }
          next.push({
            type: 'element',
            tagName: 'a',
            properties: {
              href: buildCitationHref(parsed),
              className: ['kb-citation'],
              'data-citation-filename': parsed.filename,
              ...(parsed.pageStart !== undefined
                ? { 'data-citation-page-start': String(parsed.pageStart) }
                : {}),
              ...(parsed.pageEnd !== undefined
                ? { 'data-citation-page-end': String(parsed.pageEnd) }
                : {}),
              ...(parsed.sentenceStart !== undefined
                ? {
                    'data-citation-sentence-start': String(
                      parsed.sentenceStart,
                    ),
                  }
                : {}),
              ...(parsed.sentenceEnd !== undefined
                ? { 'data-citation-sentence-end': String(parsed.sentenceEnd) }
                : {}),
              title: `Open ${parsed.filename}${
                parsed.pageStart !== undefined
                  ? ` at page ${parsed.pageStart}`
                  : ''
              }`,
            },
            children: [{ type: 'text', value: match[0] }],
          });
          lastIndex = match.index + match[0].length;
          match = CITATION_RE.exec(text);
        }
        if (lastIndex < text.length) {
          next.push({ type: 'text', value: text.slice(lastIndex) });
        }
      }
      parent.children = next;
    };
    walk(tree);
  };
}
