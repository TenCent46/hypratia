import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { getOrCreateInbox } from '../../services/daily/DailyNotes';

export function QuickCapture() {
  const open = useStore((s) => s.ui.quickCaptureOpen);
  if (!open) return null;
  return <QuickCaptureInner />;
}

function QuickCaptureInner() {
  const setOpen = useStore((s) => s.setQuickCaptureOpen);
  const addMessage = useStore((s) => s.addMessage);
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => taRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  function save() {
    const trimmed = text.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }
    const inboxId = getOrCreateInbox();
    addMessage(inboxId, 'user', trimmed);
    setText('');
    setOpen(false);
  }

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="quick-capture" onClick={(e) => e.stopPropagation()}>
        <div className="quick-capture-header">Quick capture → Inbox</div>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type. ⌘↵ to save."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        <div className="quick-capture-footer">
          <span className="muted">Goes to Inbox · ⌘↵ saves · Esc closes</span>
          <button type="button" onClick={save} className="primary">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
