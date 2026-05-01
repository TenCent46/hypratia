import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { dialog } from '../../../../services/dialog';

/**
 * Markdown link click decoration. Marks both `[text](url)` and bare
 * `<url>` autolinks with `.cm-md-link` and intercepts Cmd/Ctrl+click on
 * them. Mirrors the wikilink Cmd-click pattern; image syntax `![alt](url)`
 * is intentionally skipped (those are handled by inline-image rendering,
 * not navigation).
 */
const INLINE_LINK_RE =
  /(?<!!)\[((?:[^\]\\]|\\.)*?)\]\((<?)([^)\s>]+)>?(?:\s+"[^"]*"|\s+'[^']*'|\s+\([^)]*\))?\)/g;
const AUTOLINK_RE =
  /<((?:https?|mailto|file|tel):[^>\s]+)>/gi;

export function markdownLinkClick(
  getRoot: () => string,
  getCurrentPath: () => string,
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) {
          this.decorations = this.build(u.view);
        }
      }
      build(view: EditorView): DecorationSet {
        // Collect spans across both regexes, then sort + dedupe so the
        // RangeSetBuilder receives ranges in document order. Without the
        // pre-sort an autolink earlier in the doc could arrive after a
        // later inline link and trip the builder's "out of order" guard.
        const spans: { from: number; to: number; href: string }[] = [];
        for (const { from, to } of view.visibleRanges) {
          const text = view.state.sliceDoc(from, to);
          for (const re of [INLINE_LINK_RE, AUTOLINK_RE]) {
            let m: RegExpExecArray | null;
            re.lastIndex = 0;
            while ((m = re.exec(text)) !== null) {
              const matchStart = from + m.index;
              const matchEnd = matchStart + m[0].length;
              const href =
                re === INLINE_LINK_RE ? m[3].trim() : m[1].trim();
              if (!href) continue;
              spans.push({ from: matchStart, to: matchEnd, href });
            }
          }
        }
        spans.sort((a, b) => a.from - b.from || a.to - b.to);
        const builder = new RangeSetBuilder<Decoration>();
        let lastEnd = -1;
        for (const span of spans) {
          if (span.from < lastEnd) continue;
          builder.add(
            span.from,
            span.to,
            Decoration.mark({
              class: 'cm-md-link',
              attributes: { 'data-href': span.href },
            }),
          );
          lastEnd = span.to;
        }
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(this, e: MouseEvent, view) {
          const target = e.target as HTMLElement | null;
          if (!target) return false;
          const link = target.closest('.cm-md-link') as HTMLElement | null;
          if (!link) return false;
          const onlyMod = e.metaKey || e.ctrlKey;
          if (!onlyMod) return false;
          const href = link.dataset.href;
          if (!href) return false;
          e.preventDefault();
          void openMarkdownLink(href, getRoot(), getCurrentPath());
          void view; // appease no-unused
          return true;
        },
      },
    },
  );
}

// Bare URL fallback: matches `https://...` / `http://...` / `mailto:...`
// anywhere in a line that isn't already inside `[](...)` or `<...>`.
// We don't tag these with the `cm-md-link` class (the line might be a
// raw URL the user wants to edit, not a click target), but the
// right-click menu still offers "Go to Link" if the cursor lands on one.
const BARE_URL_RE =
  /(?:https?:\/\/|mailto:|tel:)[^\s<>()\]]+/gi;

/**
 * Resolve the link href at a document position by scanning the line for
 * `[text](url)`, `<url>`, or a bare `http(s)://...` / `mailto:` URL.
 * Returns `null` when no link covers `pos`. Used by the editor
 * right-click menu so the user can pick "Go to Link" without first
 * wrapping the URL in markdown syntax.
 */
export function findLinkHrefAt(
  doc: string,
  pos: number,
): { href: string; from: number; to: number } | null {
  // Walk only the line containing `pos` to keep the scan cheap on large
  // documents. Markdown syntactic forms win over the bare URL fallback.
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
  const lineEndRaw = doc.indexOf('\n', pos);
  const lineEnd = lineEndRaw === -1 ? doc.length : lineEndRaw;
  const line = doc.slice(lineStart, lineEnd);
  const offset = pos - lineStart;
  for (const re of [INLINE_LINK_RE, AUTOLINK_RE, BARE_URL_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (offset < start || offset > end) continue;
      let href: string;
      if (re === INLINE_LINK_RE) href = m[3];
      else if (re === AUTOLINK_RE) href = m[1];
      else {
        // Bare URL: trim trailing punctuation that's almost never part
        // of the actual link (`https://example.com.` shouldn't open
        // with the period). Mirrors what most browsers do on auto-detect.
        href = m[0].replace(/[.,!?:;'"]+$/, '');
      }
      href = href.trim();
      if (!href) continue;
      return {
        href,
        from: lineStart + start,
        to: lineStart + start + href.length + (re === AUTOLINK_RE ? 2 : 0),
      };
    }
  }
  return null;
}

/** Public wrapper for the editor commands and right-click menu. */
export function openMarkdownLinkExternal(
  href: string,
  rootPath: string,
  currentPath: string,
): Promise<void> {
  return openMarkdownLink(href, rootPath, currentPath);
}

/**
 * Open a markdown-link URL with the right destination for its kind:
 *
 * - `https?:`, `mailto:`, `file:` and `tel:` → OS default app via the
 *   dialog/opener service.
 * - `#anchor` → in-doc anchor jump (dispatched as `mc:editor-jump-to-anchor`
 *   so the host can scroll without re-opening the file).
 * - Anything else → treated as a relative path under the markdown root and
 *   opened via the existing `mc:open-markdown-file` event. A `#frag` is
 *   carried along as `anchor` so the receiver can scroll to a heading.
 */
async function openMarkdownLink(
  rawHref: string,
  rootPath: string,
  currentPath: string,
) {
  const href = rawHref.replace(/^<|>$/g, '').trim();
  if (!href) return;
  if (/^(https?:|mailto:|file:|tel:)/i.test(href)) {
    try {
      await dialog.openWithSystem(href);
    } catch (err) {
      console.warn('[md-link] failed to open external link', href, err);
    }
    return;
  }
  if (href.startsWith('#')) {
    // In-doc anchor jump. Reuse the existing `mc:open-markdown-file`
    // path-already-loaded path so the editor scrolls without remounting.
    window.dispatchEvent(
      new CustomEvent('mc:open-markdown-file', {
        detail: {
          path: currentPath,
          anchor: { kind: 'block', id: href.slice(1) },
        },
      }),
    );
    return;
  }
  // Relative file reference. Strip a leading `./` and split off any `#frag`.
  const cleaned = href.replace(/^\.\//, '');
  const hashIdx = cleaned.indexOf('#');
  const filePart =
    hashIdx >= 0 ? cleaned.slice(0, hashIdx) : cleaned;
  const anchor = hashIdx >= 0 ? cleaned.slice(hashIdx + 1) : undefined;
  if (!filePart) {
    if (anchor) {
      window.dispatchEvent(
        new CustomEvent('mc:open-markdown-file', {
          detail: {
            path: currentPath,
            anchor: { kind: 'block', id: anchor },
          },
        }),
      );
    }
    return;
  }
  // Carry rootPath in the event for hosts that resolve absolute paths;
  // existing wikilink consumers ignore it and resolve their own paths.
  window.dispatchEvent(
    new CustomEvent('mc:open-markdown-file', {
      detail: anchor
        ? { path: filePart, anchor: { kind: 'block', id: anchor }, rootPath }
        : { path: filePart, rootPath },
    }),
  );
}
