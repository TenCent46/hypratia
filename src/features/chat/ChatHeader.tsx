import { useStore } from '../../store';
import {
  estimateUsdFromTokens,
  formatUsd,
} from '../../services/llm/costEstimator';
import { getCurrentView, openChatWindow } from '../../services/window';
import { ModelPicker } from './ModelPicker';
import type { ModelRef } from '../../types';

export function ChatHeader({
  streaming,
  onAbort,
}: {
  streaming: boolean;
  onAbort: () => void;
}) {
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const conv = useStore((s) =>
    conversationId ? s.conversations.find((c) => c.id === conversationId) ?? null : null,
  );
  const settings = useStore((s) => s.settings);

  const activeModel: ModelRef | undefined =
    conv?.modelOverride ?? settings.defaultModel;
  const cost =
    activeModel && conv?.tokenUsage
      ? estimateUsdFromTokens(activeModel.provider, activeModel.model, conv.tokenUsage)
      : null;

  const isDetached = getCurrentView() !== 'main';

  return (
    <div className="chat-header">
      <ModelPicker />
      <span className="chat-header-spacer" />
      {!isDetached ? (
        <button
          type="button"
          className="chat-header-detach"
          disabled={!conversationId}
          onClick={() => {
            if (!conversationId) return;
            void openChatWindow(conversationId);
            window.dispatchEvent(
              new CustomEvent('mc:panel-detached', { detail: { panel: 'chat' } }),
            );
          }}
          aria-label="Open chat in new window"
          title="Detach tab to new window"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 3h7v7" />
            <path d="M10 14L21 3" />
            <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
          </svg>
        </button>
      ) : null}
      {conv?.tokenUsage ? (
        <span
          className="muted cost-meter"
          title={`${conv.tokenUsage.input} in / ${conv.tokenUsage.output} out tokens`}
        >
          {cost !== null ? formatUsd(cost) : `${conv.tokenUsage.input + conv.tokenUsage.output} tok`}
        </span>
      ) : null}
      {streaming ? (
        <button type="button" className="abort" onClick={onAbort} title="⌘⌫ to stop">
          Stop
        </button>
      ) : null}
    </div>
  );
}
