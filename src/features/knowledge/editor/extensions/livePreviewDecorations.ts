import { syntaxTree } from '@codemirror/language';
import { type EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

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
        // Hide link / image scaffolding: keep the visible text only.
        if (name === 'LinkMark' || name === 'URL') {
          if (rangeOnActiveLine(state, lines, nFrom, nTo)) return;
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
