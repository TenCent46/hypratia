import {
  generateText,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { buildTools } from './tools';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { secrets, SECRET_KEY } from '../secrets';
import { PROVIDERS } from './providers';
import type {
  ChatChunk,
  ChatProvider,
  ChatRequest,
  ChatResult,
  ListModelsResult,
  TestKeyResult,
} from './ChatProvider';
import type { ProviderId } from '../../types';

/** Providers we can attach a native web-search tool to. */
type WebSearchProvider = 'anthropic' | 'openai' | 'google';
function supportsWebSearch(provider: ProviderId): provider is WebSearchProvider {
  return provider === 'anthropic' || provider === 'openai' || provider === 'google';
}

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [k: string]: JSONValue | undefined };

function buildProviderOptions(
  req: ChatRequest,
): Record<string, { [k: string]: JSONValue | undefined }> | undefined {
  const opts: Record<string, { [k: string]: JSONValue | undefined }> = {};
  if (req.thinking?.enabled) {
    if (req.provider === 'anthropic') {
      opts.anthropic = {
        thinking: {
          type: 'enabled',
          budgetTokens: req.thinking.budgetTokens ?? 8000,
        },
      };
    } else if (req.provider === 'google') {
      opts.google = {
        thinkingConfig: {
          thinkingBudget: req.thinking.budgetTokens ?? 4000,
          includeThoughts: false,
        },
      };
    }
  }
  if (req.reasoningEffort && req.provider === 'openai') {
    opts.openai = { reasoningEffort: req.reasoningEffort };
  }
  return Object.keys(opts).length > 0 ? opts : undefined;
}

async function resolveModel(
  provider: ProviderId,
  modelId: string,
  baseUrl?: string,
  useResponsesApi = false,
): Promise<LanguageModel> {
  const meta = PROVIDERS[provider];
  switch (provider) {
    case 'openai': {
      const apiKey = (await secrets.get(SECRET_KEY('openai'))) ?? '';
      const openai = createOpenAI({ apiKey });
      // Web search lives behind the Responses API. When the caller wants
      // it active, use `.responses(modelId)` to get a Responses-flavoured
      // LanguageModel; otherwise stick with the chat-completions flavour
      // so existing flows (no tools / artifact tools) keep working.
      return useResponsesApi ? openai.responses(modelId) : openai(modelId);
    }
    case 'anthropic': {
      const apiKey = (await secrets.get(SECRET_KEY('anthropic'))) ?? '';
      return createAnthropic({
        apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(modelId);
    }
    case 'mistral': {
      const apiKey = (await secrets.get(SECRET_KEY('mistral'))) ?? '';
      return createMistral({ apiKey })(modelId);
    }
    case 'google': {
      const apiKey = (await secrets.get(SECRET_KEY('google'))) ?? '';
      return createGoogleGenerativeAI({ apiKey })(modelId);
    }
    case 'groq':
    case 'openai-compatible': {
      const apiKey = (await secrets.get(SECRET_KEY(provider))) ?? '';
      const url = baseUrl ?? meta.defaultBaseUrl;
      if (!url) throw new Error(`${meta.label} requires a base URL`);
      return createOpenAICompatible({
        name: provider,
        apiKey,
        baseURL: url,
      })(modelId);
    }
    case 'ollama': {
      const url = baseUrl ?? meta.defaultBaseUrl ?? 'http://localhost:11434/v1';
      return createOpenAICompatible({
        name: 'ollama',
        apiKey: 'ollama', // not validated by ollama, but the lib expects a string
        baseURL: url,
      })(modelId);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Build the provider-native web-search tool for the active request.
 * Returns `null` when web search isn't requested or when the provider
 * has no native tool we can attach. Caller merges the result into the
 * existing function-tool set.
 */
async function buildWebSearchTools(
  req: ChatRequest,
): Promise<Record<string, unknown> | null> {
  if (!req.webSearch) return null;
  if (!supportsWebSearch(req.provider)) return null;
  switch (req.provider) {
    case 'anthropic': {
      // Lazy import so non-Anthropic flows don't pay the bundle cost.
      const { anthropic } = await import('@ai-sdk/anthropic');
      return { web_search: anthropic.tools.webSearch_20250305({}) };
    }
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai');
      // The Responses-API web-search tool is registered under the same
      // name the API expects so the model can call it.
      return { web_search: openai.tools.webSearch({}) };
    }
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      // Google enforces the tool name `google_search`.
      return { google_search: google.tools.googleSearch({}) };
    }
  }
}

export class AiSdkChatProvider implements ChatProvider {
  async *stream(
    req: ChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ChatChunk> {
    const useResponsesApi = req.webSearch === true && req.provider === 'openai';
    const dropForGoogleSearch = req.webSearch === true && req.provider === 'google';
    const provider = await resolveModel(
      req.provider,
      req.model,
      undefined,
      useResponsesApi,
    );
    const fnTools = req.conversationId
      ? await buildTools(req.conversationId, { dropForGoogleSearch })
      : {};
    const webTools = (await buildWebSearchTools(req)) ?? {};
    const merged = { ...fnTools, ...webTools };
    const tools =
      Object.keys(merged).length > 0 ? (merged as ToolSet) : undefined;
    const result = streamText({
      model: provider,
      messages: req.messages as ModelMessage[],
      temperature: req.temperature,
      abortSignal: signal,
      providerOptions: buildProviderOptions(req),
      ...(tools ? { tools, stopWhen: stepCountIs(8) } : {}),
    });
    for await (const chunk of result.textStream) {
      yield { type: 'text', text: chunk };
    }
    try {
      const usage = await result.usage;
      if (usage) {
        yield {
          type: 'usage',
          usage: {
            input: usage.inputTokens ?? 0,
            output: usage.outputTokens ?? 0,
          },
        };
      }
    } catch {
      // best-effort; some providers don't report
    }
  }

  async complete(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
    const useResponsesApi = req.webSearch === true && req.provider === 'openai';
    const dropForGoogleSearch = req.webSearch === true && req.provider === 'google';
    const provider = await resolveModel(
      req.provider,
      req.model,
      undefined,
      useResponsesApi,
    );
    const fnTools = req.conversationId
      ? await buildTools(req.conversationId, { dropForGoogleSearch })
      : {};
    const webTools = (await buildWebSearchTools(req)) ?? {};
    const merged = { ...fnTools, ...webTools };
    const tools =
      Object.keys(merged).length > 0 ? (merged as ToolSet) : undefined;
    const result = await generateText({
      model: provider,
      messages: req.messages as ModelMessage[],
      temperature: req.temperature,
      abortSignal: signal,
      providerOptions: buildProviderOptions(req),
      ...(tools ? { tools, stopWhen: stepCountIs(8) } : {}),
    });
    return {
      text: result.text,
      usage: result.usage
        ? {
            input: result.usage.inputTokens ?? 0,
            output: result.usage.outputTokens ?? 0,
          }
        : undefined,
    };
  }

  async listModels(
    providerId: ProviderId,
    baseUrl?: string,
  ): Promise<ListModelsResult> {
    const meta = PROVIDERS[providerId];
    try {
      switch (providerId) {
        case 'groq':
        case 'openai':
        case 'mistral':
        case 'openai-compatible':
        case 'ollama': {
          const apiKey = (await secrets.get(SECRET_KEY(providerId))) ?? '';
          const url = baseUrl ?? meta.defaultBaseUrl;
          if (!url && providerId !== 'openai') {
            return { ok: false, error: 'Base URL is required' };
          }
          const endpoint = providerId === 'openai'
            ? 'https://api.openai.com/v1/models'
            : `${(url ?? '').replace(/\/$/, '')}/models`;
          const r = await fetch(endpoint, {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          });
          if (!r.ok) {
            return {
              ok: false,
              error: `HTTP ${r.status}: ${r.statusText}`,
            };
          }
          const json = (await r.json()) as {
            data?: Array<{ id?: string; name?: string }>;
            models?: Array<{ name?: string; id?: string }>;
          };
          const list = (json.data ?? json.models ?? [])
            .map((m) => m?.id ?? m?.name ?? '')
            .filter((s): s is string => Boolean(s))
            .sort();
          return { ok: true, models: list };
        }
        case 'anthropic': {
          const apiKey = (await secrets.get(SECRET_KEY('anthropic'))) ?? '';
          if (!apiKey) {
            return { ok: false, error: 'API key is required' };
          }
          const r = await fetch('https://api.anthropic.com/v1/models', {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
          });
          if (!r.ok) {
            return {
              ok: false,
              error: `HTTP ${r.status}: ${r.statusText}`,
            };
          }
          const json = (await r.json()) as {
            data?: Array<{ id?: string }>;
          };
          const list = (json.data ?? [])
            .map((m) => m?.id ?? '')
            .filter((s): s is string => Boolean(s))
            .sort();
          return { ok: true, models: list };
        }
        case 'google': {
          const apiKey = (await secrets.get(SECRET_KEY('google'))) ?? '';
          if (!apiKey) {
            return { ok: false, error: 'API key is required' };
          }
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
          );
          if (!r.ok) {
            return {
              ok: false,
              error: `HTTP ${r.status}: ${r.statusText}`,
            };
          }
          const json = (await r.json()) as {
            models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
          };
          const list = (json.models ?? [])
            .filter(
              (m) =>
                !m.supportedGenerationMethods ||
                m.supportedGenerationMethods.includes('generateContent'),
            )
            .map((m) => (m?.name ?? '').replace(/^models\//, ''))
            .filter((s): s is string => Boolean(s))
            .sort();
          return { ok: true, models: list };
        }
        default:
          return {
            ok: false,
            error: `Listing not supported for ${meta.label}`,
          };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  async testKey(
    providerId: ProviderId,
    baseUrl?: string,
  ): Promise<TestKeyResult> {
    const meta = PROVIDERS[providerId];
    if (!meta.testModel) {
      return { ok: false, error: 'No test model configured for this provider' };
    }
    try {
      const model = await resolveModel(providerId, meta.testModel, baseUrl);
      const r = await generateText({
        model,
        prompt: 'Reply with just: ok',
      });
      if (r.text.toLowerCase().includes('ok')) {
        return { ok: true, sampleModel: meta.testModel };
      }
      // Still consider verified if the call succeeded
      return { ok: true, sampleModel: meta.testModel };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
}
