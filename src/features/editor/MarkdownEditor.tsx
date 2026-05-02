import { useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownRenderer } from '../../services/markdown/MarkdownRenderer';
import { htmlToMarkdown } from '../../services/markdown/htmlToMarkdown';
import { handleObsidianShortcut } from '../../lib/textareaShortcuts';

type Mode = 'edit' | 'preview' | 'split';
type Format = 'h2' | 'bold' | 'italic' | 'quote' | 'code' | 'link' | 'bullet' | 'check';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  compact?: boolean;
  autoFocus?: boolean;
};

const ACTIONS: { id: Format; label: string; title: string }[] = [
  { id: 'h2', label: 'H2', title: 'Heading' },
  { id: 'bold', label: 'B', title: 'Bold' },
  { id: 'italic', label: 'I', title: 'Italic' },
  { id: 'quote', label: '❝', title: 'Quote' },
  { id: 'code', label: '{}', title: 'Code' },
  { id: 'link', label: '↗', title: 'Link' },
  { id: 'bullet', label: '•', title: 'Bullet list' },
  { id: 'check', label: '☐', title: 'Checklist' },
];

function wrapSelection(value: string, start: number, end: number, before: string, after = before, placeholder = 'text') {
  const selected = value.slice(start, end) || placeholder;
  return {
    next: `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`,
    start: start + before.length,
    end: start + before.length + selected.length,
  };
}

function prefixLines(value: string, start: number, end: number, prefix: string) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const selected = value.slice(lineStart, end);
  const nextSelected = selected
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join('\n');
  return {
    next: `${value.slice(0, lineStart)}${nextSelected}${value.slice(end)}`,
    start: lineStart,
    end: lineStart + nextSelected.length,
  };
}

function applyFormat(value: string, start: number, end: number, format: Format) {
  switch (format) {
    case 'h2':
      return prefixLines(value, start, end, '## ');
    case 'bold':
      return wrapSelection(value, start, end, '**');
    case 'italic':
      return wrapSelection(value, start, end, '_');
    case 'quote':
      return prefixLines(value, start, end, '> ');
    case 'code':
      return wrapSelection(value, start, end, '`', '`', 'code');
    case 'link':
      return wrapSelection(value, start, end, '[', '](https://)', 'link');
    case 'bullet':
      return prefixLines(value, start, end, '- ');
    case 'check':
      return prefixLines(value, start, end, '- [ ] ');
  }
}

export function MarkdownEditor({
  value,
  onChange,
  onCommit,
  onSubmit,
  onCancel,
  compact,
  autoFocus,
}: Props) {
  const [mode, setMode] = useState<Mode>('edit');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const wordCount = useMemo(
    () => value.trim().split(/\s+/).filter(Boolean).length,
    [value],
  );

  useEffect(() => {
    if (autoFocus && mode !== 'preview') {
      taRef.current?.focus();
    }
  }, [autoFocus, mode]);

  function format(action: Format) {
    const textarea = taRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const result = applyFormat(value, start, end, action);
    onChange(result.next);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(result.start, result.end);
    });
  }

  // Keep textarea focus when toolbar/mode buttons are clicked. Without this,
  // clicking a toolbar button blurs the textarea, and a parent that closes
  // on blur (e.g. inline canvas editing) would tear down the editor mid-edit.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  // Rich-paste handler. When the clipboard carries `text/html` (e.g. content
  // copied from ChatGPT, Claude, web pages, or word processors), convert it
  // to Markdown so bold / lists / code / links survive the round-trip. If
  // there's no HTML payload we let the browser do its default plain-text
  // paste — that's the right behavior for terminal output, code editors, etc.
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData('text/html');
    if (!html.trim()) return;
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value;
    void (async () => {
      const md = await htmlToMarkdown(html);
      if (!md) {
        // Conversion failed; fall back to the plain-text version of the
        // clipboard if any, so the user isn't left with a no-op paste.
        const plain = e.clipboardData.getData('text/plain');
        if (!plain) return;
        const next = before.slice(0, start) + plain + before.slice(end);
        onChange(next);
        return;
      }
      const next = before.slice(0, start) + md + before.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        const node = taRef.current;
        if (!node) return;
        const cursor = start + md.length;
        node.focus();
        node.setSelectionRange(cursor, cursor);
      });
    })();
  }

  return (
    <div
      className={`markdown-editor mode-${mode}${compact ? ' compact' : ''}`}
    >
      <div className="markdown-editor-toolbar" aria-label="Markdown formatting">
        <div className="editor-actions">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onMouseDown={keepFocus}
              onClick={() => format(action.id)}
              title={action.title}
              aria-label={action.title}
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className="editor-mode" role="group" aria-label="Editor mode">
          {(['edit', 'preview', 'split'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? 'active' : ''}
              onMouseDown={keepFocus}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="markdown-editor-body">
        {mode !== 'preview' ? (
          <textarea
            ref={taRef}
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={onPaste}
            onBlur={onCommit}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onSubmit?.();
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel?.();
                return;
              }
              handleObsidianShortcut(e, (next, sel) => {
                onChange(next);
                requestAnimationFrame(() => {
                  taRef.current?.focus();
                  taRef.current?.setSelectionRange(sel.start, sel.end);
                });
              });
            }}
            rows={14}
            spellCheck
            placeholder="Write in Markdown..."
          />
        ) : null}
        {mode !== 'edit' ? (
          <div className="markdown-editor-preview">
            <MarkdownRenderer markdown={value || '_Nothing written yet._'} />
          </div>
        ) : null}
      </div>
      <div className="markdown-editor-status">
        <span>{wordCount} words</span>
        <span>Markdown</span>
      </div>
    </div>
  );
}
