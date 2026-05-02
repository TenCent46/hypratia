import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useLocale } from '../web/LocaleProvider';

export type DemoFileType = 'pdf' | 'pptx' | 'md' | 'doc';

export type DemoFileData = {
  filename: string;
  type: DemoFileType;
  preview?: string;
  previewKey?: string;
  meta?: string;
  metaKey?: string;
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
  const { t } = useLocale();
  const preview = data.previewKey ? t(data.previewKey) : data.preview;
  const meta = data.metaKey ? t(data.metaKey) : data.meta;
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
        {preview ? (
          <p className="demo-file-preview">{preview}</p>
        ) : (
          <p className="demo-file-empty">— no preview —</p>
        )}
        {meta ? <p className="demo-file-meta">{meta}</p> : null}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
