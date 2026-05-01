import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { similarityService } from '../../services/similarity/SimilarityService';
import type { ID } from '../../types';

export function SuggestLinks({ nodeId }: { nodeId: ID }) {
  const allNodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const addEdge = useStore((s) => s.addEdge);

  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<ID>>(new Set());

  const linkedSet = useMemo(() => {
    const set = new Set<ID>();
    for (const e of edges) {
      if (e.sourceNodeId === nodeId) set.add(e.targetNodeId);
      if (e.targetNodeId === nodeId) set.add(e.sourceNodeId);
    }
    return set;
  }, [edges, nodeId]);

  const suggestions = useMemo(() => {
    if (!open) return [];
    return similarityService
      .related(nodeId, allNodes)
      .filter((s) => !linkedSet.has(s.nodeId) && !dismissed.has(s.nodeId));
  }, [open, nodeId, allNodes, linkedSet, dismissed]);

  function accept(targetId: ID) {
    addEdge({ sourceNodeId: nodeId, targetNodeId: targetId });
  }
  function reject(targetId: ID) {
    setDismissed((d) => new Set(d).add(targetId));
  }

  if (!open) {
    return (
      <div className="suggest-links">
        <button type="button" onClick={() => setOpen(true)}>
          Suggest links
        </button>
      </div>
    );
  }

  return (
    <div className="suggest-links open">
      <div className="suggest-header">
        <strong>Suggested links</strong>
        <button
          type="button"
          className="link"
          onClick={() => setOpen(false)}
        >
          Hide
        </button>
      </div>
      {suggestions.length === 0 ? (
        <div className="muted">No suggestions yet — try adding more nodes.</div>
      ) : (
        <ul>
          {suggestions.map((s) => {
            const target = allNodes.find((n) => n.id === s.nodeId);
            if (!target) return null;
            return (
              <li key={s.nodeId}>
                <div className="suggestion-title">
                  {target.title || '(untitled)'}{' '}
                  <span className="muted">· {s.score.toFixed(2)}</span>
                </div>
                <div className="actions">
                  <button type="button" onClick={() => accept(s.nodeId)}>
                    Accept
                  </button>
                  <button type="button" onClick={() => reject(s.nodeId)}>
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
