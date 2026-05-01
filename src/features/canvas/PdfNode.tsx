import { memo, useEffect, useState } from 'react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { useStore } from '../../store';
import { attachments } from '../../services/attachments';
import { NodeHandles } from './NodeHandles';

export type PdfNodeData = {
  title: string;
  attachmentId: string;
};

export type PdfNodeType = Node<PdfNodeData, 'pdf'>;

function PdfNodeImpl({ data, selected }: NodeProps<PdfNodeType>) {
  const att = useStore((s) => s.attachments.find((a) => a.id === data.attachmentId));
  const [url, setUrl] = useState<string | null>(null);

  function openPreview() {
    if (!att) return;
    window.dispatchEvent(
      new CustomEvent('mc:open-attachment-preview', {
        detail: { attachmentId: att.id, title: data.title || att.filename },
      }),
    );
  }

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
        minWidth={180}
        minHeight={100}
        lineClassName="mc-resize-line"
        handleClassName="mc-resize-handle"
      />
      <div className={`markdown-node pdf-node${selected ? ' selected' : ''}`}>
        <NodeHandles />
        <div className="title">📄 {data.title || 'PDF'}</div>
        <div className="content">
          <div className="pdf-thumb" onDoubleClick={openPreview}>
            <span className="muted">
              {att
                ? `${(att.bytes / 1024 / 1024).toFixed(1)} MB · ${att.pageCount ?? '?'} pages`
                : 'PDF not found'}
            </span>
            {url ? (
              <button
                type="button"
                className="link"
                onClick={(e) => {
                  e.stopPropagation();
                  openPreview();
                }}
              >
                Preview →
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export const PdfNode = memo(PdfNodeImpl);
