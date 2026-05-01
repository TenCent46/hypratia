# 09 — Local search

**Goal:** find any message, node, or conversation by substring.

**Depends on:** 07.

## UI

- Search input in the header. ⌘K opens it. Esc closes.
- Result list, grouped by type with a small badge:
  - **Conversation** — title match.
  - **Message** — content match, with conversation context.
  - **Node** — title and content match, with conversation context.
- Highlight matched text in results.
- Click behaviour:
  - Conversation → switch to it.
  - Message → switch to its conversation, scroll the chat list to the message, briefly highlight.
  - Node → switch to its conversation, `setCenter` on the node, briefly pulse it.

## Implementation

- In-memory substring search across all loaded data.
- Case-insensitive. NFC-normalize both input and target before matching.
- Tokenize input by whitespace; require all tokens to appear in the matched text.
- No embeddings. No fuzzy. Yet.
- Debounce input by 80 ms.
- Snippet: ±50 chars around the first match.

## Acceptance

- Returns results within 50 ms for thousands of items on a normal laptop.
- Each result type's click handler does the right thing.
- ⌘K from anywhere opens search.

## Risks

- Unicode case-folding edge cases → NFC normalize.
- Long messages making the result list ugly → clip snippets.
- Chat scroll-to-message fighting autoscroll-to-bottom (step 03) — pause autoscroll for ~500 ms after a programmatic scroll.
