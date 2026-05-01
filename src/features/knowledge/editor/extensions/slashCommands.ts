import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Obsidian-style slash quick-switcher inside the editor.
 *
 * When the user types `/` at the start of a (whitespace-only) line, an
 * autocomplete popup appears with editor-scoped commands. Selecting one
 * inserts a snippet (heading, list, callout, link, table) or runs a
 * dispatcher that calls a known editor command via window events. The
 * goal is parity with the most-used Obsidian slash entries — not the
 * full plugin-driven catalog.
 */

type SlashAction =
  | { kind: 'insert'; text: string; cursorOffset?: number }
  | { kind: 'event'; event: string; detail?: Record<string, unknown> };

type SlashCommand = {
  label: string;
  detail?: string;
  action: SlashAction;
};

const COMMANDS: SlashCommand[] = [
  { label: 'Heading 1', detail: '# Heading', action: { kind: 'insert', text: '# ', cursorOffset: 2 } },
  { label: 'Heading 2', detail: '## Heading', action: { kind: 'insert', text: '## ', cursorOffset: 3 } },
  { label: 'Heading 3', detail: '### Heading', action: { kind: 'insert', text: '### ', cursorOffset: 4 } },
  { label: 'Bullet list', detail: '- item', action: { kind: 'insert', text: '- ', cursorOffset: 2 } },
  { label: 'Numbered list', detail: '1. item', action: { kind: 'insert', text: '1. ', cursorOffset: 3 } },
  { label: 'Task', detail: '- [ ] task', action: { kind: 'insert', text: '- [ ] ', cursorOffset: 6 } },
  { label: 'Quote', detail: '> quote', action: { kind: 'insert', text: '> ', cursorOffset: 2 } },
  { label: 'Code block', detail: '```', action: { kind: 'insert', text: '```\n\n```\n', cursorOffset: 4 } },
  { label: 'Callout: note', detail: '> [!note]', action: { kind: 'insert', text: '> [!note] ', cursorOffset: 10 } },
  { label: 'Callout: warning', detail: '> [!warning]', action: { kind: 'insert', text: '> [!warning] ', cursorOffset: 13 } },
  { label: 'Callout: tip', detail: '> [!tip]', action: { kind: 'insert', text: '> [!tip] ', cursorOffset: 9 } },
  {
    label: 'Insert wikilink',
    detail: '[[Note]]',
    action: { kind: 'insert', text: '[[', cursorOffset: 2 },
  },
  {
    label: 'Insert table',
    detail: '| col | col |',
    action: {
      kind: 'insert',
      text: '| col | col |\n| --- | --- |\n|     |     |\n',
      cursorOffset: 0,
    },
  },
  {
    label: 'Save',
    action: { kind: 'event', event: 'mc:editor-save' },
  },
  {
    label: 'Close editor',
    action: { kind: 'event', event: 'mc:editor-close' },
  },
];

function applySlashCommand(view: EditorView, from: number, to: number, cmd: SlashCommand) {
  const action = cmd.action;
  if (action.kind === 'event') {
    // Erase the `/query` token and dispatch.
    view.dispatch({
      changes: { from, to, insert: '' },
      userEvent: 'input.slash-command',
    });
    window.dispatchEvent(new CustomEvent(action.event, { detail: action.detail }));
    return;
  }
  const insert = action.text;
  const cursorAt = from + (action.cursorOffset ?? insert.length);
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(cursorAt),
    userEvent: 'input.slash-command',
  });
  view.focus();
}

export function slashCommandCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match `/query` only when at the start of a line (with possible leading
  // whitespace). This avoids hijacking literal slashes inside URLs.
  const match = context.matchBefore(/(^|\n)\s*\/[\w-]*$/);
  if (!match) return null;
  const slashIdx = match.text.lastIndexOf('/');
  const from = match.from + slashIdx;
  const query = match.text.slice(slashIdx + 1).toLowerCase();
  const ranked = COMMANDS.filter((c) => {
    if (!query) return true;
    return c.label.toLowerCase().includes(query);
  });
  const options: Completion[] = ranked.map((cmd) => ({
    label: `/${cmd.label}`,
    detail: cmd.detail,
    apply: (view, _completion, applyFrom, applyTo) => {
      applySlashCommand(view, applyFrom, applyTo, cmd);
    },
  }));
  return {
    from,
    options,
    filter: false,
  };
}
