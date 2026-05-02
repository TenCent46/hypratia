import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

export type DemoFileType = 'pdf' | 'pptx' | 'md' | 'doc';

export type DemoFileData = {
  filename: string;
  type: DemoFileType;
  preview?: string;
  meta?: string;
};

export type DemoFileNodeType = Node<DemoFileData, 'file'>;

const TYPE_LABELS: Record<DemoFileType, string> = {
  pdf: 'PDF',
  pptx: 'PPTX',
  md: 'MD',
  doc: 'DOC',
};

const TYPE_BADGE_COLORS: Record<DemoFileType, string> = {
  pdf: '#ff3b30',
  pptx: '#ff9500',
  md: '#5ac8fa',
  doc: '#007aff',
};

export function DemoFileNode({ data, selected }: NodeProps<DemoFileNodeType>) {
  return (
    <div
      className={`markdown-node demo-file-node demo-file-${data.type}${
        selected ? ' selected' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="markdown-node-header demo-file-header">
        <span
          className="demo-file-badge"
          style={{ background: TYPE_BADGE_COLORS[data.type] }}
        >
          {TYPE_LABELS[data.type]}
        </span>
        <span className="title">{data.filename}</span>
      </div>
      <div className="content demo-file-content">
        {data.preview ? (
          <p className="demo-file-preview">{data.preview}</p>
        ) : (
          <p className="demo-file-empty">— no preview —</p>
        )}
        {data.meta ? <p className="demo-file-meta">{data.meta}</p> : null}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
