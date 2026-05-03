import { useEffect, useMemo, useState } from 'react';
import type { ImportedConversation } from '../../services/capture/ChatgptImporter';

/**
 * Plan 43 — list overlay shown after a `conversations.json` is dropped on
 * the canvas. Picks one conversation; the parent routes it through the
 * existing Capture Preview pipeline.
 */
export function ImportChatgptPicker({
  conversations,
  onPick,
  onClose,
}: {
  conversations: ImportedConversation[];
  onPick: (c: ImportedConversation) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true;
      return c.turns.some((t) => t.content.toLowerCase().includes(q));
    });
  }, [conversations, query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="import-chatgpt-overlay"
      role="dialog"
      aria-label="Import from ChatGPT export"
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <header className="import-chatgpt-header">
        <h2>Import from ChatGPT export</h2>
        <button
          type="button"
          className="capture-preview-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </header>
      <div className="import-chatgpt-search">
        <input
          autoFocus
          type="text"
          placeholder="Search title or content…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="import-chatgpt-count">
          {filtered.length} / {conversations.length}
        </span>
      </div>
      <ul className="import-chatgpt-list">
        {filtered.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="import-chatgpt-row"
              onClick={() => onPick(c)}
            >
              <span className="import-chatgpt-row-title">{c.title}</span>
              <span className="import-chatgpt-row-meta">
                {c.turns.length} turns ·{' '}
                {c.updatedAt ? c.updatedAt.slice(0, 10) : 'unknown date'}
                {c.model ? ` · ${c.model}` : ''}
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="import-chatgpt-empty">No matches.</li>
        ) : null}
      </ul>
    </div>
  );
}
