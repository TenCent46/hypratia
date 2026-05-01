import { useEffect, useState } from 'react';
import type { ArtifactProgressDetail } from '../../services/artifacts';

type ToastEntry = {
  generationId: string;
  phase: 'start' | 'success' | 'error';
  kind: 'document' | 'audio' | 'video';
  provider?: string;
  filename: string;
  error?: string;
  sizeBytes?: number;
  startedAt: number;
};

const KIND_LABEL: Record<ToastEntry['kind'], string> = {
  document: 'document',
  audio: 'audio',
  video: 'video',
};

const SUCCESS_TIMEOUT_MS = 5000;
const ERROR_TIMEOUT_MS = 8000;

function shortProvider(p: string | undefined): string {
  if (!p) return '';
  return p.replace(/^claude-/, 'Claude · ').replace(/^openai-/, 'OpenAI · ');
}

export function ArtifactProgressToast() {
  const [entries, setEntries] = useState<ToastEntry[]>([]);

  useEffect(() => {
    function onProgress(e: Event) {
      const detail = (e as CustomEvent<ArtifactProgressDetail>).detail;
      if (!detail) return;
      setEntries((cur) => {
        if (detail.phase === 'start') {
          return [
            ...cur,
            {
              generationId: detail.generationId,
              phase: 'start',
              kind: detail.kind,
              provider: detail.provider,
              filename: detail.filename,
              startedAt: Date.now(),
            },
          ];
        }
        const next = cur.map<ToastEntry>((t) =>
          t.generationId === detail.generationId
            ? {
                ...t,
                phase: detail.phase,
                provider: detail.provider ?? t.provider,
                filename: detail.filename,
                error:
                  detail.phase === 'error' ? detail.error : undefined,
                sizeBytes:
                  detail.phase === 'success' ? detail.sizeBytes : undefined,
              }
            : t,
        );
        // schedule auto-dismiss for terminal toasts
        const timeout =
          detail.phase === 'error' ? ERROR_TIMEOUT_MS : SUCCESS_TIMEOUT_MS;
        window.setTimeout(() => {
          setEntries((cs) =>
            cs.filter((t) => t.generationId !== detail.generationId),
          );
        }, timeout);
        return next;
      });
    }
    window.addEventListener(
      'mc:artifact-progress',
      onProgress as EventListener,
    );
    return () =>
      window.removeEventListener(
        'mc:artifact-progress',
        onProgress as EventListener,
      );
  }, []);

  if (entries.length === 0) return null;
  return (
    <div className="artifact-toast-stack" role="status" aria-live="polite">
      {entries.map((t) => (
        <div
          key={t.generationId}
          className={`artifact-toast tone-${t.phase}`}
        >
          <span className="artifact-toast-spinner" aria-hidden="true">
            {t.phase === 'start' ? '⟳' : t.phase === 'success' ? '✓' : '⚠'}
          </span>
          <div className="artifact-toast-text">
            <div className="artifact-toast-line">
              {t.phase === 'start'
                ? `Generating ${KIND_LABEL[t.kind]} via ${shortProvider(t.provider)}…`
                : t.phase === 'success'
                  ? `Saved ${t.filename}`
                  : `Failed: ${t.filename}`}
            </div>
            {t.phase === 'error' && t.error ? (
              <div className="artifact-toast-sub">{t.error}</div>
            ) : null}
            {t.phase === 'start' ? (
              <div className="artifact-toast-sub">{t.filename}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
