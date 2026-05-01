# 22 — Real streaming chat

**Goal:** the chat panel becomes a real conversation: user sends → assistant streams back. Per-conversation model selection, abort, retry, error states.

**Depends on:** 21.

## Behavioural spec

- Send message → optimistic user message appears → assistant message immediately appears with a streaming placeholder → tokens fill in.
- ⌘⌫ aborts an in-flight stream (signal cancellation).
- Failed responses surface inline ("Anthropic returned 401 — check your key in Settings"), with a Retry button.
- Default system prompt set in settings; per-conversation override in conversation properties.
- Each conversation persists `model: { provider, modelId }`. If unset, falls back to settings default.
- Token usage rolls into per-conversation totals; visible in conversation switcher row.

## UI changes

- Chat header strip: model dropdown + cost meter + abort button (only when streaming).
- Message row gets:
  - role badge (user / assistant / system).
  - timestamp on hover.
  - actions: copy, retry (assistant only), delete, add-to-canvas (existing).
- System prompt is collapsible at the top of the message list.

## Files

- `src/features/chat/ChatHeader.tsx` — model picker + cost meter + abort.
- `src/features/chat/MessageInput.tsx` — gains streaming-aware send (disable while streaming, ⌘⌫ aborts).
- `src/features/chat/useChatStream.ts` — hook that holds an `AbortController`, current stream state.
- `src/store/index.ts` — add `Conversation.modelOverride?`, `Conversation.systemPrompt?`, `Conversation.tokenUsage`.

## Implementation

1. Hook into `ChatProvider.stream(...)`. On each chunk, append to a "draft" assistant message in store; when stream ends, finalize.
2. While streaming, the assistant message is rendered through `MarkdownRenderer streaming` mode (17) so partial tokens don't break layout.
3. On abort, mark the partial message with a frontmatter-style note `_(stopped)_`.
4. On error, set message kind to `error`; offer Retry, which re-issues with the same input.
5. Cost meter: sum token usage as chunks arrive; show running estimate.

## Acceptance

- Real conversation works end-to-end with at least OpenAI and Anthropic.
- Abort actually stops the network stream within ~1s.
- Switching model mid-conversation uses the new model for the next turn only — history is preserved.
- Conversation export to Markdown includes assistant content properly (already does; verify with new content).
- Dropping an in-flight assistant message onto the canvas works (current draft text becomes the node).

## Risks

- **History context window** — long conversations exceed model limits. v1.0: hard-cap to last N messages or M tokens by simple sliding window; warn in the UI ("oldest messages were elided"). Smart memory (RAG over prior nodes) is v1.1.
- Provider-specific quirks: Anthropic requires explicit user/assistant alternation; OpenAI tolerates pairs. Normalize before send.
- Streaming flicker on Markdown — solved by the streaming-safe guard in 17.
- ⌘⌫ collides with browser default (delete previous word in inputs); restrict to non-input focus.
