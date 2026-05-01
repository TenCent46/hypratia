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
