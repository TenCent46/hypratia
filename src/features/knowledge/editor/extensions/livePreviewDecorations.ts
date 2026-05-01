import { syntaxTree } from '@codemirror/language';
import { type EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { dialog } from '../../../../services/dialog';

/**
 * Live-preview-style marker folding.
 *
 * Markdown markers (`*`, `**`, `# `, `[`, `]`, `` ` ``, etc.) are visually
 * collapsed to zero width when the cursor is **not** on the same line.
 * Moving onto the line reveals the markers again so the user can edit
 * them. This mirrors Obsidian's Live Preview behaviour without trying to
 * emulate the full WYSIWYG re-rendering.
 *
 * Implementation notes:
 *  - We walk the markdown syntax tree (provided by `@codemirror/lang-markdown`)
 *    rather than the raw text. That gives us reliable token boundaries
 *    for emphasis, strong, code, headings, links, etc.
 *  - The plugin only runs when the editor is in `live-preview` mode; the
 *    caller decides via the `enabled` accessor.
 */

type FoldRange = { from: number; to: number };

const HIDE = Decoration.replace({});

function activeLines(state: EditorState): Set<number> {
  const out = new Set<number>();
  for (const range of state.selection.ranges) {
    out.add(state.doc.lineAt(range.from).number);
    out.add(state.doc.lineAt(range.to).number);
  }
  return out;
}

function rangeOnActiveLine(state: EditorState, lines: Set<number>, from: number, to: number) {
  const line1 = state.doc.lineAt(from).number;
  const line2 = state.doc.lineAt(to).number;
  return lines.has(line1) || lines.has(line2);
}

/**
 * Collect the marker ranges we want to hide for the visible viewport.
 */
function collectFolds(view: EditorView): FoldRange[] {
  const state = view.state;
  const lines = activeLines(state);
  const folds: FoldRange[] = [];
  const tree = syntaxTree(state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        const name = node.name;
        const nFrom = node.from;
        const nTo = node.to;
        // Skip code blocks entirely — we keep them readable as-is.
        if (name === 'FencedCode' || name === 'CodeBlock' || name === 'InlineCode') {
          return;
        }
        // Hide ATX heading markers ("# ", "## " …).
        if (name === 'HeaderMark') {
          if (rangeOnActiveLine(state, lines, nFrom, nTo)) return;
          // Include the trailing space for a cleaner collapse.
          const after = state.sliceDoc(nTo, Math.min(state.doc.length, nTo + 1));
          const end = after === ' ' ? nTo + 1 : nTo;
          folds.push({ from: nFrom, to: end });
          return;
        }
        // Hide emphasis / strong / strikethrough markers.
        if (name === 'EmphasisMark' || name === 'StrongMark' || name === 'StrikethroughMark') {
          if (rangeOnActiveLine(state, lines, nFrom, nTo)) return;
          folds.push({ from: nFrom, to: nTo });
          return;
        }
        // Hide link / image scaffolding so the human-readable text in
        // `[text](url)` and `![alt](url)` reads as a clean link without
        // the surrounding brackets and URL. Allowlist only those two
        // parents — bare autolinks (`<https://example.com>`), link
        // reference definitions (`[1]: https://example.com`), and any
        // future container have no separate visible text, so folding
        // them would leave a blank line.
        if (name === 'LinkMark' || name === 'URL') {
          if (rangeOnActiveLine(state, lines, nFrom, nTo)) return;
          const parentName = node.node.parent?.name;
          if (parentName !== 'Link' && parentName !== 'Image') return;
          folds.push({ from: nFrom, to: nTo });
          return;
        }
      },
    });
  }
  // Sort and dedupe — `Decoration.set` requires sorted, non-overlapping
  // ranges in the order builder expects.
  folds.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: FoldRange[] = [];
  for (const r of folds) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to) {
      last.to = Math.max(last.to, r.to);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const r of collectFolds(view)) {
    builder.add(r.from, r.to, HIDE);
  }
  return builder.finish();
}

/**
 * Decoration plugin. Disabled when `enabled()` returns false; the
 * extension still loads but produces an empty decoration set, so
 * switching modes does not require rebuilding the editor view.
 */
export function livePreviewMarkerFold(enabled: () => boolean) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = enabled() ? buildDecorations(view) : Decoration.none;
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged) {
          this.decorations = enabled() ? buildDecorations(u.view) : Decoration.none;
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

/* ------------------------------------------------------------------ */
/* Live-preview widgets                                                */
/* ------------------------------------------------------------------ */

/**
 * Live-preview widgets. While the marker-fold plugin hides syntax, this
 * plugin replaces `![alt](url)` and `- [ ]` checkbox lines with proper
 * inline previews when the cursor is off the line.
 *
 * Goals:
 *  - Images: render `<img>` so users see the picture without leaving
 *    the editor. Clicking the image places the cursor on the line so
 *    the markdown source is editable again.
 *  - Tasks: render an interactive checkbox; toggling it dispatches a
 *    document change that flips `[ ]` ↔ `[x]`.
 *  - Horizontal rules: thin divider line.
 */

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly rootPath: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-md-image';
    img.alt = this.alt;
    img.src = resolveImageSrc(this.src, this.rootPath);
    img.loading = 'lazy';
    return img;
  }
  ignoreEvent() {
    // We want clicks to bubble so the user can place the caret inside
    // the image markdown by clicking near it.
    return false;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super();
  }
  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'cm-md-task-checkbox';
    input.checked = this.checked;
    input.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });
    input.addEventListener('click', (e) => {
      e.preventDefault();
      const next = this.checked ? ' ' : 'x';
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 1, insert: next },
        userEvent: 'input.task-toggle',
      });
    });
    return input;
  }
  ignoreEvent() {
    return false;
  }
}

class HrWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement('span');
    hr.className = 'cm-md-hr';
    return hr;
  }
}

function resolveImageSrc(src: string, _rootPath: string): string {
  // Remote URLs and data URIs are passed through; relative paths can be
  // wired up to the markdown root once the asset service exposes a
  // synchronous resolver. For now we let the browser handle anything
  // it knows how to load.
  if (/^(https?:|data:|file:|asset:|blob:)/i.test(src)) return src;
  return src;
}

function collectWidgets(
  view: EditorView,
  rootPath: string,
): DecorationSet {
  const state = view.state;
  const lines = activeLines(state);
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  const tree = syntaxTree(state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        const name = node.name;
        const nFrom = node.from;
        const nTo = node.to;
        // Image: ![alt](src). Replace whole node with <img>.
        if (name === 'Image') {
          if (rangeOnActiveLine(state, lines, nFrom, nTo)) return;
          const text = state.sliceDoc(nFrom, nTo);
          const m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(text);
          if (!m) return;
          const alt = m[1];
          const src = m[2];
          if (!src) return;
          ranges.push({
            from: nFrom,
            to: nTo,
            deco: Decoration.replace({
              widget: new ImageWidget(src, alt, rootPath),
            }),
          });
          return;
        }
        // Horizontal rule: replace the dashes/asterisks with a thin
        // divider widget, matching reading-view style.
        if (name === 'HorizontalRule') {
          if (rangeOnActiveLine(state, lines, nFrom, nTo)) return;
          ranges.push({
            from: nFrom,
            to: nTo,
            deco: Decoration.replace({ widget: new HrWidget() }),
          });
          return;
        }
        // Task checkbox: GFM lang-markdown emits TaskMarker for `[ ]`/
        // `[x]` after a list bullet. Replace with a real checkbox.
        if (name === 'TaskMarker') {
          const text = state.sliceDoc(nFrom, nTo);
          // TaskMarker spans `[ ]` or `[x]` (3 chars). The character we
          // toggle lives at position `nFrom + 1`.
          const checked = /\[x\]/i.test(text);
          ranges.push({
            from: nFrom,
            to: nTo,
            deco: Decoration.replace({
              widget: new TaskCheckboxWidget(checked, nFrom + 1),
            }),
          });
          return;
        }
      },
    });
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  let lastEnd = -1;
  for (const r of ranges) {
    if (r.from < lastEnd) continue;
    builder.add(r.from, r.to, r.deco);
    lastEnd = r.to;
  }
  return builder.finish();
}

/**
 * Live-preview widget plugin. Renders inline images and task checkboxes
 * so users see their markdown rendered while the cursor is elsewhere.
 *
 * Also installs a click handler that opens external URLs without
 * requiring Cmd/Ctrl when the cursor is not on the link's line — the
 * "click to follow, click again to edit" pattern most modern markdown
 * editors use.
 */
export function livePreviewWidgets(
  getRootPath: () => string,
  _getCurrentPath: () => string,
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = collectWidgets(view, getRootPath());
      }
      update(u: ViewUpdate) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          u.focusChanged
        ) {
          this.decorations = collectWidgets(u.view, getRootPath());
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        // Plain click on a styled markdown link opens it. We require the
        // cursor to be off the link's line so a user actively editing
        // the link source isn't yanked out into the browser.
        click(this, e: MouseEvent, view) {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
          if (e.button !== 0) return false;
          const target = e.target as HTMLElement | null;
          if (!target) return false;
          const linkEl = target.closest('.cm-md-link') as HTMLElement | null;
          if (!linkEl) return false;
          const href = linkEl.dataset.href;
          if (!href) return false;
          const pos = view.posAtDOM(linkEl);
          const line = view.state.doc.lineAt(pos).number;
          const cursorLines = activeLines(view.state);
          if (cursorLines.has(line)) return false;
          if (/^(https?:|mailto:|file:|tel:)/i.test(href)) {
            e.preventDefault();
            void dialog.openWithSystem(href).catch((err) => {
              console.warn('[live-preview] open link failed', href, err);
            });
            return true;
          }
          return false;
        },
      },
    },
  );
}
