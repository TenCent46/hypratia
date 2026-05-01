import { useState } from 'react';
import { useStore } from '../../store';
import { MarkdownEditor } from '../../features/editor/MarkdownEditor';

export function DetachedNodeEditor({ nodeId }: { nodeId: string }) {
  const node = useStore((s) => s.nodes.find((n) => n.id === nodeId) ?? null);
  const updateNode = useStore((s) => s.updateNode);
  const [draft, setDraft] = useState(node?.contentMarkdown ?? '');

  if (!node) {
    return <div className="detached-editor-empty">Node not found.</div>;
  }

  function commit() {
    if (node && draft !== node.contentMarkdown) {
      updateNode(node.id, { contentMarkdown: draft });
    }
  }

  return (
    <div className="detached-editor">
      <input
        className="detached-editor-title"
        value={node.title}
        onChange={(e) => updateNode(node.id, { title: e.target.value })}
        placeholder="Untitled"
      />
      <MarkdownEditor value={draft} onChange={setDraft} onCommit={commit} />
    </div>
  );
}
