import { useMemo, useRef, useState } from 'react';
import { MarkdownRenderer } from '../../services/markdown/MarkdownRenderer';
import { handleObsidianShortcut } from '../../lib/textareaShortcuts';

type Mode = 'edit' | 'preview' | 'split';
type Format = 'h2' | 'bold' | 'italic' | 'quote' | 'code' | 'link' | 'bullet' | 'check';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
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

export function MarkdownEditor({ value, onChange, onCommit }: Props) {
  const [mode, setMode] = useState<Mode>('edit');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const wordCount = useMemo(
    () => value.trim().split(/\s+/).filter(Boolean).length,
    [value],
  );

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

  return (
    <div className={`markdown-editor mode-${mode}`}>
      <div className="markdown-editor-toolbar" aria-label="Markdown formatting">
        <div className="editor-actions">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
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
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) =>
              handleObsidianShortcut(e, (next, sel) => {
                onChange(next);
                requestAnimationFrame(() => {
                  taRef.current?.focus();
                  taRef.current?.setSelectionRange(sel.start, sel.end);
                });
              })
            }
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
