import matter from 'gray-matter';
import { useStore } from '../../store';
import type { Conversation, Message } from '../../types';
import { MIRROR_SOURCE_TAG } from './conversationMarkdownMirror';

/**
 * Manual, user-triggered Markdown → chat re-import.
 *
 * The mirror banner on a chat-history file always reads as "edits don't
 * sync back" because automatic two-way sync is genuinely unsafe (one
 * stale window can clobber an in-flight chat stream). This helper is the
 * safer middle ground: a user explicitly invokes it, we parse the
 * Markdown back into messages, and we replace the conversation's
 * messages atomically.
 *
 * Preconditions checked at call time:
 *   - The doc has frontmatter `source: internal-chat`.
 *   - `conversationId` from frontmatter matches an existing conversation.
 *   - The conversation is **not** currently streaming (no message has
 *     `streaming: true`); we abort with a structured error otherwise.
 *
 * Format expected (matches what the mirror writes):
 *
 *   # Title
 *
 *   ## User
 *   *<iso>*
 *
 *   <body>
 *
 *   ## Assistant
 *   ...
 */

export type ReimportResult =
  | { ok: true; conversationId: string; messageCount: number }
  | { ok: false; reason: string };

const ROLE_HEADINGS: Record<string, Message['role']> = {
  '## user': 'user',
  '## assistant': 'assistant',
  '## system': 'system',
};

function parseMessages(body: string, conversationId: string): Message[] {
  const lines = body.split('\n');
  const out: Message[] = [];
  let currentRole: Message['role'] | null = null;
  let currentTimestamp: string | null = null;
  let buffer: string[] = [];
  let nextSeq = 0;
  function flush() {
    if (currentRole === null) return;
    const content = buffer.join('\n').replace(/^\s+|\s+$/g, '');
    if (!content && out.length === 0) return;
    out.push({
      id: `reimport-${conversationId}-${nextSeq++}`,
      conversationId,
      role: currentRole,
      content,
      createdAt: currentTimestamp ?? new Date().toISOString(),
    });
    buffer = [];
  }
  for (const raw of lines) {
    const trimmed = raw.trim().toLowerCase();
    const role = ROLE_HEADINGS[trimmed];
    if (role) {
      flush();
      currentRole = role;
      currentTimestamp = null;
      continue;
    }
    if (currentRole === null) continue;
    // Italic ISO timestamp on the first non-empty line of a section.
    const tsMatch = raw.match(/^\*([^*]+)\*\s*$/);
    if (tsMatch && buffer.length === 0) {
      const dt = new Date(tsMatch[1].trim());
      if (!Number.isNaN(dt.getTime())) {
        currentTimestamp = dt.toISOString();
        continue;
      }
    }
    buffer.push(raw);
  }
  flush();
  return out;
}

/**
 * Run the re-import. Returns a result discriminator; the caller decides
 * how to surface success / failure (toast, dialog, ignore).
 */
export function reimportMarkdownIntoChat(doc: string): ReimportResult {
  const parsed = matter(doc);
  const data = parsed.data as { source?: unknown; conversationId?: unknown };
  if (data.source !== MIRROR_SOURCE_TAG) {
    return { ok: false, reason: 'File is not a chat mirror.' };
  }
  const id = typeof data.conversationId === 'string' ? data.conversationId : null;
  if (!id) return { ok: false, reason: 'Missing conversationId.' };
  const state = useStore.getState();
  const conv: Conversation | undefined = state.conversations.find((c) => c.id === id);
  if (!conv) return { ok: false, reason: 'Conversation no longer exists.' };
  const streaming = state.messages.some((m) => m.conversationId === id && m.streaming);
  if (streaming) return { ok: false, reason: 'Chat is currently streaming; try again after it finishes.' };

  const messages = parseMessages(parsed.content, id);
  if (messages.length === 0) {
    return { ok: false, reason: 'No User / Assistant sections were found.' };
  }
  const messageIds = messages.map((m) => m.id);
  // Atomic state replacement — drop the old messages for this
  // conversation and substitute the parsed ones. We deliberately don't
  // try to merge: the user just told us to make the JSON match the
  // Markdown, so the Markdown wins.
  useStore.setState((s) => ({
    messages: [
      ...s.messages.filter((m) => m.conversationId !== id),
      ...messages,
    ],
    conversations: s.conversations.map((c) =>
      c.id === id
        ? {
            ...c,
            messageIds,
            updatedAt: new Date().toISOString(),
          }
        : c,
    ),
  }));
  return { ok: true, conversationId: id, messageCount: messages.length };
}
