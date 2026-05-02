import { memo } from 'react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { useStore } from '../../store';
import { attachments as attachmentService } from '../../services/attachments';
import { dialog } from '../../services/dialog';
import { NodeHandles } from './NodeHandles';

export type ArtifactNodeData = {
  title: string;
  attachmentId: string;
  hue?: number;
};

export type ArtifactNodeType = Node<ArtifactNodeData, 'artifact'>;

const PROVIDER_LABELS: Record<string, string> = {
  'host-text': 'Local',
  'claude-code-execution': 'Claude · code-execution',
  'openai-code-interpreter': 'OpenAI · code-interpreter',
  'openai-audio': 'OpenAI · TTS',
  'openai-video': 'OpenAI · Sora',
};

function iconFor(filename: string, kind: string | undefined): string {
  if (kind === 'audio') return '🔊';
  if (kind === 'video') return '🎬';
  if (kind === 'pdf') return '📕';
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'docx') return '📝';
  if (ext === 'pptx') return '📊';
  if (ext === 'xlsx') return '📈';
  if (ext === 'md' || ext === 'markdown') return '📑';
  if (ext === 'pdf') return '📕';
  return '📄';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function ArtifactNodeImpl({ data, selected, id }: NodeProps<ArtifactNodeType>) {
  const att = useStore((s) =>
    s.attachments.find((a) => a.id === data.attachmentId),
  );
  const node = useStore((s) => s.nodes.find((n) => n.id === id));
  const provider = (() => {
    const tags = node?.tags ?? [];
    for (const t of tags) {
      if (PROVIDER_LABELS[t]) return PROVIDER_LABELS[t];
      if (t.startsWith('file:')) return 'Local file';
    }
    return 'Generated';
  })();

  async function open() {
    if (!att) return;
    try {
      const path = await attachmentService.resolveAbsolutePath(att);
      await dialog.openWithSystem(path);
    } catch {
      /* ignore */
    }
  }

  async function reveal() {
    if (!att) return;
    try {
      const path = await attachmentService.resolveAbsolutePath(att);
      await dialog.revealInFinder(path);
    } catch {
      /* ignore */
    }
  }

  function preview() {
    if (!att) return;
    window.dispatchEvent(
      new CustomEvent('mc:open-attachment-preview', {
        detail: { attachmentId: att.id, title: data.title || att.filename },
      }),
    );
  }

  const filename = att?.filename ?? data.title ?? 'artifact';
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        lineClassName="mc-resize-line"
        handleClassName="mc-resize-handle"
      />
      <div
        className={`markdown-node artifact-node${selected ? ' selected' : ''}`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          preview();
        }}
        title="Double-click to preview in-app · Open externally below"
      >
        <NodeHandles />
        <div className="title">
          <span className="artifact-node-icon" aria-hidden="true">
            {iconFor(filename, att?.kind)}
          </span>{' '}
          {data.title || filename}
        </div>
        <div className="content">
          <div className="artifact-node-row">
            <div className="artifact-node-meta">
              <div className="artifact-node-name">{filename}</div>
              <div className="muted">
                {att ? (
                  <>
                    {ext.toUpperCase() || 'FILE'} · {formatBytes(att.bytes)} ·{' '}
                    {provider}
                  </>
                ) : (
                  'Attachment missing'
                )}
              </div>
            </div>
          </div>
          <div className="artifact-node-actions">
            <button
              type="button"
              className="link"
              onClick={(e) => {
                e.stopPropagation();
                preview();
              }}
            >
              Preview
            </button>
            <button
              type="button"
              className="link"
              onClick={(e) => {
                e.stopPropagation();
                void open();
              }}
              title="Open with system default app"
            >
              Open externally
            </button>
            <button
              type="button"
              className="link"
              onClick={(e) => {
                e.stopPropagation();
                void reveal();
              }}
            >
              Reveal
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export const ArtifactNode = memo(ArtifactNodeImpl);
