import type { CanvasNode } from '../../types';
import type { GraphInputKind, StagedGraph } from './types';

const COLUMN_GAP = 280;
const ROW_GAP = 110;
const PROSE_COLS = 4;
const PROSE_COL_GAP = 240;
const PROSE_ROW_GAP = 130;

/**
 * Find a free anchor position for a fresh batch of imported nodes:
 * the rightmost x of any existing node + a margin, with y reset to a
 * sensible top. When the canvas is empty falls back to (200, 200).
 */
export function pickAnchorPosition(
  existing: ReadonlyArray<{ position: { x: number; y: number } }>,
): { x: number; y: number } {
  if (existing.length === 0) return { x: 200, y: 200 };
  const rightmost = existing.reduce((acc, n) =>
    n.position.x > acc.position.x ? n : acc,
  );
  return { x: rightmost.position.x + COLUMN_GAP * 2, y: 200 };
}

/**
 * Layout a staged graph in place. Conversation graphs lay theme roots
 * across the top row, with their ask children stacked vertically below.
 * Prose graphs flow left-to-right in a 4-wide grid.
 */
export function layoutBatch(
  staged: StagedGraph,
  kind: GraphInputKind,
  anchor: { x: number; y: number },
): void {
  if (kind === 'conversation') {
    const themeIndices: number[] = [];
    const childByTheme = new Map<number, number[]>();
    for (let i = 0; i < staged.nodes.length; i += 1) {
      const tags = staged.nodes[i].tags ?? [];
      if (tags.includes('themeKind:theme')) themeIndices.push(i);
    }
    for (const e of staged.edges) {
      if (e.kind !== 'parent') continue;
      const list = childByTheme.get(e.sourceIndex) ?? [];
      list.push(e.targetIndex);
      childByTheme.set(e.sourceIndex, list);
    }
    themeIndices.forEach((tIdx, col) => {
      const x = anchor.x + col * COLUMN_GAP;
      staged.nodes[tIdx].position = { x, y: anchor.y };
      const children = childByTheme.get(tIdx) ?? [];
      children.forEach((cIdx, row) => {
        staged.nodes[cIdx].position = {
          x,
          y: anchor.y + 120 + row * ROW_GAP,
        };
      });
    });
    return;
  }

  // Prose: 4-column grid, taller cells for higher-importance concepts.
  staged.nodes.forEach((n, i) => {
    const col = i % PROSE_COLS;
    const row = Math.floor(i / PROSE_COLS);
    n.position = {
      x: anchor.x + col * PROSE_COL_GAP,
      y: anchor.y + row * PROSE_ROW_GAP,
    };
  });
}

/**
 * Walk an existing-nodes list and produce the union of positions.
 * Used by `pickAnchorPosition` and the canvas focus helper.
 */
export function summarizeExistingPositions(
  nodes: ReadonlyArray<CanvasNode>,
): Array<{ position: { x: number; y: number } }> {
  return nodes.map((n) => ({ position: n.position }));
}
