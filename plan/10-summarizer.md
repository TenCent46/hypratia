# 10 — Mock summarizer (provider abstraction)

**Goal:** a "Create summary node" button that works offline today, with a clean seam for a real LLM later.

**Depends on:** 04.

## Interface

```ts
// src/services/summarize/Summarizer.ts
export interface Summarizer {
  summarize(messages: Message[]): Promise<{
    title: string;
    contentMarkdown: string;
  }>;
}
```

## Mock (`MockSummarizer.ts`)

- `title`: `"Summary: " + first 6 words of the first user message` (trimmed).
- `contentMarkdown`: bullet list of the first 5 message excerpts, prefixed by:
  > *(mock summary — no LLM was called)*
- Marked clearly as mock. No silent fakery.

## UI

- Button in the chat panel: "Create summary node".
- Click → calls the active `Summarizer`, creates a node:
  - `tags: ['summary']`
  - position: viewport center via `screenToFlowPosition`
  - `conversationId`: current

## Future-proofing

- Registration is one line: `setSummarizer(new OpenAISummarizer(apiKey))` in app boot, gated by a settings field.
- No API keys hardcoded. No network calls without a configured provider.

## Acceptance

- Works with no network and no API key.
- Summary nodes export to Obsidian like any other node, with `summary` in frontmatter `tags`.
- Swapping in a real summarizer later is one line.

## Risks

- Hardcoding API keys "just to test" — never. Use a settings field, even for the first real provider.
- Drifting toward "mock that pretends to be real" — don't. Always show the disclaimer line.
