import type { EditorView } from '@codemirror/view';

/**
 * Single-slot registry for the currently mounted Markdown editor. The
 * spec only allows one editor at a time, so a module-scoped variable is
 * enough. Commands that need to reach the editor (Save, Close, Toggle
 * mode, Insert Wikilink) read this slot rather than crawling the DOM.
 */

export type EditorHandle = {
  view: EditorView;
  path: string;
  save: () => Promise<void> | void;
  close: () => void;
  toggleMode: (next: 'live-preview' | 'source' | 'reading') => void;
  isDirty: () => boolean;
  openInCanvas: () => Promise<void> | void;
};

let current: EditorHandle | null = null;
const listeners = new Set<(h: EditorHandle | null) => void>();

export function registerEditor(handle: EditorHandle): () => void {
  current = handle;
  listeners.forEach((l) => l(current));
  return () => {
    if (current === handle) {
      current = null;
      listeners.forEach((l) => l(null));
    }
  };
}

export function getCurrentEditor(): EditorHandle | null {
  return current;
}

export function subscribeEditor(cb: (h: EditorHandle | null) => void): () => void {
  listeners.add(cb);
  cb(current);
  return () => listeners.delete(cb);
}
