import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

export type DemoMemoData = {
  title: string;
  body: string;
};

export type DemoMemoNodeType = Node<DemoMemoData, 'memo'>;

export function DemoMemoNode({ data, selected }: NodeProps<DemoMemoNodeType>) {
  const lines = data.body.split('\n').filter((line) => line.length > 0);
  return (
    <div className={`markdown-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="markdown-node-header">
        <span className="title">{data.title}</span>
      </div>
      <div className="content">
        {lines.length === 0 ? (
          <p>&nbsp;</p>
        ) : (
          lines.map((line, i) => <p key={i}>{line}</p>)
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
