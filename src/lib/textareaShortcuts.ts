import type { KeyboardEvent } from 'react';

type Pair = { open: string; close: string };

const SINGLE_CHAR_PAIRS: Record<string, Pair> = {
  '*': { open: '*', close: '*' },
  _: { open: '_', close: '_' },
  '`': { open: '`', close: '`' },
  '"': { open: '"', close: '"' },
  "'": { open: "'", close: "'" },
  '(': { open: '(', close: ')' },
  '[': { open: '[', close: ']' },
  '{': { open: '{', close: '}' },
};

const CMD_PAIRS: Record<string, Pair> = {
  b: { open: '**', close: '**' },
  i: { open: '*', close: '*' },
};

/**
 * Obsidian-like text shortcuts for a textarea / contenteditable input.
 * Returns true if the keystroke was consumed and the caller should not run
 * its default behavior.
 */
export function handleObsidianShortcut(
  e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
  setValue: (next: string, cursor: { start: number; end: number }) => void,
): boolean {
  const target = e.currentTarget;
  if (!('selectionStart' in target)) return false;
  const value = target.value;
  const start = target.selectionStart ?? value.length;
  const end = target.selectionEnd ?? value.length;
  const hasSelection = end > start;
  const selection = value.slice(start, end);

  // Cmd/Ctrl shortcuts
  if (e.metaKey || e.ctrlKey) {
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'i') {
      e.preventDefault();
      const pair = CMD_PAIRS[k];
      const next =
        value.slice(0, start) +
        pair.open +
        selection +
        pair.close +
        value.slice(end);
      const offset = pair.open.length;
      setValue(next, {
        start: start + offset,
        end: end + offset,
      });
      return true;
    }
    if (k === 'k') {
      e.preventDefault();
      const linkText = hasSelection ? selection : 'link';
      const inserted = `[${linkText}](url)`;
      const next = value.slice(0, start) + inserted + value.slice(end);
      // Cursor on `url` for quick edit
      const urlStart = start + linkText.length + 3;
      setValue(next, {
        start: urlStart,
        end: urlStart + 3,
      });
      return true;
    }
  }

  // Single-character pair completion
  const pair = SINGLE_CHAR_PAIRS[e.key];
  if (pair && hasSelection) {
    e.preventDefault();
    const next =
      value.slice(0, start) +
      pair.open +
      selection +
      pair.close +
      value.slice(end);
    const offset = pair.open.length;
    setValue(next, {
      start: start + offset,
      end: end + offset,
    });
    return true;
  }

  // Auto-pair without selection: only for the bracketing pairs (not `*`, `_` etc.
  // which are common as single chars in regular writing).
  if (!hasSelection) {
    if (e.key === '(' || e.key === '[' || e.key === '{') {
      e.preventDefault();
      const p = SINGLE_CHAR_PAIRS[e.key];
      const next = value.slice(0, start) + p.open + p.close + value.slice(end);
      setValue(next, { start: start + 1, end: start + 1 });
      return true;
    }
  }

  return false;
}
