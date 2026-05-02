import type { ModelRef } from '../../types';
import { getModelMeta } from './providers';

export type ChatMode = 'chat' | 'search' | 'deep_search';

/**
 * True when the selected model can be paired with a provider-native
 * web-search tool (Anthropic / OpenAI Responses API / Google Gemini).
 * The capability label is on the model meta — see `providers.ts`. Other
 * providers (Mistral / Groq / Ollama / openai-compatible) return false
 * even in `search` / `deep_search` mode; the system prompt then degrades
 * gracefully to "say you can't browse".
 */
export function webSearchAvailableFor(model: ModelRef | undefined): boolean {
  if (!model) return false;
  if (
    model.provider !== 'anthropic' &&
    model.provider !== 'openai' &&
    model.provider !== 'google'
  ) {
    return false;
  }
  const meta = getModelMeta(model.provider, model.model);
  return Boolean(meta?.capabilities?.includes('web_search'));
}

/**
 * Build the system-prompt string injected at the head of the message
 * list when the user picks Search or Deep Search mode. Adapts to
 * whether the current model has a real web-search tool wired in this
 * build — when it doesn't, the prompt tells the model to say so
 * rather than fake citations.
 *
 * Used by the chat panel (`useChatStream.send`) and by the AI palette
 * to keep the language identical across both surfaces.
 */
export function modeSystemPrompt(
  mode: ChatMode,
  webSearchAvailable: boolean,
): string | null {
  if (mode === 'search') {
    return webSearchAvailable
      ? 'Search mode is selected. Use the web_search tool to look up current information whenever the answer benefits from up-to-date sources, then cite the URLs you used in your reply.'
      : 'Search mode is selected. The selected model does not have a web search tool wired in this build, so say that clearly. Do not imply that you browsed the web or fabricate citations.';
  }
  if (mode === 'deep_search') {
    return webSearchAvailable
      ? 'Deep search mode is selected. Run multiple web_search calls to triangulate sources, then produce a structured research brief with research plan, key findings, uncertainties, and citations. Cite the URLs you actually retrieved.'
      : 'Deep search mode is selected. The selected model does not have a web search tool wired, so say that clearly and do not fabricate citations. Produce a structured research brief from prior knowledge with research plan, key findings, uncertainties, and suggested source queries.';
  }
  return null;
}
