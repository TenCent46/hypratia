import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useLocale } from '../web/LocaleProvider';

export type DemoImageData = {
  src: string;
  alt?: string;
  title?: string;
  titleKey?: string;
};

export type DemoImageNodeType = Node<DemoImageData, 'image'>;

export function DemoImageNode({ data, selected }: NodeProps<DemoImageNodeType>) {
  const { t } = useLocale();
  const title = data.titleKey ? t(data.titleKey) : data.title;
  return (
    <div
      className={`markdown-node image-node${selected ? ' selected' : ''}`}
    >
      <Handle type="target" position={Position.Top} />
      {title ? (
        <div className="markdown-node-header">
          <span className="title">{title}</span>
        </div>
      ) : null}
      <div className="content image-content">
        <img src={data.src} alt={data.alt ?? title ?? 'Pasted image'} />
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
