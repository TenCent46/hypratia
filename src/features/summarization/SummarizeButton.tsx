import { useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../store';
import { getSummarizer, setSummarizer } from '../../services/summarize';
import { RealSummarizer } from '../../services/llm/RealSummarizer';
import { MockSummarizer } from '../../services/summarize/MockSummarizer';
import type { ModelRef } from '../../types';

export function SummarizeButton() {
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const allMessages = useStore((s) => s.messages);
  const conv = useStore((s) =>
    conversationId
      ? s.conversations.find((c) => c.id === conversationId) ?? null
      : null,
  );
  const settings = useStore((s) => s.settings);
  const messages = useMemo(
    () =>
      conversationId
        ? allMessages.filter((m) => m.conversationId === conversationId)
        : [],
    [allMessages, conversationId],
  );
  const addNode = useStore((s) => s.addNode);
  const flow = useReactFlow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const model: ModelRef | undefined = conv?.modelOverride ?? settings.defaultModel;

  if (!conversationId) return null;

  async function onClick() {
    if (!conversationId || messages.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Pick summarizer based on configured model
      if (model) {
        setSummarizer(new RealSummarizer(model));
      } else {
        setSummarizer(new MockSummarizer());
      }
      const summarizer = getSummarizer();
      const summary = await summarizer.summarize(messages);
      const canvas = document.querySelector(
        '.canvas-panel',
      ) as HTMLElement | null;
      const rect = canvas?.getBoundingClientRect();
      const screen = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const position = flow.screenToFlowPosition(screen);
      addNode({
        conversationId,
        title: summary.title,
        contentMarkdown: summary.contentMarkdown,
        position,
        tags: ['summary', summary.isMock ? 'mock' : 'llm'].filter(Boolean),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="summarize-bar">
      <button
        type="button"
        onClick={onClick}
        disabled={busy || messages.length === 0}
        title={
          messages.length === 0
            ? 'No messages to summarize yet'
            : model
            ? `Summarize with ${model.provider}/${model.model}`
            : 'Create a mock summary (no AI configured)'
        }
      >
        {busy ? 'Summarizing…' : model ? 'Summarize' : 'Mock summary'}
      </button>
      {error ? <div className="error-line">{error}</div> : null}
    </div>
  );
}
