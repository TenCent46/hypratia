# 44 — Distill L1: local heuristics

**Goal:** turn parsed conversation turns into candidate nodes (decisions / tasks / questions / claims / sources) with **zero LLM calls**. This is the workhorse of Hypratia's cost story.

**Depends on:** 41 (paste capture), 43 (importer).

## Why local-only first

ChatGPT replies are already structured. They use headings, bullets, numbered lists, and a small set of stock phrases ("In conclusion", "Summary", "Steps:", "Risks:", "Question:"). A regex + Markdown-AST pipeline catches the high-leverage majority for free. We do not need an LLM to read them — we already have the user's expensive output.

## Categories the L1 distiller produces

| Kind | Triggered by |
| --- | --- |
| **decision** | Headings or bullets containing "Decision", "決定", "結論", "Conclusion"; or sentences with "we will", "will adopt", "go with X" |
| **task** | TODO / `- [ ]` / "Action items" / "Steps:" / "Next steps"; bullets under those headings |
| **question** | Trailing `?`; headings "Open questions", "未解決", "Q:" |
| **claim** | H2/H3 headings without other classification; topic sentences of long paragraphs |
| **source** | URLs, citations like `[1]`, `[Source: …]`, code blocks with `// from X` |

## Scope

1. Markdown AST parse using `remark-parse` (already in the project's `services/markdown/`).
2. For each turn, walk the AST and emit candidates using a deterministic ruleset.
3. Candidate output: `{ kind, title (≤ 60 chars), body (markdown), confidence (0..1), sourceTurnIndex }`.
4. De-duplicate near-identical candidates within one conversation (Levenshtein on titles, threshold 0.85).
5. Cap candidates per conversation at a sensible default (e.g., 30) and let the user "Show more" in Capture Preview.
6. Order candidates within each kind by confidence × position (later turns slightly favored — they are usually the synthesis).

## Implementation

New `src/services/capture/distill/local.ts`:

```ts
export type DistillCandidate = {
  id: string;
  kind: 'decision' | 'task' | 'question' | 'claim' | 'source';
  title: string;
  body: string;
  sourceTurnIndex: number;
  confidence: number;
};
export function distillLocal(turns: ParsedTurn[]): DistillCandidate[];
```

Sub-modules:

- `headings.ts` — extracts headings → claim/decision/question candidates.
- `lists.ts` — extracts bullet/numbered list items under known headings.
- `keywords.ts` — pattern catalog (English + Japanese for v1.2; pluggable per locale).
- `urls.ts` — URL + citation extraction.
- `dedup.ts` — Levenshtein-based merge.

Pure functions, no DOM, easy to unit-test.

## Acceptance

1. Given a sample ChatGPT conversation about a product decision, `distillLocal` returns:
   - At least one `decision` candidate matching the conclusion.
   - All `- [ ]` bullets as `task` candidates.
   - Trailing `?` sentences as `question` candidates.
   - Each H2 as a `claim` candidate.
2. Output is deterministic — same input → same output, including ordering.
3. Runs in < 200 ms for a 50-turn conversation on a 2020 M1 Mac.
4. Locale-aware: a Japanese ChatGPT reply triggers Japanese keyword rules.
5. Unit tests cover at least 8 representative fixtures (under `src/services/capture/distill/__fixtures__/`).
6. Zero network requests.

## Risks

- Over-extraction: long conversations create candidate spam. The cap + dedup mitigate; surface a confidence slider in Capture Preview ("Show only confident").
- Locale drift: keyword sets need maintenance per language; isolate so contributors can add languages.
- AST library choice — keep the dependency the same as `services/markdown/` to avoid two AST stacks.
