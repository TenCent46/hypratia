import { useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../store';
import { chat } from '../../services/llm';
import { PRESETS } from './prompts';
import type { ModelRef } from '../../types';

export function AIPalette() {
  const palette = useStore((s) => s.ui.aiPalette);
  const close = useStore((s) => s.closeAiPalette);

  if (!palette || !palette.open) return null;
  return <AIPaletteInner selection={palette.selection} origin={palette.origin} onClose={close} />;
}

function AIPaletteInner({
  selection,
  origin,
  onClose,
}: {
  selection: string;
  origin: string | null;
  onClose: () => void;
}) {
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const conv = useStore((s) =>
    conversationId ? s.conversations.find((c) => c.id === conversationId) : null,
  );
  const settings = useStore((s) => s.settings);
  const addNode = useStore((s) => s.addNode);
  const addEdge = useStore((s) => s.addEdge);
  const flow = useReactFlow();

  const [custom, setCustom] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const model: ModelRef | undefined = conv?.modelOverride ?? settings.defaultModel;

  async function run(prompt: string) {
    if (!model) {
      setError('No AI provider configured. Open Settings → Providers & keys.');
      return;
    }
    setError(null);
    setOutput('');
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      for await (const chunk of chat.stream(
        {
          provider: model.provider,
          model: model.model,
          messages: [{ role: 'user', content: prompt }],
        },
        ctrl.signal,
      )) {
        if (ctrl.signal.aborted) break;
        if ('text' in chunk) setOutput((o) => o + chunk.text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(false);
    }
  }

  function makeNode() {
    if (!conversationId) return;
    const center = flow.screenToFlowPosition({
      x: window.innerWidth / 3,
      y: window.innerHeight / 2,
    });
    const node = addNode({
      conversationId,
      title: 'AI · ' + (selection.slice(0, 40) || 'note'),
      contentMarkdown: output,
      position: center,
      tags: ['ai'],
    });
    if (origin && origin.startsWith('node-content:')) {
      const sourceNodeId = origin.split(':')[1];
      addEdge({ sourceNodeId, targetNodeId: node.id, label: 'AI' });
    }
    onClose();
  }

  function copyOutput() {
    void navigator.clipboard.writeText(output);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="ai-palette" onClick={(e) => e.stopPropagation()}>
        <header className="ai-palette-header">
          <span className="muted">AI palette · ⌘J</span>
          <button type="button" className="close" onClick={onClose}>
            ×
          </button>
        </header>
        {selection ? (
          <div className="ai-selection">
            <span className="muted">Selection</span>
            <blockquote>{selection.slice(0, 240)}{selection.length > 240 ? '…' : ''}</blockquote>
          </div>
        ) : (
          <div className="muted ai-selection">No selection — your custom prompt runs alone.</div>
        )}
        <div className="ai-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={streaming || !selection}
              onClick={() => run(p.build(selection))}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="ai-custom">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Or write a custom prompt…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && custom.trim()) {
                const fullPrompt = selection
                  ? `${custom}\n\n---\n${selection}`
                  : custom;
                run(fullPrompt);
              }
            }}
          />
        </div>
        {error ? <div className="result error">{error}</div> : null}
        {output ? (
          <div className="ai-output">
            <pre>{output}</pre>
            {!streaming ? (
              <div className="ai-actions">
                <button type="button" className="primary" onClick={makeNode}>
                  Make a node
                </button>
                <button type="button" onClick={copyOutput}>
                  Copy
                </button>
                <button type="button" onClick={() => setOutput('')}>
                  Clear
                </button>
              </div>
            ) : (
              <div className="muted">Streaming…</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
