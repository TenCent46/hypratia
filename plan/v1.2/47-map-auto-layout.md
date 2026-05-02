# 47 — Map: auto-layout templates

**Goal:** when N candidates land on a canvas, they should appear in a meaningful arrangement, not stacked at the same point. Provide a small set of named templates that map kinds (decision / task / question / claim / source) to spatial regions.

**Depends on:** 41, 43, 44.

## Templates

1. **Conversation Map** (default for imported / pasted conversations):
   - **Center:** the conversation's root (title + 1-line gist).
   - **Right:** decisions, stacked vertically.
   - **Below:** tasks, in a grid.
   - **Left:** sources / citations.
   - **Top:** open questions.
   - **Lower-right:** claims (the bulk; flow into a column).
2. **Argument Tree** (for L3 restructure output): claim at top, evidence/counter-evidence as children using a top-down tree (delegated to ELK or Dagre).
3. **Free-form** (existing behavior): just stack near the paste point with a small jitter.

## Scope

- Layout is **deterministic given input** — same candidates → same positions, so a re-run does not scramble the user's mental model.
- Layout respects existing user-positioned nodes: it places only the *new* candidates and never moves existing nodes unless explicitly invoked from a "Re-layout all" action.
- Edges from the conversation root to each candidate are created with a faint-by-default style; user can promote them to first-class edges later.
- A small "Layout: Conversation Map ▾" button in the canvas toolbar lets users re-apply or switch templates.

## Implementation

New `src/services/canvas/AutoLayout.ts`:

```ts
export type LayoutInput = {
  rootNodeId: string;
  newNodes: { id: string; kind: DistillCandidate['kind']; widthHint?: number; heightHint?: number }[];
  existingNodes: { id: string; position: { x: number; y: number } }[];
  template: 'conversation-map' | 'argument-tree' | 'free';
};
export type LayoutOutput = { positions: Record<string, { x: number; y: number }> };
export function layout(input: LayoutInput): LayoutOutput;
```

For Conversation Map, compute fixed offsets per kind from the root, with column wrapping when count exceeds a threshold (5 per column).

For Argument Tree, integrate `elkjs` or `dagre` (lightweight; pick one, prefer elkjs for cleaner layered output) — only loaded on demand to keep bundle size sensible.

## Acceptance

1. Importing a conversation places the root in the center, decisions to the right, tasks below, etc., with no overlaps.
2. Re-importing the same conversation produces identical positions.
3. Pre-existing user-placed nodes do not move during a partial layout.
4. Switching to "Argument Tree" on a restructured conversation reflows nodes top-down without losing identity.
5. With 100 candidate nodes, layout completes in < 300 ms.

## Risks

- elkjs / dagre add bundle weight; lazy-load.
- Templates can feel rigid; ensure a "Free-form" option and that any user drag immediately sticks (no auto-snap-back).
- Multi-conversation canvases need a way to namespace roots — for v1.2, every imported conversation gets its own canvas.
