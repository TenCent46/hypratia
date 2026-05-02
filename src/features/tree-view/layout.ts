import dagre from '@dagrejs/dagre';
import type { Edge as RfEdge, Node as RfNode } from '@xyflow/react';
import type { CanvasNode, Edge, ID } from '../../types';

export const TREE_NODE_WIDTH = 200;
export const TREE_NODE_HEIGHT = 44;
const RANK_SEP = 64;
const NODE_SEP = 24;

export type TreeNodeData = {
  title: string;
  themeKind?: string;
  selected?: boolean;
};

/**
 * Run a fresh dagre layout for the parent-edge tree of `conversationId`.
 *
 * - Only nodes belonging to that conversation are considered.
 * - Only `parent` edges feed dagre (cross-cluster `related` edges are
 *   not part of the structural tree, and would force dagre into
 *   non-tree shapes).
 * - Returns React Flow's `nodes` / `edges` arrays ready to feed into
 *   `<ReactFlow nodes={...} edges={...} />`.
 */
export function layoutTree(
  nodes: CanvasNode[],
  edges: Edge[],
  conversationId: ID | undefined,
  selectedNodeId: ID | null,
): {
  rfNodes: RfNode<TreeNodeData>[];
  rfEdges: RfEdge[];
} {
  if (!conversationId) {
    return { rfNodes: [], rfEdges: [] };
  }
  const own = nodes.filter((n) => n.conversationId === conversationId);
  if (own.length === 0) {
    return { rfNodes: [], rfEdges: [] };
  }

  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: NODE_SEP, ranksep: RANK_SEP });
  for (const n of own) {
    g.setNode(n.id, { width: TREE_NODE_WIDTH, height: TREE_NODE_HEIGHT });
  }
  for (const e of edges) {
    if ((e.kind ?? 'parent') !== 'parent') continue;
    if (!g.hasNode(e.sourceNodeId) || !g.hasNode(e.targetNodeId)) continue;
    g.setEdge(e.sourceNodeId, e.targetNodeId);
  }
  dagre.layout(g);

  const rfNodes: RfNode<TreeNodeData>[] = own.map((n) => {
    const layout = g.node(n.id);
    // dagre returns the *center* position; React Flow expects the
    // top-left corner, so subtract half the node size.
    const x = (layout?.x ?? 0) - TREE_NODE_WIDTH / 2;
    const y = (layout?.y ?? 0) - TREE_NODE_HEIGHT / 2;
    const themeKindTag = (n.tags ?? []).find((t) => t.startsWith('themeKind:'));
    const themeKind = themeKindTag
      ? themeKindTag.slice('themeKind:'.length)
      : undefined;
    return {
      id: n.id,
      type: 'tree',
      position: { x, y },
      data: {
        title: n.title || '(untitled)',
        themeKind,
        selected: n.id === selectedNodeId,
      },
      width: TREE_NODE_WIDTH,
      height: TREE_NODE_HEIGHT,
      draggable: false,
      selectable: true,
      selected: n.id === selectedNodeId,
    };
  });

  const rfEdges: RfEdge[] = [];
  for (const e of edges) {
    if ((e.kind ?? 'parent') !== 'parent') continue;
    if (!g.hasNode(e.sourceNodeId) || !g.hasNode(e.targetNodeId)) continue;
    rfEdges.push({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      type: 'smoothstep',
      style: { strokeWidth: 1.25 },
    });
  }

  return { rfNodes, rfEdges };
}
