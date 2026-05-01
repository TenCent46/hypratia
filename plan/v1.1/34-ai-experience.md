# 34 — AI experience refinement

**Goal:** AI should feel as fluid as mainstream chat apps while staying local-first and BYOK.

**Depends on:** v1.0 streaming chat and provider layer.

## Scope

- Better streaming animations and response states.
- Stop, retry, regenerate, and continue controls.
- Provider/model clarity without noisy technical chrome.
- Optional web search mode with citations.
- Deep research mode as an explicit multi-step workflow.
- Better error recovery: missing key, rate limit, network error, provider error.

## AI modes

- **Chat:** default direct model response.
- **Search:** model response grounded in live web results, with citations.
- **Deep research:** user-approved multi-step research plan, multiple searches, source synthesis, final cited report.

## Implementation

1. Add message lifecycle UI states: thinking, streaming, stopped, errored, complete.
2. Add per-message controls: copy, retry, regenerate, make node.
3. Add a chat mode control: Chat / Search / Deep Research.
4. Define a `SearchProvider` interface, separate from `ChatProvider`.
5. Keep web access explicit and source-cited.
6. Store research artifacts as messages plus optional canvas nodes.

## Acceptance

- Streaming has a visible thinking/typing state before first token.
- Stop is immediate and leaves the partial response usable.
- Regenerate creates a new assistant answer without losing the old one.
- Search mode shows source links/citations.
- Deep research asks for confirmation before a multi-step run.
- Provider failures tell the user what to do next.

## Risks

- Web search introduces privacy and cost questions. It must be explicit and configurable.
- Deep research can be slow and expensive. Show progress and allow cancellation.
