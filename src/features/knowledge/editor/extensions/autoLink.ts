import { EditorSelection } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/**
 * Auto-linkify URLs as the user types.
 *
 * When a recognisable URL is followed by a space or newline, wrap it with
 * `<…>` (CommonMark autolink) so the markdown parser highlights it as a
 * link without forcing the user to type the syntax. We only act on the
 * character that was just inserted (space or newline) so the rule never
 * surprises mid-edit. Wrapping in `<…>` rather than `[url](url)` keeps
 * the visible source compact and round-trips cleanly through Obsidian.
 */
const URL_RE = /(?:^|\s)((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,!?:;'"])$/i;

export function autoLinkifyUrls() {
  return ViewPlugin.fromClass(
    class {
      view: EditorView;
      constructor(view: EditorView) {
        this.view = view;
      }
      update(u: ViewUpdate) {
        if (!u.docChanged) return;
        // Only react to single-character inserts of space / newline.
        let inserted = '';
        u.changes.iterChanges((_fromA, _toA, _fromB, _toB, ins) => {
          inserted += ins.toString();
        });
        if (inserted.length !== 1) return;
        if (inserted !== ' ' && inserted !== '\n') return;
        // After the insert, look at the line up to (and including) the
        // typed space. If the chunk before it parses as a bare URL, wrap.
        const state = u.state;
        const sel = state.selection.main;
        if (!sel.empty) return;
        const cursor = sel.from;
        // The typed character lives just before the cursor.
        const lineFromCursor = state.doc.lineAt(cursor);
        const upTo = state.sliceDoc(lineFromCursor.from, cursor - 1); // strip the typed char
        const m = URL_RE.exec(upTo + ' '); // pad to make `\s$` match
        if (!m) return;
        const rawUrl = m[1];
        const urlStart = lineFromCursor.from + (upTo.length - rawUrl.length);
        const urlEnd = urlStart + rawUrl.length;
        // Already inside `<…>` or part of a markdown link? Skip.
        const before = state.sliceDoc(Math.max(0, urlStart - 1), urlStart);
        const after = state.sliceDoc(urlEnd, Math.min(state.doc.length, urlEnd + 1));
        if (before === '<' || before === '(' || before === '[') return;
        if (after === '>' || after === ')') return;
        // www.* gets an https:// prefix when wrapping so clicks open.
        const displayUrl = rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl;
        // Defer the dispatch so we don't re-enter the update cycle.
        queueMicrotask(() => {
          if (!this.view) return;
          this.view.dispatch({
            changes: [
              { from: urlStart, to: urlEnd, insert: `<${displayUrl}>` },
            ],
            // Wrapping shifts the cursor right by 2 (`<` + `>`).
            selection: EditorSelection.cursor(cursor + 2),
            userEvent: 'input.autolink',
          });
        });
      }
    },
  );
}

const PASTE_URL_RE = /^https?:\/\/\S+$|^mailto:\S+$/i;

/**
 * When the user pastes a URL while text is selected, replace the
 * selection with `[selected](pasted)` instead of overwriting it. This
 * matches the behaviour of every modern markdown editor and is one of
 * the most-requested keystrokes in the world.
 */
export function pasteLinkOverSelection() {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData;
      if (!data) return false;
      const text = data.getData('text/plain').trim();
      if (!text || !PASTE_URL_RE.test(text)) return false;
      const sel = view.state.selection.main;
      if (sel.empty) return false;
      const selectedText = view.state.sliceDoc(sel.from, sel.to);
      if (!selectedText) return false;
      const insert = `[${selectedText}](${text})`;
      event.preventDefault();
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert },
        selection: EditorSelection.cursor(sel.from + insert.length),
        userEvent: 'input.paste-link',
        scrollIntoView: true,
      });
      return true;
    },
  });
}
