import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { attachments as attachmentService } from '../../services/attachments';
import { dialog } from '../../services/dialog';
import type { Attachment, ID } from '../../types';

type Props = {
  attachmentId: ID;
  conversationId: ID;
};

const PROVIDER_LABELS: Record<string, string> = {
  'host-text': 'Local',
  'claude-code-execution': 'Claude · code-execution',
  'openai-code-interpreter': 'OpenAI · code-interpreter',
  'openai-audio': 'OpenAI · TTS',
  'openai-video': 'OpenAI · Sora',
};

function iconFor(att: Attachment | undefined): string {
  if (!att) return '📄';
  if (att.kind === 'image') return '🖼';
  if (att.kind === 'audio') return '🔊';
  if (att.kind === 'video') return '🎬';
  if (att.kind === 'pdf') return '📕';
  const ext = att.filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'docx') return '📝';
  if (ext === 'pptx') return '📊';
  if (ext === 'xlsx') return '📈';
  if (ext === 'md') return '📑';
  return '📄';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function providerFromTags(tagSource: string[] | undefined): string | null {
  if (!tagSource) return null;
  for (const tag of tagSource) {
    if (PROVIDER_LABELS[tag]) return PROVIDER_LABELS[tag];
  }
  return null;
}

export function ArtifactCard({ attachmentId, conversationId }: Props) {
  const att = useStore((s) =>
    s.attachments.find((a) => a.id === attachmentId),
  );
  const node = useStore((s) =>
    s.nodes.find(
      (n) =>
        n.conversationId === conversationId &&
        n.attachmentIds?.includes(attachmentId),
    ),
  );
  const addNode = useStore((s) => s.addNode);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const ext = useMemo(
    () => att?.filename.split('.').pop()?.toLowerCase() ?? '',
    [att?.filename],
  );

  const providerLabel = useMemo(() => {
    return providerFromTags(node?.tags) ?? 'Generated';
  }, [node?.tags]);

  useEffect(() => {
    if (!att || att.kind !== 'audio') return;
    let cancelled = false;
    attachmentService
      .toUrl(att)
      .then((u) => {
        if (!cancelled) setAudioUrl(u);
      })
      .catch(() => {
        // ignore — the card just won't render the player
      });
    return () => {
      cancelled = true;
    };
  }, [att]);

  if (!att) return null;

  async function onOpen() {
    if (!att) return;
    try {
      const path = await attachmentService.resolveAbsolutePath(att);
      await dialog.openWithSystem(path);
    } catch {
      /* ignore */
    }
  }

  async function onReveal() {
    if (!att) return;
    try {
      const path = await attachmentService.resolveAbsolutePath(att);
      await dialog.revealInFinder(path);
    } catch {
      /* ignore */
    }
  }

  function onAddToCanvas() {
    if (!att) return;
    addNode({
      conversationId,
      title: att.filename,
      contentMarkdown: `**${att.filename}** · ${formatBytes(att.bytes)}`,
      position: { x: 240, y: 240 },
      tags: ['ai-generated', ext],
      attachmentIds: [att.id],
    });
  }

  return (
    <div className="artifact-card" data-kind={att.kind}>
      <div className="artifact-card-row">
        <span className="artifact-card-icon" aria-hidden="true">
          {iconFor(att)}
        </span>
        <div className="artifact-card-meta">
          <button
            type="button"
            className="artifact-card-name"
            onClick={onOpen}
            title="Open with default app"
          >
            {att.filename}
          </button>
          <div className="artifact-card-sub">
            <span>{formatBytes(att.bytes)}</span>
            <span className="dot">·</span>
            <span>{providerLabel}</span>
          </div>
        </div>
        <div className="artifact-card-actions">
          <button type="button" onClick={onOpen} title="Open">
            Open
          </button>
          <button type="button" onClick={onReveal} title="Reveal in Finder">
            Reveal
          </button>
          {!node ? (
            <button type="button" onClick={onAddToCanvas} title="Add to canvas">
              + Canvas
            </button>
          ) : null}
        </div>
      </div>
      {att.kind === 'audio' && audioUrl ? (
        <div className="artifact-card-audio">
          <audio controls preload="metadata" src={audioUrl} />
          <small>AI-generated audio</small>
        </div>
      ) : null}
      {att.kind === 'video' ? (
        <div className="artifact-card-video">
          <small>AI-generated video — open to play.</small>
        </div>
      ) : null}
    </div>
  );
}
