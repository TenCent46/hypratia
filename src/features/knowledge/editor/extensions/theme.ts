import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

export type MarkdownEditorMode = 'live-preview' | 'source';

/**
 * Markdown highlight style for Live Preview: large headings, distinct
 * emphasis colours, monospaced code, dimmed punctuation. Colours pull
 * from the app's CSS custom properties so the themes track.
 */
export const kbLivePreviewHighlightStyle = HighlightStyle.define([
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
  {
    tag: t.monospace,
    fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)',
    color: 'var(--text)',
  },
  { tag: t.list, color: 'var(--text)' },
  { tag: t.quote, color: 'var(--text-mute)', fontStyle: 'italic' },
  { tag: t.processingInstruction, color: 'var(--text-mute)' },
  { tag: t.contentSeparator, color: 'var(--text-mute)' },
  { tag: t.meta, color: 'var(--text-mute)' },
]);

/** Source mode keeps Markdown readable as code instead of prose. */
export const kbSourceHighlightStyle = HighlightStyle.define([
  { tag: t.heading, color: 'var(--accent)', fontWeight: '600' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--accent)' },
  { tag: t.monospace, color: 'var(--text)' },
  { tag: t.quote, color: 'var(--text-mute)' },
  { tag: t.processingInstruction, color: 'var(--text-mute)' },
  { tag: t.contentSeparator, color: 'var(--text-mute)' },
  { tag: t.meta, color: 'var(--text-mute)' },
]);

/**
 * Shared styles for the CodeMirror search / replace panel (Cmd+F).
 * Both `kbLivePreviewTheme` and `kbSourceTheme` spread this so the panel
 * always tracks the active app theme — without this, dark themes painted
 * white-on-white because the input field used browser defaults while the
 * panel inherited the dark-theme `color: var(--text)`.
 */
const cmSearchPanelStyle: Record<string, Record<string, string>> = {
  '.cm-panels': {
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    borderTop: '1px solid var(--border)',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid var(--border)',
    borderTop: 'none',
  },
  '.cm-panel.cm-search': {
    padding: '6px 8px',
    color: 'var(--text)',
  },
  '.cm-panel.cm-search input.cm-textfield': {
    backgroundColor: 'var(--bg-soft)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '3px 6px',
    fontSize: '12px',
  },
  '.cm-panel.cm-search input.cm-textfield:focus': {
    borderColor: 'var(--accent)',
    outline: 'none',
    boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent)',
  },
  '.cm-panel.cm-search input.cm-textfield::placeholder': {
    color: 'var(--text-mute)',
  },
  '.cm-panel.cm-search label': {
    color: 'var(--text-mute)',
    fontSize: '12px',
  },
  '.cm-panel.cm-search input[type="checkbox"]': {
    accentColor: 'var(--accent)',
  },
  '.cm-panel.cm-search .cm-button, .cm-panel.cm-search button': {
    backgroundColor: 'var(--bg-soft)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '2px 8px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  '.cm-panel.cm-search .cm-button:hover, .cm-panel.cm-search button:hover': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 14%, var(--bg-soft))',
  },
  '.cm-panel.cm-search button[name="close"]': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-mute)',
    fontSize: '14px',
  },
  '.cm-panel.cm-search button[name="close"]:hover': {
    color: 'var(--text)',
    backgroundColor: 'var(--bg-soft)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 55%, transparent)',
    color: 'var(--text)',
  },
};

/** CodeMirror theme for the document editor. Hooks into app CSS variables. */
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
    '.cm-md-link': {
      color: 'var(--accent)',
      textDecoration: 'underline',
      cursor: 'pointer',
    },
    ...cmSearchPanelStyle,
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
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
      fontSize: '13px',
      lineHeight: '1.65',
      padding: '14px 0 64px',
    },
    '.cm-content': {
      maxWidth: '900px',
      margin: '0 auto',
      caretColor: 'var(--accent)',
      whiteSpace: 'pre-wrap',
    },
    '.cm-line': {
      padding: '0 4px',
    },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--bg-soft) 65%, transparent)',
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
    '.cm-md-link': {
      color: 'var(--accent)',
      textDecoration: 'underline',
      cursor: 'pointer',
    },
    ...cmSearchPanelStyle,
  },
  { dark: false },
);

export function kbThemeExtension(mode: MarkdownEditorMode = 'live-preview') {
  return mode === 'source'
    ? [kbSourceTheme, syntaxHighlighting(kbSourceHighlightStyle)]
    : [kbLivePreviewTheme, syntaxHighlighting(kbLivePreviewHighlightStyle)];
}
