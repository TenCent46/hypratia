import { useEffect, useMemo, useState } from 'react';
import { ViewportPortal, useReactFlow } from '@xyflow/react';
import { useStore } from '../../store';
import type { ID, EdgeKind } from '../../types';

/**
 * Floating action bar that appears at the midpoint of a selected edge.
 * Replaces the right-click-only flow for the common edge actions: delete,
 * cycle kind, focus, swap direction, edit label.
 *
 * Rendered inside `<ViewportPortal>` so it pans/zooms with the canvas; an
 * inverse-zoom transform on the inner element keeps the visual chrome at a
 * constant pixel size regardless of canvas zoom.
 */
export function EdgeToolbar({ edgeId }: { edgeId: ID }) {
  const flow = useReactFlow();
  const edge = useStore((s) => s.edges.find((e) => e.id === edgeId));
  const sourceNode = useStore((s) =>
    edge ? s.nodes.find((n) => n.id === edge.sourceNodeId) : null,
  );
  const targetNode = useStore((s) =>
    edge ? s.nodes.find((n) => n.id === edge.targetNodeId) : null,
  );
  const removeEdge = useStore((s) => s.removeEdge);
  const addEdge = useStore((s) => s.addEdge);
  const setCanvasSelection = useStore((s) => s.setCanvasSelection);
  const updateEdgeLabel = useStore((s) => s.updateEdgeLabel);
  const updateEdgeKind = useStore((s) => s.updateEdgeKind);

  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const [zoom, setZoom] = useState(() => flow.getViewport().zoom);

  // Subscribe to viewport changes so the inverse-zoom transform stays current.
  useEffect(() => {
    let raf = 0;
    function tick() {
      const z = flow.getViewport().zoom;
      setZoom((prev) => (Math.abs(prev - z) > 0.001 ? z : prev));
      raf = window.requestAnimationFrame(tick);
    }
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [flow]);

  const midpoint = useMemo(() => {
    if (!sourceNode || !targetNode) return null;
    const sw = sourceNode.width ?? 280;
    const sh = sourceNode.height ?? 160;
    const tw = targetNode.width ?? 280;
    const th = targetNode.height ?? 160;
    return {
      x: (sourceNode.position.x + sw / 2 + targetNode.position.x + tw / 2) / 2,
      y: (sourceNode.position.y + sh / 2 + targetNode.position.y + th / 2) / 2,
    };
  }, [sourceNode, targetNode]);

  if (!edge || !midpoint) return null;

  function onDelete() {
    if (!edge) return;
    removeEdge(edge.id);
    setCanvasSelection(useStore.getState().ui.selectedNodeIds, []);
  }

  function onSwapDirection() {
    if (!edge) return;
    const restoredKind: EdgeKind | undefined = edge.kind;
    const restoredLabel = edge.label;
    removeEdge(edge.id);
    const next = addEdge({
      sourceNodeId: edge.targetNodeId,
      targetNodeId: edge.sourceNodeId,
      ...(restoredKind ? { kind: restoredKind } : {}),
      ...(restoredLabel ? { label: restoredLabel } : {}),
    });
    setCanvasSelection(useStore.getState().ui.selectedNodeIds, [next.id]);
  }

  function onCycleKind() {
    if (!edge) return;
    // undefined → 'related' → undefined. We don't expose 'parent' here because
    // it is mint-server-side only (theme-cluster auto-edges).
    const nextKind: EdgeKind | undefined =
      edge.kind === 'related' ? undefined : 'related';
    updateEdgeKind(edge.id, nextKind);
  }

  function onFocus() {
    if (!edge) return;
    flow.fitView({
      nodes: [{ id: edge.sourceNodeId }, { id: edge.targetNodeId }],
      padding: 0.45,
      duration: 220,
    });
  }

  function onStartLabelEdit() {
    if (!edge) return;
    setLabelDraft(edge.label ?? '');
  }

  function commitLabel() {
    if (!edge || labelDraft === null) return;
    const trimmed = labelDraft.trim();
    updateEdgeLabel(edge.id, trimmed.length > 0 ? trimmed : undefined);
    setLabelDraft(null);
  }

  return (
    <ViewportPortal>
      <div
        className="edge-toolbar-anchor"
        style={{
          position: 'absolute',
          left: midpoint.x,
          top: midpoint.y,
          // Keep the toolbar pixel-sized regardless of canvas zoom.
          transform: `translate(-50%, -130%) scale(${1 / zoom})`,
          transformOrigin: 'center bottom',
          pointerEvents: 'auto',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <div className="edge-toolbar">
          <button
            type="button"
            className="edge-toolbar-btn"
            onClick={onDelete}
            title="Delete"
            aria-label="Delete edge"
          >
            <TrashIcon />
          </button>
          <button
            type="button"
            className={`edge-toolbar-btn${edge.kind === 'related' ? ' is-active' : ''}`}
            onClick={onCycleKind}
            title={edge.kind === 'related' ? 'Solid' : 'Dashed (related)'}
            aria-label="Toggle edge style"
          >
            <PaletteIcon />
          </button>
          <button
            type="button"
            className="edge-toolbar-btn"
            onClick={onFocus}
            title="Focus on this edge"
            aria-label="Focus on this edge"
          >
            <FocusIcon />
          </button>
          <button
            type="button"
            className="edge-toolbar-btn"
            onClick={onSwapDirection}
            title="Swap direction"
            aria-label="Swap edge direction"
          >
            <SwapIcon />
          </button>
          <button
            type="button"
            className="edge-toolbar-btn"
            onClick={onStartLabelEdit}
            title="Edit label"
            aria-label="Edit edge label"
          >
            <EditIcon />
          </button>
        </div>
        {labelDraft !== null ? (
          <form
            className="edge-toolbar-label-form"
            onSubmit={(e) => {
              e.preventDefault();
              commitLabel();
            }}
          >
            <input
              autoFocus
              className="edge-toolbar-label-input"
              type="text"
              value={labelDraft}
              placeholder="Edge label"
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setLabelDraft(null);
                }
              }}
              onBlur={commitLabel}
            />
          </form>
        ) : null}
      </div>
    </ViewportPortal>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path
        d="M9 4h6m-9 3h12m-1 0-1 12.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 6 19.5L5 7m5 4v8m4-8v8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="10" r="1.1" fill="currentColor" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" />
      <circle cx="16" cy="10" r="1.1" fill="currentColor" />
      <circle cx="15" cy="14" r="1.1" fill="currentColor" />
    </svg>
  );
}

function FocusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path
        d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path
        d="M5 12h14m0 0-4-4m4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path
        d="M4 20h4l11-11-4-4L4 16v4Zm10-14 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
