import { useState } from 'react';
import { useChatStream } from './useChatStream';
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
  const [mode, setMode] = useState<ChatMode>('chat');
  const { send, regenerate, abort, streaming } = useChatStream();
  const conversationId = useStore((s) => s.settings.lastConversationId);
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

  return (
    <div className="chat-panel">
      <ChatTabBarSlot />
      <ChatHeader streaming={streaming} onAbort={abort} />
      <MessageList onRegenerate={(messageId) => regenerate(messageId, mode)} />
      <MessageInput
        onSend={(text, attachmentIds) => send(text, mode, attachmentIds)}
        streaming={streaming}
        onAbort={abort}
        mode={mode}
        onModeChange={setMode}
        onSlashCommand={handleSlash}
      />
      <ArtifactProgressToast />
    </div>
  );
}

function ChatTabBarSlot() {
  const inSidebar = useStore((s) => s.settings.chatTabsInSidebar ?? true);
  if (inSidebar) return null;
  return <ChatTabBar />;
}
