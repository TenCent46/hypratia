# 46 — Distill L3: premium re-structure (opt-in)

**Goal:** for the small set of conversations the user marks as important, run a premium model to reorganize them into an argument map, detect contradictions across multiple conversations, and propose updates to the user's project memory.

**Depends on:** 44, 45, project memory store from v1.1.

## What L3 does (and does not)

L3 **does**:

- Restructure a long conversation into a labeled argument graph (claim → evidence → counter-claim).
- Cross-reference up to N selected conversations and surface contradictions ("In conversation A you decided X; in conversation B you decided ¬X").
- Propose memory updates ("Add this decision to `project_decisions.md`?").
- Generate an essay/strategy memo as Markdown, optionally linked back to the canvas nodes.

L3 **does not**:

- Run automatically on every imported conversation. Always opt-in per conversation.
- Replace the user's writing. Output is a draft; the user accepts/edits/rejects.
- Modify memory or the canvas without explicit user confirmation.

## Scope

1. "Deep restructure" button in Capture Preview, disabled by default, gated behind:
   - A premium-tier key configured.
   - Per-call confirmation showing estimated cost and token count.
2. Output rendered in a side-by-side panel: original on the left, proposed structure on the right.
3. "Apply" button rewrites the candidate set; canvas auto-layout (plan 47) re-flows.
4. Contradiction detector: takes up to 5 selected past canvases (limit token cost) and produces a `contradictions: { a: nodeId, b: nodeId, statement: string }[]` list.
5. Memory-update proposals show as a diff against `memory/*.md` files; user accepts/rejects per item.

## Implementation

- New `src/services/capture/distill/premium.ts`.
- One structured-output prompt per task (restructure / contradict / memory-propose). No free-form prose.
- Heavy outputs render via the existing Markdown renderer.
- Memory writes go through the existing memory file path; never auto-overwrite — always diff-and-accept.

## Acceptance

1. Deep restructure on a 30-turn conversation produces a coherent argument graph with the original turns linked as sources.
2. The cost shown before the call matches actual within ±20%.
3. Cross-conversation contradiction detection runs only on the explicitly selected canvases.
4. Memory updates are presented as diffs and applied only on user click. No silent writes.
5. Without a premium key, all L3 controls are disabled with explanatory tooltips.

## Risks

- Premium calls can cost dollars per conversation — the budget UI from plan 49 must be unmissable.
- Hallucinated contradictions: prompt should require quoting source spans verbatim; reject contradictions without quoted evidence.
- Memory bloat: a contradiction-flagged conversation that updates memory needs a clear undo path.
