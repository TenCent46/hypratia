import {
  beginCrossWindowDrag,
  broadcast,
  cancelCrossWindowDrag,
  onBroadcast,
  resolveCrossWindowDrag,
  type CrossWindowDragPayload,
} from '../../services/window';
import type { Message } from '../../types';

export const MIME_MESSAGE_ID = 'application/x-mc-message';
export const MIME_MESSAGE_JSON = 'application/x-mc-message-json';
export const MIME_CROSS_WINDOW_DRAG_SESSION =
  'application/x-platoscape-drag-session';
export const MIME_CROSS_WINDOW_DRAG_PAYLOAD =
  'application/x-platoscape-drag-payload';

let currentMessageDragId: string | null = null;
let currentDragImage: HTMLElement | null = null;
let remoteDragId: string | null = null;
let currentCrossWindowDragSessionId: string | null = null;

// Listen for sibling-window drags so the canvas in this window also accepts drops.
void onBroadcast((p) => {
  if (p.kind === 'drag-message-start') remoteDragId = p.messageId;
  else if (p.kind === 'drag-message-end') remoteDragId = null;
});

type MessageDragPayload = {
  type: 'memory-canvas/message';
  messageId: string;
};

function clip(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export function createMessageDragPayload(messageId: string): string {
  return JSON.stringify({ type: 'memory-canvas/message', messageId });
}

export function readMessageDragPayload(data: string): string | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as Partial<MessageDragPayload>;
    if (
      parsed.type === 'memory-canvas/message' &&
      typeof parsed.messageId === 'string' &&
      parsed.messageId.trim()
    ) {
      return parsed.messageId;
    }
  } catch {
    return null;
  }
  return null;
}

export function beginMessageDrag(messageId: string): void {
  currentMessageDragId = messageId;
  void broadcast({ kind: 'drag-message-start', messageId });
}

export function endMessageDrag(): void {
  const id = currentMessageDragId;
  const dragSessionId = currentCrossWindowDragSessionId;
  currentMessageDragId = null;
  currentCrossWindowDragSessionId = null;
  if (currentDragImage) {
    currentDragImage.remove();
    currentDragImage = null;
  }
  if (id) void broadcast({ kind: 'drag-message-end', messageId: id });
  if (dragSessionId) {
    window.setTimeout(() => {
      void cancelCrossWindowDrag(dragSessionId).catch(() => {
        // Dropped sessions are resolved/removed by the target window.
      });
    }, 1500);
  }
}

export function getCurrentMessageDragId(): string | null {
  return currentMessageDragId ?? remoteDragId;
}

function createDragSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `drag-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createCrossWindowDragPayload(
  message: Message,
): CrossWindowDragPayload {
  return {
    id: createDragSessionId(),
    type: 'chat-message',
    chatId: message.conversationId,
    messageId: message.id,
    content: message.content,
    metadata: {
      role: message.role,
      createdAt: message.createdAt,
      model: message.model,
    },
  };
}

export function beginCrossWindowMessageDrag(message: Message): CrossWindowDragPayload {
  const payload = createCrossWindowDragPayload(message);
  currentCrossWindowDragSessionId = payload.id;
  void beginCrossWindowDrag(payload)
    .then((registeredId) => {
      currentCrossWindowDragSessionId = registeredId;
    })
    .catch((err) => {
      console.warn('begin_cross_window_drag failed; using DataTransfer fallback', err);
    });
  return payload;
}

function parseCrossWindowDragPayload(data: string): CrossWindowDragPayload | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as Partial<CrossWindowDragPayload>;
    if (
      parsed.type === 'chat-message' &&
      typeof parsed.id === 'string' &&
      typeof parsed.chatId === 'string' &&
      typeof parsed.content === 'string'
    ) {
      return {
        id: parsed.id,
        type: 'chat-message',
        chatId: parsed.chatId,
        messageId: parsed.messageId,
        content: parsed.content,
        metadata: parsed.metadata,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function getCrossWindowDragSessionId(dataTransfer: DataTransfer): string | null {
  const id =
    dataTransfer.getData(MIME_CROSS_WINDOW_DRAG_SESSION) ||
    dataTransfer.getData('text/plain');
  if (!id || id.startsWith('{')) return null;
  return id;
}

export function getCrossWindowDragFallbackPayload(
  dataTransfer: DataTransfer,
): CrossWindowDragPayload | null {
  return (
    parseCrossWindowDragPayload(dataTransfer.getData(MIME_CROSS_WINDOW_DRAG_PAYLOAD)) ||
    parseCrossWindowDragPayload(dataTransfer.getData('application/json'))
  );
}

export async function resolveCrossWindowDragPayload(
  dragSessionId: string,
): Promise<CrossWindowDragPayload | null> {
  try {
    return await resolveCrossWindowDrag(dragSessionId);
  } catch (err) {
    console.warn('resolve_cross_window_drag failed', err);
    return null;
  }
}

export function createMessageDragImage(input: {
  role: string;
  title: string;
  content: string;
}): HTMLElement {
  if (currentDragImage) currentDragImage.remove();

  const ghost = document.createElement('div');
  ghost.className = 'message-drag-ghost';
  ghost.innerHTML = `
    <div class="message-drag-ghost-role">${clip(input.role, 24)}</div>
    <div class="message-drag-ghost-title">${clip(input.title, 64)}</div>
    <div class="message-drag-ghost-body">${clip(input.content, 120)}</div>
  `;
  document.body.appendChild(ghost);
  currentDragImage = ghost;
  return ghost;
}
