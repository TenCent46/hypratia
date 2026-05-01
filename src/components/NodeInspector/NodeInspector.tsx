import { useMemo, useState } from 'react';
import matter from 'gray-matter';
import { useStore } from '../../store';
import { SuggestLinks } from '../../features/canvas/SuggestLinks';
import { MarkdownEditor } from '../../features/editor/MarkdownEditor';
import type { CanvasNode } from '../../types';

const RESERVED_FRONTMATTER_KEYS = new Set([
  'id',
  'conversationId',
  'createdAt',
  'updatedAt',
  'linkedNodeIds',
  'sourceMessageId',
  'pdfRef',
  'kind',
  'tags',
  'title',
]);

function frontmatterToYaml(fm: Record<string, unknown>): string {
  if (!fm || Object.keys(fm).length === 0) return '';
  // gray-matter has a stringify; use it on an empty body so we just get the YAML head.
  const out = matter.stringify('', fm);
  return out.replace(/^---\n/, '').replace(/\n---\n*$/, '').trim();
}

export function NodeInspector() {
  const selectedId = useStore((s) => s.ui.selectedNodeId);
  const node = useStore((s) =>
    selectedId ? s.nodes.find((n) => n.id === selectedId) ?? null : null,
  );
  const setActiveRightTab = useStore((s) => s.setActiveRightTab);

  if (!node) {
    return (
      <div className="inspector empty">
        <div>No node selected.</div>
        <button type="button" onClick={() => setActiveRightTab('chat')}>
          Back to chat
        </button>
      </div>
    );
  }
  return <InspectorForm key={node.id} node={node} />;
}

function InspectorForm({ node }: { node: CanvasNode }) {
  const updateNode = useStore((s) => s.updateNode);
  const removeNode = useStore((s) => s.removeNode);
  const selectNode = useStore((s) => s.selectNode);
  const setActiveRightTab = useStore((s) => s.setActiveRightTab);
  const setDetachedEditorNodeId = useStore((s) => s.setDetachedEditorNodeId);

  const [draftTitle, setDraftTitle] = useState(node.title);
  const [draftContent, setDraftContent] = useState(node.contentMarkdown);
  const [draftTags, setDraftTags] = useState(node.tags.join(', '));
  const [draftFm, setDraftFm] = useState(
    frontmatterToYaml(node.frontmatter ?? {}),
  );
  const [fmError, setFmError] = useState<string | null>(null);

  const conversationTitle = useStore(
    (s) =>
      s.conversations.find((c) => c.id === node.conversationId)?.title ?? null,
  );
  const allEdges = useStore((s) => s.edges);
  const incomingEdges = useMemo(
    () => allEdges.filter((e) => e.targetNodeId === node.id),
    [allEdges, node.id],
  );
  const outgoingEdges = useMemo(
    () => allEdges.filter((e) => e.sourceNodeId === node.id),
    [allEdges, node.id],
  );

  const linkedCount = useMemo(
    () => incomingEdges.length + outgoingEdges.length,
    [incomingEdges, outgoingEdges],
  );

  function commitTitle() {
    if (draftTitle !== node.title) updateNode(node.id, { title: draftTitle });
  }
  function commitContent() {
    if (draftContent !== node.contentMarkdown)
      updateNode(node.id, { contentMarkdown: draftContent });
  }
  function commitTags() {
    const next = draftTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const same =
      next.length === node.tags.length &&
      next.every((t, i) => t === node.tags[i]);
    if (!same) updateNode(node.id, { tags: next });
  }

  function commitFrontmatter() {
    const yaml = draftFm.trim();
    if (!yaml) {
      setFmError(null);
      if (node.frontmatter && Object.keys(node.frontmatter).length > 0) {
        updateNode(node.id, { frontmatter: {} });
      }
      return;
    }
    try {
      const parsed = matter(`---\n${yaml}\n---\n`).data as Record<string, unknown>;
      const filtered: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (RESERVED_FRONTMATTER_KEYS.has(k)) continue;
        filtered[k] = v;
      }
      setFmError(null);
      updateNode(node.id, { frontmatter: filtered });
    } catch (err) {
      setFmError(err instanceof Error ? err.message : 'Invalid YAML');
    }
  }

  function onDelete() {
    if (!confirm('Delete this node? Edges to it will be removed.')) return;
    removeNode(node.id);
    selectNode(null);
    setActiveRightTab('chat');
  }

  return (
    <div className="inspector">
      <div className="inspector-row">
        <label>Title</label>
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitTitle}
          placeholder="Untitled"
        />
      </div>
      <div className="inspector-row">
        <div className="inspector-label-row">
          <label>Content (Markdown)</label>
          <button
            type="button"
            onClick={() => {
              setDetachedEditorNodeId(null);
              window.requestAnimationFrame(() => setDetachedEditorNodeId(node.id));
            }}
            title="Open editor window"
            aria-label="Open editor window"
          >
            ⧉
          </button>
        </div>
        <MarkdownEditor
          value={draftContent}
          onChange={setDraftContent}
          onCommit={commitContent}
        />
      </div>
      <div className="inspector-row">
        <label>Tags (comma-separated)</label>
        <input
          value={draftTags}
          onChange={(e) => setDraftTags(e.target.value)}
          onBlur={commitTags}
          placeholder="thought, summary, …"
        />
      </div>
      <details className="inspector-advanced">
        <summary>Advanced metadata</summary>
        <div className="inspector-row">
          <label>Frontmatter (YAML)</label>
          <textarea
            value={draftFm}
            onChange={(e) => setDraftFm(e.target.value)}
            onBlur={commitFrontmatter}
            rows={4}
            placeholder={'priority: high\naliases: [draft]'}
          />
          {fmError ? (
            <div className="result error" style={{ marginTop: 4 }}>
              {fmError}
            </div>
          ) : null}
        </div>
      </details>
      <div className="inspector-meta">
        <div>
          <span>Conversation</span>
          <strong>{conversationTitle ?? '—'}</strong>
        </div>
        <div>
          <span>Links</span>
          <strong>
            {linkedCount} ({incomingEdges.length} in / {outgoingEdges.length} out)
          </strong>
        </div>
        <div>
          <span>Updated</span>
          <strong>{new Date(node.updatedAt).toLocaleString()}</strong>
        </div>
      </div>

      <SuggestLinks nodeId={node.id} />

      <div className="inspector-actions">
        <button type="button" className="danger" onClick={onDelete}>
          Delete node
        </button>
      </div>
    </div>
  );
}
