import type { CanvasNode, Edge, ID } from '../../types';

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function rectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

export function selectNodesInRect(
  nodes: CanvasNode[],
  rect: Rect,
  visibleNodeIds: Set<ID>,
): ID[] {
  return nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .filter((node) => {
      const bounds: Rect = {
        x: node.position.x,
        y: node.position.y,
        width: node.width ?? 280,
        height: node.height ?? 160,
      };
      return intersects(rect, bounds);
    })
    .map((node) => node.id);
}

export function selectEdgesForNodes(edges: Edge[], nodeIds: ID[]): ID[] {
  const set = new Set(nodeIds);
  return edges
    .filter((edge) => set.has(edge.sourceNodeId) && set.has(edge.targetNodeId))
    .map((edge) => edge.id);
}

function rectsCollide(a: Rect, b: Rect, padding: number): boolean {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

/**
 * Find a position near `preferred` for a rect of size `width`x`height` that
 * does not overlap any of the supplied obstacles. Searches in an outward spiral
 * starting from the preferred location. Falls back to the preferred location
 * shifted down if no free slot is found within the search budget.
 */
export function findFreeNodePosition(
  preferred: { x: number; y: number },
  size: { width: number; height: number },
  obstacles: Rect[],
  options: { padding?: number; step?: number; maxRings?: number } = {},
): { x: number; y: number } {
  const padding = options.padding ?? 16;
  const step = options.step ?? Math.max(40, Math.min(size.width, size.height) / 2);
  const maxRings = options.maxRings ?? 24;
  const candidate = (x: number, y: number): Rect => ({
    x,
    y,
    width: size.width,
    height: size.height,
  });
  const overlaps = (rect: Rect) =>
    obstacles.some((other) => rectsCollide(rect, other, padding));
  if (!overlaps(candidate(preferred.x, preferred.y))) {
    return { x: preferred.x, y: preferred.y };
  }
  for (let ring = 1; ring <= maxRings; ring++) {
    const radius = ring * step;
    const samples = Math.max(8, ring * 8);
    for (let i = 0; i < samples; i++) {
      const angle = (Math.PI * 2 * i) / samples;
      const x = preferred.x + Math.cos(angle) * radius;
      const y = preferred.y + Math.sin(angle) * radius;
      if (!overlaps(candidate(x, y))) return { x, y };
    }
  }
  return { x: preferred.x, y: preferred.y + step * (maxRings + 1) };
}
