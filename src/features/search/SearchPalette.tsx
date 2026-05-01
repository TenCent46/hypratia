import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../store';
import {
  highlightParts,
  search,
  type SearchResult,
} from '../../services/search/SearchService';

export function SearchPalette() {
  const open = useStore((s) => s.ui.searchOpen);
  const setOpen = useStore((s) => s.setSearchOpen);
  if (!open) return null;
  return <SearchPaletteInner onClose={() => setOpen(false)} />;
}

function SearchPaletteInner({ onClose }: { onClose: () => void }) {
  const conversations = useStore((s) => s.conversations);
  const messages = useStore((s) => s.messages);
  const nodes = useStore((s) => s.nodes);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const selectNode = useStore((s) => s.selectNode);
  const setActiveRightTab = useStore((s) => s.setActiveRightTab);
  const setViewMode = useStore((s) => s.setViewMode);
  const flow = useReactFlow();

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 80);
    return () => clearTimeout(id);
  }, [q]);

  const results: SearchResult[] = useMemo(
    () => search(debouncedQ, { conversations, messages, nodes }),
    [debouncedQ, conversations, messages, nodes],
  );

  function pick(r: SearchResult) {
    if (r.kind === 'conversation') {
      setViewMode('current');
      setActiveConversation(r.id);
    } else if (r.kind === 'message') {
      setViewMode('current');
      setActiveConversation(r.conversationId);
      setActiveRightTab('chat');
      setTimeout(() => {
        const el = document.querySelector(
          `[data-message-id="${r.id}"]`,
        ) as HTMLElement | null;
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('flash');
          setTimeout(() => el.classList.remove('flash'), 1200);
        }
      }, 50);
    } else {
      setViewMode('current');
      setActiveConversation(r.conversationId);
      selectNode(r.id);
      setActiveRightTab('inspect');
      setTimeout(() => {
        const target = nodes.find((n) => n.id === r.id);
        if (target)
          flow.setCenter(target.position.x, target.position.y, {
            zoom: 1.1,
            duration: 250,
          });
      }, 50);
    }
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="search-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search messages, nodes, conversations…"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        />
        <div className="search-results">
          {debouncedQ.trim().length === 0 ? (
            <div className="search-empty">Type to search.</div>
          ) : results.length === 0 ? (
            <div className="search-empty">No matching memory found.</div>
          ) : (
            results.map((r) => (
              <button
                key={`${r.kind}:${r.id}`}
                type="button"
                className={`search-row ${r.kind}`}
                onClick={() => pick(r)}
              >
                <span className={`badge ${r.kind}`}>{r.kind}</span>
                <span className="title">
                  <Hi text={titleFor(r)} q={debouncedQ} />
                </span>
                <span className="snippet">
                  <Hi text={r.snippet} q={debouncedQ} />
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function titleFor(r: SearchResult): string {
  if (r.kind === 'conversation') return r.title;
  if (r.kind === 'node') return r.title || '(untitled node)';
  return `${r.role} · ${r.conversationTitle}`;
}

function Hi({ text, q }: { text: string; q: string }) {
  const parts = highlightParts(text, q);
  return (
    <>
      {parts.map((p, i) =>
        p.match ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}
