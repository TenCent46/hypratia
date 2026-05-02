# 50 — Half-automation: suggestions, never edicts

**Goal:** every automated action in v1.2 is a *suggestion the user accepts*, not a fait accompli. This is the user-experience constraint that keeps Hypratia from feeling like an out-of-control AI tool.

**Depends on:** 41–48.

## The rule

> Hypratia never adds, deletes, or modifies a node, an edge, a memory file, a vault file, or a setting *without an explicit user confirmation in the same gesture.*

Exceptions are limited to:

- Saving the user's own typed input (autosave on blur).
- Saving the raw conversation Markdown when capturing (the conversation is *the user's content*, just relocated).

## How "suggested" looks

Every place an LLM-driven action could land changes:

- **Capture Preview** (plans 41 / 43): all candidate nodes are checkboxes; the user picks before "Add to canvas".
- **Auto-layout** (plan 47): only acts on candidates the user just accepted; never reflows unrelated nodes without an explicit "Re-layout" action.
- **Memory updates** (plan 46): rendered as a diff; per-line accept.
- **Tag suggestions** (plan 45): added as small chips with a checkmark; click to accept; ignored otherwise.
- **Edge suggestions** (existing `SuggestLinks`): already in suggestion form; verify it never auto-adds.

## Scope

1. Audit every call site in plans 41–48 against the rule.
2. Add a small `<SuggestionStrip />` primitive used across suggestion surfaces (chips + accept/dismiss).
3. Persist *rejected* suggestions per source (conversation id + content hash) so we do not re-prompt for the same dismissed thing.
4. Keep an "Undo last accept" affordance in the canvas footer for the 5 s after any bulk accept.

## Acceptance

1. Importing a conversation produces zero canvas mutations until the user clicks "Add to canvas".
2. Dismissed suggestions do not reappear on re-open of the same conversation.
3. Undo within 5 s of a bulk accept removes the just-added nodes/edges.
4. No code path can write to the user's vault or memory file without a user confirmation in the same gesture (audited via grep + tests).

## Risks

- Confirmation fatigue: too many click-to-accept makes the product feel slow. Group confirmations (one click accepts a checked set) to keep this minimal.
- Persisting rejected hashes can grow without bound; cap at 5,000 per workspace and rotate oldest first.
