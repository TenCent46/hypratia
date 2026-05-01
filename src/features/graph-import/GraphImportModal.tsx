import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import {
  buildGraphFromText,
  type BuildSummary,
} from '../../services/graphBuilder';
import { modelLabel } from '../../services/llm';

const MAX_INPUT_BYTES = 200 * 1024;

export function GraphImportModal() {
  const open = useStore((s) => s.ui.graphImportOpen);
  if (!open) return null;
  return <GraphImportModalInner />;
}

function GraphImportModalInner() {
  const setOpen = useStore((s) => s.setGraphImportOpen);
  const ensureConversation = useStore((s) => s.ensureConversation);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BuildSummary | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => taRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => ctrlRef.current?.abort();
  }, []);

  function close() {
    if (busy) {
      ctrlRef.current?.abort();
    }
    setOpen(false);
  }

  async function onFileDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) {
      setError(
        `File is too large (${(file.size / 1024).toFixed(0)} KB). Cap is ${
          MAX_INPUT_BYTES / 1024
        } KB.`,
      );
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      setError(null);
    } catch (err) {
      setError(`Failed to read file: ${err instanceof Error ? err.message : err}`);
    }
  }

  async function build() {
    setError(null);
    setSummary(null);
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_INPUT_BYTES) {
      setError(
        `Input is too large (${(trimmed.length / 1024).toFixed(
          0,
        )} KB). Cap is ${MAX_INPUT_BYTES / 1024} KB.`,
      );
      return;
    }
    setBusy(true);
    const conversationId = ensureConversation();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const result = await buildGraphFromText(trimmed, {
        conversationId,
        signal: ctrl.signal,
      });
      setSummary(result);
      // brief flash of summary, then close.
      window.setTimeout(() => setOpen(false), 1400);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        setError('Cancelled.');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
      ctrlRef.current = null;
    }
  }

  function modelLabelOf(s: BuildSummary): string {
    if (s.modelUsed === 'heuristic') return 'heuristic (offline)';
    return modelLabel(s.modelUsed.provider, s.modelUsed.model);
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal graph-import-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <h2>Import to map</h2>
            <p className="muted">
              Paste a chat export or a research note. The app picks the right
              builder automatically; a small / local model handles routing
              when configured.
            </p>
          </div>
          <button type="button" className="close" onClick={close} aria-label="Close">
            ×
          </button>
        </header>
        <textarea
          ref={taRef}
          className="graph-import-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            busy
              ? 'Working…'
              : 'Paste conversation history or prose. Drop a .txt / .md file to fill this box.'
          }
          disabled={busy}
          onDrop={onFileDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (!busy) void build();
            } else if (e.key === 'Escape') {
              close();
            }
          }}
        />
        {error ? (
          <div className="canvas-modal-error">{error}</div>
        ) : summary ? (
          <div className="graph-import-summary">
            ✓ Imported as <strong>{summary.classifiedAs}</strong> · {summary.nodeCount}{' '}
            nodes, {summary.edgeCount} edges · {modelLabelOf(summary)} ·{' '}
            {(summary.durationMs / 1000).toFixed(1)}s
          </div>
        ) : (
          <div className="muted small">
            ⌘↵ to build · Esc to close · Cap: {MAX_INPUT_BYTES / 1024} KB
          </div>
        )}
        <footer>
          <button type="button" onClick={close}>
            {busy ? 'Cancel' : 'Close'}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void build()}
            disabled={busy || !text.trim()}
          >
            {busy ? 'Building…' : 'Build graph'}
          </button>
        </footer>
      </div>
    </div>
  );
}
