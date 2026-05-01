import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/**
 * Markdown highlight style that gives the live-preview surface a feel
 * closer to Obsidian's editor: large headings, distinct emphasis colours,
 * monospaced code, dimmed punctuation. The colours hook into the app's
 * CSS custom properties so light/dark themes are automatically picked
 * up — see `src/App.css` for the variables.
 */
export const kbHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.7em', fontWeight: '700', lineHeight: '1.2' },
  { tag: t.heading2, fontSize: '1.4em', fontWeight: '700', lineHeight: '1.25' },
  { tag: t.heading3, fontSize: '1.2em', fontWeight: '600' },
  { tag: t.heading4, fontWeight: '600' },
  { tag: t.heading5, fontWeight: '600' },
  { tag: t.heading6, fontWeight: '600' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--accent)' },
  { tag: t.monospace, fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)', color: 'var(--text)' },
  { tag: t.list, color: 'var(--text)' },
  { tag: t.quote, color: 'var(--text-mute)', fontStyle: 'italic' },
  { tag: t.processingInstruction, color: 'var(--text-mute)' },
  { tag: t.contentSeparator, color: 'var(--text-mute)' },
  { tag: t.meta, color: 'var(--text-mute)' },
]);

/** CodeMirror theme for Live Preview. Hooks into app CSS variables. */
export const kbLivePreviewTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent',
      color: 'var(--text)',
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-serif, ui-serif, Georgia, serif)',
      fontSize: '17px',
      lineHeight: '1.75',
      padding: '14px 0 64px',
    },
    '.cm-content': {
      maxWidth: '760px',
      margin: '0 auto',
      caretColor: 'var(--accent)',
    },
    '.cm-line': {
      padding: '0 4px',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--accent-soft)',
    },
    '.cm-kb-wikilink': {
      color: 'var(--accent)',
      textDecoration: 'underline',
      textDecorationStyle: 'dotted',
      cursor: 'pointer',
    },
    '.cm-kb-wikilink-broken': {
      color: 'var(--danger)',
      textDecorationStyle: 'wavy',
    },
    '.cm-panels': {
      backgroundColor: 'var(--bg)',
      color: 'var(--text)',
      borderTop: '1px solid var(--border)',
    },
    '.cm-search input, .cm-search button': {
      fontSize: '12px',
    },
  },
  { dark: false },
);

export const kbSourceTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent',
      color: 'var(--text)',
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)',
      fontSize: '13px',
      lineHeight: '1.55',
      padding: '8px 0 64px',
    },
    '.cm-content': {
      maxWidth: '900px',
      margin: '0 auto',
      caretColor: 'var(--accent)',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--accent-soft)',
    },
    '.cm-kb-wikilink': {
      color: 'var(--accent)',
      textDecoration: 'underline',
      textDecorationStyle: 'dotted',
      cursor: 'pointer',
    },
    '.cm-kb-wikilink-broken': {
      color: 'var(--danger)',
      textDecorationStyle: 'wavy',
    },
    '.cm-panels': {
      backgroundColor: 'var(--bg)',
      color: 'var(--text)',
      borderTop: '1px solid var(--border)',
    },
  },
  { dark: false },
);

export function kbThemeExtension(mode: 'live-preview' | 'source') {
  if (mode === 'source') {
    return [kbSourceTheme, syntaxHighlighting(kbHighlightStyle)];
  }
  return [kbLivePreviewTheme, syntaxHighlighting(kbHighlightStyle)];
}
