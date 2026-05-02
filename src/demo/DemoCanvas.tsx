import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DemoMemoNode, type DemoMemoNodeType } from './DemoMemoNode';
import { DemoImageNode, type DemoImageNodeType } from './DemoImageNode';
import { DemoFileNode } from './DemoFileNode';
import { initialNodes, initialEdges, type DemoNode } from './sampleData';

const nodeTypes: NodeTypes = {
  memo: DemoMemoNode,
  image: DemoImageNode,
  file: DemoFileNode,
};

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

function shortId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function DemoCanvasInner() {
  const [nodes, setNodes] = useState<DemoNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pasteOffsetRef = useRef(0);
  const rf = useReactFlow();

  const onNodesChange = useCallback(
    (changes: NodeChange<DemoNode>[]) =>
      setNodes((current) => applyNodeChanges(changes, current) as DemoNode[]),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  );

  const computePastePosition = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const offset = (pasteOffsetRef.current % 6) * 24;
    pasteOffsetRef.current += 1;
    const screenPoint = rect
      ? {
          x: rect.left + rect.width / 2 + offset,
          y: rect.top + rect.height / 2 + offset,
        }
      : { x: 200 + offset, y: 200 + offset };
    return rf.screenToFlowPosition(screenPoint);
  }, [rf]);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      return Boolean(
        el?.closest?.('input, textarea, [contenteditable="true"]'),
      );
    }
    function handlePaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      if (isEditableTarget(e.target)) return;
      const items = Array.from(e.clipboardData.items);
      let consumed = false;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          consumed = true;
          void readBlobAsDataUrl(file).then((src) => {
            const position = computePastePosition();
            const node: DemoImageNodeType = {
              id: shortId('img'),
              type: 'image',
              position,
              style: { width: 240, height: 200 },
              data: { src, title: file.name || 'Pasted image' },
            };
            setNodes((current) => [...current, node]);
          });
        } else if (item.kind === 'string' && item.type === 'text/plain') {
          consumed = true;
          item.getAsString((text) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            const position = computePastePosition();
            const firstLine = trimmed.split('\n')[0]?.slice(0, 60).trim() || 'Pasted note';
            const node: DemoMemoNodeType = {
              id: shortId('note'),
              type: 'memo',
              position,
              style: { width: 260, height: 160 },
              data: { title: firstLine, body: trimmed },
            };
            setNodes((current) => [...current, node]);
          });
        }
      }
      if (consumed) e.preventDefault();
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [computePastePosition]);

  const addEmptyMemo = useCallback(() => {
    const position = computePastePosition();
    const node: DemoMemoNodeType = {
      id: shortId('memo'),
      type: 'memo',
      position,
      style: { width: 240, height: 130 },
      data: {
        title: 'New memo',
        body: 'Edit me, or paste content directly onto the canvas.',
      },
    };
    setNodes((current) => [...current, node]);
  }, [computePastePosition]);

  return (
    <div
      className="demo-canvas-wrapper"
      ref={wrapperRef}
      data-tour="canvas"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.4}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.4}
          color="var(--dot)"
        />
      </ReactFlow>
      <button
        type="button"
        className="demo-add-memo-btn"
        data-tour="add-memo"
        onClick={addEmptyMemo}
      >
        <span className="demo-add-memo-plus" aria-hidden>
          +
        </span>
        Add memo
      </button>
      <div className="demo-canvas-hint" aria-hidden>
        Paste text or images here
        <span className="demo-canvas-hint-kbd">⌘V</span>
      </div>
    </div>
  );
}

export function DemoCanvas() {
  return (
    <ReactFlowProvider>
      <DemoCanvasInner />
    </ReactFlowProvider>
  );
}
