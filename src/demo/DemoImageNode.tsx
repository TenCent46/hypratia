import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

export type DemoImageData = {
  src: string;
  alt?: string;
  title?: string;
};

export type DemoImageNodeType = Node<DemoImageData, 'image'>;

export function DemoImageNode({ data, selected }: NodeProps<DemoImageNodeType>) {
  return (
    <div
      className={`markdown-node image-node${selected ? ' selected' : ''}`}
    >
      <Handle type="target" position={Position.Top} />
      {data.title ? (
        <div className="markdown-node-header">
          <span className="title">{data.title}</span>
        </div>
      ) : null}
      <div className="content image-content">
        <img src={data.src} alt={data.alt ?? data.title ?? 'Pasted image'} />
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
