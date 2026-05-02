import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import {
  Background,
  BaseEdge,
  ReactFlow,
  useInternalNode,
  useReactFlow,
  type Connection,
  type Edge as RfEdge,
  type EdgeChange,
  type EdgeProps,
  type EdgeTypes,
  type Node as RfNode,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
  type Viewport as RfViewport,
} from '@xyflow/react';
import { useStore, type CanvasTool } from '../../store';
import { hueFromId } from '../../lib/hue';
import {
  MarkdownNode,
  defaultMarkdownNodeSize,
  type MarkdownNodeType,
} from './MarkdownNode';
import { ImageNode, type ImageNodeType } from './ImageNode';
import { PdfNode, type PdfNodeType } from './PdfNode';
import { ArtifactNode, type ArtifactNodeType } from './ArtifactNode';
import {
  ThemeNode,
  themeNodeDataFromCanvasNode,
  type ThemeNodeType,
} from './ThemeNode';
import {
  NodeContextMenu,
  type NodeContextMenuState,
} from '../../components/NodeContextMenu/NodeContextMenu';
import { CanvasPanelContextMenu } from '../../components/CanvasPanel/CanvasPanelContextMenu';
import type { PaneMenuControl } from '../../components/PanesContextMenu/PanesContextMenu';
import {
  getCurrentMessageDragId,
  getCrossWindowDragFallbackPayload,
  getCrossWindowDragSessionId,
  MIME_CROSS_WINDOW_DRAG_PAYLOAD,
  MIME_CROSS_WINDOW_DRAG_SESSION,
  MIME_MESSAGE_ID,
  MIME_MESSAGE_JSON,
  readMessageDragPayload,
  resolveCrossWindowDragPayload,
} from './dnd';
import { ingestDroppedFiles, pasteToCanvas } from './ingest';
import { useClampedMenuPosition } from '../../hooks/useClampedMenuPosition';
import {
  findFreeNodePosition,
  rectFromPoints,
  selectEdgesForNodes,
  selectNodesInRect,
  type Rect,
} from '../../services/canvas/CanvasSelectionService';
import {
  ensureNodeMarkdownPath,
} from '../../services/markdown/MarkdownContextResolver';
import { searchMarkdownFiles, type MarkdownSearchResult, type MarkdownSearchScope } from '../../services/markdown/MarkdownSearchService';
import { resolveMarkdownRoot } from '../../services/storage/MarkdownFileService';
import { syncWikiLinkBetweenNodes } from '../../services/markdown/WikiLinkSyncService';
import { buildCanvasAskContext } from '../../services/canvas/CanvasAskService';

const nodeTypes: NodeTypes = {
  markdown: MarkdownNode,
  image: ImageNode,
  pdf: PdfNode,
  artifact: ArtifactNode,
  theme: ThemeNode,
};

const edgeTypes: EdgeTypes = {
  flexible: FlexibleEdge,
};

const MIN_CANVAS_ZOOM = 0.01;
const MAX_CANVAS_ZOOM = 100;

function deriveTitle(content: string): string {
  const firstLine = content.split('\n')[0]?.trim() ?? '';
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}

function rectBoundaryPoint(
  rect: { x: number; y: number; width: number; height: number },
  toward: { x: number; y: number },
) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : (rect.width / 2) / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : (rect.height / 2) / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

const NODE_HEADER_OFFSET = 36;

type EdgeRect = { x: number; y: number; width: number; height: number };

type SourceMarkerInfo = {
  startOffset: number;
  endOffset: number;
  textLength: number;
};

type FlexibleEdgeData = {
  sourceMarker?: SourceMarkerInfo;
};

function markerAnchorPoint(
  rect: EdgeRect,
  toward: { x: number; y: number },
  marker: SourceMarkerInfo,
) {
  const center = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
  const onRight = toward.x >= center.x;
  const x = onRight ? rect.x + rect.width : rect.x;
  const safeLength = Math.max(1, marker.textLength);
  const mid = (marker.startOffset + marker.endOffset) / 2;
  const ratio = Math.max(0, Math.min(1, mid / safeLength));
  const top = rect.y + Math.min(NODE_HEADER_OFFSET, rect.height * 0.25);
  const bottom = rect.y + rect.height - 8;
  const usableHeight = Math.max(0, bottom - top);
  const y = top + ratio * usableHeight;
  return { x, y, onRight };
}

function flexibleEdgePathFromRects(
  sourceRect: EdgeRect,
  targetRect: EdgeRect,
  sourceMarker?: SourceMarkerInfo,
) {
  const sourceCenter = {
    x: sourceRect.x + sourceRect.width / 2,
    y: sourceRect.y + sourceRect.height / 2,
  };
  const targetCenter = {
    x: targetRect.x + targetRect.width / 2,
    y: targetRect.y + targetRect.height / 2,
  };
  const start = sourceMarker
    ? markerAnchorPoint(sourceRect, targetCenter, sourceMarker)
    : {
        ...rectBoundaryPoint(sourceRect, targetCenter),
        onRight: targetCenter.x >= sourceCenter.x,
      };
  const end = rectBoundaryPoint(targetRect, sourceCenter);
  const horizontal = Math.abs(end.x - start.x);
  const dxBase = Math.max(40, horizontal * 0.35);
  const dx = sourceMarker
    ? start.onRight
      ? dxBase
      : -dxBase
    : end.x >= start.x
    ? dxBase
    : -dxBase;
  return `M ${start.x},${start.y} C ${start.x + dx},${start.y} ${end.x - dx},${end.y} ${end.x},${end.y}`;
}

function FlexibleEdge(props: EdgeProps<RfEdge<FlexibleEdgeData>>) {
  const sourceNode = useInternalNode(props.source);
  const targetNode = useInternalNode(props.target);
  const sourceMarker = props.data?.sourceMarker;

  const fallbackPath = `M ${props.sourceX},${props.sourceY} C ${
    props.sourceX + 40
  },${props.sourceY} ${props.targetX - 40},${props.targetY} ${props.targetX},${
    props.targetY
  }`;

  let path = fallbackPath;
  if (sourceNode && targetNode) {
    const sourcePos =
      sourceNode.internals.positionAbsolute ?? sourceNode.position;
    const targetPos =
      targetNode.internals.positionAbsolute ?? targetNode.position;
    const sourceWidth = sourceNode.measured.width ?? sourceNode.width;
    const sourceHeight = sourceNode.measured.height ?? sourceNode.height;
    const targetWidth = targetNode.measured.width ?? targetNode.width;
    const targetHeight = targetNode.measured.height ?? targetNode.height;
    if (
      typeof sourceWidth === 'number' &&
      typeof sourceHeight === 'number' &&
      typeof targetWidth === 'number' &&
      typeof targetHeight === 'number'
    ) {
      const sourceRect: EdgeRect = {
        x: sourcePos.x,
        y: sourcePos.y,
        width: sourceWidth,
        height: sourceHeight,
      };
      const targetRect: EdgeRect = {
        x: targetPos.x,
        y: targetPos.y,
        width: targetWidth,
        height: targetHeight,
      };
      path = flexibleEdgePathFromRects(sourceRect, targetRect, sourceMarker);
    } else {
      // measured not available yet — keep fallback this frame; a re-render
      // will follow once React Flow finishes measuring.
      path = fallbackPath;
    }
  }

  return (
    <BaseEdge
      path={path}
      markerEnd={props.markerEnd}
      style={props.style}
      interactionWidth={props.interactionWidth}
    />
  );
}

export type CanvasPanelProps = {
  canvasPanelState?: 'shown' | 'hidden';
  chatPanelState?: 'shown' | 'hidden';
  paneMenuItems?: PaneMenuControl[];
  onShowCanvas?: () => void;
  onHideCanvas?: () => void;
  onShowChat?: () => void;
  onHideChat?: () => void;
};

export function CanvasPanel({
  canvasPanelState,
  chatPanelState,
  paneMenuItems,
  onShowCanvas,
  onHideCanvas,
  onShowChat,
  onHideChat,
}: CanvasPanelProps = {}) {
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const viewMode = useStore((s) => s.ui.viewMode);
  const storeNodes = useStore((s) => s.nodes);
  const storeEdges = useStore((s) => s.edges);
  const messages = useStore((s) => s.messages);
  const conversations = useStore((s) => s.conversations);
  const projects = useStore((s) => s.projects);
  const visibleProjects = useStore((s) => s.ui.globalVisibleProjectIds);
  const visibleConvs = useStore((s) => s.ui.globalVisibleConversationIds);
  const toggleProjectVisible = useStore((s) => s.toggleProjectVisible);
  const toggleConversationVisible = useStore(
    (s) => s.toggleConversationVisible,
  );
  const canvasTool = useStore((s) => s.ui.canvasTool);
  const setCanvasTool = useStore((s) => s.setCanvasTool);
  const wheelMode = useStore(
    (s) => s.settings.canvasWheelMode ?? 'pan',
  );
  const setCanvasWheelMode = useStore((s) => s.setCanvasWheelMode);
  const toggleWheelMode = () =>
    setCanvasWheelMode(wheelMode === 'pan' ? 'zoom' : 'pan');
  const editingNodeId = useStore((s) => s.ui.editingNodeId);
  const setEditingNode = useStore((s) => s.setEditingNode);
  const viewportByConv = useStore((s) => s.settings.viewportByConversation);
  const updateNodePosition = useStore((s) => s.updateNodePosition);
  const updateNodeSize = useStore((s) => s.updateNodeSize);
  const setViewport = useStore((s) => s.setViewport);
  const addNode = useStore((s) => s.addNode);
  const removeNode = useStore((s) => s.removeNode);
  const addEdge = useStore((s) => s.addEdge);
  const removeEdge = useStore((s) => s.removeEdge);
  const ensureConversation = useStore((s) => s.ensureConversation);
  const selectNode = useStore((s) => s.selectNode);
  const selectedNodeIds = useStore((s) => s.ui.selectedNodeIds);
  const selectedEdgeIds = useStore((s) => s.ui.selectedEdgeIds);
  const setCanvasSelection = useStore((s) => s.setCanvasSelection);
  const clearCanvasSelection = useStore((s) => s.clearCanvasSelection);
  const flow = useReactFlow();
  const [dragOver, setDragOver] = useState(false);
  const [dropTargetNodeId, setDropTargetNodeId] = useState<string | null>(null);
  const [dupToast, setDupToast] = useState<{ id: number } | null>(null);
  const suppressDupWarning = useStore(
    (s) => s.settings.suppressDuplicateChatNodeWarning ?? false,
  );
  const setSuppressDupWarning = useStore(
    (s) => s.setSuppressDuplicateChatNodeWarning,
  );
  const [ctxMenu, setCtxMenu] = useState<NodeContextMenuState | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number } | null>(null);
  const [paneMenu, setPaneMenu] = useState<{ x: number; y: number } | null>(null);
  const [textSelectionMenu, setTextSelectionMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    selectedText: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const [searchOpen, setSearchOpen] = useState<{ nodeIds: string[]; initialQuery?: string } | null>(null);
  const [marquee, setMarquee] = useState<{
    startScreen: { x: number; y: number };
    currentScreen: { x: number; y: number };
    startFlow: { x: number; y: number };
    currentFlow: { x: number; y: number };
    additive: boolean;
    active: boolean;
  } | null>(null);
  const marqueeRef = useRef<typeof marquee>(null);
  const theme = useStore((s) => s.settings.theme);
  const dotColor = useMemo(() => {
    const map: Record<string, string> = {
      light: '#e0d3b4',
      dark: '#2a2e35',
      sepia: '#d6c9ae',
      'high-contrast': '#444',
      white: '#d8d8dd',
      violet: '#ddd5ee',
    };
    return map[theme] ?? '#e0d3b4';
  }, [theme]);

  const showGlobal = viewMode === 'global';

  const visibleConvSet = useMemo(() => {
    if (!showGlobal) return null;
    const set = new Set<string>(visibleConvs);
    const visibleProjectSet = new Set(visibleProjects);
    for (const c of conversations) {
      if (c.projectId && visibleProjectSet.has(c.projectId)) set.add(c.id);
    }
    return set;
  }, [showGlobal, conversations, visibleProjects, visibleConvs]);

  const rfNodes: RfNode[] = useMemo(() => {
    const visible = showGlobal
      ? visibleConvSet
        ? storeNodes.filter((n) => visibleConvSet.has(n.conversationId))
        : []
      : conversationId
      ? storeNodes.filter((n) => n.conversationId === conversationId)
      : [];
    return visible.map<
      | MarkdownNodeType
      | ImageNodeType
      | PdfNodeType
      | ArtifactNodeType
      | ThemeNodeType
    >((n) => {
      const hue = showGlobal ? hueFromId(n.conversationId) : undefined;
      // While a Markdown node is being edited inline, drop its persisted
      // dimensions so the React Flow wrapper auto-grows around the larger
      // editor; the saved width/height are restored on save/cancel.
      const isEditing =
        n.kind !== 'image' &&
        n.kind !== 'pdf' &&
        n.kind !== 'artifact' &&
        editingNodeId === n.id;
      const sizeStyle: Record<string, number> = {};
      if (!isEditing) {
        if (typeof n.width === 'number') sizeStyle.width = n.width;
        if (typeof n.height === 'number') sizeStyle.height = n.height;
      }
      if (n.kind === 'image' && n.attachmentIds && n.attachmentIds[0]) {
        return {
          id: n.id,
          type: 'image',
          selected: selectedNodeIds.includes(n.id),
          position: n.position,
          ...(n.width ? { width: n.width } : {}),
          ...(n.height ? { height: n.height } : {}),
          style: sizeStyle,
          data: { title: n.title, attachmentId: n.attachmentIds[0], hue },
        } satisfies ImageNodeType;
      }
      if (n.kind === 'pdf' && n.attachmentIds && n.attachmentIds[0]) {
        return {
          id: n.id,
          type: 'pdf',
          selected: selectedNodeIds.includes(n.id),
          position: n.position,
          ...(n.width ? { width: n.width } : {}),
          ...(n.height ? { height: n.height } : {}),
          style: sizeStyle,
          data: { title: n.title, attachmentId: n.attachmentIds[0] },
        } satisfies PdfNodeType;
      }
      if (n.kind === 'artifact' && n.attachmentIds && n.attachmentIds[0]) {
        return {
          id: n.id,
          type: 'artifact',
          selected: selectedNodeIds.includes(n.id),
          position: n.position,
          ...(n.width ? { width: n.width } : {}),
          ...(n.height ? { height: n.height } : {}),
          style: sizeStyle,
          data: { title: n.title, attachmentId: n.attachmentIds[0], hue },
        } satisfies ArtifactNodeType;
      }
      if (n.kind === 'theme') {
        return {
          id: n.id,
          type: 'theme',
          selected: selectedNodeIds.includes(n.id),
          position: n.position,
          ...(n.width ? { width: n.width } : {}),
          ...(n.height ? { height: n.height } : {}),
          style: sizeStyle,
          data: { ...themeNodeDataFromCanvasNode(n), hue },
        } satisfies ThemeNodeType;
      }
      return {
        id: n.id,
        type: 'markdown',
        selected: selectedNodeIds.includes(n.id),
        position: n.position,
        ...(isEditing ? {} : n.width ? { width: n.width } : {}),
        ...(isEditing ? {} : n.height ? { height: n.height } : {}),
        style: sizeStyle,
          data: {
            title: n.title,
            contentMarkdown: n.contentMarkdown,
            mdPath: n.mdPath,
            markers: n.selectionMarkers ?? [],
            hue,
            isSummary: n.tags.includes('summary'),
          },
      } satisfies MarkdownNodeType;
    });
  }, [storeNodes, conversationId, showGlobal, visibleConvSet, selectedNodeIds, editingNodeId]);

  const rfEdges: RfEdge[] = useMemo(() => {
    const visibleNodeIds = new Set(rfNodes.map((n) => n.id));
    const storeNodeById = new Map(storeNodes.map((node) => [node.id, node]));
    return storeEdges
      .filter(
        (e) =>
          visibleNodeIds.has(e.sourceNodeId) &&
          visibleNodeIds.has(e.targetNodeId),
      )
      .map((e) => {
        const sourceStore = storeNodeById.get(e.sourceNodeId);
        const marker = sourceStore?.selectionMarkers?.find(
          (m) => m.answerNodeId === e.targetNodeId,
        );
        const sourceMarker: SourceMarkerInfo | undefined = marker
          ? {
              startOffset: marker.startOffset,
              endOffset: marker.endOffset,
              textLength: Math.max(
                marker.endOffset,
                sourceStore?.contentMarkdown.length ?? marker.endOffset,
              ),
            }
          : undefined;
        const data: FlexibleEdgeData = sourceMarker ? { sourceMarker } : {};
        const isSelected = selectedEdgeIds.includes(e.id);
        const baseStyle: Record<string, string | number> = {};
        if (e.kind === 'related') {
          baseStyle.strokeDasharray = '6 4';
          baseStyle.stroke = 'var(--text-mute)';
        }
        if (isSelected) {
          baseStyle.stroke = 'var(--accent)';
          baseStyle.strokeWidth = 2.5;
        }
        return {
          id: e.id,
          source: e.sourceNodeId,
          target: e.targetNodeId,
          type: 'flexible',
          data,
          label: e.label,
          selected: isSelected,
          style: Object.keys(baseStyle).length > 0 ? baseStyle : undefined,
          className: e.kind ? `edge-kind-${e.kind}` : undefined,
          // Widen the invisible hit-target stroke so right-click reliably
          // lands on the curved path (default 20px is narrow at low zoom).
          interactionWidth: 28,
        };
      });
  }, [storeEdges, storeNodes, rfNodes, selectedEdgeIds]);

  const initialViewport: RfViewport | undefined =
    !showGlobal && conversationId
      ? viewportByConv?.[conversationId]
      : undefined;

  function onNodesChange(changes: NodeChange[]) {
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position) {
        updateNodePosition(ch.id, ch.position);
      } else if (ch.type === 'remove') {
        removeNode(ch.id);
      } else if (ch.type === 'select') {
        const nextSelected = ch.selected
          ? Array.from(new Set([...selectedNodeIds, ch.id]))
          : selectedNodeIds.filter((id) => id !== ch.id);
        setCanvasSelection(
          nextSelected,
          selectEdgesForNodes(storeEdges, nextSelected),
        );
      } else if (ch.type === 'dimensions' && ch.dimensions && ch.resizing) {
        updateNodeSize(ch.id, {
          width: ch.dimensions.width,
          height: ch.dimensions.height,
        });
      }
    }
  }

  function onEdgesChange(changes: EdgeChange[]) {
    for (const ch of changes) {
      if (ch.type === 'remove') {
        removeEdge(ch.id);
      }
    }
  }

  function onConnect(c: Connection) {
    if (!c.source || !c.target || c.source === c.target) return;
    // Connecting two theme-kind nodes manually defaults to a `related` edge
    // (dashed). Auto-created parent-child edges are minted server-side via
    // `kind: 'parent'` and never go through this path.
    const sourceNode = storeNodes.find((n) => n.id === c.source);
    const targetNode = storeNodes.find((n) => n.id === c.target);
    const isThemeLink =
      sourceNode?.kind === 'theme' && targetNode?.kind === 'theme';
    const edge = addEdge({
      sourceNodeId: c.source,
      targetNodeId: c.target,
      ...(isThemeLink ? { kind: 'related' as const } : {}),
    });
    void syncConnectedMarkdownLinks(c.source, c.target);
    setCanvasSelection(
      [c.source, c.target],
      Array.from(new Set([...selectedEdgeIds, edge.id])),
    );
  }

  async function syncConnectedMarkdownLinks(sourceId: string, targetId: string) {
    try {
      const rootPath = await resolveMarkdownRoot(
        useStore.getState().settings.markdownStorageDir,
      );
      await ensureNodeMarkdownPath(rootPath, sourceId);
      await ensureNodeMarkdownPath(rootPath, targetId);
      const latest = useStore.getState();
      const source = latest.nodes.find((n) => n.id === sourceId);
      const target = latest.nodes.find((n) => n.id === targetId);
      if (!source || !target) return;
      await syncWikiLinkBetweenNodes(rootPath, source, target);
    } catch (err) {
      console.warn('wikilink sync failed', err);
    }
  }

  function onMoveEnd(_: unknown, viewport: RfViewport) {
    if (!showGlobal && conversationId) setViewport(conversationId, viewport);
  }

  function onPaneClick() {
    clearCanvasSelection();
  }

  const onNodeClick: NodeMouseHandler = (_, node) => {
    selectNode(node.id);
  };

  function resetCanvasView() {
    flow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 });
    if (!showGlobal && conversationId) {
      setViewport(conversationId, { x: 0, y: 0, zoom: 1 });
    }
  }

  function fitCanvasView() {
    const targetIds =
      selectedNodeIds.length > 0
        ? selectedNodeIds
        : rfNodes.map((n) => n.id);
    if (targetIds.length === 0) return;
    flow.fitView({
      nodes: targetIds.map((id) => ({ id })),
      padding: 0.2,
      duration: 200,
    });
  }

  function fitToCanvasEdges() {
    if (rfNodes.length === 0) return;
    flow.fitView({
      nodes: rfNodes.map((n) => ({ id: n.id })),
      padding: 0,
      duration: 200,
    });
  }

  function visibleNodeIdSet(): Set<string> {
    return new Set(rfNodes.map((node) => node.id));
  }

  function finishMarquee() {
    const current = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    if (!current) return;
    const dx = current.currentScreen.x - current.startScreen.x;
    const dy = current.currentScreen.y - current.startScreen.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 6) {
      if (!current.additive) clearCanvasSelection();
      return;
    }
    const rect = rectFromPoints(current.startFlow, current.currentFlow);
    const nodeIds = selectNodesInRect(storeNodes, rect, visibleNodeIdSet());
    const combinedNodeIds = current.additive
      ? Array.from(new Set([...selectedNodeIds, ...nodeIds]))
      : nodeIds;
    const edgeIds = selectEdgesForNodes(storeEdges, combinedNodeIds);
    setCanvasSelection(combinedNodeIds, edgeIds);
  }

  function onCanvasPointerDown(e: PointerEvent<HTMLElement>) {
    if (canvasTool === 'hand') {
      startHandPan(e);
      return;
    }
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (!target.classList.contains('react-flow__pane')) return;
    const startScreen = { x: e.clientX, y: e.clientY };
    const startFlow = flow.screenToFlowPosition(startScreen);
    const next = {
      startScreen,
      currentScreen: startScreen,
      startFlow,
      currentFlow: startFlow,
      additive: e.shiftKey,
      active: false,
    };
    marqueeRef.current = next;
    setMarquee(next);
    e.preventDefault();
    e.stopPropagation();

    function onMove(ev: globalThis.PointerEvent) {
      const current = marqueeRef.current;
      if (!current) return;
      const currentScreen = { x: ev.clientX, y: ev.clientY };
      const distance = Math.hypot(
        currentScreen.x - current.startScreen.x,
        currentScreen.y - current.startScreen.y,
      );
      const nextState = {
        ...current,
        currentScreen,
        currentFlow: flow.screenToFlowPosition(currentScreen),
        active: current.active || distance >= 6,
      };
      marqueeRef.current = nextState;
      setMarquee(nextState);
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      finishMarquee();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function isHandPanTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (
      target.closest(
        'button, input, textarea, select, a, [contenteditable="true"], .nodrag, .node-context-menu, .canvas-modal, .canvas-toolbar',
      )
    ) {
      return false;
    }
    return true;
  }

  function startHandPan(e: PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    if (!isHandPanTarget(e.target)) return;
    const startScreen = { x: e.clientX, y: e.clientY };
    const startViewport = flow.getViewport();
    e.preventDefault();
    e.stopPropagation();

    function onMove(ev: globalThis.PointerEvent) {
      const dx = ev.clientX - startScreen.x;
      const dy = ev.clientY - startScreen.y;
      flow.setViewport(
        {
          x: startViewport.x + dx,
          y: startViewport.y + dy,
          zoom: startViewport.zoom,
        },
        { duration: 0 },
      );
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!showGlobal && conversationId) {
        setViewport(conversationId, flow.getViewport());
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function selectedMenuAt(x: number, y: number) {
    if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return false;
    setSelectionMenu({ x, y });
    return true;
  }

  /**
   * Open the unified AI Palette for the current canvas selection (nodes
   * and/or edges). The selection's resolved Markdown context is passed in
   * as the palette's selection text; the first selected node is used as the
   * auto-link anchor so the streamed answer becomes a connected node.
   */
  async function openAiPaletteForSelectedCanvas() {
    try {
      const context = await buildCanvasAskContext({
        nodeIds: selectedNodeIds,
        edgeIds: selectedEdgeIds,
      });
      const firstNodeId = selectedNodeIds[0];
      const origin = firstNodeId ? `canvas-node:${firstNodeId}` : null;
      // Separate the user-visible label from the LLM-internal source
      // dump. The previous behavior pasted the whole "Use the
      // following local Markdown files…" block as if it were the user's
      // selection, which (a) cluttered the palette UI and (b) leaked
      // the system-prompt scaffolding back to the user. The summary
      // here is just enough context for the user to know what's
      // attached; the verbose markdown/edge data still reaches the
      // model as a `system` message via `systemContext`.
      const summary = context.summary;
      const titlePreview = summary.fileNames.slice(0, 3).join(', ');
      const lines: string[] = [];
      if (summary.fileCount > 0) {
        lines.push(
          `${summary.fileCount} note${summary.fileCount === 1 ? '' : 's'}` +
            (titlePreview ? `: ${titlePreview}` : ''),
        );
      }
      if (summary.edgeCount > 0) {
        lines.push(
          `${summary.edgeCount} link${summary.edgeCount === 1 ? '' : 's'}`,
        );
      }
      const userVisible = lines.length
        ? lines.join(' · ')
        : 'Selected canvas context';
      useStore
        .getState()
        .openAiPalette(userVisible, origin, context.systemContext);
    } catch (err) {
      console.error('[mc:ask] openAiPaletteForSelectedCanvas failed', err);
    }
  }

  function addNodeAt(screenX: number, screenY: number) {
    if (showGlobal) return;
    const targetConv = conversationId ?? ensureConversation();
    if (!targetConv) return;
    const position = flow.screenToFlowPosition({ x: screenX, y: screenY });
    const size = defaultMarkdownNodeSize('');
    const node = addNode({
      conversationId: targetConv,
      kind: 'markdown',
      title: '',
      contentMarkdown: '',
      position,
      width: size.width,
      height: size.height,
      tags: [],
    });
    setEditingNode(node.id);
  }

  // Async paste — used by the right-click "Paste" menu where there is no
  // ClipboardEvent. Reads navigator.clipboard.read(); falls back to readText.
  async function pasteAt(screenX: number, screenY: number) {
    if (showGlobal) return;
    const targetConv = conversationId ?? ensureConversation();
    if (!targetConv) return;
    const position = flow.screenToFlowPosition({ x: screenX, y: screenY });
    await pasteToCanvas({ kind: 'async' }, targetConv, position);
  }

  function getSelectionOffsets(container: HTMLElement, range: Range) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let startOffset = -1;
    let endOffset = -1;
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const len = textNode.textContent?.length ?? 0;
      if (textNode === range.startContainer) startOffset = offset + range.startOffset;
      if (textNode === range.endContainer) {
        endOffset = offset + range.endOffset;
        break;
      }
      offset += len;
    }
    return startOffset >= 0 && endOffset >= startOffset
      ? { startOffset, endOffset }
      : null;
  }

  function onCanvasContextMenu(e: MouseEvent<HTMLElement>) {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';
    if (!selection || selection.rangeCount === 0 || !selectedText) {
      console.debug('[mc:ask] context-menu skipped — no text selection');
      return;
    }
    const target = e.target as HTMLElement;
    const content = target.closest<HTMLElement>('.markdown-node-content');
    const nodeId = content?.dataset.nodeId;
    if (!content || !nodeId || !content.contains(selection.anchorNode)) {
      console.debug('[mc:ask] context-menu skipped — selection not inside a markdown node', {
        hasContent: !!content,
        nodeId,
        anchorInside: content ? content.contains(selection.anchorNode) : false,
      });
      return;
    }
    const range = selection.getRangeAt(0);
    const offsets = getSelectionOffsets(content, range);
    if (!offsets) {
      console.debug('[mc:ask] context-menu skipped — could not compute offsets');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    console.debug('[mc:ask] text-selection menu opened', {
      nodeId,
      selectedText: selectedText.slice(0, 80),
      length: selectedText.length,
      startOffset: offsets.startOffset,
      endOffset: offsets.endOffset,
    });
    setTextSelectionMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId,
      selectedText,
      startOffset: offsets.startOffset,
      endOffset: offsets.endOffset,
    });
  }

  function openMarkdownForSelection() {
    const first = selectedNodeIds[0];
    if (!first) return;
    openMarkdownForNode(first);
  }

  function openMarkdownForNode(nodeId: string) {
    void (async () => {
      const root = await resolveMarkdownRoot(
        useStore.getState().settings.markdownStorageDir,
      );
      const path = await ensureNodeMarkdownPath(root, nodeId);
      if (path) {
        window.dispatchEvent(
          new CustomEvent('mc:open-markdown-file', { detail: { path } }),
        );
      }
    })();
  }

  function copyMarkdownLinks() {
    const selected = useStore
      .getState()
      .nodes.filter((node) => selectedNodeIds.includes(node.id));
    const links = selected.map((node) => `[[${node.title || node.mdPath || node.id}]]`);
    void navigator.clipboard.writeText(links.join('\n'));
  }

  function linkSelectedNotes() {
    if (selectedNodeIds.length < 2) return;
    const [source, ...targets] = selectedNodeIds;
    for (const target of targets) {
      if (source !== target) {
        const edge = addEdge({ sourceNodeId: source, targetNodeId: target });
        void syncConnectedMarkdownLinks(source, target);
        setCanvasSelection(selectedNodeIds, [...selectedEdgeIds, edge.id]);
      }
    }
  }

  // Double-click in global mode: select all nodes in the same conversation /
  // project so they can be dragged as a group.
  const onNodeDoubleClick: NodeMouseHandler = (_e, node) => {
    if (!showGlobal) return;
    const meta = storeNodes.find((n) => n.id === node.id);
    if (!meta) return;
    const conv = conversations.find((c) => c.id === meta.conversationId);
    const groupConvIds = conv?.projectId
      ? new Set(
          conversations
            .filter((c) => c.projectId === conv.projectId)
            .map((c) => c.id),
        )
      : new Set([meta.conversationId]);
    const ids = storeNodes
      .filter((n) => groupConvIds.has(n.conversationId))
      .map((n) => n.id);
    setCanvasSelection(ids, selectEdgesForNodes(storeEdges, ids));
  };

  function findCanvasNodeIdAtPoint(clientX: number, clientY: number): string | null {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
      const nodeEl = (el as HTMLElement).closest?.('.react-flow__node');
      if (nodeEl) {
        const id = (nodeEl as HTMLElement).getAttribute('data-id');
        if (id) return id;
      }
    }
    return null;
  }

  function onDragOver(e: DragEvent<HTMLElement>) {
    const types = Array.from(e.dataTransfer.types);
    const isMessage =
      Boolean(getCurrentMessageDragId()) ||
      types.includes(MIME_CROSS_WINDOW_DRAG_SESSION) ||
      types.includes(MIME_CROSS_WINDOW_DRAG_PAYLOAD) ||
      types.includes(MIME_MESSAGE_ID) ||
      types.includes(MIME_MESSAGE_JSON) ||
      types.includes('text/plain');
    const isFile = e.dataTransfer.types.includes('Files');
    if (!isMessage && !isFile) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragOver) setDragOver(true);
    if (isMessage) {
      const hovered = findCanvasNodeIdAtPoint(e.clientX, e.clientY);
      if (hovered !== dropTargetNodeId) setDropTargetNodeId(hovered);
    } else if (dropTargetNodeId) {
      setDropTargetNodeId(null);
    }
  }

  function onDragLeave(e: DragEvent<HTMLElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
    setDropTargetNodeId(null);
  }

  function placeChildNodeNear(
    parent: { position: { x: number; y: number }; width?: number; height?: number },
    childSize: { width: number; height: number },
  ): { x: number; y: number } {
    const preferred = {
      x: parent.position.x + (parent.width ?? 280) + 80,
      y: parent.position.y,
    };
    const obstacles: Rect[] = useStore.getState().nodes.map((node) => ({
      x: node.position.x,
      y: node.position.y,
      width: node.width ?? 280,
      height: node.height ?? 160,
    }));
    return findFreeNodePosition(preferred, childSize, obstacles);
  }

  function createChildNodeFromChat(input: {
    parentNodeId: string;
    conversationId: string;
    title: string;
    contentMarkdown: string;
    sourceMessageId?: string;
    sourceRole?: 'user' | 'assistant' | 'system';
  }) {
    const parent = useStore.getState().nodes.find((n) => n.id === input.parentNodeId);
    if (!parent) return null;
    const childSize = { width: 280, height: 160 };
    const position = placeChildNodeNear(parent, childSize);
    const tags = ['chat-derived'];
    if (input.sourceRole) tags.push(`role:${input.sourceRole}`);
    const child = addNode({
      conversationId: input.conversationId,
      kind: 'markdown',
      title: input.title,
      contentMarkdown: input.contentMarkdown,
      sourceMessageId: input.sourceMessageId,
      position,
      width: childSize.width,
      height: childSize.height,
      tags,
    });
    const edge = addEdge({
      sourceNodeId: input.parentNodeId,
      targetNodeId: child.id,
      label: 'chat',
    });
    void syncConnectedMarkdownLinks(input.parentNodeId, child.id);
    setCanvasSelection([input.parentNodeId, child.id], [edge.id]);
    return child;
  }

  async function onDrop(e: DragEvent<HTMLElement>) {
    const dropNodeId = findCanvasNodeIdAtPoint(e.clientX, e.clientY);
    setDragOver(false);
    setDropTargetNodeId(null);
    const dragSessionId = getCrossWindowDragSessionId(e.dataTransfer);
    const fallbackPayload = getCrossWindowDragFallbackPayload(e.dataTransfer);
    const messageId =
      e.dataTransfer.getData(MIME_MESSAGE_ID) ||
      readMessageDragPayload(e.dataTransfer.getData(MIME_MESSAGE_JSON)) ||
      readMessageDragPayload(e.dataTransfer.getData('text/plain')) ||
      getCurrentMessageDragId();
    const targetConv = conversationId;
    const position = flow.screenToFlowPosition({
      x: e.clientX,
      y: e.clientY,
    });

    if (e.dataTransfer.files.length > 0 && targetConv) {
      e.preventDefault();
      const ingested = await ingestDroppedFiles(
        Array.from(e.dataTransfer.files),
        targetConv,
        position,
      );
      for (const item of ingested.filter((f) => f.preview)) {
        window.dispatchEvent(
          new CustomEvent('mc:open-attachment-preview', {
            detail: { attachmentId: item.attachment.id, title: item.title },
          }),
        );
      }
      return;
    }

    if (dragSessionId || fallbackPayload) {
      e.preventDefault();
      const payload = dragSessionId
        ? (await resolveCrossWindowDragPayload(dragSessionId)) ?? fallbackPayload
        : fallbackPayload;
      if (!payload) return;
      const tConv = showGlobal ? payload.chatId : conversationId;
      if (!tConv) return;
      if (
        payload.messageId &&
        isMessageAlreadyOnCanvas(payload.messageId, tConv)
      ) {
        notifyDuplicateDrop();
        return;
      }
      const dropTarget = dropNodeId
        ? useStore.getState().nodes.find((n) => n.id === dropNodeId)
        : null;
      if (dropTarget && dropTarget.id !== payload.messageId) {
        createChildNodeFromChat({
          parentNodeId: dropTarget.id,
          conversationId: tConv,
          title: deriveTitle(payload.content),
          contentMarkdown: payload.content || 'Dropped chat card',
          sourceMessageId: payload.messageId,
        });
        return;
      }
      {
        const content = payload.content || 'Dropped chat card';
        const size = defaultMarkdownNodeSize(content);
        const role = payload.metadata?.role;
        addNode({
          conversationId: tConv,
          title: deriveTitle(payload.content),
          contentMarkdown: content,
          sourceMessageId: payload.messageId,
          position,
          width: size.width,
          height: size.height,
          tags: role ? [`role:${role}`] : [],
          // Preserve the source message's metadata for cross-window
          // drops too. `payload.metadata.createdAt` is provided by the
          // dragging window via `createCrossWindowDragPayload`.
          frontmatter: {
            sourceCreatedAt: payload.metadata?.createdAt,
            sourceRole: role,
            sourceConversationId: payload.chatId,
          },
        });
      }
      return;
    }

    if (!messageId) return;
    e.preventDefault();
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    const tConv = showGlobal ? msg.conversationId : conversationId;
    if (!tConv) return;
    if (isMessageAlreadyOnCanvas(messageId, tConv)) {
      notifyDuplicateDrop();
      return;
    }
    const dropTarget = dropNodeId
      ? useStore.getState().nodes.find((n) => n.id === dropNodeId)
      : null;
    if (dropTarget) {
      createChildNodeFromChat({
        parentNodeId: dropTarget.id,
        conversationId: tConv,
        title: deriveTitle(msg.content),
        contentMarkdown: msg.content,
        sourceMessageId: messageId,
        sourceRole: msg.role,
      });
      return;
    }
    {
      const size = defaultMarkdownNodeSize(msg.content);
      addNode({
        conversationId: tConv,
        title: deriveTitle(msg.content),
        contentMarkdown: msg.content,
        sourceMessageId: messageId,
        position,
        width: size.width,
        height: size.height,
        tags: [`role:${msg.role}`],
        // Preserve the source message's metadata. The node's own
        // `createdAt` records when it landed on the canvas; the
        // frontmatter keeps the message's original createdAt and role
        // so downstream consumers (export, search, dedupe) can tell
        // them apart.
        frontmatter: {
          sourceCreatedAt: msg.createdAt,
          sourceRole: msg.role,
          sourceConversationId: msg.conversationId,
        },
      });
    }
  }

  /**
   * Returns true if a chat-message-derived node already exists on the
   * canvas for this conversation. The check by `sourceMessageId` is
   * load-bearing: the canvas allows multiple plain notes per chat, but
   * a given chat message should only ever have one node tying back to
   * its source.
   */
  function isMessageAlreadyOnCanvas(
    messageId: string,
    convId: string,
  ): boolean {
    return useStore
      .getState()
      .nodes.some(
        (n) => n.sourceMessageId === messageId && n.conversationId === convId,
      );
  }

  /**
   * Surface the "already on canvas" toast unless the user clicked
   * "Don't show again" previously. The duplicate is silently skipped
   * either way — we never produce a second node for the same message.
   */
  function notifyDuplicateDrop() {
    if (suppressDupWarning) return;
    setDupToast({ id: Date.now() });
  }

  useEffect(() => {
    function onFocusCanvasNode(e: Event) {
      const nodeId = (e as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;
      const node = useStore.getState().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      flow.setCenter(node.position.x, node.position.y, { zoom: 1.1, duration: 300 });
    }
    window.addEventListener('mc:focus-canvas-node', onFocusCanvasNode);
    return () => window.removeEventListener('mc:focus-canvas-node', onFocusCanvasNode);
  }, [flow]);

  // Cmd/Ctrl+V on the canvas → drop clipboard contents as new node(s). We
  // listen at document level (paste only fires on document.body when no
  // editable element is focused) and skip when the user is in any input,
  // textarea, or contenteditable so existing native paste handlers (chat
  // input, node editor textarea) keep working unchanged.
  useEffect(() => {
    function onDocPaste(e: ClipboardEvent) {
      if (showGlobal) return;
      if (!conversationId) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return;
      }
      const data = e.clipboardData;
      if (!data) return;
      // Paste at the visible canvas center. We resolve via the React Flow
      // container's bounding rect instead of viewport math so multi-pane
      // layouts (chat panel taking width) get the correct on-screen center.
      const container = document.querySelector('.react-flow') as HTMLElement | null;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const screenX = rect.left + rect.width / 2;
      const screenY = rect.top + rect.height / 2;
      const position = flow.screenToFlowPosition({ x: screenX, y: screenY });
      e.preventDefault();
      void pasteToCanvas({ kind: 'event', data }, conversationId, position);
    }
    document.addEventListener('paste', onDocPaste);
    return () => document.removeEventListener('paste', onDocPaste);
  }, [conversationId, showGlobal, flow]);

  // Theme/project-root double-click → bulk select the connected component:
  // the root itself, every node reachable through incident edges, every
  // node whose `themeId` points at the root (legacy / non-edge clusters),
  // and every edge whose endpoints both sit inside the selected group.
  useEffect(() => {
    function onSelectThemeCluster(e: Event) {
      const themeRootId = (e as CustomEvent<{ themeRootId?: string }>).detail
        ?.themeRootId;
      if (!themeRootId) return;
      const state = useStore.getState();
      const root = state.nodes.find((n) => n.id === themeRootId);
      if (!root) return;
      const connected = new Map<string, string[]>();
      for (const e2 of state.edges) {
        const fromSource = connected.get(e2.sourceNodeId) ?? [];
        fromSource.push(e2.targetNodeId);
        connected.set(e2.sourceNodeId, fromSource);
        const fromTarget = connected.get(e2.targetNodeId) ?? [];
        fromTarget.push(e2.sourceNodeId);
        connected.set(e2.targetNodeId, fromTarget);
      }
      const clusterNodeIds = new Set<string>([root.id]);
      const queue: string[] = [root.id];
      while (queue.length > 0) {
        const cur = queue.shift() as string;
        for (const child of connected.get(cur) ?? []) {
          if (clusterNodeIds.has(child)) continue;
          clusterNodeIds.add(child);
          queue.push(child);
        }
      }
      // Defensive sweep: pick up nodes that were tagged with this theme
      // root id directly even if no parent edge connects them (e.g. broken
      // imports, manual user edits).
      for (const n of state.nodes) {
        if (n.themeId === root.id) clusterNodeIds.add(n.id);
      }
      const clusterEdgeIds: string[] = [];
      for (const e2 of state.edges) {
        if (
          clusterNodeIds.has(e2.sourceNodeId) &&
          clusterNodeIds.has(e2.targetNodeId)
        ) {
          clusterEdgeIds.push(e2.id);
        }
      }
      setCanvasSelection(Array.from(clusterNodeIds), clusterEdgeIds);
    }
    window.addEventListener('mc:select-theme-cluster', onSelectThemeCluster);
    return () =>
      window.removeEventListener(
        'mc:select-theme-cluster',
        onSelectThemeCluster,
      );
  }, [setCanvasSelection]);

  useEffect(() => {
    if (!dropTargetNodeId) return;
    const el = document.querySelector(
      `.react-flow__node[data-id="${CSS.escape(dropTargetNodeId)}"]`,
    );
    if (!el) return;
    el.classList.add('drop-target');
    return () => {
      el.classList.remove('drop-target');
    };
  }, [dropTargetNodeId]);

  const empty = rfNodes.length === 0;
  const hasMessages = useStore(
    (s) =>
      s.messages.some((m) => m.conversationId === conversationId),
  );

  return (
    <main
      className={`canvas-panel tool-${canvasTool}${
        dragOver ? ' dragging-over' : ''
      }${viewMode === 'titles' ? ' canvas-titles-only' : ''}`}
      onPointerDownCapture={onCanvasPointerDown}
      onContextMenu={onCanvasContextMenu}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          // Stop the workspace-level context menu (App.tsx) from also
          // firing — without this, even with our menu shown, the
          // layout/show-hide menu can race in on top.
          e.stopPropagation();
          if (selectedNodeIds.includes(node.id)) {
            selectedMenuAt(e.clientX, e.clientY);
          } else {
            setCtxMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
          }
        }}
        onEdgeClick={() => {
          // No-op handler exists solely so React Flow's `inactive` rule
          // (`!isSelectable && !onClick`) never fires. Without it, edges
          // get `pointer-events: none` whenever `elementsSelectable=false`
          // (i.e. hand-tool mode), which silently breaks the right-click
          // context menu. We don't want clicks to do anything special here
          // — selection still happens through React Flow's own machinery.
        }}
        onEdgeContextMenu={(e, edge) => {
          // Right-click on an edge: if it's already in the selection,
          // open the selection menu (which now offers "Delete Link").
          // Otherwise replace the selection with just this edge first
          // so the menu always reflects what the user clicked on.
          e.preventDefault();
          e.stopPropagation();
          if (!selectedEdgeIds.includes(edge.id)) {
            setCanvasSelection([], [edge.id]);
          }
          setSelectionMenu({ x: e.clientX, y: e.clientY });
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (selectedMenuAt(e.clientX, e.clientY)) return;
          setPaneMenu({ x: e.clientX, y: e.clientY });
        }}
        onPaneClick={onPaneClick}
        onMoveEnd={onMoveEnd}
        defaultViewport={initialViewport}
        fitView={false}
        minZoom={MIN_CANVAS_ZOOM}
        maxZoom={MAX_CANVAS_ZOOM}
        panOnDrag={false}
        panOnScroll={wheelMode === 'pan'}
        zoomOnScroll={wheelMode === 'zoom'}
        zoomOnPinch
        zoomActivationKeyCode={
          wheelMode === 'pan' ? ['Meta', 'Control'] : null
        }
        nodesDraggable={canvasTool === 'select'}
        nodesConnectable={!showGlobal && canvasTool === 'select'}
        elementsSelectable={canvasTool === 'select'}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color={dotColor} />
      </ReactFlow>
      <CanvasToolSwitcher
        tool={canvasTool}
        onChange={setCanvasTool}
        wheelMode={wheelMode}
        onToggleWheelMode={toggleWheelMode}
      />
      {marquee?.active ? <MarqueeOverlay rect={rectFromPoints(marquee.startScreen, marquee.currentScreen)} /> : null}
      {showGlobal ? (
        <GlobalVisibilityPanel
          projects={projects}
          conversations={conversations}
          visibleProjects={visibleProjects}
          visibleConvs={visibleConvs}
          onToggleProject={toggleProjectVisible}
          onToggleConversation={toggleConversationVisible}
        />
      ) : null}
      {ctxMenu ? (
        <NodeContextMenu state={ctxMenu} onClose={() => setCtxMenu(null)} />
      ) : null}
      {selectionMenu ? (
        <SelectionContextMenu
          x={selectionMenu.x}
          y={selectionMenu.y}
          nodeCount={selectedNodeIds.length}
          edgeCount={selectedEdgeIds.length}
          onAsk={() => {
            setSelectionMenu(null);
            void openAiPaletteForSelectedCanvas();
          }}
          onSearch={() => {
            setSelectionMenu(null);
            setSearchOpen({ nodeIds: selectedNodeIds });
          }}
          onOpenMarkdown={() => {
            setSelectionMenu(null);
            openMarkdownForSelection();
          }}
          onCopyLinks={() => {
            setSelectionMenu(null);
            copyMarkdownLinks();
          }}
          onAddLinks={() => {
            setSelectionMenu(null);
            linkSelectedNotes();
          }}
          onDeleteEdges={() => {
            setSelectionMenu(null);
            const ids = [...selectedEdgeIds];
            for (const id of ids) removeEdge(id);
            // Drop the now-stale edges from the selection so the menu
            // closes cleanly. Nodes stay selected so the user can keep
            // operating on them.
            setCanvasSelection(selectedNodeIds, []);
          }}
          onClear={() => {
            setSelectionMenu(null);
            clearCanvasSelection();
          }}
          onClose={() => setSelectionMenu(null)}
        />
      ) : null}
      {textSelectionMenu ? (
        <TextSelectionContextMenu
          state={textSelectionMenu}
          onAsk={() => {
            // Route into the unified AI palette; palette auto-creates
            // the answer node + edge + selection marker on stream
            // completion (see parseCanvasSelectionOrigin in AIPalette.tsx).
            const origin = `canvas-selection:${textSelectionMenu.nodeId}:${textSelectionMenu.startOffset}:${textSelectionMenu.endOffset}`;
            console.debug('[mc:ask] Ask clicked → openAiPalette', {
              origin,
              selectionLength: textSelectionMenu.selectedText.length,
            });
            useStore.getState().openAiPalette(
              textSelectionMenu.selectedText,
              origin,
            );
            setTextSelectionMenu(null);
          }}
          onSearch={() => {
            setSearchOpen({
              nodeIds: [textSelectionMenu.nodeId],
              initialQuery: textSelectionMenu.selectedText,
            });
            setTextSelectionMenu(null);
          }}
          onCopy={() => {
            void navigator.clipboard.writeText(textSelectionMenu.selectedText);
            setTextSelectionMenu(null);
          }}
          onOpenMarkdown={() => {
            setCanvasSelection([textSelectionMenu.nodeId], selectEdgesForNodes(storeEdges, [textSelectionMenu.nodeId]));
            openMarkdownForNode(textSelectionMenu.nodeId);
            setTextSelectionMenu(null);
          }}
          onClose={() => setTextSelectionMenu(null)}
        />
      ) : null}
      {searchOpen ? (
        <SearchSelectedModal
          nodeIds={searchOpen.nodeIds}
          initialQuery={searchOpen.initialQuery}
          onClose={() => setSearchOpen(null)}
          onFocusNode={(nodeId) => {
            const node = useStore.getState().nodes.find((n) => n.id === nodeId);
            if (!node) return;
            setCanvasSelection([nodeId], selectEdgesForNodes(storeEdges, [nodeId]));
            flow.setCenter(node.position.x, node.position.y, { zoom: 1.2, duration: 300 });
          }}
        />
      ) : null}
      {paneMenu ? (
        <CanvasPanelContextMenu
          x={paneMenu.x}
          y={paneMenu.y}
          canvasPanelState={canvasPanelState}
          chatPanelState={chatPanelState}
          paneMenuItems={paneMenuItems}
          canvasTool={canvasTool}
          hasSelection={selectedNodeIds.length > 0}
          hasNodes={rfNodes.length > 0}
          canAddNode={!showGlobal}
          onShowCanvas={onShowCanvas}
          onHideCanvas={onHideCanvas}
          onShowChat={onShowChat}
          onHideChat={onHideChat}
          onAddNode={() => addNodeAt(paneMenu.x, paneMenu.y)}
          onPaste={() => void pasteAt(paneMenu.x, paneMenu.y)}
          onResetView={resetCanvasView}
          onFitView={fitCanvasView}
          onFitToCanvas={fitToCanvasEdges}
          onSetTool={setCanvasTool}
          onClose={() => setPaneMenu(null)}
        />
      ) : null}
      {empty ? (
        <div className="canvas-empty">
          {showGlobal
            ? 'Pick a project or conversation in the panel to show its nodes.'
            : hasMessages
            ? 'Drag a message here.'
            : 'Start anywhere.'}
        </div>
      ) : null}
      {dupToast ? (
        <DuplicateDropToast
          key={dupToast.id}
          onDismiss={() => setDupToast(null)}
          onSuppress={() => {
            setSuppressDupWarning(true);
            setDupToast(null);
          }}
        />
      ) : null}
    </main>
  );
}

/**
 * "Already on canvas" notification for duplicate per-message drops.
 * Auto-dismisses after a few seconds; the "Don't show again" button
 * persists the choice via `setSuppressDuplicateChatNodeWarning`.
 */
function DuplicateDropToast({
  onDismiss,
  onSuppress,
}: {
  onDismiss: () => void;
  onSuppress: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="canvas-duplicate-toast" role="status" aria-live="polite">
      <span className="canvas-duplicate-toast-text">
        This message is already on the canvas.
      </span>
      <button
        type="button"
        className="canvas-duplicate-toast-suppress"
        onClick={onSuppress}
      >
        Don't show again
      </button>
      <button
        type="button"
        className="canvas-duplicate-toast-close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

function GlobalVisibilityPanel({
  projects,
  conversations,
  visibleProjects,
  visibleConvs,
  onToggleProject,
  onToggleConversation,
}: {
  projects: ReturnType<typeof useStore.getState>['projects'];
  conversations: ReturnType<typeof useStore.getState>['conversations'];
  visibleProjects: string[];
  visibleConvs: string[];
  onToggleProject: (id: string) => void;
  onToggleConversation: (id: string) => void;
}) {
  const orphans = conversations
    .filter((c) => !c.projectId)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  const visibleProjectSet = new Set(visibleProjects);
  const visibleConvSet = new Set(visibleConvs);
  return (
    <div className="global-visibility nodrag nopan">
      <div className="global-visibility-header">Show in Global</div>
      {projects.length === 0 && orphans.length === 0 ? (
        <div className="global-visibility-empty muted">
          No projects or chats yet.
        </div>
      ) : null}
      {projects.length > 0 ? (
        <div className="global-visibility-section">
          <div className="muted small">Projects</div>
          {projects.map((p) => (
            <label key={p.id} className="global-visibility-row">
              <input
                type="checkbox"
                checked={visibleProjectSet.has(p.id)}
                onChange={() => onToggleProject(p.id)}
              />
              <span>{p.emoji ? `${p.emoji} ` : ''}{p.name}</span>
            </label>
          ))}
        </div>
      ) : null}
      {orphans.length > 0 ? (
        <div className="global-visibility-section">
          <div className="muted small">Standalone chats</div>
          {orphans.slice(0, 50).map((c) => (
            <label key={c.id} className="global-visibility-row">
              <input
                type="checkbox"
                checked={visibleConvSet.has(c.id)}
                onChange={() => onToggleConversation(c.id)}
              />
              <span>{c.title}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MarqueeOverlay({ rect }: { rect: Rect }) {
  return (
    <div
      className="canvas-marquee"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}

// Stroked black-and-white icons for the canvas tool switcher. Inline SVG
// instead of glyph emoji so the look stays consistent across platforms
// and the buttons inherit the toolbar's `currentColor`.
const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function SelectToolIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M5 3l13 7-6 1-2.5 6L5 3z" />
    </svg>
  );
}

function HandToolIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 11V5.5a1.5 1.5 0 113 0V11" />
      <path d="M12 11V4.5a1.5 1.5 0 113 0V11" />
      <path d="M15 11V5.5a1.5 1.5 0 113 0V13" />
      <path d="M9 11V8a1.5 1.5 0 10-3 0v6a7 7 0 007 7h.5a6.5 6.5 0 006.5-6.5V11" />
    </svg>
  );
}

function ScrollPanIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 4v16" />
      <path d="M8 8l4-4 4 4" />
      <path d="M8 16l4 4 4-4" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="11" cy="11" r="6" />
      <path d="M11 8v6M8 11h6" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

function CanvasToolSwitcher({
  tool,
  onChange,
  wheelMode,
  onToggleWheelMode,
}: {
  tool: CanvasTool;
  onChange: (tool: CanvasTool) => void;
  wheelMode: 'pan' | 'zoom';
  onToggleWheelMode: () => void;
}) {
  return (
    <div className="canvas-tool-switcher nodrag" aria-label="Canvas tools">
      <button
        type="button"
        className={tool === 'select' ? 'active' : ''}
        aria-pressed={tool === 'select'}
        title="Select Tool (V)"
        onClick={() => onChange('select')}
      >
        <SelectToolIcon />
      </button>
      <button
        type="button"
        className={tool === 'hand' ? 'active' : ''}
        aria-pressed={tool === 'hand'}
        title="Hand Tool (H)"
        onClick={() => onChange('hand')}
      >
        <HandToolIcon />
      </button>
      <span className="canvas-tool-sep" aria-hidden="true" />
      <button
        type="button"
        className={wheelMode === 'pan' ? 'active' : ''}
        aria-pressed={wheelMode === 'pan'}
        title={
          wheelMode === 'pan'
            ? 'Wheel scrolls/pans (S to switch to zoom)'
            : 'Wheel zooms (S to switch to scroll/pan)'
        }
        onClick={onToggleWheelMode}
      >
        {wheelMode === 'pan' ? <ScrollPanIcon /> : <ZoomIcon />}
      </button>
    </div>
  );
}

function SelectionContextMenu({
  x,
  y,
  nodeCount,
  edgeCount,
  onAsk,
  onSearch,
  onOpenMarkdown,
  onCopyLinks,
  onAddLinks,
  onDeleteEdges,
  onClear,
  onClose,
}: {
  x: number;
  y: number;
  nodeCount: number;
  edgeCount: number;
  onAsk: () => void;
  onSearch: () => void;
  onOpenMarkdown: () => void;
  onCopyLinks: () => void;
  onAddLinks: () => void;
  onDeleteEdges: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Measured clamp — the menu's actual bounding rect is read after
  // mount and the position is shifted (or flipped) so the menu always
  // fits inside the viewport, regardless of how tall it gets after
  // its Panes section / Delete Link rows are added.
  const pos = useClampedMenuPosition(ref, x, y);
  useEffect(() => {
    // pointerdown/capture: the canvas marquee handler preventDefault()'s
    // pointerdown, which suppresses mousedown on the empty pane.
    function onDoc(e: globalThis.PointerEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);
  return (
    <div
      className="node-context-menu"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="selection-menu-title">
        {nodeCount} notes, {edgeCount} links
      </div>
      <button type="button" onClick={onAsk}>Ask</button>
      <button type="button" onClick={onSearch}>Search</button>
      <button type="button" onClick={onOpenMarkdown}>Open Markdown</button>
      <button type="button" onClick={onCopyLinks}>Copy Markdown Links</button>
      {nodeCount >= 2 ? (
        <button type="button" onClick={onAddLinks}>
          Add Link Between Selected Notes
        </button>
      ) : null}
      {edgeCount >= 1 ? (
        <button type="button" className="danger" onClick={onDeleteEdges}>
          {edgeCount === 1 ? 'Delete Link' : `Delete ${edgeCount} Links`}
        </button>
      ) : null}
      <hr />
      <div className="selection-menu-title">Panes</div>
      {/* Panel toggles. The right-click on an edge/node now wins over
          the workspace show/hide menu, but users still want to flip
          panels without dropping the selection — these forward to the
          existing `mc:layout-action` toggles in App.tsx. */}
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent('mc:layout-action', {
              detail: { action: 'toggle-sidebar' },
            }),
          );
          onClose();
        }}
      >
        Toggle Sidebar
      </button>
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent('mc:layout-action', {
              detail: { action: 'toggle-markdown' },
            }),
          );
          onClose();
        }}
      >
        Toggle Markdown Editor
      </button>
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent('mc:layout-action', {
              detail: { action: 'toggle-canvas' },
            }),
          );
          onClose();
        }}
      >
        Toggle Canvas
      </button>
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent('mc:layout-action', {
              detail: { action: 'toggle-chat' },
            }),
          );
          onClose();
        }}
      >
        Toggle Chat
      </button>
      <hr />
      <button type="button" onClick={onClear}>Clear Selection</button>
    </div>
  );
}

function TextSelectionContextMenu({
  state,
  onAsk,
  onSearch,
  onCopy,
  onOpenMarkdown,
  onClose,
}: {
  state: { x: number; y: number; selectedText: string };
  onAsk: () => void;
  onSearch: () => void;
  onCopy: () => void;
  onOpenMarkdown: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useClampedMenuPosition(ref, state.x, state.y);
  useEffect(() => {
    // pointerdown/capture: the canvas marquee handler preventDefault()'s
    // pointerdown, which suppresses mousedown on the empty pane.
    function onDoc(e: globalThis.PointerEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);
  return (
    <div
      className="node-context-menu"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="selection-menu-title">Selected passage</div>
      <button type="button" onClick={onAsk}>Ask</button>
      <button type="button" onClick={onSearch}>Search</button>
      <button type="button" onClick={onCopy}>Copy</button>
      <button type="button" onClick={onOpenMarkdown}>Open Markdown</button>
    </div>
  );
}

function SearchSelectedModal({
  nodeIds,
  initialQuery,
  onFocusNode,
  onClose,
}: {
  nodeIds: string[];
  initialQuery?: string;
  onFocusNode: (nodeId: string) => void;
  onClose: () => void;
}) {
  const markdownStorageDir = useStore((s) => s.settings.markdownStorageDir);
  const [scope, setScope] = useState<MarkdownSearchScope>('selected');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MarkdownSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(nextQuery = query, nextScope = scope) {
    const trimmed = nextQuery.trim();
    setQuery(nextQuery);
    if (!trimmed) {
      setResults([]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResults(
        await searchMarkdownFiles({
          query: trimmed,
          scope: nextScope,
          selectedNodeIds: nodeIds,
          markdownStorageDir,
        }),
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!initialQuery) return;
    // Defer to a microtask so the synchronous setState calls inside
    // runSearch (setQuery / setBusy / setResults) don't cascade through
    // this same render. Lint rule react-hooks/set-state-in-effect.
    const handle = window.setTimeout(() => {
      void runSearch(initialQuery, 'all');
    }, 0);
    return () => window.clearTimeout(handle);
    // run only when the modal opens with a new initial query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  return (
    <div className="canvas-modal-backdrop">
      <div className="canvas-modal search-modal">
        <header>
          <div>
            <h2>{scope === 'selected' ? 'Search selected context' : 'Search Markdown'}</h2>
            <p>{scope === 'selected' ? `${nodeIds.length} selected notes` : 'All local Markdown files'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">x</button>
        </header>
        <div className="canvas-search-controls">
          <input
            autoFocus
            value={query}
            onChange={(e) => void runSearch(e.target.value)}
            placeholder="Search text..."
          />
          <div className="canvas-search-scope">
            <button
              type="button"
              className={scope === 'selected' ? 'active' : ''}
              onClick={() => {
                setScope('selected');
                void runSearch(query, 'selected');
              }}
            >
              Selected context
            </button>
            <button
              type="button"
              className={scope === 'all' ? 'active' : ''}
              onClick={() => {
                setScope('all');
                void runSearch(query, 'all');
              }}
            >
              All Markdown
            </button>
          </div>
        </div>
        {error ? <div className="canvas-modal-error">{error}</div> : null}
        <div className="canvas-search-results">
          {busy ? <div className="canvas-search-empty">Searching...</div> : null}
          {!busy && query.trim() && results.length === 0 ? (
            <div className="canvas-search-empty">No matches.</div>
          ) : null}
          {results.map((result) => (
            <button
              type="button"
              key={`${result.path}:${result.nodeId ?? ''}`}
              className="canvas-search-result"
              onClick={() => {
                if (result.nodeId) onFocusNode(result.nodeId);
                window.dispatchEvent(
                  new CustomEvent('mc:open-markdown-file', {
                    detail: { path: result.path },
                  }),
                );
                onClose();
              }}
            >
              <strong>{result.title}</strong>
              <span>{result.path}</span>
              <p>{result.snippet}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
