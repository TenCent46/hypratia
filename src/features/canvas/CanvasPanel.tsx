import { createContext, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Background,
  BaseEdge,
  ConnectionMode,
  MarkerType,
  Position,
  ReactFlow,
  ViewportPortal,
  useInternalNode,
  useReactFlow,
  type Connection,
  type ConnectionLineComponentProps,
  type Edge as RfEdge,
  type EdgeChange,
  type EdgeMarkerType,
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
import { EdgeToolbar } from '../../components/CanvasPanel/EdgeToolbar';
import { ConnectionEndMenu } from '../../components/CanvasPanel/ConnectionEndMenu';
import {
  CapturePreview,
  shouldOpenCapture,
  type CaptureInput,
} from '../../components/CapturePreview/CapturePreview';
import { ImportChatgptPicker } from '../../components/CapturePreview/ImportChatgptPicker';
import {
  conversationToCaptureText,
  parseChatgptExport,
  type ImportedConversation,
} from '../../services/capture/ChatgptImporter';
import { writeCanvasFile } from '../../services/export/JsonCanvasExport';
import { syncToVault } from '../../services/export/VaultSync';
import { startMailboxWatcher } from '../../services/storage/MailboxWatcher';
import { dialog } from '../../services/dialog';
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
import { RichTextContextMenu } from '../../components/ContextMenu/RichTextContextMenu';
import { showToast } from '../../components/Toast/Toast';
import { useClampedMenuPosition } from '../../hooks/useClampedMenuPosition';
import {
  findFreeNodePosition,
  rectFromPoints,
  selectEdgesForNodes,
  selectNodesInRect,
  type Rect,
} from '../../services/canvas/CanvasSelectionService';
import { getHelperLines } from '../../services/canvas/HelperLines';
import {
  ensureNodeMarkdownPath,
} from '../../services/markdown/MarkdownContextResolver';
import { searchMarkdownFiles, type MarkdownSearchResult, type MarkdownSearchScope } from '../../services/markdown/MarkdownSearchService';
import {
  searchNodesWithLlm,
  type LlmSearchMatch,
} from '../../services/llm/searchSelectedNodes';
import { PROVIDERS, PROVIDER_ORDER } from '../../services/llm';
import type { ModelRef, ProviderId } from '../../types';
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

/**
 * Read a CSS variable from the document root. Falls back when the variable
 * is unset or we're running in a non-DOM env (e.g. tests). Used to color the
 * React-Flow-managed `MarkerType.ArrowClosed` markers from the active theme.
 */
function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v.length > 0 ? v : fallback;
}

function deriveTitle(content: string): string {
  const firstLine = content.split('\n')[0]?.trim() ?? '';
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}

type EdgeRect = { x: number; y: number; width: number; height: number };

type SourceMarkerInfo = {
  startOffset: number;
  endOffset: number;
  textLength: number;
};

type FlexibleEdgeData = {
  /**
   * Persisted from the legacy "PDF text-selection → node" flow. The visual
   * router no longer consumes this — every edge now lands on a side-midpoint
   * for consistency — but the data is preserved so future tooling that wants
   * to recover the source span can still find it.
   */
  sourceMarker?: SourceMarkerInfo;
};

type Side = 'top' | 'right' | 'bottom' | 'left';

type SidePoint = { x: number; y: number; side: Side };

/**
 * Pick the side of `rect` whose midpoint is closest to `toward`. Used for
 * persisted edge endpoints — picks the side facing the other node.
 */
function nearestSideMidpoint(rect: EdgeRect, toward: { x: number; y: number }): SidePoint {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const candidates: SidePoint[] = [
    { x: cx, y: rect.y, side: 'top' },
    { x: rect.x + rect.width, y: cy, side: 'right' },
    { x: cx, y: rect.y + rect.height, side: 'bottom' },
    { x: rect.x, y: cy, side: 'left' },
  ];
  let best = candidates[0];
  let bestDist = Math.hypot(best.x - toward.x, best.y - toward.y);
  for (let i = 1; i < candidates.length; i += 1) {
    const c = candidates[i];
    const d = Math.hypot(c.x - toward.x, c.y - toward.y);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * For a cursor `inside` `rect`, return the midpoint of the boundary side the
 * cursor is closest to. As the cursor moves around inside the rect, this
 * gives a "the moment the cursor touches a side, the snap is that side"
 * feel — which is the in-flight magnetic behavior the user asked for.
 */
function nearestSideMidpointFromInside(
  rect: EdgeRect,
  cursor: { x: number; y: number },
): SidePoint {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const dTop = cursor.y - top;
  const dRight = right - cursor.x;
  const dBottom = bottom - cursor.y;
  const dLeft = cursor.x - left;
  const m = Math.min(dTop, dRight, dBottom, dLeft);
  if (m === dTop) return { x: left + rect.width / 2, y: top, side: 'top' };
  if (m === dRight) return { x: right, y: top + rect.height / 2, side: 'right' };
  if (m === dBottom) return { x: left + rect.width / 2, y: bottom, side: 'bottom' };
  return { x: left, y: top + rect.height / 2, side: 'left' };
}

/**
 * Outward direction for a control point sitting on `side`. Used to make the
 * Bezier curve exit/enter perpendicular to the rectangle.
 */
function controlOffset(side: Side, dist: number): { dx: number; dy: number } {
  switch (side) {
    case 'top':
      return { dx: 0, dy: -dist };
    case 'right':
      return { dx: dist, dy: 0 };
    case 'bottom':
      return { dx: 0, dy: dist };
    case 'left':
      return { dx: -dist, dy: 0 };
  }
}

/**
 * Build a smooth cubic Bezier between two side-midpoints. The control points
 * push outward perpendicular to each side so the curve always exits one
 * rectangle perpendicular and enters the other perpendicular — this is the
 * Obsidian-Canvas-like read.
 */
function sideMidpointBezierPath(start: SidePoint, end: SidePoint): string {
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  const offset = Math.max(40, dist * 0.35);
  const c1 = controlOffset(start.side, offset);
  const c2 = controlOffset(end.side, offset);
  return `M ${start.x},${start.y} C ${start.x + c1.dx},${start.y + c1.dy} ${
    end.x + c2.dx
  },${end.y + c2.dy} ${end.x},${end.y}`;
}

function positionToSide(p: Position): Side {
  if (p === Position.Top) return 'top';
  if (p === Position.Right) return 'right';
  if (p === Position.Bottom) return 'bottom';
  return 'left';
}

/**
 * Position the visible edge grip slightly outside the node boundary along
 * the curve's outward direction, so the dot sits ON the edge (not inside
 * the node). 14 flow-units feels right at default zoom.
 */
function gripPosFromSide(p: SidePoint, dist = 14): { x: number; y: number } {
  switch (p.side) {
    case 'top':
      return { x: p.x, y: p.y - dist };
    case 'right':
      return { x: p.x + dist, y: p.y };
    case 'bottom':
      return { x: p.x, y: p.y + dist };
    case 'left':
      return { x: p.x - dist, y: p.y };
  }
}

type EdgeDetachState = {
  edgeId: string;
  /** Which endpoint stays anchored to its node — the OTHER endpoint follows the cursor. */
  anchoredEnd: 'source' | 'target';
  /** Anchored side midpoint in flow coordinates (updates as cursor moves so the
   *  curve always exits the closest face of the anchor node). */
  anchor: SidePoint;
  /** Cursor position in flow coordinates. */
  cursor: { x: number; y: number };
};

/**
 * Provided by CanvasPanel; consumed by FlexibleEdge so each edge knows when
 * it is the one being detached and can swap to in-flight rendering. Null
 * while no detach is active — the common case.
 */
const EdgeDetachContext = createContext<EdgeDetachState | null>(null);

const EDGE_DETACH_EVENT = 'mc:edge-detach-begin';

type EdgeDetachBeginDetail = {
  edgeId: string;
  /** Which side the user grabbed (source = start of edge / target = end). */
  grabbedEnd: 'source' | 'target';
  startScreen: { x: number; y: number };
};

/**
 * In-flight connection line. While the user drags from a handle, this draws
 * the candidate path to the cursor. The moment the cursor enters another
 * node's bounding rectangle, the line snaps to the **midpoint of the
 * boundary side the cursor is currently closest to** — not the node's
 * geometric center. Routing matches `FlexibleEdge` so the in-flight visual
 * is continuous with the persisted edge once the connection is dropped.
 */
function HypConnectionLine(props: ConnectionLineComponentProps) {
  const { fromX, fromY, toX, toY, fromPosition, fromNode } = props;
  const flow = useReactFlow();
  const fromSide = positionToSide(fromPosition);

  let end: SidePoint | { x: number; y: number; side?: undefined } = {
    x: toX,
    y: toY,
  };
  for (const n of flow.getNodes()) {
    if (fromNode && n.id === fromNode.id) continue;
    const w = n.measured?.width ?? n.width ?? 0;
    const h = n.measured?.height ?? n.height ?? 0;
    if (!w || !h) continue;
    const left = n.position.x;
    const right = left + w;
    const top = n.position.y;
    const bottom = top + h;
    if (toX >= left && toX <= right && toY >= top && toY <= bottom) {
      end = nearestSideMidpointFromInside(
        { x: left, y: top, width: w, height: h },
        { x: toX, y: toY },
      );
      break;
    }
  }

  let path: string;
  if (end.side) {
    path = sideMidpointBezierPath(
      { x: fromX, y: fromY, side: fromSide },
      end,
    );
  } else {
    // Cursor in empty space — exit the source perpendicular to its side and
    // approach the cursor along the source→cursor vector so the curve doesn't
    // kink near the cursor.
    const dist = Math.hypot(end.x - fromX, end.y - fromY);
    const offset = Math.max(40, dist * 0.35);
    const c1Off = controlOffset(fromSide, offset);
    const c1 = { x: fromX + c1Off.dx, y: fromY + c1Off.dy };
    const len = Math.max(1, dist);
    const dx = (end.x - fromX) / len;
    const dy = (end.y - fromY) / len;
    const c2 = { x: end.x - dx * offset, y: end.y - dy * offset };
    path = `M ${fromX},${fromY} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}`;
  }

  return (
    <g>
      <path d={path} className="hyp-connection-line" />
    </g>
  );
}

/**
 * Smooth bezier from an anchored side midpoint to a free cursor in flow
 * coordinates. Used while the user is detaching an edge endpoint — the
 * anchored end keeps its perpendicular tangent, the cursor end is
 * approached along the source→cursor vector.
 */
function detachInFlightPath(
  anchor: SidePoint,
  cursor: { x: number; y: number },
): string {
  const dx = cursor.x - anchor.x;
  const dy = cursor.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  const offset = Math.max(40, dist * 0.35);
  const c1Off = controlOffset(anchor.side, offset);
  const c1 = { x: anchor.x + c1Off.dx, y: anchor.y + c1Off.dy };
  const len = Math.max(1, dist);
  const ux = dx / len;
  const uy = dy / len;
  const c2 = { x: cursor.x - ux * offset, y: cursor.y - uy * offset };
  return `M ${anchor.x},${anchor.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${cursor.x},${cursor.y}`;
}

function FlexibleEdge(props: EdgeProps<RfEdge<FlexibleEdgeData>>) {
  const sourceNode = useInternalNode(props.source);
  const targetNode = useInternalNode(props.target);
  const detach = useContext(EdgeDetachContext);
  const isDetaching = detach?.edgeId === props.id;

  const fallbackPath = `M ${props.sourceX},${props.sourceY} C ${
    props.sourceX + 40
  },${props.sourceY} ${props.targetX - 40},${props.targetY} ${props.targetX},${
    props.targetY
  }`;

  let path = fallbackPath;
  let startSide: SidePoint | null = null;
  let endSide: SidePoint | null = null;

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
      const sourceCenter = {
        x: sourceRect.x + sourceRect.width / 2,
        y: sourceRect.y + sourceRect.height / 2,
      };
      const targetCenter = {
        x: targetRect.x + targetRect.width / 2,
        y: targetRect.y + targetRect.height / 2,
      };
      startSide = nearestSideMidpoint(sourceRect, targetCenter);
      endSide = nearestSideMidpoint(targetRect, sourceCenter);
      path = sideMidpointBezierPath(startSide, endSide);
    }
  }

  // While this edge is being detached, swap the rendered path so the moving
  // endpoint follows the cursor. Hide the grip handles too — the user is
  // already holding one.
  if (isDetaching && detach) {
    const inFlight = detachInFlightPath(detach.anchor, detach.cursor);
    return (
      <BaseEdge
        path={inFlight}
        style={{
          stroke: 'var(--accent)',
          strokeWidth: 2.25,
          strokeDasharray: '4 4',
          opacity: 0.9,
          ...(props.style as Record<string, unknown>),
        }}
        interactionWidth={0}
      />
    );
  }

  function dispatchGrip(grabbedEnd: 'source' | 'target') {
    return (e: PointerEvent<SVGCircleElement>) => {
      // Stop React Flow's edge-select / pane-marquee handlers from also
      // firing — the grip is a pure detach gesture.
      e.stopPropagation();
      e.preventDefault();
      const detail: EdgeDetachBeginDetail = {
        edgeId: props.id,
        grabbedEnd,
        startScreen: { x: e.clientX, y: e.clientY },
      };
      window.dispatchEvent(new CustomEvent(EDGE_DETACH_EVENT, { detail }));
    };
  }

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={props.interactionWidth}
      />
      {startSide ? (
        <circle
          className="hyp-edge-grip"
          {...gripCxCy(startSide)}
          r={9}
          onPointerDown={dispatchGrip('source')}
        />
      ) : null}
      {endSide ? (
        <circle
          className="hyp-edge-grip"
          {...gripCxCy(endSide)}
          r={9}
          onPointerDown={dispatchGrip('target')}
        />
      ) : null}
    </>
  );
}

function gripCxCy(side: SidePoint): { cx: number; cy: number } {
  const p = gripPosFromSide(side);
  return { cx: p.x, cy: p.y };
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
  const { t } = useTranslation();
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
  // Edge ids created during this session that should run the draw-in
  // animation. Cleared per id ~350 ms after creation.
  const [justCreatedEdgeIds, setJustCreatedEdgeIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Active connection in flight (between onConnectStart and onConnectEnd).
  // Used to highlight the candidate target node when the cursor is within
  // the magnetic radius.
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(
    null,
  );
  const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(
    null,
  );
  const [helperLines, setHelperLines] = useState<{
    vertical?: number;
    horizontal?: number;
  } | null>(null);
  const [captureInput, setCaptureInput] = useState<CaptureInput | null>(null);
  const [importPicker, setImportPicker] = useState<{
    conversations: ImportedConversation[];
    landAt: { x: number; y: number };
  } | null>(null);
  /** Open menu when the user releases a connection on empty canvas. */
  const [connectionEndMenu, setConnectionEndMenu] = useState<{
    sourceNodeId: string;
    screen: { x: number; y: number };
    flowPos: { x: number; y: number };
  } | null>(null);
  /** Custom edge detach state. Replaces React Flow's built-in reconnect
   *  because that one positions its grips at React Flow's `sourceX/Y`,
   *  which mismatches our side-midpoint custom path. */
  const [edgeDetach, setEdgeDetach] = useState<EdgeDetachState | null>(null);
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
  const [llmSearchOpen, setLlmSearchOpen] = useState<{ nodeIds: string[] } | null>(null);
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
        const classes: string[] = [];
        if (e.kind) classes.push(`edge-kind-${e.kind}`);
        if (justCreatedEdgeIds.has(e.id)) classes.push('edge-just-created');
        // React Flow's built-in marker (`MarkerType.ArrowClosed`) is injected
        // into React Flow's own SVG `<defs>`, so the `url(#…)` reference is
        // always in the same SVG document — that's the only reliable way to
        // get markers to render across themes / browsers (Tauri's WebKit was
        // dropping cross-SVG references silently). Color literals are
        // resolved from CSS vars at render time.
        const markerEnd: EdgeMarkerType = {
          type: MarkerType.ArrowClosed,
          color: isSelected
            ? readCssVar('--accent', '#3b82f6')
            : e.kind === 'related'
            ? readCssVar('--text-mute', '#9c9c9c')
            : readCssVar('--text-mute', '#7c7c7c'),
          width: 22,
          height: 22,
        };
        return {
          id: e.id,
          source: e.sourceNodeId,
          target: e.targetNodeId,
          type: 'flexible',
          data,
          label: e.label,
          selected: isSelected,
          style: Object.keys(baseStyle).length > 0 ? baseStyle : undefined,
          className: classes.length > 0 ? classes.join(' ') : undefined,
          markerEnd,
          // Widen the invisible hit-target stroke so right-click reliably
          // lands on the curved path (default 20px is narrow at low zoom).
          interactionWidth: 28,
        };
      });
  }, [storeEdges, storeNodes, rfNodes, selectedEdgeIds, justCreatedEdgeIds]);

  const initialViewport: RfViewport | undefined =
    !showGlobal && conversationId
      ? viewportByConv?.[conversationId]
      : undefined;

  function onNodesChange(changes: NodeChange[]) {
    // Compute alignment guides + soft snap (~6 px) for the *primary* dragged
    // node. Multi-select drags produce one position-change per node — we use
    // the first dragging change as the snap reference and apply the same
    // delta to every other dragged node so the group stays rigid.
    let snapDeltaX = 0;
    let snapDeltaY = 0;
    let computedGuides: { vertical?: number; horizontal?: number } | null = null;
    let anyDragging = false;
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position && ch.dragging) {
        if (!computedGuides) {
          const lines = getHelperLines(ch, rfNodes);
          if (lines.snapPosition.x !== undefined) {
            snapDeltaX = lines.snapPosition.x - ch.position.x;
            ch.position.x = lines.snapPosition.x;
          }
          if (lines.snapPosition.y !== undefined) {
            snapDeltaY = lines.snapPosition.y - ch.position.y;
            ch.position.y = lines.snapPosition.y;
          }
          computedGuides = {
            vertical: lines.vertical,
            horizontal: lines.horizontal,
          };
        } else {
          // Apply the leader's snap correction to every other dragged node.
          if (snapDeltaX) ch.position.x += snapDeltaX;
          if (snapDeltaY) ch.position.y += snapDeltaY;
        }
        anyDragging = true;
      }
    }
    if (anyDragging) {
      setHelperLines(computedGuides);
    } else if (helperLines) {
      setHelperLines(null);
    }

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
      } else if (ch.type === 'select') {
        // Mirror React Flow's internal selection into our store. Without
        // this, box-select / programmatic-select / Delete-after-click never
        // reach our `selectedEdgeIds`, and the EdgeToolbar (which gates on
        // store selection) never appears.
        const next = ch.selected
          ? Array.from(new Set([...selectedEdgeIds, ch.id]))
          : selectedEdgeIds.filter((id) => id !== ch.id);
        setCanvasSelection(selectedNodeIds, next);
      }
    }
  }

  function markEdgeJustCreated(edgeId: string) {
    setJustCreatedEdgeIds((prev) => {
      if (prev.has(edgeId)) return prev;
      const next = new Set(prev);
      next.add(edgeId);
      return next;
    });
    window.setTimeout(() => {
      setJustCreatedEdgeIds((prev) => {
        if (!prev.has(edgeId)) return prev;
        const next = new Set(prev);
        next.delete(edgeId);
        return next;
      });
    }, 350);
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
    markEdgeJustCreated(edge.id);
    void syncConnectedMarkdownLinks(c.source, c.target);
    setCanvasSelection(
      [c.source, c.target],
      Array.from(new Set([...selectedEdgeIds, edge.id])),
    );
  }

  /**
   * Validate an in-flight connection. Reject self-loops and duplicate edges
   * so users do not accumulate redundant arrows by accident. Runs for every
   * pointermove inside `connectionRadius`, so keep it cheap.
   */
  function isValidConnection(c: Connection | RfEdge): boolean {
    const source = 'source' in c ? c.source : null;
    const target = 'target' in c ? c.target : null;
    if (!source || !target || source === target) return false;
    const exists = storeEdges.some(
      (e) =>
        (e.sourceNodeId === source && e.targetNodeId === target) ||
        (e.sourceNodeId === target && e.targetNodeId === source),
    );
    return !exists;
  }

  function onConnectStart(_e: unknown, params: { nodeId?: string | null }) {
    setConnectingFromNodeId(params.nodeId ?? null);
  }

  function onConnectEnd(event: MouseEvent | TouchEvent | unknown) {
    // If the connection ended on empty canvas (the user did NOT drop on a
    // node), offer "Add card" / "Add note from vault" at the cursor. We
    // detect "empty" by inspecting the pointer's terminal element via the
    // event React Flow forwards. `react-flow__pane` is the background.
    let landed: 'pane' | 'node' | 'unknown' = 'unknown';
    let screenX = 0;
    let screenY = 0;
    const startedFrom = connectingFromNodeId;
    if (event && typeof event === 'object') {
      const e = event as MouseEvent | TouchEvent;
      const target = (e as MouseEvent).target as HTMLElement | null;
      if (target) {
        if (target.closest('.react-flow__node')) landed = 'node';
        else if (target.closest('.react-flow__pane')) landed = 'pane';
      }
      const me = e as MouseEvent;
      const te = e as TouchEvent;
      if ('clientX' in me && typeof me.clientX === 'number') {
        screenX = me.clientX;
        screenY = me.clientY;
      } else if (te.changedTouches && te.changedTouches[0]) {
        screenX = te.changedTouches[0].clientX;
        screenY = te.changedTouches[0].clientY;
      }
    }
    setConnectingFromNodeId(null);
    setConnectionTargetNodeId(null);
    if (landed === 'pane' && startedFrom && screenX > 0) {
      const flowPos = flow.screenToFlowPosition({ x: screenX, y: screenY });
      setConnectionEndMenu({
        sourceNodeId: startedFrom,
        screen: { x: screenX, y: screenY },
        flowPos,
      });
    }
  }

  /**
   * "Add card" — create a fresh, empty Markdown node at the release point and
   * connect it from the source. The node spawns in edit mode so the user can
   * type immediately (matches the right-click → Add Node flow).
   */
  function addCardFromConnection(menu: NonNullable<typeof connectionEndMenu>) {
    if (!conversationId) return;
    const created = addNode({
      conversationId,
      kind: 'markdown',
      title: '',
      contentMarkdown: '',
      position: {
        x: menu.flowPos.x - 140,
        y: menu.flowPos.y - 60,
      },
      width: 280,
      height: 140,
      tags: [],
    });
    const edge = addEdge({
      sourceNodeId: menu.sourceNodeId,
      targetNodeId: created.id,
    });
    markEdgeJustCreated(edge.id);
    setEditingNode(created.id);
    setCanvasSelection([created.id], [edge.id]);
  }

  /**
   * "Add note from vault" — pick a Markdown file via the native dialog, read
   * its contents, and create a Markdown node connected from the source. The
   * node title is the filename (sans extension); body is the file content.
   */
  async function addVaultNoteFromConnection(
    menu: NonNullable<typeof connectionEndMenu>,
  ) {
    if (!conversationId) return;
    const path = await dialog.pickFile({
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    });
    if (!path) return;
    let content: string;
    try {
      content = await dialog.readTextFile(path);
    } catch (err) {
      console.error('[connection-end] read failed', err);
      return;
    }
    const filename = path.split(/[\\/]/).pop() ?? 'note.md';
    const title = filename.replace(/\.[^.]+$/, '');
    const created = addNode({
      conversationId,
      kind: 'markdown',
      title,
      contentMarkdown: content,
      position: {
        x: menu.flowPos.x - 140,
        y: menu.flowPos.y - 60,
      },
      width: 320,
      height: 200,
      tags: ['from-vault'],
      mdPath: path,
    });
    const edge = addEdge({
      sourceNodeId: menu.sourceNodeId,
      targetNodeId: created.id,
    });
    markEdgeJustCreated(edge.id);
    setCanvasSelection([created.id], [edge.id]);
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

  /**
   * Plan 52 — sync every conversation Hypratia owns into the vault under
   * `Hypratia/`. One-way: never writes outside that subtree, never modifies
   * user-owned files. Idempotent for canvases / sidecars Hypratia owns.
   */
  async function syncEverythingToVault() {
    const state = useStore.getState();
    let vaultPath = state.settings.obsidianVaultPath;
    if (!vaultPath) {
      const picked = await dialog.pickFolder();
      if (!picked) return;
      vaultPath = picked;
      state.setObsidianVault(picked);
    }
    try {
      const summary = await syncToVault({
        vaultPath,
        conversations: state.conversations,
        nodes: state.nodes,
        edges: state.edges,
      });
      console.info(
        `[vault-sync] synced ${summary.canvases} canvas(es), ${summary.notes} note(s) to ${summary.vaultPath}/Hypratia`,
      );
    } catch (err) {
      console.error('[vault-sync] failed', err);
    }
  }

  /**
   * Plan 48 — write the current conversation's canvas as a `.canvas` file
   * (plus long-body sidecar `.md` notes) into the user's Obsidian vault.
   * Uses the configured vault if set; otherwise prompts for a folder once.
   */
  async function exportObsidianCanvas() {
    if (!conversationId) return;
    const state = useStore.getState();
    let vaultPath = state.settings.obsidianVaultPath;
    if (!vaultPath) {
      const picked = await dialog.pickFolder();
      if (!picked) return;
      vaultPath = picked;
      // Persist so subsequent exports are one-click.
      state.setObsidianVault(picked);
    }
    const conv = state.conversations.find((c) => c.id === conversationId);
    const title = conv?.title ?? 'Untitled';
    const nodesForCanvas = state.nodes.filter(
      (n) => n.conversationId === conversationId,
    );
    const nodeIdSet = new Set(nodesForCanvas.map((n) => n.id));
    const edgesForCanvas = state.edges.filter(
      (e) => nodeIdSet.has(e.sourceNodeId) && nodeIdSet.has(e.targetNodeId),
    );
    try {
      const result = await writeCanvasFile({
        vaultPath,
        conversationId,
        conversationTitle: title,
        nodes: nodesForCanvas,
        edges: edgesForCanvas,
      });
      console.info('[obsidian-canvas] exported', result.canvasPath, '+', result.sidecarPaths.length, 'notes');
    } catch (err) {
      console.error('[obsidian-canvas] export failed', err);
    }
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
      const files = Array.from(e.dataTransfer.files);
      // Plan 43 — if a `conversations.json` (or any `.json` looking like the
      // OpenAI export shape) is dropped, route it into the import picker
      // instead of attaching it as a file.
      const jsonFile = files.find(
        (f) => f.type === 'application/json' || f.name.toLowerCase().endsWith('.json'),
      );
      if (jsonFile && files.length === 1) {
        try {
          const text = await jsonFile.text();
          const convos = parseChatgptExport(text);
          if (convos.length > 0) {
            setImportPicker({ conversations: convos, landAt: position });
            return;
          }
        } catch (err) {
          console.warn('[chatgpt-import] failed to parse JSON, falling back to attachment', err);
        }
      }
      const ingested = await ingestDroppedFiles(
        files,
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

  // React Flow's stored `position` is the node's top-left corner, not its
  // center. Pass position straight to setCenter and the corner lands at the
  // viewport center — the node renders off to the bottom-right. Shift by
  // the rendered half-size so the node body actually sits in the middle.
  function focusOnNodeCenter(
    nodeId: string,
    opts?: { zoom?: number; duration?: number },
  ) {
    const node = useStore.getState().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const rfNode = flow.getNode(nodeId);
    const w = rfNode?.measured?.width ?? rfNode?.width ?? 0;
    const h = rfNode?.measured?.height ?? rfNode?.height ?? 0;
    const cx = node.position.x + w / 2;
    const cy = node.position.y + h / 2;
    flow.setCenter(cx, cy, {
      zoom: opts?.zoom ?? 1.1,
      duration: opts?.duration ?? 220,
    });
  }

  useEffect(() => {
    function onFocusCanvasNode(e: Event) {
      const nodeId = (e as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;
      // 220 ms reads as snappy; the previous 300 ms felt floaty in side-by-side
      // panes (plan 39 — motion polish).
      focusOnNodeCenter(nodeId, { zoom: 0.77, duration: 220 });
    }
    window.addEventListener('mc:focus-canvas-node', onFocusCanvasNode);
    return () => window.removeEventListener('mc:focus-canvas-node', onFocusCanvasNode);
    // focusOnNodeCenter closes over `flow`, which is stable per provider —
    // re-binding the listener every render would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);

  // Connection-target highlight: while a connection is being dragged from a
  // node, mark the candidate target's React Flow wrapper with a CSS class so
  // it shows the magnetic outline. Avoids a full re-render of every node.
  useEffect(() => {
    if (!connectionTargetNodeId) return;
    const el = document.querySelector(
      `.react-flow__node[data-id="${CSS.escape(connectionTargetNodeId)}"]`,
    );
    if (!el) return;
    el.classList.add('connection-target');
    return () => {
      el.classList.remove('connection-target');
    };
  }, [connectionTargetNodeId]);

  // Cmd/Ctrl+A on a hovered or single-selected markdown node → text-select
  // that node's body only (instead of the browser default of selecting
  // every text on the page). Skipped when an editable element has focus
  // so chat input and node-editor select-all keep working natively.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'a' && e.key !== 'A') return;
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
      // Resolve target: hover wins (cursor location is the user's
      // intent), else single-selection fallback.
      let contentEl: HTMLElement | null = document.querySelector<HTMLElement>(
        '.markdown-node:hover .markdown-node-content',
      );
      if (!contentEl && selectedNodeIds.length === 1) {
        contentEl = document.querySelector<HTMLElement>(
          `.markdown-node-content[data-node-id="${CSS.escape(
            selectedNodeIds[0],
          )}"]`,
        );
      }
      if (!contentEl) return;
      e.preventDefault();
      e.stopPropagation();
      const range = document.createRange();
      range.selectNodeContents(contentEl);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [selectedNodeIds]);

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
      // Plan 41 — when the clipboard text looks like an AI conversation,
      // route it through Capture Preview instead of dropping a single memo.
      // ⌘⇧V (handled below) always opens the preview.
      const text = data.getData('text/plain');
      const hasFiles = Array.from(data.items).some((it) => it.kind === 'file');
      if (!hasFiles && text && shouldOpenCapture(text)) {
        e.preventDefault();
        setCaptureInput({
          source: 'paste',
          rawText: text,
          conversationId,
          landAt: position,
        });
        return;
      }
      e.preventDefault();
      void pasteToCanvas({ kind: 'event', data }, conversationId, position);
    }
    document.addEventListener('paste', onDocPaste);
    return () => document.removeEventListener('paste', onDocPaste);
  }, [conversationId, showGlobal, flow]);

  // ⌘⇧V — always open Capture Preview from the current clipboard text. Useful
  // when the heuristic in onDocPaste is too conservative for an unusual share
  // format. We bypass the regular paste-event path entirely here.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (!e.shiftKey) return;
      if (e.key !== 'v' && e.key !== 'V') return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        return;
      }
      if (showGlobal || !conversationId) return;
      e.preventDefault();
      void navigator.clipboard
        .readText()
        .then((text) => {
          if (!text || !text.trim()) return;
          const container = document.querySelector('.react-flow') as HTMLElement | null;
          if (!container) return;
          const r = container.getBoundingClientRect();
          const position = flow.screenToFlowPosition({
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
          });
          setCaptureInput({
            source: 'paste',
            rawText: text,
            conversationId,
            landAt: position,
          });
        })
        .catch(() => {
          /* clipboard permission denied — silently no-op */
        });
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [conversationId, showGlobal, flow]);

  // Custom edge-endpoint detach. Listens for the `mc:edge-detach-begin`
  // CustomEvent dispatched by FlexibleEdge grips, then attaches window-level
  // pointer listeners to drive the in-flight visual and resolve the drop.
  // Drop on a different node → reconnect. Drop on empty pane → delete.
  useEffect(() => {
    function onBegin(e: Event) {
      const detail = (e as CustomEvent<EdgeDetachBeginDetail>).detail;
      if (!detail) return;
      const state = useStore.getState();
      const edge = state.edges.find((ed) => ed.id === detail.edgeId);
      if (!edge) return;
      // The user grabbed `grabbedEnd`; the OTHER end is the anchor.
      const anchoredEnd =
        detail.grabbedEnd === 'source' ? 'target' : 'source';
      const anchorNodeId =
        anchoredEnd === 'source' ? edge.sourceNodeId : edge.targetNodeId;
      const anchorNode = state.nodes.find((n) => n.id === anchorNodeId);
      if (!anchorNode) return;
      const w = anchorNode.width ?? 280;
      const h = anchorNode.height ?? 160;
      const rect: EdgeRect = {
        x: anchorNode.position.x,
        y: anchorNode.position.y,
        width: w,
        height: h,
      };
      const cursor = flow.screenToFlowPosition(detail.startScreen);
      const anchor = nearestSideMidpoint(rect, cursor);
      setEdgeDetach({
        edgeId: detail.edgeId,
        anchoredEnd,
        anchor,
        cursor,
      });
      document.body.dataset.edgeDetach = 'true';
    }
    window.addEventListener(EDGE_DETACH_EVENT, onBegin);
    return () => {
      window.removeEventListener(EDGE_DETACH_EVENT, onBegin);
    };
  }, [flow]);

  useEffect(() => {
    if (!edgeDetach) return;
    function onMove(e: globalThis.PointerEvent) {
      const cursor = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setEdgeDetach((prev) => {
        if (!prev) return prev;
        const state = useStore.getState();
        const edge = state.edges.find((ed) => ed.id === prev.edgeId);
        if (!edge) return prev;
        const anchorNodeId =
          prev.anchoredEnd === 'source' ? edge.sourceNodeId : edge.targetNodeId;
        const anchorNode = state.nodes.find((n) => n.id === anchorNodeId);
        if (!anchorNode) return prev;
        const w = anchorNode.width ?? 280;
        const h = anchorNode.height ?? 160;
        const rect: EdgeRect = {
          x: anchorNode.position.x,
          y: anchorNode.position.y,
          width: w,
          height: h,
        };
        const anchor = nearestSideMidpoint(rect, cursor);
        return { ...prev, anchor, cursor };
      });
    }
    function onUp(e: globalThis.PointerEvent) {
      const detach = edgeDetach;
      setEdgeDetach(null);
      delete document.body.dataset.edgeDetach;
      if (!detach) return;
      const state = useStore.getState();
      const edge = state.edges.find((ed) => ed.id === detach.edgeId);
      if (!edge) return;
      const anchorNodeId =
        detach.anchoredEnd === 'source' ? edge.sourceNodeId : edge.targetNodeId;
      const originalOtherId =
        detach.anchoredEnd === 'source' ? edge.targetNodeId : edge.sourceNodeId;
      // Hit-test for a node under the cursor on release.
      let landedNodeId: string | null = null;
      const target = e.target as HTMLElement | null;
      const nodeEl = target?.closest('.react-flow__node');
      if (nodeEl) {
        landedNodeId = (nodeEl as HTMLElement).getAttribute('data-id');
      }
      if (!landedNodeId || landedNodeId === anchorNodeId) {
        // Empty canvas drop OR self-loop → delete (⌘Z restores via undo stack).
        removeEdge(detach.edgeId);
        return;
      }
      if (landedNodeId === originalOtherId) {
        // Released on the same node — no-op.
        return;
      }
      // Reconnect to a different node.
      removeEdge(detach.edgeId);
      const newEdge = state.addEdge({
        sourceNodeId:
          detach.anchoredEnd === 'source' ? anchorNodeId : landedNodeId,
        targetNodeId:
          detach.anchoredEnd === 'source' ? landedNodeId : anchorNodeId,
        ...(edge.kind ? { kind: edge.kind } : {}),
        ...(edge.label ? { label: edge.label } : {}),
      });
      markEdgeJustCreated(newEdge.id);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [edgeDetach, flow, removeEdge]);

  // Plan 53 — Obsidian companion mailbox watcher. When the user has both
  // (a) configured a vault and (b) toggled the watcher on, poll
  // `Hypratia/.mailbox/incoming` for payloads dropped by the plugin and
  // route them through Capture Preview, same as paste / import.
  const mailboxEnabled = useStore(
    (s) => Boolean(s.settings.mailboxWatcherEnabled),
  );
  const vaultPath = useStore((s) => s.settings.obsidianVaultPath);
  useEffect(() => {
    if (!mailboxEnabled || !vaultPath || !conversationId) return;
    let docFocused = !document.hidden;
    const onVis = () => {
      docFocused = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVis);
    const handle = startMailboxWatcher({
      vaultPath,
      enabled: () => docFocused,
      onPayload: (payload) => {
        const text =
          payload.kind === 'send-selection' ? payload.text : payload.content;
        const title =
          payload.kind === 'send-file' ? payload.title : payload.title ?? '';
        const container = document.querySelector('.react-flow') as HTMLElement | null;
        if (!container) return;
        const r = container.getBoundingClientRect();
        const landAt = flow.screenToFlowPosition({
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
        });
        setCaptureInput({
          source: 'chatgpt-export',
          title,
          rawText: text,
          conversationId,
          landAt,
        });
      },
    });
    return () => {
      handle.stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [mailboxEnabled, vaultPath, conversationId, flow]);

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
    <EdgeDetachContext.Provider value={edgeDetach}>
    <main
      className={`canvas-panel tool-${canvasTool}${
        dragOver ? ' dragging-over' : ''
      }${viewMode === 'titles' ? ' canvas-titles-only' : ''}${
        edgeDetach ? ' is-edge-detaching' : ''
      }`}
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
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        connectionRadius={60}
        connectionMode={ConnectionMode.Loose}
        connectOnClick={false}
        connectionLineComponent={HypConnectionLine}
        onNodeMouseEnter={(_, node) => {
          if (connectingFromNodeId && node.id !== connectingFromNodeId) {
            setConnectionTargetNodeId(node.id);
          }
        }}
        onNodeMouseLeave={() => {
          if (connectingFromNodeId) setConnectionTargetNodeId(null);
        }}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          // Stop the workspace-level context menu (App.tsx) from also
          // firing — without this, even with our menu shown, the
          // layout/show-hide menu can race in on top.
          e.stopPropagation();
          // If text is currently selected INSIDE the node's rendered
          // content, the user expects the text-selection menu (Copy /
          // Ask / Search / Open Markdown). Without this gate, React
          // Flow's per-node handler beats `onCanvasContextMenu` to it
          // and silently shows the multi-node selection menu instead.
          const sel = window.getSelection();
          const selectedText = sel?.toString().trim() ?? '';
          const target = e.target as HTMLElement;
          const contentEl = target.closest<HTMLElement>(
            '.markdown-node-content',
          );
          if (
            selectedText &&
            contentEl &&
            sel &&
            sel.rangeCount > 0 &&
            contentEl.contains(sel.anchorNode)
          ) {
            const nodeId = contentEl.dataset.nodeId;
            if (nodeId) {
              const range = sel.getRangeAt(0);
              const offsets = getSelectionOffsets(contentEl, range);
              if (offsets) {
                setTextSelectionMenu({
                  x: e.clientX,
                  y: e.clientY,
                  nodeId,
                  selectedText,
                  startOffset: offsets.startOffset,
                  endOffset: offsets.endOffset,
                });
                return;
              }
            }
          }
          if (selectedNodeIds.includes(node.id)) {
            selectedMenuAt(e.clientX, e.clientY);
          } else {
            setCtxMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
          }
        }}
        onEdgeClick={(e, edge) => {
          // Left-click on an edge: replace the canvas selection with this
          // edge so the EdgeToolbar appears. React Flow's own `select`
          // change events also flow through `onEdgesChange` above, but
          // calling explicitly here makes the click immediately decisive
          // (no waiting for React Flow's internal toggle pass) and lets us
          // clear node selection in the same tick.
          e.stopPropagation();
          setCanvasSelection([], [edge.id]);
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
        {/* Floating action bar shown when exactly one edge (and no nodes) is
            selected. Replaces the previous right-click-only flow for delete /
            swap-direction / focus / kind / label. The right-click menu still
            works as a fallback. */}
        {selectedEdgeIds.length === 1 && selectedNodeIds.length === 0 ? (
          <EdgeToolbar edgeId={selectedEdgeIds[0]} />
        ) : null}
        {helperLines && (helperLines.vertical !== undefined || helperLines.horizontal !== undefined) ? (
          <ViewportPortal>
            {helperLines.vertical !== undefined ? (
              <div
                className="canvas-helper-line canvas-helper-line-v"
                style={{
                  position: 'absolute',
                  left: helperLines.vertical,
                  top: -100000,
                  width: 1,
                  height: 200000,
                  pointerEvents: 'none',
                }}
              />
            ) : null}
            {helperLines.horizontal !== undefined ? (
              <div
                className="canvas-helper-line canvas-helper-line-h"
                style={{
                  position: 'absolute',
                  top: helperLines.horizontal,
                  left: -100000,
                  height: 1,
                  width: 200000,
                  pointerEvents: 'none',
                }}
              />
            ) : null}
          </ViewportPortal>
        ) : null}
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
          onSearchWithLlm={() => {
            setSelectionMenu(null);
            setLlmSearchOpen({ nodeIds: selectedNodeIds });
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
        <RichTextContextMenu
          x={textSelectionMenu.x}
          y={textSelectionMenu.y}
          onClose={() => setTextSelectionMenu(null)}
          items={{
            copy: () => {
              void navigator.clipboard
                .writeText(textSelectionMenu.selectedText)
                .then(() => showToast({ message: t('common.copied'), tone: 'success' }))
                .catch(() => undefined);
              setTextSelectionMenu(null);
            },
            ask: () => {
              const origin = `canvas-selection:${textSelectionMenu.nodeId}:${textSelectionMenu.startOffset}:${textSelectionMenu.endOffset}`;
              useStore
                .getState()
                .openAiPalette(textSelectionMenu.selectedText, origin);
              setTextSelectionMenu(null);
            },
            search: () => {
              setSearchOpen({
                nodeIds: [textSelectionMenu.nodeId],
                initialQuery: textSelectionMenu.selectedText,
              });
              setTextSelectionMenu(null);
            },
            openMarkdown: () => {
              setCanvasSelection(
                [textSelectionMenu.nodeId],
                selectEdgesForNodes(storeEdges, [textSelectionMenu.nodeId]),
              );
              openMarkdownForNode(textSelectionMenu.nodeId);
              setTextSelectionMenu(null);
            },
          }}
        />
      ) : null}
      {searchOpen ? (
        <SearchSelectedModal
          nodeIds={searchOpen.nodeIds}
          initialQuery={searchOpen.initialQuery}
          onClose={() => setSearchOpen(null)}
          onFocusNode={(nodeId) => {
            setCanvasSelection([nodeId], selectEdgesForNodes(storeEdges, [nodeId]));
            focusOnNodeCenter(nodeId, { zoom: 0.84, duration: 300 });
          }}
        />
      ) : null}
      {llmSearchOpen ? (
        <LlmSearchSelectedModal
          nodeIds={llmSearchOpen.nodeIds}
          onClose={() => setLlmSearchOpen(null)}
          onFocusNode={(nodeId) => {
            setCanvasSelection([nodeId], selectEdgesForNodes(storeEdges, [nodeId]));
            focusOnNodeCenter(nodeId, { zoom: 0.84, duration: 300 });
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
          onExportObsidianCanvas={() => void exportObsidianCanvas()}
          onSyncToVault={() => void syncEverythingToVault()}
          onClose={() => setPaneMenu(null)}
        />
      ) : null}
      {connectionEndMenu ? (
        <ConnectionEndMenu
          x={connectionEndMenu.screen.x}
          y={connectionEndMenu.screen.y}
          onAddCard={() => addCardFromConnection(connectionEndMenu)}
          onAddFromVault={() =>
            void addVaultNoteFromConnection(connectionEndMenu)
          }
          onClose={() => setConnectionEndMenu(null)}
        />
      ) : null}
      {captureInput ? (
        <CapturePreview
          input={captureInput}
          onClose={() => setCaptureInput(null)}
        />
      ) : null}
      {importPicker && conversationId ? (
        <ImportChatgptPicker
          conversations={importPicker.conversations}
          onPick={(c) => {
            const text = conversationToCaptureText(c);
            const landAt = importPicker.landAt;
            setImportPicker(null);
            setCaptureInput({
              source: 'chatgpt-export',
              title: c.title,
              rawText: text,
              conversationId,
              landAt,
            });
          }}
          onClose={() => setImportPicker(null)}
        />
      ) : null}
      {empty ? (
        <div className="canvas-empty">
          {showGlobal
            ? t('canvas.empty.pickProject')
            : hasMessages
            ? t('canvas.empty.dragMessage')
            : t('canvas.empty.startAnywhere')}
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
    </EdgeDetachContext.Provider>
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
  onSearchWithLlm,
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
  onSearchWithLlm: () => void;
  onOpenMarkdown: () => void;
  onCopyLinks: () => void;
  onAddLinks: () => void;
  onDeleteEdges: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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
        {t('selection.summary', { nodes: nodeCount, edges: edgeCount })}
      </div>
      <button type="button" onClick={onAsk}>{t('selection.ask')}</button>
      <button type="button" onClick={onSearch}>{t('selection.search')}</button>
      <button type="button" onClick={onSearchWithLlm}>
        {t('selection.searchWithLlm')}
      </button>
      <button type="button" onClick={onOpenMarkdown}>
        {t('selection.openMarkdown')}
      </button>
      <button type="button" onClick={onCopyLinks}>
        {t('selection.copyLinks')}
      </button>
      {nodeCount >= 2 ? (
        <button type="button" onClick={onAddLinks}>
          {t('selection.addLinks')}
        </button>
      ) : null}
      {edgeCount >= 1 ? (
        <button type="button" className="danger" onClick={onDeleteEdges}>
          {edgeCount === 1
            ? t('selection.deleteLink')
            : t('selection.deleteLinks', { count: edgeCount })}
        </button>
      ) : null}
      <hr />
      <div className="selection-menu-title">{t('selection.panes')}</div>
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
        {t('selection.toggleSidebar')}
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
        {t('selection.toggleMarkdown')}
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
        {t('selection.toggleCanvas')}
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
        {t('selection.toggleChat')}
      </button>
      <hr />
      <button type="button" onClick={onClear}>Clear Selection</button>
    </div>
  );
}

// TextSelectionContextMenu has been replaced by the shared
// RichTextContextMenu in src/components/ContextMenu/.

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

type LlmSearchModelOption = {
  provider: ProviderId;
  model: string;
  label: string;
};

function LlmSearchSelectedModal({
  nodeIds,
  onFocusNode,
  onClose,
}: {
  nodeIds: string[];
  onFocusNode: (nodeId: string) => void;
  onClose: () => void;
}) {
  const allNodes = useStore((s) => s.nodes);
  const providersConfig = useStore((s) => s.settings.providers);
  const settingsModel = useStore((s) => s.settings.defaultModel);
  const llmSearchModel = useStore((s) => s.settings.llmSearchModel);
  const setLlmSearchModel = useStore((s) => s.setLlmSearchModel);
  const conversations = useStore((s) => s.conversations);
  const lastConversationId = useStore((s) => s.settings.lastConversationId);
  const conv = conversations.find((c) => c.id === lastConversationId);

  // Flat list of every (provider, model) pair the user has enabled. Built
  // the same way ModelPicker builds its dropdown so the LLM-search picker
  // stays in sync with what the chat picker offers.
  const options = useMemo<LlmSearchModelOption[]>(() => {
    const out: LlmSearchModelOption[] = [];
    for (const pid of PROVIDER_ORDER) {
      const cfg = providersConfig[pid];
      if (!cfg?.enabled) continue;
      const meta = PROVIDERS[pid];
      const hidden = new Set(cfg.hiddenModels ?? []);
      const all = [
        ...meta.defaultModels,
        ...(cfg.customModels ?? []),
      ].filter((m, i, arr) => arr.indexOf(m) === i && !hidden.has(m));
      for (const model of all) {
        const m = meta.models[model];
        out.push({
          provider: pid,
          model,
          label: `${meta.label} · ${m?.label ?? model}`,
        });
      }
    }
    return out;
  }, [providersConfig]);

  // Model resolution priority:
  //   1. explicit `settings.llmSearchModel` (user picked one previously)
  //   2. Groq's first available model — Groq is free as of 2026 and fast,
  //      so it's a sensible default for "scan my selected notes" tasks
  //   3. active chat model (`conversation.modelOverride ?? settings.defaultModel`)
  // Falls back to undefined if no provider is configured.
  const effectiveModel: ModelRef | undefined = useMemo(() => {
    if (
      llmSearchModel &&
      options.some(
        (o) =>
          o.provider === llmSearchModel.provider &&
          o.model === llmSearchModel.model,
      )
    ) {
      return llmSearchModel;
    }
    const groqOption = options.find((o) => o.provider === 'groq');
    if (groqOption) return { provider: groqOption.provider, model: groqOption.model };
    const chatModel = conv?.modelOverride ?? settingsModel;
    if (
      chatModel &&
      options.some(
        (o) => o.provider === chatModel.provider && o.model === chatModel.model,
      )
    ) {
      return chatModel;
    }
    return options[0]
      ? { provider: options[0].provider, model: options[0].model }
      : undefined;
  }, [llmSearchModel, options, conv?.modelOverride, settingsModel]);

  const selectedNodes = useMemo(
    () => allNodes.filter((n) => nodeIds.includes(n.id)),
    [allNodes, nodeIds],
  );

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LlmSearchMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function pickModel(value: string) {
    const [provider, model] = value.split('|');
    if (!provider || !model) return;
    setLlmSearchModel({ provider: provider as ProviderId, model });
  }

  async function runSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (!effectiveModel) {
      setError('No AI provider configured. Open Settings → Providers & keys.');
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setError(null);
    try {
      const matches = await searchNodesWithLlm({
        query: trimmed,
        nodes: selectedNodes,
        model: effectiveModel,
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      setResults(matches);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(String(err));
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }

  const selectValue = effectiveModel
    ? `${effectiveModel.provider}|${effectiveModel.model}`
    : '';

  return (
    <div className="canvas-modal-backdrop">
      <div className="canvas-modal search-modal">
        <header>
          <div>
            <h2>Search with LLM</h2>
            <p>{`${selectedNodes.length} selected notes`}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">x</button>
        </header>
        <div className="canvas-search-controls">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="例: ＿＿＿みたいなこと書いてなかったっけ?"
          />
          <div className="canvas-search-scope">
            <button
              type="button"
              className="active"
              onClick={() => void runSearch()}
              disabled={busy || !query.trim() || !effectiveModel}
            >
              {busy ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>
        <div className="canvas-search-controls">
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              opacity: 0.85,
              flex: 1,
            }}
          >
            <span style={{ whiteSpace: 'nowrap' }}>Model</span>
            <select
              value={selectValue}
              onChange={(e) => pickModel(e.target.value)}
              disabled={options.length === 0}
              style={{ flex: 1, minWidth: 0 }}
            >
              {options.length === 0 ? (
                <option value="">No providers enabled</option>
              ) : (
                options.map((o) => (
                  <option key={`${o.provider}|${o.model}`} value={`${o.provider}|${o.model}`}>
                    {o.label}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
        {error ? <div className="canvas-modal-error">{error}</div> : null}
        <div className="canvas-search-results">
          {busy ? <div className="canvas-search-empty">Asking the model…</div> : null}
          {!busy && query.trim() && results.length === 0 && !error ? (
            <div className="canvas-search-empty">No matches.</div>
          ) : null}
          {results.map((r) => (
            <button
              type="button"
              key={r.nodeId}
              className="canvas-search-result"
              onClick={() => {
                onFocusNode(r.nodeId);
                onClose();
              }}
            >
              <strong>{r.title}</strong>
              {r.reason ? <span>{r.reason}</span> : null}
              <p>{r.snippet}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
