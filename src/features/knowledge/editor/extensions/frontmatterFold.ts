import { foldService } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

/**
 * Lightweight fold helper that lets the user collapse the leading YAML
 * frontmatter block (`---\n…\n---`) using CodeMirror's built-in fold
 * gutter. We do not implement a custom widget in Phase 1 — the standard
 * fold UI is enough to keep the YAML out of the way.
 */
export function frontmatterFold() {
  return foldService.of((state: EditorState, lineStart: number) => {
    if (lineStart !== 0) return null;
    const first = state.doc.lineAt(0);
    if (first.text.trim() !== '---') return null;
    let i = 2;
    while (i <= state.doc.lines) {
      const line = state.doc.line(i);
      if (line.text.trim() === '---') {
        return { from: first.to, to: line.from };
      }
      i += 1;
    }
    return null;
  });
}
