import type { ProviderId } from '../../types';

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatTextPart = { type: 'text'; text: string };
export type ChatImagePart = {
  type: 'image';
  image: Uint8Array;
  mediaType?: string;
};
export type ChatFilePart = {
  type: 'file';
  data: Uint8Array;
  mediaType: string;
  filename?: string;
};
export type ChatPart = ChatTextPart | ChatImagePart | ChatFilePart;

export type ChatMessage = {
  role: ChatRole;
  content: string | ChatPart[];
};

export type ReasoningEffort = 'low' | 'medium' | 'high';

export type ChatRequest = {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Anthropic / Gemini extended thinking */
  thinking?: { enabled: boolean; budgetTokens?: number };
  /** OpenAI reasoning effort (o-series) */
  reasoningEffort?: ReasoningEffort;
  /**
   * Conversation ID used to bind tools (e.g. create_file) so generated
   * artifacts land in the right project folder.
   */
  conversationId?: string;
  /**
   * Attach the provider's native web-search tool when the model supports
   * it. Mapped per provider:
   *   - Anthropic → `web_search_20250305`
   *   - OpenAI → Responses-API `web_search`
   *   - Google  → `google_search` grounding (drops custom function tools)
   */
  webSearch?: boolean;
};

export type ChatChunk =
  | { type?: 'text'; text: string }
  | { type: 'usage'; usage: { input: number; output: number } };

export type ChatResult = {
  text: string;
  usage?: { input: number; output: number };
};

export type TestKeyResult =
  | { ok: true; sampleModel: string }
  | { ok: false; error: string };

export type ListModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string };

export interface ChatProvider {
  stream(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk>;
  complete(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult>;
  testKey(provider: ProviderId, baseUrl?: string): Promise<TestKeyResult>;
  listModels(provider: ProviderId, baseUrl?: string): Promise<ListModelsResult>;
}
