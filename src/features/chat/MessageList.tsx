import { useEffect, useMemo, useRef, type DragEvent } from 'react';
import { useStore } from '../../store';
import {
  beginMessageDrag,
  beginCrossWindowMessageDrag,
  createMessageDragImage,
  createMessageDragPayload,
  endMessageDrag,
  MIME_CROSS_WINDOW_DRAG_PAYLOAD,
  MIME_CROSS_WINDOW_DRAG_SESSION,
  MIME_MESSAGE_ID,
  MIME_MESSAGE_JSON,
} from '../canvas/dnd';
import { MarkdownRenderer } from '../../services/markdown/MarkdownRenderer';
import { confirmDangerTwice } from '../../lib/confirm';
import { ArtifactCard } from './ArtifactCard';
import {
  extractFencedBlocks,
  saveBlockAsArtifact,
  saveFencedBlocksFromMessage,
} from './saveCodeBlock';
import type { Message } from '../../types';

export function MessageList({
  onRegenerate,
}: {
  onRegenerate: (messageId: string) => void;
}) {
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const allMessages = useStore((s) => s.messages);
  const messages = useMemo(
    () =>
      conversationId
        ? allMessages.filter((m) => m.conversationId === conversationId)
        : [],
    [allMessages, conversationId],
  );

  const ref = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Keep the newest content at the bottom whenever message count or streaming content changes.
  const totalLen = useMemo(
    () => messages.reduce((acc, m) => acc + m.content.length, 0),
    [messages],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, totalLen]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
    stickToBottom.current = atBottom;
  }

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        Ask anything.
      </div>
    );
  }

  return (
    <div className="message-list" ref={ref} onScroll={onScroll}>
      {messages.map((m) => (
        <MessageRow key={m.id} message={m} onRegenerate={onRegenerate} />
      ))}
    </div>
  );
}

function MessageRow({
  message,
  onRegenerate,
}: {
  message: Message;
  onRegenerate: (messageId: string) => void;
}) {
  const removeMessage = useStore((s) => s.removeMessage);
  const draggable = !message.streaming && message.role !== 'system';

  function onDragStart(e: DragEvent<HTMLDivElement>) {
    const payload = createMessageDragPayload(message.id);
    const crossWindowPayload = beginCrossWindowMessageDrag(message);
    const crossWindowPayloadJson = JSON.stringify(crossWindowPayload);
    beginMessageDrag(message.id);
    e.dataTransfer.setData(MIME_CROSS_WINDOW_DRAG_SESSION, crossWindowPayload.id);
    e.dataTransfer.setData(MIME_CROSS_WINDOW_DRAG_PAYLOAD, crossWindowPayloadJson);
    e.dataTransfer.setData('application/json', crossWindowPayloadJson);
    e.dataTransfer.setData(MIME_MESSAGE_ID, message.id);
    e.dataTransfer.setData(MIME_MESSAGE_JSON, payload);
    e.dataTransfer.setData('text/plain', crossWindowPayload.id);
    e.dataTransfer.effectAllowed = 'copy';
    const dragImage = createMessageDragImage({
      role: message.role,
      title: message.content.split('\n')[0]?.trim() || 'Untitled',
      content: message.content,
    });
    e.dataTransfer.setDragImage(dragImage, 18, 18);
    e.currentTarget.classList.add('dragging');
  }

  function onDragEnd(e: DragEvent<HTMLDivElement>) {
    e.currentTarget.classList.remove('dragging');
    endMessageDrag();
  }

  function onCopy() {
    void navigator.clipboard.writeText(message.content);
  }

  const showActions =
    !message.streaming && message.role !== 'system' && message.content.trim();
  const thinking = message.streaming && !message.content.trim();
  const hasFencedBlocks =
    message.role === 'assistant' &&
    !message.streaming &&
    extractFencedBlocks(message.content).length > 0;
  const artifactIds = message.attachmentIds ?? [];

  return (
    <div
      className={`message role-${message.role}${message.streaming ? ' streaming' : ''}${
        thinking ? ' thinking' : ''
      }${
        message.errored ? ' errored' : ''
      }`}
      data-message-id={message.id}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={draggable ? 'Drag this message to the canvas' : undefined}
    >
      <div className="role">
        {message.role}
        {message.model ? <span className="model"> · {message.model.model}</span> : null}
        {thinking ? <span className="status">thinking</span> : null}
        {message.streaming && !thinking ? <span className="status">streaming</span> : null}
        {message.errored ? <span className="status error">error</span> : null}
        {draggable ? <span className="drag-hint" aria-hidden="true">⋮⋮</span> : null}
      </div>
      {message.contextSummary ? (
        <details className="message-context-chip">
          <summary>
            Context: {message.contextSummary.fileCount} Markdown files,{' '}
            {message.contextSummary.edgeCount} canvas links
          </summary>
          <div>
            {message.contextSummary.fileNames.slice(0, 12).map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </details>
      ) : null}
      {message.errored ? (
        <div className="content error">
          <strong>Error:</strong> {message.errorMessage ?? 'Unknown error'}
        </div>
      ) : (
        <div className="content">
          <MarkdownRenderer
            markdown={message.content || (message.streaming ? '…' : '')}
            streaming={message.streaming}
            onSaveCodeBlock={
              message.role === 'assistant' && !message.streaming
                ? (code, language) =>
                    void saveBlockAsArtifact(
                      { code, language },
                      message.conversationId,
                      0,
                    )
                : undefined
            }
          />
        </div>
      )}
      {artifactIds.length > 0 ? (
        <div className="artifact-card-list">
          {artifactIds.map((id) => (
            <ArtifactCard
              key={id}
              attachmentId={id}
              conversationId={message.conversationId}
            />
          ))}
        </div>
      ) : null}
      {showActions ? (
        <div className="actions">
          <button type="button" onClick={onCopy} aria-label="Copy message" title="Copy">
            ⧉
          </button>
          {message.role === 'assistant' ? (
            <button
              type="button"
              onClick={() => onRegenerate(message.id)}
              aria-label="Regenerate response"
              title="Regenerate"
            >
              ↻
            </button>
          ) : null}
          {hasFencedBlocks ? (
            <button
              type="button"
              onClick={() =>
                void saveFencedBlocksFromMessage(
                  message.content,
                  message.conversationId,
                )
              }
              aria-label="Save code block as file"
              title="Save fenced code block as file"
            >
              ⤓
            </button>
          ) : null}
          <button
            type="button"
            className="link"
            onClick={() => {
              if (
                confirmDangerTwice({
                  title: 'Delete this message?',
                  detail: 'This removes the message from the chat history.',
                  finalDetail: 'Second confirmation: permanently delete this message?',
                })
              ) {
                removeMessage(message.id);
              }
            }}
            aria-label="Delete message"
            title="Delete"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
