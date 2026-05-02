import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useLocale } from '../web/LocaleProvider';

export type DemoMemoData = {
  /** Raw title string (used by paste / new-memo flows that are not keyed). */
  title?: string;
  /** i18n key — preferred for sample nodes so the canvas re-localizes. */
  titleKey?: string;
  body?: string;
  bodyKey?: string;
};

export type DemoMemoNodeType = Node<DemoMemoData, 'memo'>;

export function DemoMemoNode({ data, selected }: NodeProps<DemoMemoNodeType>) {
  const { t } = useLocale();
  const title = data.titleKey ? t(data.titleKey) : data.title ?? '';
  const body = data.bodyKey ? t(data.bodyKey) : data.body ?? '';
  const lines = body.split('\n').filter((line) => line.length > 0);
  return (
    <div className={`markdown-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="markdown-node-header">
        <span className="title">{title}</span>
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
