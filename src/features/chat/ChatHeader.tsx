import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import {
  estimateUsdFromTokens,
  formatUsd,
} from '../../services/llm/costEstimator';
import { ModelPicker } from './ModelPicker';
import type { ModelRef } from '../../types';

export function ChatHeader({
  streaming,
  onAbort,
}: {
  streaming: boolean;
  onAbort: () => void;
}) {
  const { t } = useTranslation();
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

  return (
    <div className="chat-header">
      <ModelPicker />
      <span className="chat-header-spacer" />
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
          {t('chat.stop')}
        </button>
      ) : null}
    </div>
  );
}
