# 21 — Multi-provider LLM layer

**Goal:** one internal interface (`ChatProvider`, `Summarizer`, `EmbeddingProvider`) backed by Vercel AI SDK; user picks the model from a dropdown that shows only providers with a configured key.

**Depends on:** 20.

## Stack

`ai` (core) + `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/openai-compatible`. Groq, OpenRouter, Together, Perplexity, Fireworks all speak OpenAI-compatible — we wire them via `@ai-sdk/openai-compatible` with custom base URLs. Ollama is OpenAI-compatible at `http://localhost:11434/v1`.

Day-1 enabled providers (v1.0 default config):

| Id | SDK | Notes |
|---|---|---|
| `openai` | `@ai-sdk/openai` | gpt-4o, gpt-4o-mini, o3-mini |
| `anthropic` | `@ai-sdk/anthropic` | claude-sonnet-4, claude-opus-4 (via env config) |
| `groq` | `@ai-sdk/openai-compatible` | base `https://api.groq.com/openai/v1`, llama-3.3-70b, mixtral-8x7b |
| `mistral` | `@ai-sdk/mistral` | mistral-large, codestral |
| `google` | `@ai-sdk/google` | gemini-2.5-pro, gemini-2.5-flash |
| `ollama` | `@ai-sdk/openai-compatible` | base `http://localhost:11434/v1`, no key needed |
| `openai-compatible` | `@ai-sdk/openai-compatible` | user-configured base URL + key (covers OpenRouter, Together, etc.) |

## Files

```
src/services/llm/
  ChatProvider.ts          # interface
  ProviderRegistry.ts      # static metadata (id, label, models, sdk loader)
  AiSdkChatProvider.ts     # wraps ai sdk; one class, all providers
  ModelCatalog.ts          # which models per provider; fetched on first use w/ cache
  costEstimator.ts         # rough $ / 1k tokens per model, for the cost meter
  index.ts                 # singleton + setters
  RealSummarizer.ts        # implements Summarizer using ChatProvider + 5-message-bullet prompt
```

## ChatProvider interface

```ts
type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };
type ChatRequest = { provider: ProviderId; model: string; messages: ChatMessage[]; temperature?: number };
type ChatChunk = { text: string };

interface ChatProvider {
  stream(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk>;
  complete(req: ChatRequest, signal?: AbortSignal): Promise<{ text: string; usage?: { input: number; output: number } }>;
  testKey(provider: ProviderId): Promise<{ ok: true; sampleModel: string } | { ok: false; error: string }>;
}
```

`AiSdkChatProvider` calls `services/secrets/` to fetch the key per request. Never caches keys in memory beyond the request.

## Cost estimator

Rough per-1k-token costs hard-coded in `costEstimator.ts` (single source, easy to update). Used in:

- A small "≈ $0.003" estimate next to the send button.
- A running total per conversation (visible in inspector or settings).
- Surfaced in the AI palette (so users see cost before running an expand-prompt on a long node).

## Acceptance

- With OpenAI key configured, send a chat → assistant message streams in.
- Switch to Anthropic in the model dropdown → next message uses Anthropic; cost meter swaps to Anthropic rates.
- Disable OpenAI in Settings → its models disappear from the dropdown.
- Ollama, with `ollama serve` running locally, shows live models from `http://localhost:11434/api/tags`.
- `RealSummarizer` produces a non-mock summary node when a provider is configured, falls back to `MockSummarizer` otherwise (with the same disclaimer line).

## Risks

- AI SDK provider modules are hefty; lazy-import per provider on first use.
- Streaming abort handling: if user navigates away mid-stream, abort the request to avoid hanging the UI.
- Token-usage reporting is inconsistent across providers; treat as best-effort.
- Ollama auto-detect: if not running, omit from dropdown (don't show "connection refused" errors).
