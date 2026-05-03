/**
 * Alignment-guide computation for canvas drag.
 *
 * Given a single in-flight `position` NodeChange and the full list of nodes,
 * returns the closest matching anchor lines (left/center/right and
 * top/center/bottom) within `SNAP_THRESHOLD`, plus a snap-corrected position.
 *
 * Pure function — no DOM, no React. Same input → same output, so the whole
 * thing is unit-testable.
 */
import type { Node as RfNode, NodeChange } from '@xyflow/react';

export const SNAP_THRESHOLD = 6;

export type HelperLinesResult = {
  /** x in flow coordinates where the vertical guide should be drawn. */
  vertical?: number;
  /** y in flow coordinates where the horizontal guide should be drawn. */
  horizontal?: number;
  /** Snap-corrected position in flow coordinates (only filled axes change). */
  snapPosition: { x?: number; y?: number };
};

type DimsRequired<T> = T & { measured?: { width?: number; height?: number } };

function nodeDims(n: DimsRequired<RfNode>): { w: number; h: number } | null {
  const w = n.measured?.width ?? n.width ?? 0;
  const h = n.measured?.height ?? n.height ?? 0;
  if (!w || !h) return null;
  return { w, h };
}

export function getHelperLines(
  change: NodeChange,
  nodes: RfNode[],
): HelperLinesResult {
  const empty: HelperLinesResult = { snapPosition: {} };
  if (
    change.type !== 'position' ||
    !change.position ||
    !change.dragging
  ) {
    return empty;
  }
  const dragNode = nodes.find((n) => n.id === change.id);
  if (!dragNode) return empty;
  const dims = nodeDims(dragNode as DimsRequired<RfNode>);
  if (!dims) return empty;
  const { w, h } = dims;

  const { x, y } = change.position;
  const dragLeft = x;
  const dragRight = x + w;
  const dragCenterX = x + w / 2;
  const dragTop = y;
  const dragBottom = y + h;
  const dragCenterY = y + h / 2;

  let bestV: { delta: number; line: number; snapX: number } | null = null;
  let bestH: { delta: number; line: number; snapY: number } | null = null;

  for (const other of nodes) {
    if (other.id === change.id) continue;
    const od = nodeDims(other as DimsRequired<RfNode>);
    if (!od) continue;
    const ox = other.position.x;
    const oy = other.position.y;
    const oLeft = ox;
    const oRight = ox + od.w;
    const oCenterX = ox + od.w / 2;
    const oTop = oy;
    const oBottom = oy + od.h;
    const oCenterY = oy + od.h / 2;

    const verticalCandidates: { delta: number; line: number; snapX: number }[] = [
      { delta: Math.abs(dragLeft - oLeft), line: oLeft, snapX: oLeft },
      { delta: Math.abs(dragRight - oRight), line: oRight, snapX: oRight - w },
      { delta: Math.abs(dragCenterX - oCenterX), line: oCenterX, snapX: oCenterX - w / 2 },
      { delta: Math.abs(dragLeft - oRight), line: oRight, snapX: oRight },
      { delta: Math.abs(dragRight - oLeft), line: oLeft, snapX: oLeft - w },
    ];
    for (const c of verticalCandidates) {
      if (c.delta < SNAP_THRESHOLD && (!bestV || c.delta < bestV.delta)) {
        bestV = c;
      }
    }

    const horizontalCandidates: { delta: number; line: number; snapY: number }[] = [
      { delta: Math.abs(dragTop - oTop), line: oTop, snapY: oTop },
      { delta: Math.abs(dragBottom - oBottom), line: oBottom, snapY: oBottom - h },
      { delta: Math.abs(dragCenterY - oCenterY), line: oCenterY, snapY: oCenterY - h / 2 },
      { delta: Math.abs(dragTop - oBottom), line: oBottom, snapY: oBottom },
      { delta: Math.abs(dragBottom - oTop), line: oTop, snapY: oTop - h },
    ];
    for (const c of horizontalCandidates) {
      if (c.delta < SNAP_THRESHOLD && (!bestH || c.delta < bestH.delta)) {
        bestH = c;
      }
    }
  }

  const result: HelperLinesResult = { snapPosition: {} };
  if (bestV) {
    result.vertical = bestV.line;
    result.snapPosition.x = bestV.snapX;
  }
  if (bestH) {
    result.horizontal = bestH.line;
    result.snapPosition.y = bestH.snapY;
  }
  return result;
}
