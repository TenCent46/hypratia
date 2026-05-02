import { useStore } from '../../store';
import type { ID, Message, ModelRef, ProviderId, Settings } from '../../types';
import { chat } from '../llm';
import { secrets, SECRET_KEY } from '../secrets';

const AUTO_TITLE_RE = /^(untitled|new chat|new conversation|first conversation)$/i;
const GROQ_TITLE_MODEL = 'llama-3.1-8b-instant';
const OPENAI_TITLE_FALLBACKS = [
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
];

function isAutoTitleCandidate(title: string): boolean {
  const normalized = title.trim();
  return !normalized || AUTO_TITLE_RE.test(normalized);
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_~>[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(value: string): string {
  const oneLine = stripMarkdown(value)
    .split(/\r?\n/)[0]
    .replace(/^["'“”‘’「『]+|["'“”‘’」』.。:：-]+$/g, '')
    .trim();
  if (!oneLine) return '';
  return oneLine.length > 60 ? `${oneLine.slice(0, 57).trim()}...` : oneLine;
}

async function providerReady(settings: Settings, provider: ProviderId): Promise<boolean> {
  const cfg = settings.providers[provider];
  if (!cfg?.enabled) return false;
  if (provider === 'ollama') return true;
  const key = await secrets.get(SECRET_KEY(provider));
  return Boolean(key);
}

function pickOpenAiMiniModel(settings: Settings): string {
  const configured = settings.providers.openai?.defaultModel;
  if (configured && /(?:mini|nano)/i.test(configured)) return configured;
  return OPENAI_TITLE_FALLBACKS[0];
}

async function pickTitleModel(settings: Settings): Promise<ModelRef | undefined> {
  if (await providerReady(settings, 'groq')) {
    return {
      provider: 'groq',
      model: settings.providers.groq?.defaultModel ?? GROQ_TITLE_MODEL,
    };
  }
  if (await providerReady(settings, 'openai')) {
    return {
      provider: 'openai',
      model: pickOpenAiMiniModel(settings),
    };
  }
  return undefined;
}

function fallbackTitleFrom(text: string): string {
  const cleaned = stripMarkdown(text);
  if (!cleaned) return 'Untitled';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    return cleanTitle(words.slice(0, 7).join(' '));
  }
  return cleanTitle(cleaned.slice(0, 42));
}

function firstMessages(messages: Message[], conversationId: ID) {
  const ordered = messages
    .filter((m) => m.conversationId === conversationId && !m.errored)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    user: ordered.find((m) => m.role === 'user'),
    assistant: ordered.find((m) => m.role === 'assistant' && !m.streaming),
  };
}

async function generateTitleWithModel(
  userText: string,
  assistantText: string,
  model: ModelRef,
): Promise<string> {
  const result = await chat.complete({
    provider: model.provider,
    model: model.model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'Name this chat conversation. Return only a concise title, in the same language as the user when possible. No quotes. No punctuation at the end. Maximum 6 words or 30 Japanese characters.',
      },
      {
        role: 'user',
        content: [
          'First user message:',
          userText.slice(0, 1200),
          '',
          'First assistant response:',
          assistantText.slice(0, 1200),
        ].join('\n'),
      },
    ],
  });
  return cleanTitle(result.text);
}

export async function autoTitleConversation(
  conversationId: ID,
  preferredModel?: ModelRef,
): Promise<void> {
  const state = useStore.getState();
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation || !isAutoTitleCandidate(conversation.title)) return;

  const { user, assistant } = firstMessages(state.messages, conversationId);
  if (!user) return;

  let title = '';
  const model = preferredModel ?? await pickTitleModel(state.settings);
  if (model && assistant?.content) {
    try {
      title = await generateTitleWithModel(user.content, assistant.content, model);
    } catch {
      title = '';
    }
  }
  if (!title) title = fallbackTitleFrom(user.content);
  if (!title || title === 'Untitled') return;

  const latest = useStore.getState().conversations.find((c) => c.id === conversationId);
  if (!latest || !isAutoTitleCandidate(latest.title)) return;
  useStore.getState().renameConversation(conversationId, title);
}

/* -------------------------------------------------------------------- *
 * Generic content-aware title generation                               *
 *                                                                      *
 * Used by canvas nodes, AI palette responses, markdown notes, and      *
 * artifact files so titles reflect what the content is actually about  *
 * — not just the first 60 characters. Same model selection as          *
 * `autoTitleConversation`: prefers Groq's free Llama 3.1 8B Instant,   *
 * falls back to OpenAI's mini/nano family, and finally falls back to a *
 * heuristic when no provider is configured. Results are cached so the  *
 * same content doesn't pay for the same prompt twice.                  *
 * -------------------------------------------------------------------- */

export type TitleKind = 'note' | 'ask' | 'answer' | 'document';

const SYSTEM_PROMPT_BY_KIND: Record<TitleKind, string> = {
  note: 'You name short markdown notes. Return one concise descriptive title that reflects the note\'s topic. Same language as the content. No quotes, no trailing punctuation. Max 6 words or 30 Japanese characters.',
  ask: 'You name a user question for use as a card title in a thinking app. Return one concise title that captures what the user is asking about. Same language as the question. No quotes, no question mark at the end. Max 6 words or 30 Japanese characters.',
  answer: 'You name an AI answer for use as a card title in a thinking app. Return one concise title that captures the topic of the answer (not "AI answer" or "Response"). Same language as the answer. No quotes, no trailing punctuation. Max 6 words or 30 Japanese characters.',
  document: 'You name a document. Return one concise title reflecting the document\'s topic. Same language as the content. No quotes, no trailing punctuation. Max 6 words or 30 Japanese characters.',
};

/** ~24h LRU keyed by content hash + kind so repeated calls are free. */
const titleCache = new Map<string, { title: string; at: number }>();
const TITLE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TITLE_CACHE_MAX = 200;

function hashKey(value: string): string {
  // Fast non-cryptographic hash (DJB2 variant). Good enough to dedupe
  // identical content within a session.
  let h = 5381;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function cacheLookup(key: string): string | undefined {
  const hit = titleCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TITLE_CACHE_TTL_MS) {
    titleCache.delete(key);
    return undefined;
  }
  return hit.title;
}

function cacheSet(key: string, title: string): void {
  titleCache.set(key, { title, at: Date.now() });
  if (titleCache.size > TITLE_CACHE_MAX) {
    // Drop the oldest entry. Map iteration is insertion-ordered.
    const first = titleCache.keys().next().value;
    if (first) titleCache.delete(first);
  }
}

/**
 * Build a content-aware title using the configured light model. Returns
 * a fallback title (heuristic) when no provider is configured or the
 * model errors. Never throws.
 */
export async function generateContentTitle(input: {
  content: string;
  context?: string;
  kind: TitleKind;
  fallback?: string;
  /** Override model selection. Otherwise picks Groq → OpenAI mini → fallback. */
  model?: ModelRef;
  /** Bypass the cache and force a fresh call. */
  fresh?: boolean;
}): Promise<string> {
  const content = (input.content ?? '').trim();
  if (!content) return cleanTitle(input.fallback ?? '') || 'Untitled';

  const cacheKey = `${input.kind}|${hashKey(content)}|${hashKey(
    input.context ?? '',
  )}`;
  if (!input.fresh) {
    const cached = cacheLookup(cacheKey);
    if (cached) return cached;
  }

  const model =
    input.model ?? (await pickTitleModel(useStore.getState().settings));
  if (!model) {
    const fb = cleanTitle(input.fallback ?? '') || fallbackTitleFrom(content);
    return fb || 'Untitled';
  }

  try {
    const result = await chat.complete({
      provider: model.provider,
      model: model.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_BY_KIND[input.kind] },
        {
          role: 'user',
          content: input.context
            ? [
                'Context:',
                input.context.slice(0, 800),
                '',
                'Content to title:',
                content.slice(0, 1600),
              ].join('\n')
            : `Content to title:\n${content.slice(0, 1600)}`,
        },
      ],
    });
    const title = cleanTitle(result.text);
    if (!title) {
      return cleanTitle(input.fallback ?? '') || fallbackTitleFrom(content);
    }
    cacheSet(cacheKey, title);
    return title;
  } catch {
    return cleanTitle(input.fallback ?? '') || fallbackTitleFrom(content);
  }
}

/** Re-title looks like a heuristic / placeholder we should refine. */
const PLACEHOLDER_TITLE_RE =
  /^(untitled|new note|new chat|new conversation|first conversation|answer\b|ai answer|response|note|memo|markdown|.+?\.\.\.)$/i;

/**
 * Refine a CanvasNode's title in the background. Idempotent — safely
 * skips when the current title is already user-set (i.e. doesn't match
 * the placeholder regex) unless `force: true` is passed.
 *
 * Always uses the same content the node renders, so titles stay in
 * sync with what the user sees. Errors are swallowed.
 */
export async function autoTitleNode(input: {
  nodeId: ID;
  kind: TitleKind;
  /** Optional supporting context (e.g. the question for an answer). */
  context?: string;
  /** Force a refresh even when the current title doesn't look placeholder-y. */
  force?: boolean;
}): Promise<void> {
  const state = useStore.getState();
  const node = state.nodes.find((n) => n.id === input.nodeId);
  if (!node) return;
  const current = (node.title ?? '').trim();
  if (!input.force && current && !PLACEHOLDER_TITLE_RE.test(current)) {
    // User-authored or already-good title; leave it alone.
    return;
  }
  const content = node.contentMarkdown ?? '';
  if (content.trim().length < 10) return;
  const title = await generateContentTitle({
    content,
    context: input.context,
    kind: input.kind,
    fallback: current || undefined,
  });
  if (!title || title === current) return;
  // Re-check from the latest store snapshot so we don't clobber a
  // mid-flight rename initiated by the user.
  const latest = useStore.getState().nodes.find((n) => n.id === input.nodeId);
  if (!latest) return;
  const latestTitle = (latest.title ?? '').trim();
  if (!input.force && latestTitle && !PLACEHOLDER_TITLE_RE.test(latestTitle)) {
    return;
  }
  useStore.getState().updateNode(input.nodeId, { title });
}
