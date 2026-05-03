import type { ProviderId } from '../../types';

export type ModelCapability =
  | 'text'
  | 'vision'
  | 'thinking'
  | 'reasoning_effort'
  | 'web_search'
  | 'audio';

export type ModelMeta = {
  id: string;
  /** A short, human-readable label. Falls back to `id`. */
  label?: string;
  capabilities?: ModelCapability[];
  /** USD per 1M input tokens (cached / non-cached). */
  inputUsdPer1M?: number;
  cachedInputUsdPer1M?: number;
  /** USD per 1M output tokens. */
  outputUsdPer1M?: number;
  /** Per-model context window (tokens). */
  contextWindow?: number;
};

export type ProviderMeta = {
  id: ProviderId;
  label: string;
  defaultBaseUrl?: string;
  needsKey: boolean;
  /** Built-in canonical models — id list. */
  defaultModels: string[];
  /** Detailed metadata for any model id (built-in or custom). */
  models: Record<string, ModelMeta>;
  testModel: string;
  docsUrl: string;
};

const OPENAI_MODELS: Record<string, ModelMeta> = {
  'gpt-5.5': {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    capabilities: ['text', 'vision', 'reasoning_effort', 'web_search'],
    inputUsdPer1M: 5,
    outputUsdPer1M: 30,
    contextWindow: 1000000,
  },
  'gpt-5.4-mini': {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    capabilities: ['text', 'vision', 'reasoning_effort', 'web_search'],
  },
  'gpt-5.4-nano': {
    id: 'gpt-5.4-nano',
    label: 'GPT-5.4 nano',
    capabilities: ['text', 'vision', 'reasoning_effort'],
  },
  'gpt-4o': {
    id: 'gpt-4o',
    label: 'GPT-4o',
    capabilities: ['text', 'vision'],
    inputUsdPer1M: 2.5,
    cachedInputUsdPer1M: 1.25,
    outputUsdPer1M: 10,
    contextWindow: 128000,
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    capabilities: ['text', 'vision'],
    inputUsdPer1M: 0.15,
    cachedInputUsdPer1M: 0.075,
    outputUsdPer1M: 0.6,
    contextWindow: 128000,
  },
  'gpt-4.1': {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    capabilities: ['text', 'vision'],
    inputUsdPer1M: 2,
    cachedInputUsdPer1M: 0.5,
    outputUsdPer1M: 8,
    contextWindow: 1000000,
  },
  'gpt-4.1-mini': {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini',
    capabilities: ['text', 'vision'],
    inputUsdPer1M: 0.4,
    cachedInputUsdPer1M: 0.1,
    outputUsdPer1M: 1.6,
    contextWindow: 1000000,
  },
  'o3': {
    id: 'o3',
    label: 'o3 (reasoning)',
    capabilities: ['text', 'vision', 'reasoning_effort'],
    inputUsdPer1M: 2,
    cachedInputUsdPer1M: 0.5,
    outputUsdPer1M: 8,
    contextWindow: 200000,
  },
  'o3-mini': {
    id: 'o3-mini',
    label: 'o3-mini (reasoning)',
    capabilities: ['text', 'reasoning_effort'],
    inputUsdPer1M: 1.1,
    cachedInputUsdPer1M: 0.55,
    outputUsdPer1M: 4.4,
    contextWindow: 200000,
  },
  'o4-mini': {
    id: 'o4-mini',
    label: 'o4-mini (reasoning)',
    capabilities: ['text', 'vision', 'reasoning_effort'],
    inputUsdPer1M: 1.1,
    cachedInputUsdPer1M: 0.275,
    outputUsdPer1M: 4.4,
    contextWindow: 200000,
  },
};

const ANTHROPIC_MODELS: Record<string, ModelMeta> = {
  'claude-opus-4-7': {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    capabilities: ['text', 'vision', 'thinking', 'web_search'],
    inputUsdPer1M: 15,
    cachedInputUsdPer1M: 1.5,
    outputUsdPer1M: 75,
    contextWindow: 200000,
  },
  'claude-opus-4-7-1m': {
    id: 'claude-opus-4-7-1m',
    label: 'Claude Opus 4.7 (1M context)',
    capabilities: ['text', 'vision', 'thinking', 'web_search'],
    inputUsdPer1M: 18,
    cachedInputUsdPer1M: 1.8,
    outputUsdPer1M: 90,
    contextWindow: 1000000,
  },
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    capabilities: ['text', 'vision', 'thinking', 'web_search'],
    inputUsdPer1M: 3,
    cachedInputUsdPer1M: 0.3,
    outputUsdPer1M: 15,
    contextWindow: 200000,
  },
  'claude-haiku-4-5': {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    capabilities: ['text', 'vision', 'thinking', 'web_search'],
    inputUsdPer1M: 1,
    cachedInputUsdPer1M: 0.1,
    outputUsdPer1M: 5,
    contextWindow: 200000,
  },
};

// Groq production + free-tier preview models (2026-05). Free tier defaults to
// 30 RPM / 6K TPM / 1K RPD, except where Groq has set per-model overrides.
// Source: https://console.groq.com/docs/models
const GROQ_MODELS: Record<string, ModelMeta> = {
  'openai/gpt-oss-120b': {
    id: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B (production)',
    capabilities: ['text', 'thinking'],
    inputUsdPer1M: 0.15,
    outputUsdPer1M: 0.6,
    contextWindow: 128000,
  },
  'meta-llama/llama-4-scout-17b-16e-instruct': {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B (vision)',
    capabilities: ['text', 'vision'],
    inputUsdPer1M: 0.11,
    outputUsdPer1M: 0.34,
    contextWindow: 128000,
  },
  'openai/gpt-oss-20b': {
    id: 'openai/gpt-oss-20b',
    label: 'GPT-OSS 20B (fast)',
    capabilities: ['text', 'thinking'],
    inputUsdPer1M: 0.075,
    outputUsdPer1M: 0.3,
    contextWindow: 128000,
  },
  'moonshotai/kimi-k2-instruct-0905': {
    id: 'moonshotai/kimi-k2-instruct-0905',
    label: 'Kimi K2 0905 (256K, agentic)',
    capabilities: ['text'],
    inputUsdPer1M: 1,
    cachedInputUsdPer1M: 0.5,
    outputUsdPer1M: 3,
    contextWindow: 262144,
  },
  'qwen/qwen3-32b': {
    id: 'qwen/qwen3-32b',
    label: 'Qwen 3 32B (reasoning)',
    capabilities: ['text', 'thinking'],
    inputUsdPer1M: 0.29,
    outputUsdPer1M: 0.59,
    contextWindow: 131072,
  },
  'deepseek-r1-distill-llama-70b': {
    id: 'deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1 distill (Llama 70B)',
    capabilities: ['text', 'thinking'],
  },
  'llama-3.3-70b-versatile': {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B versatile',
    capabilities: ['text'],
    inputUsdPer1M: 0.59,
    outputUsdPer1M: 0.79,
    contextWindow: 128000,
  },
  'llama-3.1-8b-instant': {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B instant',
    capabilities: ['text'],
    inputUsdPer1M: 0.05,
    outputUsdPer1M: 0.08,
    contextWindow: 128000,
  },
};

const MISTRAL_MODELS: Record<string, ModelMeta> = {
  'mistral-large-latest': {
    id: 'mistral-large-latest',
    label: 'Mistral Large',
    capabilities: ['text'],
    inputUsdPer1M: 2,
    outputUsdPer1M: 6,
  },
  'mistral-small-latest': {
    id: 'mistral-small-latest',
    label: 'Mistral Small',
    capabilities: ['text'],
    inputUsdPer1M: 0.2,
    outputUsdPer1M: 0.6,
  },
  'magistral-medium-latest': {
    id: 'magistral-medium-latest',
    label: 'Magistral medium (reasoning)',
    capabilities: ['text', 'thinking'],
  },
  'codestral-latest': {
    id: 'codestral-latest',
    label: 'Codestral',
    capabilities: ['text'],
    inputUsdPer1M: 0.3,
    outputUsdPer1M: 0.9,
  },
  'pixtral-large-latest': {
    id: 'pixtral-large-latest',
    label: 'Pixtral Large (vision)',
    capabilities: ['text', 'vision'],
  },
};

const GOOGLE_MODELS: Record<string, ModelMeta> = {
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    capabilities: ['text', 'vision', 'thinking', 'audio', 'web_search'],
    inputUsdPer1M: 1.25,
    outputUsdPer1M: 10,
    contextWindow: 2000000,
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    capabilities: ['text', 'vision', 'thinking', 'audio', 'web_search'],
    inputUsdPer1M: 0.3,
    outputUsdPer1M: 2.5,
    contextWindow: 1000000,
  },
  'gemini-2.5-flash-lite': {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    capabilities: ['text', 'vision'],
    inputUsdPer1M: 0.1,
    outputUsdPer1M: 0.4,
  },
};

const OLLAMA_MODELS: Record<string, ModelMeta> = {
  'llama3.1': { id: 'llama3.1', capabilities: ['text'] },
  'llama3.3': { id: 'llama3.3', capabilities: ['text'] },
  'qwen2.5': { id: 'qwen2.5', capabilities: ['text'] },
  'mistral': { id: 'mistral', capabilities: ['text'] },
  'gemma3': { id: 'gemma3', capabilities: ['text'] },
};

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    needsKey: true,
    defaultModels: Object.keys(OPENAI_MODELS),
    models: OPENAI_MODELS,
    testModel: 'gpt-4o-mini',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    needsKey: true,
    defaultModels: Object.keys(ANTHROPIC_MODELS),
    models: ANTHROPIC_MODELS,
    testModel: 'claude-haiku-4-5',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    needsKey: true,
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModels: Object.keys(GROQ_MODELS),
    models: GROQ_MODELS,
    testModel: 'llama-3.1-8b-instant',
    docsUrl: 'https://console.groq.com/keys',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    needsKey: true,
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModels: Object.keys(MISTRAL_MODELS),
    models: MISTRAL_MODELS,
    testModel: 'mistral-small-latest',
    docsUrl: 'https://console.mistral.ai/api-keys/',
  },
  google: {
    id: 'google',
    label: 'Google (Gemini)',
    needsKey: true,
    defaultModels: Object.keys(GOOGLE_MODELS),
    models: GOOGLE_MODELS,
    testModel: 'gemini-2.5-flash',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    needsKey: false,
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModels: Object.keys(OLLAMA_MODELS),
    models: OLLAMA_MODELS,
    testModel: 'llama3.1',
    docsUrl: 'https://ollama.com',
  },
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'OpenAI-compatible (custom)',
    needsKey: true,
    defaultModels: [],
    models: {},
    testModel: '',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
  },
};

export const PROVIDER_ORDER: ProviderId[] = [
  'openai',
  'anthropic',
  'groq',
  'mistral',
  'google',
  'ollama',
  'openai-compatible',
];

export function getModelMeta(
  provider: ProviderId,
  model: string,
): ModelMeta | undefined {
  return PROVIDERS[provider].models[model];
}

export function modelLabel(provider: ProviderId, model: string): string {
  return PROVIDERS[provider].models[model]?.label ?? model;
}
