import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { dialog } from '../../services/dialog';
import { attachments as attachmentsService } from '../../services/attachments';
import type { ID } from '../../types';

export type NodeContextMenuState = {
  nodeId: ID;
  x: number;
  y: number;
};

export function NodeContextMenu({
  state,
  onClose,
}: {
  state: NodeContextMenuState;
  onClose: () => void;
}) {
  const node = useStore((s) => s.nodes.find((n) => n.id === state.nodeId));
  const attachmentsList = useStore((s) => s.attachments);
  const projects = useStore((s) => s.projects);
  const conversations = useStore((s) => s.conversations);
  const removeNode = useStore((s) => s.removeNode);
  const setDetached = useStore((s) => s.setDetachedEditorNodeId);
  const setConversationProject = useStore((s) => s.setConversationProject);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  if (!node) return null;

  const attachment =
    node.attachmentIds && node.attachmentIds[0]
      ? attachmentsList.find((a) => a.id === node.attachmentIds![0])
      : null;
  const conv = conversations.find((c) => c.id === node.conversationId);

  async function copyAsMarkdown() {
    if (!node) return;
    let md = node.contentMarkdown ?? '';
    if (node.title) md = `# ${node.title}\n\n${md}`;
    await navigator.clipboard.writeText(md);
    onClose();
  }

  async function showInFinder() {
    if (!attachment) return;
    try {
      const path = await attachmentsService.resolveAbsolutePath(attachment);
      await dialog.revealInFinder(path);
    } catch (err) {
      console.error('reveal failed', err);
    }
    onClose();
  }

  async function openExternal() {
    if (!attachment) return;
    try {
      const path = await attachmentsService.resolveAbsolutePath(attachment);
      await dialog.openWithSystem(path);
    } catch (err) {
      console.error('open failed', err);
    }
    onClose();
  }

  function openEditor() {
    if (!node) return;
    setDetached(node.id);
    onClose();
  }

  function deleteNode() {
    if (!node) return;
    removeNode(node.id);
    onClose();
  }

  function moveTo(projectId: ID | null) {
    if (!conv) return;
    setConversationProject(conv.id, projectId);
    onClose();
  }

  // Clamp position to viewport
  const left = Math.min(state.x, window.innerWidth - 220);
  const top = Math.min(state.y, window.innerHeight - 280);

  return (
    <div
      className="node-context-menu"
      ref={ref}
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button type="button" onClick={openEditor}>
        Open in editor
      </button>
      <button type="button" onClick={copyAsMarkdown}>
        Copy as Markdown
      </button>
      {attachment ? (
        <>
          <button type="button" onClick={openExternal}>
            Open with default app
          </button>
          <button type="button" onClick={showInFinder}>
            Show in Finder
          </button>
        </>
      ) : null}
      {projects.length > 0 && conv ? (
        <details className="node-context-submenu">
          <summary>Move conversation to…</summary>
          <div className="node-context-submenu-body">
            {conv.projectId ? (
              <button type="button" onClick={() => moveTo(null)}>
                (No project)
              </button>
            ) : null}
            {projects
              .filter((p) => p.id !== conv.projectId)
              .map((p) => (
                <button key={p.id} type="button" onClick={() => moveTo(p.id)}>
                  {p.emoji ? `${p.emoji} ` : ''}
                  {p.name}
                </button>
              ))}
          </div>
        </details>
      ) : null}
      <hr />
      <button type="button" className="danger" onClick={deleteNode}>
        Delete card
      </button>
    </div>
  );
}
