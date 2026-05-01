import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { confirmDangerTwice } from '../../lib/confirm';

export function ConversationSwitcher() {
  const conversations = useStore((s) => s.conversations);
  const activeId = useStore((s) => s.settings.lastConversationId);
  const setActive = useStore((s) => s.setActiveConversation);
  const create = useStore((s) => s.createConversation);
  const rename = useStore((s) => s.renameConversation);
  const remove = useStore((s) => s.removeConversation);

  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const popRef = useRef<HTMLDivElement>(null);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function onNew() {
    const id = create('Untitled');
    setActive(id);
    setOpen(false);
  }

  function commitRename(id: string) {
    const t = draft.trim();
    if (t) rename(id, t);
    setRenamingId(null);
    setDraft('');
  }

  return (
    <div className="conv-switcher" ref={popRef}>
      <button type="button" className="conv-trigger" onClick={() => setOpen((v) => !v)}>
        {active ? active.title : 'No conversation'}
        <span className="caret">▾</span>
      </button>
      {open ? (
        <div className="conv-popover">
          <div className="conv-list">
            {conversations.length === 0 ? (
              <div className="conv-empty">No conversations yet.</div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`conv-row${c.id === activeId ? ' active' : ''}`}
                >
                  {renamingId === c.id ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitRename(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(c.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="conv-pick"
                      onDoubleClick={() => {
                        setRenamingId(c.id);
                        setDraft(c.title);
                      }}
                      onClick={() => {
                        setActive(c.id);
                        setOpen(false);
                      }}
                    >
                      {c.kind === 'inbox' ? '📥 ' : c.kind === 'daily' ? '🗓 ' : ''}
                      {c.title}
                    </button>
                  )}
                  <button
                    type="button"
                    className="conv-delete"
                    title="Delete conversation"
                    onClick={() => {
                      if (
                        confirmDangerTwice({
                          title: `Delete conversation "${c.title}"?`,
                          detail:
                            'This will remove the conversation, its messages, canvas nodes, and connected edges.',
                          finalDetail:
                            'Second confirmation: permanently delete this conversation?',
                        })
                      ) {
                        remove(c.id);
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="conv-footer">
            <button type="button" onClick={onNew}>
              + New conversation
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
