# 51 — Laconic View

**Goal:** a non-destructive, toggleable reading mode for assistant messages that strips boilerplate, hedging, and decorative phrasing while preserving meaning. The original message is **never** overwritten. *Laconic View turns verbose AI answers into reusable thought.*

**Depends on:** 44 (local heuristics), 45 (cheap-LLM enrichment), `services/llm/`, the existing `Message` type in `src/types/index.ts`.

## Why this is Hypratia-shaped

Hypratia's real enemy is not Obsidian Canvas — it is the *over-viscous* texture of AI replies. ChatGPT and Claude are pleasant in the moment and dense to re-read. Hypratia owns the moment after the conversation: where the user wants the answer fast, in their own canvas, in fewer words. Laconic View is the surface where this becomes obvious.

This is also a textbook case for the v1.2 cost ladder: most of the compression work is **L1 (free local)**; LLM compression is opt-in for messages where the heuristic isn't enough.

## Views

Each assistant message can be displayed under one of four views; the original is always preserved:

- **Original** — verbatim assistant content (default, persisted).
- **Laconic** — same meaning, less text. Boilerplate / hedging / decorative phrasing stripped. Code, citations, numbers, named entities, explicit caveats kept verbatim.
- **Outline** — H2/H3 headings only.
- **Actions** — TODO / decisions / open questions only (re-uses the local distiller from plan 44).

Users toggle per-message (segmented control top-right of each assistant bubble) or per-conversation (`View ▾` in the chat header).

`⌘L` toggles Laconic on the focused / hovered assistant message.

## What Laconic *removes*

- Opening boilerplate: "Great question.", "結論から言うと", "重要なのは…".
- Repeated summaries within a single message.
- Generic safety/notice phrasing not tied to the actual content.
- Metaphor restatements of the same point.
- "Of course / however / in summary" connective bloat.
- Closing pleasantries and call-to-actions that don't carry information.

## What Laconic *never touches*

- Code blocks (preserved byte-for-byte).
- Math / equations.
- Numbers, named entities, citations, URLs.
- Quoted material and explicit attribution.
- Legal / medical / financial caveats that name a domain.
- User-supplied context echoed back inside the message.

## Data model

Extend `Message` (in `src/types/index.ts`) with non-breaking optional fields:

```ts
export type LaconicView = 'original' | 'laconic' | 'outline' | 'actions';

export type Message = {
  // …existing fields unchanged…
  contentHash?: string;                 // sha-256(content), 16-byte truncated hex
  views?: {
    laconic?: { text: string; engine: 'local' | 'cheap-llm'; promptVersion: string; generatedAt: string };
    outline?: { text: string; generatedAt: string };
    actions?: { text: string; generatedAt: string };
  };
  preferredView?: LaconicView;          // per-message user choice; falls back to conversation default
};
```

`content` (Original) is never overwritten. Cache invalidation is by (`contentHash`, `engine`, `promptVersion`).

## Caching strategy

Cache key: `${contentHash}:${engine}:${promptVersion}`. Stored alongside the message in `messages.json` (atomic write per existing rules).

- A user editing a chat message resets `contentHash` and invalidates the cache for that message.
- Bumping `promptVersion` (per release) invalidates all LLM-generated views; a one-time migration regenerates on demand, never on app start.
- Local Laconic is regenerated lazily because it is cheap; LLM Laconic is gated by the budget UI from plan 49.

## Implementation

New service `src/services/views/laconic.ts`:

```ts
export const LACONIC_PROMPT_VERSION = '2026-05-02-1';

export function compressLaconicLocally(content: string, locale: 'en' | 'ja'): string;
export async function compressLaconicWithProvider(
  content: string,
  opts: { locale: 'en' | 'ja'; provider: ChatProvider; model: ModelRef },
): Promise<string>;

export function ensureLaconic(message: Message, prefer: 'local' | 'cheap-llm'): Promise<Message>;
```

- `compressLaconicLocally` is pure and synchronous: tokenize the message into Markdown blocks, strip block- and sentence-level boilerplate via a curated regex set per locale, collapse "in summary / つまり" duplicates, trim redundant connective sentences, never modify code/quote/number-bearing tokens.
- `compressLaconicWithProvider` calls `services/llm/ChatProvider` with the prompt below and JSON-mode disabled (return raw text).
- `ensureLaconic` is the orchestrator: cache hit → return; miss → run local; if user setting "Use cheap LLM for Laconic" is on and budget allows → upgrade to LLM result. Local result is *always* persisted as a fallback.

Prompt (English):

```
You are compressing an AI assistant message for later review.
- Preserve the original meaning. Do not add new information. Do not soften or polish.
- Remove verbosity, repetition, hedging, generic introductions, and decorative phrasing.
- Keep concrete claims, numbers, names, decisions, tasks, caveats, citations, and code verbatim.
- Prefer short paragraphs and bullets. Do not over-summarize.
- If the original contains code blocks, preserve them exactly unless clearly off-topic.
- Output only the laconic version. No preface. No explanation.
```

Japanese prompt: same shape, written natively (see strategy doc).

## UI

`src/features/chat/MessageList.tsx`:

- Each assistant message gets a small segmented control: `Original | Laconic | Outline | Actions`. Hidden until the message is focused/hovered to keep the chat quiet.
- Conversation header gains `View: Original ▾`. Switching applies the conversation default; per-message overrides win.
- `⌘L` keybinding toggles Laconic on the message currently in focus or under the cursor.
- Loading state: while LLM Laconic is generating, show the local Laconic with a small "Refining…" pip; the user reads something useful immediately.
- Error state: failed LLM call falls back to local Laconic with a "Local compression — LLM failed" tag.

## Canvas integration (Map-ready)

Per the strategy doc, **canvas nodes default to Laconic content.** When a message is dragged onto the canvas, the resulting `MarkdownNode.contentMarkdown` is the Laconic text; the original is reachable from the node inspector ("View original →") and is preserved in the underlying Message. This makes Hypratia's canvas read tighter than Obsidian's even on the same content.

Add a "Map-ready" preset to the view switch — a stricter Laconic optimized for ~120 chars of node body, ideal for canvas display.

## Acceptance

1. Toggling Laconic on a verbose 800-char ChatGPT reply shows a noticeably shorter version (target: ≥ 35% reduction on a 10-fixture corpus) within 50 ms (local).
2. Toggling back to Original restores the exact original text byte-for-byte.
3. Code blocks, URLs, numbers, and named entities present in Original are present in Laconic.
4. With the cheap-LLM upgrade enabled and a key configured, Laconic runs through the LLM exactly once per `(contentHash, promptVersion)` and the result is cached.
5. Editing a message invalidates its Laconic cache; reopening the conversation regenerates lazily.
6. With no key and L2 disabled, Laconic still works for every message via the local compressor.
7. Canvas nodes created by dragging an assistant message default to Laconic body, with original reachable from the inspector.
8. `⌘L` toggles the focused message's Laconic / Original view.

## Risks

- **Over-aggressive stripping** that drops a meaningful caveat. Mitigation: the keep-list (numbers, named entities, code, explicit caveats by keyword) is conservative; ship with a fixture suite that flags any keep-token loss.
- **Locale drift.** Boilerplate phrases differ across English / Japanese / Chinese. Per-locale rule files; English + Japanese ship in v1.2; Chinese in v1.3.
- **User confusion** between view and edit. Laconic is read-only; editing always reverts to Original. Make this visible.
- **LLM cost creep.** Always default to local. The cheap-LLM upgrade is a setting, not a default; budget-tracked via plan 49.
- **Cache size.** Storing all four views per message can grow `messages.json`. Persist views in a sibling file `messages.views.json` if size becomes a problem; do not block v1.2 on this.

## Out of scope (defer)

- A full Original / Laconic *diff* view ("what was removed?"). Useful but heavier UI; queue for v1.3.
- Per-section Laconic toggles inside one message. Whole-message toggle is enough for v1.2.
- Round-tripping Laconic into the export pipeline; export always uses Original.
