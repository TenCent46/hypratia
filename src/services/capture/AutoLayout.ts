/**
 * Plan 47 — Map: deterministic auto-layout for newly-accepted candidates.
 *
 * "Conversation map" template:
 *   - root in the center
 *   - decisions to the right (column)
 *   - tasks below (grid)
 *   - sources to the left (column)
 *   - questions above (column)
 *   - claims to the lower-right (column)
 *
 * Same input → same output, so re-running the layout never scrambles the
 * user's mental model. Existing user-positioned nodes are not touched.
 */

import type { DistillKind } from './distillLocal';

export type LayoutInputNode = {
  id: string;
  kind: DistillKind;
};

export type LayoutResult = {
  rootPosition: { x: number; y: number };
  positions: Record<string, { x: number; y: number }>;
};

const NODE_W = 280;
const NODE_H = 160;
const GAP = 60;

export function layoutConversationMap(
  rootCenter: { x: number; y: number },
  newNodes: LayoutInputNode[],
): LayoutResult {
  const groups: Record<DistillKind, string[]> = {
    decision: [],
    task: [],
    question: [],
    claim: [],
    source: [],
  };
  for (const n of newNodes) groups[n.kind].push(n.id);

  const positions: Record<string, { x: number; y: number }> = {};

  // Right column — decisions.
  layoutColumn(
    groups.decision,
    rootCenter.x + NODE_W / 2 + GAP * 2,
    rootCenter.y - NODE_H / 2,
    'down',
    positions,
  );

  // Above — open questions, stacked upward.
  layoutColumn(
    groups.question,
    rootCenter.x - NODE_W / 2,
    rootCenter.y - NODE_H - GAP * 2,
    'up',
    positions,
  );

  // Left column — sources.
  layoutColumn(
    groups.source,
    rootCenter.x - NODE_W * 1.5 - GAP * 2,
    rootCenter.y - NODE_H / 2,
    'down',
    positions,
  );

  // Below — tasks, in a 2-column grid.
  layoutGrid(
    groups.task,
    rootCenter.x - NODE_W - GAP / 2,
    rootCenter.y + NODE_H / 2 + GAP * 2,
    2,
    positions,
  );

  // Lower-right — claims.
  layoutColumn(
    groups.claim,
    rootCenter.x + NODE_W / 2 + GAP * 2,
    rootCenter.y + NODE_H + GAP * 2,
    'down',
    positions,
  );

  return {
    rootPosition: {
      x: rootCenter.x - NODE_W / 2,
      y: rootCenter.y - NODE_H / 2,
    },
    positions,
  };
}

function layoutColumn(
  ids: string[],
  x: number,
  startY: number,
  direction: 'up' | 'down',
  out: Record<string, { x: number; y: number }>,
): void {
  const step = (NODE_H + GAP) * (direction === 'down' ? 1 : -1);
  for (let i = 0; i < ids.length; i += 1) {
    out[ids[i]] = { x, y: startY + step * i };
  }
}

function layoutGrid(
  ids: string[],
  startX: number,
  startY: number,
  cols: number,
  out: Record<string, { x: number; y: number }>,
): void {
  const colStep = NODE_W + GAP;
  const rowStep = NODE_H + GAP;
  for (let i = 0; i < ids.length; i += 1) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    out[ids[i]] = { x: startX + c * colStep, y: startY + r * rowStep };
  }
}
