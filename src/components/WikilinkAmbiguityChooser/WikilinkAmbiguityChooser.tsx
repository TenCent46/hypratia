import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WikilinkCandidate } from '../../services/markdown/wikilinkResolver';

/**
 * Modal that pops up when a clicked wikilink resolves to more than one
 * candidate. The user picks one; we then dispatch the appropriate
 * "open" event for that candidate (a Hypratia node when the file carries
 * a `hypratia_id` we know, otherwise just the markdown file).
 *
 * "Ambiguous" only happens when the title matches multiple files and
 * none of them wins on score (e.g. two different files both alias the
 * same title). The display lists every candidate so the user can choose
 * deliberately — silent picks would erode trust.
 */
export function WikilinkAmbiguityChooser() {
  const [state, setState] = useState<{
    query: string;
    candidates: WikilinkCandidate[];
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{
        query: string;
        candidates: WikilinkCandidate[];
      }>).detail;
      if (!detail) return;
      setState({ query: detail.query, candidates: detail.candidates });
    }
    window.addEventListener('mc:wikilink-chooser-open', onOpen);
    return () =>
      window.removeEventListener('mc:wikilink-chooser-open', onOpen);
  }, []);

  useEffect(() => {
    if (!state) return;
    function onPointer(e: PointerEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setState(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setState(null);
    }
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [state]);

  if (!state || typeof document === 'undefined') return null;

  function pick(c: WikilinkCandidate) {
    if (c.nodeId && c.conversationId) {
      // High-level event: App's listener reveals the canvas pane,
      // switches conversation if needed, selects the node, and re-emits
      // `mc:focus-canvas-node` once the canvas has mounted.
      window.dispatchEvent(
        new CustomEvent('mc:open-canvas-node', {
          detail: {
            nodeId: c.nodeId,
            conversationId: c.conversationId,
            hypratiaId: c.hypratiaId,
            path: c.path,
          },
        }),
      );
      window.dispatchEvent(
        new CustomEvent('mc:open-markdown-file', {
          detail: { path: c.path },
        }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent('mc:open-markdown-file', {
          detail: { path: c.path },
        }),
      );
    }
    setState(null);
  }

  return createPortal(
    <div
      className="wikilink-chooser-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a wikilink target"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div ref={ref} className="wikilink-chooser">
        <header className="wikilink-chooser-header">
          <span className="wikilink-chooser-title">
            Multiple notes found for{' '}
            <code className="wikilink-chooser-query">[[{state.query}]]</code>
          </span>
          <button
            type="button"
            className="wikilink-chooser-close"
            onClick={() => setState(null)}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <ul className="wikilink-chooser-list">
          {state.candidates.map((c) => (
            <li key={c.path}>
              <button
                type="button"
                className="wikilink-chooser-row"
                onClick={() => pick(c)}
              >
                <span className="wikilink-chooser-row-title">{c.title}</span>
                <span className="wikilink-chooser-row-meta">{c.path}</span>
                {c.nodeId ? (
                  <span className="wikilink-chooser-pill wikilink-chooser-pill-node">
                    Hypratia node
                  </span>
                ) : (
                  <span className="wikilink-chooser-pill wikilink-chooser-pill-md">
                    Markdown only
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
