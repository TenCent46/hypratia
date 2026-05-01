import { memo, useEffect, useState } from 'react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { useStore } from '../../store';
import { attachments } from '../../services/attachments';
import { NodeHandles } from './NodeHandles';

export type ImageNodeData = {
  title: string;
  attachmentId: string;
  hue?: number;
};

export type ImageNodeType = Node<ImageNodeData, 'image'>;

function ImageNodeImpl({ data, selected }: NodeProps<ImageNodeType>) {
  const att = useStore((s) => s.attachments.find((a) => a.id === data.attachmentId));
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!att) return;
    let on = true;
    attachments.toUrl(att).then((u) => {
      if (on) setUrl(u);
    });
    return () => {
      on = false;
    };
  }, [att]);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={80}
        keepAspectRatio
        lineClassName="mc-resize-line"
        handleClassName="mc-resize-handle"
      />
      <div className={`markdown-node image-node${selected ? ' selected' : ''}`}>
        <NodeHandles />
        {data.title ? <div className="title">{data.title}</div> : null}
        <div className="content image-content">
          {url ? (
            <img src={url} alt={data.title} />
          ) : (
            <div className="muted">Image not found</div>
          )}
        </div>
      </div>
    </>
  );
}

export const ImageNode = memo(ImageNodeImpl);
