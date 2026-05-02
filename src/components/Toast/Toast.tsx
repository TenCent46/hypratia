import { useEffect, useState } from 'react';

/**
 * Lightweight global toast. Decoupled from any state library so callers
 * just dispatch a `mc:toast` CustomEvent — no provider wiring required.
 *
 * Example:
 *   showToast('Copied');
 *   showToast({ message: 'Pasted', tone: 'success', durationMs: 1200 });
 */
type ToastTone = 'info' | 'success' | 'error';

type ToastDetail = {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
};

const TOAST_EVENT = 'mc:toast';

export function showToast(input: string | ToastDetail): void {
  const detail: ToastDetail =
    typeof input === 'string' ? { message: input } : input;
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }));
}

type ToastEntry = {
  id: number;
  message: string;
  tone: ToastTone;
  durationMs: number;
};

let nextId = 1;

export function ToastHost() {
  const [entries, setEntries] = useState<ToastEntry[]>([]);

  useEffect(() => {
    function onToast(event: Event) {
      const ce = event as CustomEvent<ToastDetail>;
      const detail = ce.detail;
      if (!detail || !detail.message) return;
      const entry: ToastEntry = {
        id: nextId++,
        message: detail.message,
        tone: detail.tone ?? 'info',
        durationMs: detail.durationMs ?? 1400,
      };
      setEntries((prev) => [...prev, entry]);
      window.setTimeout(() => {
        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      }, entry.durationMs);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (entries.length === 0) return null;
  return (
    <div className="toast-host" aria-live="polite" aria-atomic="true">
      {entries.map((e) => (
        <div key={e.id} className={`toast toast-${e.tone}`}>
          {e.message}
        </div>
      ))}
    </div>
  );
}
