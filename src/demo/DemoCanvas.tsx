import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
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
  type Node as RFNode,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DemoMemoNode, type DemoMemoNodeType } from './DemoMemoNode';
import { DemoImageNode, type DemoImageNodeType } from './DemoImageNode';
import { DemoFileNode } from './DemoFileNode';
import { initialNodes, initialEdges, type DemoNode } from './sampleData';
import { useLocale } from '../web/LocaleProvider';

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

function findHoveredNodeEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.react-flow__node:hover .markdown-node');
}

function findNodeElById(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `.react-flow__node[data-id="${CSS.escape(id)}"] .markdown-node`,
  );
}

function selectAllInNode(nodeEl: HTMLElement) {
  const target = nodeEl.querySelector<HTMLElement>('.content') ?? nodeEl;
  const range = document.createRange();
  range.selectNodeContents(target);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

async function copyNodeContent(nodeEl: HTMLElement) {
  const html = nodeEl.innerHTML;
  const text = nodeEl.innerText;
  if (
    html &&
    typeof ClipboardItem !== 'undefined' &&
    navigator.clipboard?.write
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return;
    } catch {
      /* fall through to plain text */
    }
  }
  await navigator.clipboard.writeText(text);
}

type NodeCtxMenu = { nodeId: string; x: number; y: number };

function DemoCanvasInner() {
  const [nodes, setNodes] = useState<DemoNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [ctxMenu, setCtxMenu] = useState<NodeCtxMenu | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
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
              data: file.name
                ? { src, title: file.name }
                : { src, titleKey: 'pasted.image.title' },
            };
            setNodes((current) => [...current, node]);
          });
        } else if (item.kind === 'string' && item.type === 'text/plain') {
          consumed = true;
          item.getAsString((text) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            const position = computePastePosition();
            const firstLine = trimmed.split('\n')[0]?.slice(0, 60).trim();
            const node: DemoMemoNodeType = {
              id: shortId('note'),
              type: 'memo',
              position,
              style: { width: 260, height: 160 },
              data: firstLine
                ? { title: firstLine, body: trimmed }
                : { titleKey: 'pasted.note.title', body: trimmed },
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

  // Cmd/Ctrl+A while hovering a node → select-all that node's body. Cmd/Ctrl+C
  // while hovering a node → copy the node's content (rich + plain). Skipped
  // when an editable element holds focus so its native shortcuts keep working.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'a' || e.key === 'A') {
        const hovered = findHoveredNodeEl();
        if (!hovered) return;
        e.preventDefault();
        e.stopPropagation();
        selectAllInNode(hovered);
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        // If the user already has an explicit text selection, let the native
        // copy do its job. Otherwise copy the entire hovered node.
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0) return;
        const hovered = findHoveredNodeEl();
        if (!hovered) return;
        e.preventDefault();
        e.stopPropagation();
        void copyNodeContent(hovered);
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    function onDoc(e: PointerEvent) {
      if (!ctxMenuRef.current) return;
      if (!ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setCtxMenu(null);
    }
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onEsc);
    };
  }, [ctxMenu]);

  const onNodeContextMenu = useCallback(
    (e: ReactMouseEvent, node: RFNode) => {
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const addEmptyMemo = useCallback(() => {
    const position = computePastePosition();
    const node: DemoMemoNodeType = {
      id: shortId('memo'),
      type: 'memo',
      position,
      style: { width: 240, height: 130 },
      data: {
        titleKey: 'new.memo.title',
        bodyKey: 'new.memo.body',
      },
    };
    setNodes((current) => [...current, node]);
  }, [computePastePosition]);

  const { t } = useLocale();

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
        onNodeContextMenu={onNodeContextMenu}
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
        {t('canvas.addMemo')}
      </button>
      <div className="demo-canvas-hint" aria-hidden>
        {t('canvas.hint.paste')}
        <span className="demo-canvas-hint-kbd">⌘V</span>
      </div>
      {ctxMenu ? (
        <div
          className="node-context-menu"
          ref={ctxMenuRef}
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            onClick={() => {
              const el = findNodeElById(ctxMenu.nodeId);
              if (el) selectAllInNode(el);
              setCtxMenu(null);
            }}
          >
            {t('node.selectAll')}
          </button>
          <button
            type="button"
            onClick={() => {
              const el = findNodeElById(ctxMenu.nodeId);
              if (el) void copyNodeContent(el);
              setCtxMenu(null);
            }}
          >
            {t('node.copy')}
          </button>
        </div>
      ) : null}
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
