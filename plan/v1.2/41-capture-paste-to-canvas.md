# 41 — Paste-to-Canvas (P0 capture)

**Goal:** the user copies a ChatGPT or Claude reply (or a whole conversation) and pastes it onto the canvas with `⌘V` or `⌘⇧V`. Hypratia parses the structure, generates candidate nodes, and lets the user accept which ones land on the canvas. **Zero outbound network calls** in the default path.

**Depends on:** existing paste handler in `CanvasPanel.tsx`, `services/markdown/`, plan 44 (local heuristics) for the parsing engine.

## Why this is P0

This is the cheapest possible Capture → Distill → Map slice and the single most important differentiator. Every demo of Hypratia from now on starts with: "Copy your last ChatGPT reply, paste it here." If the result is good, the rest of the feature set sells itself.

## Scope

1. **`⌘V` on the canvas with text on the clipboard** — current behavior creates one note. Replace with a richer flow:
   - Detect "looks like an AI conversation" (multiple `### `, `**You:**`, role markers, ChatGPT export-style structure).
   - If detected, run `distillLocal()` (plan 44) and open the **Capture Preview** panel (see below).
   - If not detected, fall back to today's single-memo paste.
2. **`⌘⇧V` always** opens Capture Preview, regardless of clipboard heuristics. Power-user shortcut.
3. **Capture Preview panel** — a right-side overlay (width 380 px) showing:
   - Detected conversation title (editable).
   - Suggested nodes grouped by kind: **Decisions / Tasks / Questions / Claims / Sources**.
   - A checkbox per suggestion. All checked by default.
   - "Add selected to canvas" primary button + "Discard" secondary.
4. **Accepted nodes** are placed by the auto-layout in plan 47, anchored at the paste position (or the canvas center if pasted via menu).
5. **The original conversation** is saved as a Markdown file under `LLM-Conversations/` regardless of which nodes were accepted, so the raw source survives.

## Implementation

New module `src/services/capture/PasteCapture.ts`:

- `detectAIConversation(text: string): { confidence: number; format: 'chatgpt-share' | 'claude-share' | 'plain' | 'markdown' }`.
- `parsePastedConversation(text: string): { title: string; turns: { role: 'user' | 'assistant' | 'system'; content: string }[]; }`.
- Heuristics: split on `**You:**` / `**ChatGPT:**` / `**Assistant:**` / `User:` / `Claude:`, fall back to splitting on H2 (`## `) when ChatGPT markdown export is detected.
- Returns plain Markdown turns; does not call the LLM.

`src/services/capture/Distiller.ts` (interface only — implementation in plans 44–46):

```ts
export type DistillCandidate = {
  id: string;
  kind: 'decision' | 'task' | 'question' | 'claim' | 'source';
  title: string;
  body: string;
  sourceTurnIndex: number;
};
export interface Distiller {
  distill(turns: ParsedTurn[]): Promise<DistillCandidate[]>;
}
```

`src/components/CapturePreview/CapturePreview.tsx`:

- Reads from a Zustand slice `captureSlice` that holds the in-progress capture state.
- Renders grouped candidates, accepts user picks, calls `useStore.getState().applyCapture(candidates)`.

In `CanvasPanel.tsx`:

- Extend the existing `onDocPaste` handler to call `detectAIConversation`. If confidence ≥ 0.6 or `e.shiftKey`, switch to the capture flow.
- Add a `⌘⇧V` keybinding that opens an empty Capture Preview pre-filled from the clipboard (use `navigator.clipboard.readText`).

## Acceptance

1. Copy a multi-turn ChatGPT reply, paste with `⌘V` on a blank canvas: the Capture Preview opens within 300 ms, with grouped suggestions populated, with no network requests in DevTools.
2. Accepting all suggestions creates the proposed nodes in their groups (positions deferred to plan 47; for now place them in a column).
3. The original conversation is saved as Markdown under app-data and is exportable (plan 48).
4. Plain text on the clipboard (single paragraph) still drops as one memo node — the heuristic does not over-trigger.
5. `⌘⇧V` always opens the Preview even if heuristic fails.

## Risks

- Heuristics will misclassify — keep Capture Preview always editable / dismissable, never block the user.
- Big pastes can hang the main thread on parse — split parse work via `requestIdleCallback` or chunk by turn.
- Privacy: never send pasted text to any service in the default flow. Document this in the Preview panel ("Local parse — no network").
