import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../store';
import { chat } from '../../services/llm';
import {
  modeSystemPrompt,
  webSearchAvailableFor,
  type ChatMode,
} from '../../services/llm/searchMode';
import { autoTitleNode } from '../../services/chat/autoTitle';
import { ModelPicker } from '../chat/ModelPicker';
import { MarkdownRenderer } from '../../services/markdown/MarkdownRenderer';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import type { CanvasSelectionMarker, ModelRef } from '../../types';

export function AIPalette() {
  const palette = useStore((s) => s.ui.aiPalette);
  const close = useStore((s) => s.closeAiPalette);

  if (!palette || !palette.open) return null;
  return (
    <AIPaletteInner
      selection={palette.selection}
      systemContext={palette.systemContext}
      origin={palette.origin}
      onClose={close}
    />
  );
}

function AIPaletteInner({
  selection,
  systemContext,
  origin,
  onClose,
}: {
  selection: string;
  systemContext?: string;
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
  const updateNode = useStore((s) => s.updateNode);
  const setCanvasSelection = useStore((s) => s.setCanvasSelection);
  const addMessage = useStore((s) => s.addMessage);
  const ensureConversation = useStore((s) => s.ensureConversation);
  const flow = useReactFlow();

  const [custom, setCustom] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>('chat');
  const abortRef = useRef<AbortController | null>(null);
  // Parsed canvas-selection origin: when present we auto-create the
  // answer node + edge as soon as streaming completes.
  const canvasOrigin = useMemo(() => parseCanvasSelectionOrigin(origin), [
    origin,
  ]);

  useEffect(() => {
    console.debug('[mc:ask] AIPalette mounted', {
      origin,
      canvasOrigin,
      conversationId,
      selectionLength: selection.length,
    });
    return () => {
      console.debug('[mc:ask] AIPalette unmounting (abort any in-flight stream)');
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const model: ModelRef | undefined = conv?.modelOverride ?? settings.defaultModel;

  async function run(question: string) {
    // When `systemContext` is present (canvas-multi-selection Ask) the
    // verbose "Use the following local Markdown files…" block goes to
    // the model as a `system` message — *not* concatenated to the user
    // prompt — so it doesn't pollute the user-visible message in chat
    // history. For plain text-selection asks (no systemContext), the
    // legacy behaviour stands: append the selection to the prompt so
    // the model sees both the question and what was highlighted.
    const fullPrompt =
      systemContext || !selection ? question : `${question}\n\n---\n${selection}`;
    console.debug('[mc:ask] run() called', {
      questionLength: question.length,
      promptLength: fullPrompt.length,
      hasModel: !!model,
      hasSystemContext: !!systemContext,
      provider: model?.provider,
      model: model?.model,
      conversationId,
      hasCanvasOrigin: !!canvasOrigin,
    });
    if (!model) {
      console.warn('[mc:ask] run() aborted — no model configured');
      setError('No AI provider configured. Open Settings → Providers & keys.');
      return;
    }
    setError(null);
    setOutput('');
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let collected = '';
    // Wire Search / Deep Search mode through to the same provider-
    // native web-search tools the chat panel uses (Anthropic
    // web_search_20250305 / OpenAI Responses API web_search / Google
    // googleSearch). When the active model has no web-search
    // capability, the system prompt degrades to "say you can't
    // browse" — same language the chat panel shows.
    const webSearchActive =
      mode !== 'chat' && webSearchAvailableFor(model);
    const modePrompt = modeSystemPrompt(mode, webSearchActive);
    const systemMessages: { role: 'system'; content: string }[] = [];
    if (systemContext) {
      systemMessages.push({ role: 'system', content: systemContext });
    }
    if (modePrompt) {
      systemMessages.push({ role: 'system', content: modePrompt });
    }
    const messages = [
      ...systemMessages,
      { role: 'user' as const, content: fullPrompt },
    ];
    // Persist the user's prompt to chat history *before* we kick off
    // the stream so it appears in the chat panel right away. The
    // assistant message is appended after streaming completes; the
    // `system` block (verbose source dump) is intentionally not
    // written to the conversation — it's transient context for this
    // single call.
    const targetConversationId = conversationId ?? ensureConversation();
    addMessage(
      targetConversationId,
      'user',
      question,
      undefined,
      systemContext
        ? {
            // Compact summary so the chat-message context badge can
            // surface "+ N source files" without exposing the dump.
            fileCount: 0,
            edgeCount: 0,
            fileNames: [],
          }
        : undefined,
    );
    try {
      console.debug('[mc:ask] stream starting', {
        mode,
        webSearchActive,
      });
      for await (const chunk of chat.stream(
        {
          provider: model.provider,
          model: model.model,
          messages,
          webSearch: webSearchActive,
        },
        ctrl.signal,
      )) {
        if (ctrl.signal.aborted) break;
        if ('text' in chunk) {
          collected += chunk.text;
          setOutput((o) => o + chunk.text);
        }
      }
      console.debug('[mc:ask] stream finished', {
        aborted: ctrl.signal.aborted,
        collectedLength: collected.length,
      });
    } catch (err) {
      console.error('[mc:ask] stream error', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(false);
    }
    // Write the assistant response to chat history. We do this once,
    // after the stream completes, instead of mid-stream — the palette
    // shows live streaming locally already, and a single finalized
    // message keeps the chat panel / mirror / search clean. The
    // model is recorded so token usage / cost still routes correctly.
    if (collected.trim().length > 0) {
      const finalized = addMessage(
        targetConversationId,
        'assistant',
        collected,
      );
      if (finalized && model) {
        useStore.getState().finalizeMessage(finalized.id, { model });
      }
    }
    // Auto-link: when the palette was opened from a canvas selection,
    // mint the answer node + edge + selection marker as soon as the
    // stream finishes (and only on success — collected non-empty).
    if (
      !ctrl.signal.aborted &&
      canvasOrigin &&
      collected.trim().length > 0 &&
      conversationId
    ) {
      console.debug('[mc:ask] auto-linking answer to canvas');
      autoLinkAnswerToCanvas(question, collected.trim());
    } else {
      console.debug('[mc:ask] auto-link skipped', {
        aborted: ctrl.signal.aborted,
        hasCanvasOrigin: !!canvasOrigin,
        collectedLength: collected.trim().length,
        conversationId,
      });
    }
  }

  function autoLinkAnswerToCanvas(question: string, answer: string) {
    if (!canvasOrigin || !conversationId) {
      console.warn('[mc:ask] autoLinkAnswerToCanvas bailed — missing origin or conversation', {
        hasCanvasOrigin: !!canvasOrigin,
        conversationId,
      });
      return;
    }
    const state = useStore.getState();
    const sourceNode = state.nodes.find((n) => n.id === canvasOrigin.nodeId);
    if (!sourceNode) {
      console.warn('[mc:ask] autoLinkAnswerToCanvas bailed — source node not found', {
        sourceNodeId: canvasOrigin.nodeId,
      });
      return;
    }
    console.debug('[mc:ask] creating answer node + edge', {
      sourceNodeId: sourceNode.id,
      conversationId,
      answerLength: answer.length,
    });
    const placed = {
      x: sourceNode.position.x + (sourceNode.width ?? 280) + 80,
      y: sourceNode.position.y,
    };
    const answerWidth = 320;
    const answerHeight = 220;
    const answerNode = addNode({
      conversationId,
      kind: 'markdown',
      title: titleFromPrompt(question) || 'AI answer',
      contentMarkdown: composeAnswerContent(question, answer),
      position: placed,
      width: answerWidth,
      height: answerHeight,
      tags: ['answer', 'selection-ask'],
    });
    const newEdge = addEdge({
      sourceNodeId: sourceNode.id,
      targetNodeId: answerNode.id,
      label: 'asked',
    });
    if (canvasOrigin.kind === 'selection' && canvasOrigin.selectionRange) {
      const marker: CanvasSelectionMarker = {
        markerId: newId(),
        sourceNodeId: sourceNode.id,
        sourceMdPath: sourceNode.mdPath,
        selectedText: selection,
        startOffset: canvasOrigin.selectionRange.start,
        endOffset: canvasOrigin.selectionRange.end,
        answerNodeId: answerNode.id,
        question,
        createdAt: now(),
      };
      const markers = sourceNode.selectionMarkers ?? [];
      const dup = markers.some(
        (m) =>
          m.startOffset === marker.startOffset &&
          m.endOffset === marker.endOffset &&
          m.question === marker.question,
      );
      if (!dup) {
        updateNode(sourceNode.id, {
          selectionMarkers: [...markers, marker],
        });
      }
    }
    // Focus the new answer node: select it (so the user can immediately
    // operate on it), zoom in to surface its content, then close the
    // palette since the result now lives on the canvas.
    setCanvasSelection([answerNode.id], [newEdge.id]);
    flow.setCenter(
      placed.x + answerWidth / 2,
      placed.y + answerHeight / 2,
      { zoom: 1.2, duration: 350 },
    );
    onClose();
    // Refine the heuristic title from the actual answer content.
    // Free Groq Llama path when configured; falls back gracefully.
    void autoTitleNode({
      nodeId: answerNode.id,
      kind: 'answer',
      context: question,
    }).catch((err: unknown) =>
      console.warn('[autoTitleNode] palette failed', err),
    );
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
    void autoTitleNode({
      nodeId: node.id,
      kind: 'answer',
      context: selection,
    }).catch((err: unknown) =>
      console.warn('[autoTitleNode] makeNode failed', err),
    );
    onClose();
  }

  function copyOutput() {
    void navigator.clipboard.writeText(output);
  }

  function dumpDebugState() {
    const snap = {
      origin,
      canvasOrigin,
      conversationId,
      hasModel: !!model,
      provider: model?.provider,
      model: model?.model,
      streaming,
      outputLength: output.length,
      selectionLength: selection.length,
      error,
      conversation: conv
        ? {
            id: conv.id,
            modelOverride: conv.modelOverride,
            thinking: conv.thinking,
            reasoningEffort: conv.reasoningEffort,
          }
        : null,
      defaultModel: settings.defaultModel,
    };
    console.group('[mc:ask] palette state');
    console.log(snap);
    console.groupEnd();
    void navigator.clipboard.writeText(JSON.stringify(snap, null, 2)).catch(() => {});
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="ai-palette" onClick={(e) => e.stopPropagation()}>
        <header className="ai-palette-header">
          <span className="muted">AI palette · ⌘J</span>
          <div className="ai-palette-header-actions">
            <button
              type="button"
              className="ai-palette-debug"
              onClick={dumpDebugState}
              title="Dump palette state to console (and copy JSON)"
            >
              debug
            </button>
            <button type="button" className="close" onClick={onClose}>
              ×
            </button>
          </div>
        </header>
        <div className="ai-palette-model">
          <ModelPicker />
        </div>
        {/* Mode toggle — Chat / Search / Deep Search. Same wiring as
            the chat panel: when web_search is active the request goes
            out with the provider's native web-search tool attached
            (Anthropic / OpenAI Responses / Google grounding). On
            providers without a search tool the system prompt tells
            the model to say so rather than fake citations. */}
        <div
          className="ai-palette-modes"
          role="tablist"
          aria-label="Ask mode"
        >
          {(['chat', 'search', 'deep_search'] as const).map((m) => {
            const label =
              m === 'chat'
                ? 'Chat'
                : m === 'search'
                  ? 'Search'
                  : 'Deep Search';
            const supports = m === 'chat' || webSearchAvailableFor(model);
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? 'active' : ''}
                onClick={() => setMode(m)}
                title={
                  supports
                    ? undefined
                    : 'The selected model has no web-search tool — the AI will say it can\'t browse.'
                }
              >
                {label}
                {/* `supports` is only false when the mode is non-chat
                    AND the model has no web-search capability — so
                    no need to also check `m !== 'chat'` here. */}
                {!supports ? ' (no web)' : null}
              </button>
            );
          })}
        </div>
        {selection ? (
          <CollapsibleSelection text={selection} />
        ) : (
          <div className="muted ai-selection">
            No selection — your custom prompt runs alone.
          </div>
        )}
        <div className="ai-custom">
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Write a prompt…  (⏎ to send, ⇧⏎ for newline)"
            rows={2}
            onKeyDown={(e) => {
              // Shift+Enter inserts a newline (default textarea behavior).
              if (e.key === 'Enter' && e.shiftKey) return;
              // Skip Enter while an IME composition is in progress: the
              // confirmation Enter for kana → kanji must NOT submit. Both
              // `isComposing` and `keyCode === 229` are needed because the
              // first goes false right before keyup on some platforms.
              if (
                e.key === 'Enter' &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229 &&
                custom.trim()
              ) {
                e.preventDefault();
                run(custom.trim());
              }
            }}
          />
        </div>
        {error ? <div className="result error">{error}</div> : null}
        {output ? (
          <div className="ai-output">
            <div className="ai-output-body">
              <MarkdownRenderer markdown={output} />
            </div>
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

type CanvasOrigin =
  | {
      kind: 'selection';
      nodeId: string;
      selectionRange: { start: number; end: number };
    }
  | { kind: 'node'; nodeId: string };

/**
 * Origin formats produced by canvas-side openers:
 *
 *   `canvas-selection:<nodeId>:<startOffset>:<endOffset>` — text-selection ask
 *   `canvas-node:<nodeId>` — node-level ask (no offsets)
 *
 * Returns null for everything else (kb-editor / pdf / chat-message etc.)
 * so the palette keeps its original "Make a node" manual flow.
 */
/**
 * Selection preview that collapses to two lines and reveals the full
 * text on click. The user asked for this because dumping a 50-line
 * canvas-multi-selection summary into the palette buried the question
 * input below the fold; the collapsed-by-default form keeps the modal
 * compact without losing access to the full text.
 */
function CollapsibleSelection({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // Heuristic for "is this long enough to bother collapsing": either
  // multiple lines, or more than ~140 chars (≈ two lines at the
  // palette width). Short selections render flat without the toggle.
  const lineCount = text.split('\n').length;
  const isLong = lineCount > 2 || text.length > 140;
  return (
    <div className="ai-selection">
      <span className="muted">Selection</span>
      <blockquote
        className={`ai-selection-quote${
          isLong ? (expanded ? ' expanded' : ' clamped') : ''
        }`}
        role={isLong ? 'button' : undefined}
        tabIndex={isLong ? 0 : undefined}
        onClick={() => isLong && setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (!isLong) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        title={
          isLong ? (expanded ? 'Click to collapse' : 'Click to expand') : undefined
        }
      >
        {text}
      </blockquote>
      {isLong ? (
        <button
          type="button"
          className="ai-selection-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

function parseCanvasSelectionOrigin(
  origin: string | null,
): CanvasOrigin | null {
  if (!origin) return null;
  const sel = /^canvas-selection:([^:]+):(\d+):(\d+)$/.exec(origin);
  if (sel) {
    return {
      kind: 'selection',
      nodeId: sel[1],
      selectionRange: {
        start: Number(sel[2]),
        end: Number(sel[3]),
      },
    };
  }
  const node = /^canvas-node:([^:]+)$/.exec(origin);
  if (node) return { kind: 'node', nodeId: node[1] };
  return null;
}

function titleFromPrompt(prompt: string): string {
  const first = prompt.split('\n').find((l) => l.trim().length > 0) ?? prompt;
  const trimmed = first.trim().replace(/^[#>*\-\s]+/, '').slice(0, 80);
  return trimmed;
}

/**
 * Compose the contents of the auto-created answer node so the user can see
 * what they asked alongside the AI's reply. Without the question, browsing
 * a chat-derived answer node later is just a wall of answer text with no
 * recall of the prompt that triggered it.
 */
function composeAnswerContent(question: string, answer: string): string {
  const q = question.trim();
  if (!q) return answer;
  return `## Question\n\n${q}\n\n## Answer\n\n${answer}`;
}
