import { useCallback, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStream } from './useChatStream';
import { RichTextContextMenu } from '../../components/ContextMenu/RichTextContextMenu';
import { showToast } from '../../components/Toast/Toast';
import { ChatHeader } from './ChatHeader';
import { ChatTabBar } from './ChatTabBar';
import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';
import { ArtifactProgressToast } from './ArtifactProgressToast';
import { useStore } from '../../store';
import { getSummarizer, setSummarizer } from '../../services/summarize';
import { RealSummarizer } from '../../services/llm/RealSummarizer';
import { MockSummarizer } from '../../services/summarize/MockSummarizer';
import type { SlashCommand } from './slashCommands';
import type { ChatMode } from './useChatStream';
import type { ModelRef } from '../../types';

export function ChatPanel() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ChatMode>('chat');
  const { send, regenerate, abort, streaming } = useChatStream();
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const [textMenu, setTextMenu] = useState<{
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);
  const openAiPalette = useStore((s) => s.openAiPalette);
  const allMessages = useStore((s) => s.messages);
  const conv = useStore((s) =>
    conversationId
      ? s.conversations.find((c) => c.id === conversationId) ?? null
      : null,
  );
  const settings = useStore((s) => s.settings);
  const addNode = useStore((s) => s.addNode);
  const setActive = useStore((s) => s.setActiveConversation);
  const createConversation = useStore((s) => s.createConversation);
  const setGraphImportOpen = useStore((s) => s.setGraphImportOpen);

  async function runSummarize() {
    if (!conversationId) return;
    const messages = allMessages.filter(
      (m) => m.conversationId === conversationId,
    );
    if (messages.length === 0) return;
    const model: ModelRef | undefined =
      conv?.modelOverride ?? settings.defaultModel;
    if (model) setSummarizer(new RealSummarizer(model));
    else setSummarizer(new MockSummarizer());
    const summarizer = getSummarizer();
    try {
      const summary = await summarizer.summarize(messages);
      // Place summary near recent nodes for this conversation; fallback to origin
      const recent = useStore
        .getState()
        .nodes.filter((n) => n.conversationId === conversationId)
        .slice(-1)[0];
      const base = recent
        ? { x: recent.position.x + 320, y: recent.position.y }
        : { x: 240, y: 240 };
      addNode({
        conversationId,
        title: summary.title,
        contentMarkdown: summary.contentMarkdown,
        position: base,
        tags: ['summary', summary.isMock ? 'mock' : 'llm'].filter(Boolean),
      });
    } catch (err) {
      console.error('summarize failed', err);
    }
  }

  function handleSlash(cmd: SlashCommand) {
    switch (cmd.id) {
      case 'summarize':
        void runSummarize();
        break;
      case 'newchat': {
        const id = createConversation('Untitled');
        setActive(id);
        break;
      }
      case 'clear':
        // Already handled in MessageInput (it clears on send), no-op here.
        break;
      case 'import-graph':
        setGraphImportOpen(true);
        break;
    }
  }

  // Stable callback so `MessageRow`'s React.memo can short-circuit
  // re-renders. A fresh inline arrow on every parent render would defeat
  // the memo and we'd parse markdown for every row on every chunk.
  const onRegenerate = useCallback(
    (messageId: string) => regenerate(messageId, mode),
    [regenerate, mode],
  );
  const onSend = useCallback(
    (text: string, attachmentIds: string[]) => send(text, mode, attachmentIds),
    [send, mode],
  );

  function onChatContextMenu(e: MouseEvent<HTMLDivElement>) {
    // Inputs / textareas keep their own context menus (chat input has
    // its own RichTextContextMenu wired in MessageInput).
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }
    const sel = window.getSelection();
    const selectedText = sel?.toString().trim() ?? '';
    if (
      !sel ||
      sel.rangeCount === 0 ||
      !selectedText ||
      !target.closest('.message .content')
    ) {
      return;
    }
    e.preventDefault();
    setTextMenu({ x: e.clientX, y: e.clientY, selectedText });
  }

  return (
    <div className="chat-panel" onContextMenu={onChatContextMenu}>
      <ChatTabBarSlot />
      <ChatHeader streaming={streaming} onAbort={abort} />
      <MessageList onRegenerate={onRegenerate} />
      <MessageInput
        onSend={onSend}
        streaming={streaming}
        onAbort={abort}
        mode={mode}
        onModeChange={setMode}
        onSlashCommand={handleSlash}
      />
      <ArtifactProgressToast />
      {textMenu ? (
        <RichTextContextMenu
          x={textMenu.x}
          y={textMenu.y}
          onClose={() => setTextMenu(null)}
          items={{
            copy: () => {
              void navigator.clipboard
                .writeText(textMenu.selectedText)
                .then(() =>
                  showToast({ message: t('common.copied'), tone: 'success' }),
                )
                .catch(() => undefined);
              setTextMenu(null);
            },
            ask: () => {
              openAiPalette(textMenu.selectedText, 'chat-selection');
              setTextMenu(null);
            },
          }}
        />
      ) : null}
    </div>
  );
}

function ChatTabBarSlot() {
  const inSidebar = useStore((s) => s.settings.chatTabsInSidebar ?? true);
  if (inSidebar) return null;
  return <ChatTabBar />;
}
