import { EditorSelection, type ChangeSpec, type EditorState } from '@codemirror/state';
import { EditorView, type KeyBinding } from '@codemirror/view';

/**
 * Map of typed-character → wrap delimiters. Keys are the characters the
 * user types; values are the surrounding strings inserted before / after
 * a non-empty selection. When a selection is already wrapped in the same
 * pair we strip rather than re-wrap, so a second press toggles off.
 */
const WRAP_PAIRS: Record<string, [string, string]> = {
  '*': ['**', '**'],
  _: ['*', '*'],
  '`': ['`', '`'],
  '"': ['"', '"'],
  "'": ["'", "'"],
  '(': ['(', ')'],
  '[': ['[', ']'],
  '{': ['{', '}'],
  '=': ['==', '=='],
};

/** Pairs we also auto-close when the selection is empty. */
const AUTO_PAIR_EMPTY: Record<string, [string, string]> = {
  '(': ['(', ')'],
  '[': ['[', ']'],
  '{': ['{', '}'],
  '"': ['"', '"'],
  "'": ["'", "'"],
};

function applyWrap(
  state: EditorState,
  view: EditorView,
  open: string,
  close: string,
): boolean {
  const changes: ChangeSpec[] = [];
  const ranges: { anchor: number; head: number }[] = [];
  let any = false;
  for (const range of state.selection.ranges) {
    if (range.empty) {
      ranges.push({ anchor: range.from, head: range.to });
      continue;
    }
    any = true;
    const before = state.sliceDoc(
      Math.max(0, range.from - open.length),
      range.from,
    );
    const after = state.sliceDoc(
      range.to,
      Math.min(state.doc.length, range.to + close.length),
    );
    const inner = state.sliceDoc(range.from, range.to);

    if (before === open && after === close) {
      // Already wrapped — strip the markers and keep the inner selected.
      changes.push({
        from: range.from - open.length,
        to: range.from,
        insert: '',
      });
      changes.push({
        from: range.to,
        to: range.to + close.length,
        insert: '',
      });
      ranges.push({
        anchor: range.from - open.length,
        head: range.to - open.length,
      });
      continue;
    }
    if (
      inner.startsWith(open) &&
      inner.endsWith(close) &&
      inner.length >= open.length + close.length
    ) {
      // Selection already includes the markers — strip them inside.
      changes.push({
        from: range.from,
        to: range.to,
        insert: inner.slice(open.length, inner.length - close.length),
      });
      const newLen = inner.length - open.length - close.length;
      ranges.push({ anchor: range.from, head: range.from + newLen });
      continue;
    }
    changes.push({ from: range.from, to: range.from, insert: open });
    changes.push({ from: range.to, to: range.to, insert: close });
    ranges.push({
      anchor: range.from + open.length,
      head: range.to + open.length,
    });
  }
  if (!any) return false;
  view.dispatch(
    state.update({
      changes,
      selection: EditorSelection.create(
        ranges.map((r) => EditorSelection.range(r.anchor, r.head)),
      ),
      userEvent: 'input.wrap',
      scrollIntoView: true,
    }),
  );
  return true;
}

/**
 * Input handler that wraps non-empty selections when the user types one
 * of the trigger characters in `WRAP_PAIRS`. For empty selections, only
 * the `AUTO_PAIR_EMPTY` characters are auto-closed; the rest fall
 * through so plain typing of `*`, `_`, `` ` ``, `=` still works.
 */
export function smartWrapInputHandler() {
  return EditorView.inputHandler.of((view, _from, _to, text) => {
    if (text.length !== 1) return false;
    const pair = WRAP_PAIRS[text];
    const state = view.state;
    if (pair && state.selection.ranges.some((r) => !r.empty)) {
      return applyWrap(state, view, pair[0], pair[1]);
    }
    const autoPair = AUTO_PAIR_EMPTY[text];
    if (autoPair && state.selection.ranges.every((r) => r.empty)) {
      const changes: ChangeSpec[] = [];
      const ranges: { anchor: number; head: number }[] = [];
      for (const range of state.selection.ranges) {
        changes.push({
          from: range.from,
          to: range.to,
          insert: autoPair[0] + autoPair[1],
        });
        ranges.push({
          anchor: range.from + autoPair[0].length,
          head: range.from + autoPair[0].length,
        });
      }
      view.dispatch(
        state.update({
          changes,
          selection: EditorSelection.create(
            ranges.map((r) => EditorSelection.range(r.anchor, r.head)),
          ),
          userEvent: 'input.autopair',
          scrollIntoView: true,
        }),
      );
      return true;
    }
    return false;
  });
}

/**
 * Shared command runner for the keymap commands below. Wraps the current
 * selection (or the word at the cursor if the selection is empty).
 */
function wrapSelectionOrWord(
  view: EditorView,
  open: string,
  close: string,
): boolean {
  const state = view.state;
  if (state.selection.ranges.every((r) => r.empty)) {
    const changes: ChangeSpec[] = [];
    const newRanges: { anchor: number; head: number }[] = [];
    let touched = false;
    for (const range of state.selection.ranges) {
      const word = state.wordAt(range.from);
      if (word) {
        const inner = state.sliceDoc(word.from, word.to);
        const before = state.sliceDoc(
          Math.max(0, word.from - open.length),
          word.from,
        );
        const after = state.sliceDoc(
          word.to,
          Math.min(state.doc.length, word.to + close.length),
        );
        if (before === open && after === close) {
          changes.push({ from: word.from - open.length, to: word.from, insert: '' });
          changes.push({ from: word.to, to: word.to + close.length, insert: '' });
          newRanges.push({
            anchor: word.from - open.length,
            head: word.to - open.length,
          });
          touched = true;
          continue;
        }
        changes.push({ from: word.from, to: word.from, insert: open });
        changes.push({ from: word.to, to: word.to, insert: close });
        newRanges.push({
          anchor: word.from + open.length,
          head: word.to + open.length,
        });
        touched = true;
        // Keep `inner` referenced to make grep-friendly intent clear.
        void inner;
      } else {
        // Insert empty pair and put cursor in the middle.
        changes.push({ from: range.from, to: range.to, insert: open + close });
        newRanges.push({
          anchor: range.from + open.length,
          head: range.from + open.length,
        });
        touched = true;
      }
    }
    if (!touched) return false;
    view.dispatch(
      state.update({
        changes,
        selection: EditorSelection.create(
          newRanges.map((r) => EditorSelection.range(r.anchor, r.head)),
        ),
        userEvent: 'input.wrap',
        scrollIntoView: true,
      }),
    );
    return true;
  }
  return applyWrap(state, view, open, close);
}

export function wrapKeymap(): KeyBinding[] {
  return [
    {
      key: 'Mod-b',
      run: (view) => wrapSelectionOrWord(view, '**', '**'),
    },
    {
      key: 'Mod-i',
      run: (view) => wrapSelectionOrWord(view, '*', '*'),
    },
    {
      key: 'Mod-e',
      run: (view) => wrapSelectionOrWord(view, '`', '`'),
    },
    {
      key: 'Mod-Shift-h',
      run: (view) => wrapSelectionOrWord(view, '==', '=='),
    },
    {
      key: 'Mod-Shift-x',
      run: toggleTaskCheckbox,
    },
  ];
}

/**
 * Toggle a Markdown task checkbox on the current line. Recognises:
 *   - [ ] foo  ↔  - [x] foo
 *   * [ ] foo  ↔  * [x] foo
 *   1. [ ] foo ↔  1. [x] foo
 * If the line is a list item without a checkbox, inserts `[ ] ` after
 * the bullet.
 */
function toggleTaskCheckbox(view: EditorView): boolean {
  const state = view.state;
  const changes: ChangeSpec[] = [];
  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    const text = line.text;
    const checked = text.match(/^(\s*(?:[-*+]|\d+\.)\s+)\[x\]\s/i);
    const unchecked = text.match(/^(\s*(?:[-*+]|\d+\.)\s+)\[ \]\s/);
    const listOnly = text.match(/^(\s*(?:[-*+]|\d+\.)\s+)/);
    if (checked) {
      const start = line.from + checked[1].length;
      changes.push({ from: start, to: start + 3, insert: '[ ]' });
    } else if (unchecked) {
      const start = line.from + unchecked[1].length;
      changes.push({ from: start, to: start + 3, insert: '[x]' });
    } else if (listOnly) {
      const insertAt = line.from + listOnly[1].length;
      changes.push({ from: insertAt, to: insertAt, insert: '[ ] ' });
    } else {
      // Promote bare line to a task.
      changes.push({ from: line.from, to: line.from, insert: '- [ ] ' });
    }
  }
  if (changes.length === 0) return false;
  view.dispatch(state.update({ changes, userEvent: 'input.task-toggle' }));
  return true;
}
