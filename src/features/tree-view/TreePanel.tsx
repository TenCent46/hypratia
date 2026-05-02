import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  useReactFlow,
} from '@xyflow/react';
import { useStore } from '../../store';
import { broadcast } from '../../services/window';
import { layoutTree, TREE_NODE_HEIGHT, TREE_NODE_WIDTH } from './layout';
import { TreeNode } from './TreeNode';

const nodeTypes: NodeTypes = {
  tree: TreeNode,
};

function TreePanelInner() {
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const conversationTitle = useStore((s) => {
    const id = s.settings.lastConversationId;
    return id
      ? s.conversations.find((c) => c.id === id)?.title ?? 'Untitled'
      : 'No conversation';
  });
  const allNodes = useStore((s) => s.nodes);
  const allEdges = useStore((s) => s.edges);
  const selectedNodeId = useStore((s) => s.ui.selectedNodeId);
  const setCanvasSelection = useStore((s) => s.setCanvasSelection);
  const flow = useReactFlow();

  // Run the dagre layout whenever the underlying nodes / edges /
  // conversation change. The function is pure and cheap (~O(n)) for
  // realistic sizes; useMemo is enough — no debounce needed for v1.
  const { rfNodes, rfEdges } = useMemo(
    () => layoutTree(allNodes, allEdges, conversationId, selectedNodeId),
    [allNodes, allEdges, conversationId, selectedNodeId],
  );

  // Fit-view once on the first non-empty layout so the user sees the
  // whole tree. Subsequent dagre re-layouts (new node added, etc.) keep
  // the user's pan/zoom — re-fitting on every change would yank the
  // viewport whenever the chat ticked. The flag is a ref, not state,
  // so we don't trigger an extra render or trip the
  // react-hooks/set-state-in-effect rule.
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (rfNodes.length === 0) return;
    if (didInitialFit.current) return;
    flow.fitView({ padding: 0.15, duration: 0 });
    didInitialFit.current = true;
  }, [flow, rfNodes.length]);

  const onNodeClick = useCallback(
    (_: unknown, node: { id: string }) => {
      if (!conversationId) return;
      // Update local selection so the highlight on this window updates
      // immediately. The store-patch broadcast will also propagate the
      // change to other windows (the main canvas selection model is
      // the same).
      setCanvasSelection([node.id], []);
      // Tell the main canvas window to zoom to the node. The handler
      // in store/persistence.ts re-dispatches this as the existing
      // `mc:focus-canvas-node` event so CanvasPanel's flow.setCenter
      // path runs.
      void broadcast({
        kind: 'focus-canvas-node',
        nodeId: node.id,
        conversationId,
      });
    },
    [conversationId, setCanvasSelection],
  );

  return (
    <div className="tree-window-shell">
      <header className="tree-window-header">
        <span className="tree-window-header-label">Relationship Tree</span>
        <span className="tree-window-header-conv" title={conversationTitle}>
          {conversationTitle}
        </span>
      </header>
      <div className="tree-window-canvas">
        {rfNodes.length === 0 ? (
          <div className="tree-window-empty">
            No nodes in this conversation yet. Send a chat message — the
            tree fills in automatically as theme nodes are minted.
          </div>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={onNodeClick}
            fitView={false}
            minZoom={0.4}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background gap={20} size={1} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

/**
 * Synced relationship-tree window. Read-only projection of the active
 * conversation's parent-edge tree. Click → select + zoom in the main
 * canvas window via cross-window broadcast. See spec 36.
 */
export function TreePanel() {
  return (
    <ReactFlowProvider>
      <TreePanelInner />
    </ReactFlowProvider>
  );
}

void TREE_NODE_WIDTH;
void TREE_NODE_HEIGHT;
