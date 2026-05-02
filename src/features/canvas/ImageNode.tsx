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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!att) return;
    let on = true;
    let objectUrl: string | null = null;
    attachments
      .readBytes(att)
      .then((bytes) => {
        objectUrl = URL.createObjectURL(
          new Blob([bytes.slice()], {
            type: att.mimeType || 'application/octet-stream',
          }),
        );
        if (on) {
          setLoadError(null);
          setUrl(objectUrl);
        }
      })
      .catch((err) => {
        if (on) {
          setUrl(null);
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      on = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [att]);

  function preview() {
    if (!att) return;
    window.dispatchEvent(
      new CustomEvent('mc:open-attachment-preview', {
        detail: { attachmentId: att.id, title: data.title || att.filename },
      }),
    );
  }

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
      <div
        className={`markdown-node image-node${selected ? ' selected' : ''}`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          preview();
        }}
        title="Double-click to open in preview"
      >
        <NodeHandles />
        {data.title ? <div className="title">{data.title}</div> : null}
        <div className="content image-content">
          {loadError ? (
            <div className="image-node-error">
              <strong>Preview unavailable</strong>
              <span>{loadError}</span>
            </div>
          ) : url ? (
            <img
              src={url}
              alt={data.title}
              onError={() => {
                setUrl(null);
                setLoadError(
                  att?.mimeType === 'image/heic' || att?.mimeType === 'image/heif'
                    ? 'HEIC preview is not supported by this WebView. Double-click to open it externally.'
                    : 'Image preview failed. Double-click to open it externally.',
                );
              }}
            />
          ) : (
            <div className="muted">Loading image...</div>
          )}
        </div>
      </div>
    </>
  );
}

export const ImageNode = memo(ImageNodeImpl);
