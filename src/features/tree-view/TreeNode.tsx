import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TreeNodeData } from './layout';

/**
 * Tree-window node. Fixed-size title card. Clicking this node is
 * handled at the ReactFlow `onNodeClick` level inside `TreePanel`,
 * so the card itself only renders the title and a thin border.
 *
 * `themeKind` adds a tiny accent dot (ask / insight / decision) so a
 * dense tree is still scannable at a glance, mirroring the canvas.
 */
function TreeNodeImpl({ data, selected }: NodeProps) {
  const d = data as TreeNodeData;
  const kind = d.themeKind;
  const accent =
    kind === 'ask'
      ? 'var(--accent)'
      : kind === 'insight'
        ? 'var(--accent-strong, var(--accent))'
        : kind === 'decision'
          ? '#2e8b57'
          : 'var(--text-mute)';
  return (
    <div
      className={`tree-window-node${selected ? ' selected' : ''}`}
      title={d.title}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <span className="tree-window-node-dot" style={{ background: accent }} />
      <span className="tree-window-node-title">{d.title}</span>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

export const TreeNode = memo(TreeNodeImpl);
