import { secrets, SECRET_KEY } from '../secrets';
import { chat } from '../llm';
import type { ModelRef, ProviderId, Settings } from '../../types';
import type { ChainTier } from './types';

const LIGHT_NAME_RE = /^(llama|qwen|phi|mistral|gemma)[-_]?\d/i;

const CLOUD_LIGHT_TIER: ModelRef[] = [
  { provider: 'openai', model: 'gpt-4o-mini' },
  { provider: 'openai', model: 'gpt-4.1-mini' },
  { provider: 'anthropic', model: 'claude-haiku-4-5' },
  { provider: 'google', model: 'gemini-2.5-flash' },
];

/**
 * Build the per-call model chain. Order:
 *
 *   1. Light tier — first matching local Llama / Qwen / Phi / Mistral via
 *      Groq or Ollama. No key check for Ollama (it is local).
 *   2. Cheap-cloud tier — `gpt-4o-mini`, `gpt-4.1-mini`, Haiku 4.5,
 *      Gemini Flash, in that order, **only** when the corresponding key
 *      is set.
 *   3. Heavy tier — `settings.defaultModel` (if any).
 *   4. Heuristic — pure-JS fallback path.
 *
 * Duplicates are removed and any tier the chain already includes is
 * skipped when adding a later one.
 */
export async function buildModelChain(
  settings: Settings,
): Promise<ChainTier[]> {
  const out: ChainTier[] = [];
  const seen = new Set<string>();
  const push = (m: ChainTier) => {
    const key = m === 'heuristic' ? 'heuristic' : `${m.provider}|${m.model}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(m);
  };

  // 1. Light: Ollama or Groq llama-likes.
  const ollama = settings.providers.ollama;
  if (ollama?.enabled) {
    const all = [
      ...((ollama.customModels ?? []) as string[]),
      'llama3.1',
      'llama3',
    ];
    const match = all.find((m) => LIGHT_NAME_RE.test(m));
    if (match) push({ provider: 'ollama', model: match });
  }
  const groq = settings.providers.groq;
  if (groq?.enabled && (await hasKey('groq'))) {
    const all = [
      ...((groq.customModels ?? []) as string[]),
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
    ];
    const match = all.find((m) => LIGHT_NAME_RE.test(m));
    if (match) push({ provider: 'groq', model: match });
  }

  // 2. Cheap cloud — gated on a configured key for that provider.
  for (const m of CLOUD_LIGHT_TIER) {
    if (await hasKey(m.provider)) push(m);
  }

  // 3. Heavy — user's chosen default.
  if (settings.defaultModel) push(settings.defaultModel);

  // 4. Heuristic always present last.
  push('heuristic');
  return out;
}

async function hasKey(provider: ProviderId): Promise<boolean> {
  return secrets.get(SECRET_KEY(provider)).then((v) => Boolean(v));
}

export type LlmAttempt<T> = (model: ModelRef, signal?: AbortSignal) => Promise<T>;

/**
 * Try each model tier in order, returning the first that yields a
 * non-null result. `attempt` should throw or return null on failure
 * (malformed JSON, empty response, etc.). The `'heuristic'` tier is
 * never passed to `attempt`; the caller handles that explicitly via
 * `runChain`'s second callback.
 */
export async function runChain<T>(
  chain: ChainTier[],
  attempt: LlmAttempt<T | null>,
  heuristic: () => T,
  signal?: AbortSignal,
): Promise<{ value: T; modelUsed: ChainTier }> {
  for (const tier of chain) {
    if (signal?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    if (tier === 'heuristic') {
      return { value: heuristic(), modelUsed: 'heuristic' };
    }
    try {
      const v = await attempt(tier, signal);
      if (v !== null && v !== undefined) {
        return { value: v, modelUsed: tier };
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      // try next tier
    }
  }
  return { value: heuristic(), modelUsed: 'heuristic' };
}

/**
 * Helper: ask a model for one short structured reply. Used by both
 * routing and content extraction. The model is told to reply with JSON
 * only; the caller handles parsing.
 */
export async function llmComplete(
  model: ModelRef,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const result = await chat.complete(
    {
      provider: model.provider,
      model: model.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
    },
    signal,
  );
  return result.text;
}

/**
 * Robust JSON-from-LLM parser. Strips ```json fences, trims, and falls
 * back to the first `{...}` or `[...]` block on parse error.
 */
export function parseJsonLoose(raw: string): unknown {
  if (!raw) return null;
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const arrayMatch = body.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        // fall through
      }
    }
    const objectMatch = body.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
