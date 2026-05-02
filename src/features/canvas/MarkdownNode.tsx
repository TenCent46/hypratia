import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { WheelEvent } from 'react';
import {
  NodeResizer,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { MarkdownRenderer } from '../../services/markdown/MarkdownRenderer';
import { MarkdownEditor } from '../editor/MarkdownEditor';
import { NodeHandles } from './NodeHandles';
import { useStore } from '../../store';
import type { CanvasSelectionMarker } from '../../types';
import {
  ensureNodeMarkdownPath,
} from '../../services/markdown/MarkdownContextResolver';
import { isMirrorManagedPath } from '../../services/knowledge/knowledgeBaseLayout';
import {
  markdownFiles,
  resolveMarkdownRoot,
} from '../../services/storage/MarkdownFileService';
import { autoTitleNode } from '../../services/chat/autoTitle';


export type MarkdownNodeData = {
  title: string;
  contentMarkdown: string;
  mdPath?: string;
  markers?: CanvasSelectionMarker[];
  hue?: number;
  isSummary?: boolean;
};

export type MarkdownNodeType = Node<MarkdownNodeData, 'markdown'>;

const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_HEIGHT_MIN = 140;
const DEFAULT_HEIGHT_MAX = 360;

/**
 * Default size for a freshly-created markdown panel. Sized so the panel shows
 * roughly a third of the content's natural height; the rest scrolls inside
 * the body. Hardcoded line metrics match the rendered 13px/1.45 styling.
 */
export function defaultMarkdownNodeSize(content: string): {
  width: number;
  height: number;
} {
  const width = DEFAULT_NODE_WIDTH;
  const charsPerLine = Math.max(8, Math.floor((width - 32) / 7));
  const lineHeightPx = 20;
  const headerPx = 56;
  const lines = Math.max(2, Math.ceil(content.length / charsPerLine));
  const naturalHeight = headerPx + lines * lineHeightPx;
  const height = Math.max(
    DEFAULT_HEIGHT_MIN,
    Math.min(DEFAULT_HEIGHT_MAX, Math.round(naturalHeight / 3)),
  );
  return { width, height };
}

function plainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromMarkdown(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 80);
  const first = plainText(markdown).slice(0, 80);
  return first || fallback || 'Untitled';
}

const MIN_ZOOM = 0.01;
const MAX_ZOOM = 100;

function MarkdownNodeImpl({
  id,
  data,
  selected,
}: NodeProps<MarkdownNodeType>) {
  const accent =
    typeof data.hue === 'number' ? `hsl(${data.hue}, 35%, 70%)` : undefined;
  const updateNode = useStore((s) => s.updateNode);
  const removeNode = useStore((s) => s.removeNode);
  const editing = useStore((s) => s.ui.editingNodeId === id);
  const setEditingNode = useStore((s) => s.setEditingNode);
  const [draft, setDraft] = useState(data.contentMarkdown);
  const cancelBlurSaveRef = useRef(false);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const markers = data.markers ?? [];
  const flow = useReactFlow();

  // Body wheel handler. The body has the `nowheel` class so React Flow's
  // own pan/zoom logic ignores wheel events that originate inside it,
  // restoring native overflow scroll. The downside is that pinch and
  // Cmd/Ctrl-wheel ALSO get ignored (they normally trigger zoom); we
  // replay them here as a programmatic focal-point zoom.
  const bodyWheel = useCallback(
    (e: WheelEvent<HTMLElement>) => {
      if (!(e.ctrlKey || e.metaKey)) return; // plain wheel: native scroll
      e.preventDefault();
      const container = (e.currentTarget.closest(
        '.react-flow',
      ) as HTMLElement | null)?.getBoundingClientRect();
      if (!container) return;
      const mx = e.clientX - container.left;
      const my = e.clientY - container.top;
      const vp = flow.getViewport();
      const factor = Math.exp(-e.deltaY * 0.01);
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * factor));
      const ratio = newZoom / vp.zoom;
      flow.setViewport({
        x: mx * (1 - ratio) + vp.x * ratio,
        y: my * (1 - ratio) + vp.y * ratio,
        zoom: newZoom,
      });
    },
    [flow],
  );

  async function saveDraft(nextMarkdown = draft) {
    // Discard fresh-and-empty nodes. A right-click "Add Node" creates an empty
    // markdown node and immediately enters edit mode; if the user commits
    // without typing anything (and there was nothing to start with), we drop
    // the placeholder rather than littering the canvas.
    if (!nextMarkdown.trim() && !data.contentMarkdown.trim() && !data.title.trim()) {
      cancelBlurSaveRef.current = true;
      setEditingNode(null);
      removeNode(id);
      return;
    }
    const rootPath = await resolveMarkdownRoot(useStore.getState().settings.markdownStorageDir);
    const path = await ensureNodeMarkdownPath(rootPath, id);
    if (path && !isMirrorManagedPath(path)) {
      // Refuse to overwrite a mirror-managed file. `ensureNodeMarkdownPath`
      // already filters these out and mints a fresh canonical path, so a
      // mirror path here means something raced or a future caller bypassed
      // the helper — better to skip the write than corrupt frontmatter.
      await markdownFiles.writeFile(rootPath, path, nextMarkdown);
    }
    // Set the heuristic title immediately (fast, no network) so the
    // node label updates the moment the user commits the edit.
    const heuristicTitle = titleFromMarkdown(nextMarkdown, data.title);
    updateNode(id, {
      title: heuristicTitle,
      contentMarkdown: nextMarkdown,
      ...(path ? { mdPath: path } : {}),
    });
    setEditingNode(null);
    // Refine the title in the background using the free Groq Llama
    // model when configured. Skipped automatically when the user has
    // hand-edited the title (autoTitleNode checks the placeholder
    // pattern). Errors are swallowed.
    void autoTitleNode({
      nodeId: id,
      kind: 'note',
    }).catch((err: unknown) =>
      console.warn('[autoTitleNode] markdown node failed', err),
    );
  }

  function cancelEdit() {
    cancelBlurSaveRef.current = true;
    setDraft(data.contentMarkdown);
    setEditingNode(null);
    if (!data.contentMarkdown.trim() && !data.title.trim()) {
      removeNode(id);
    }
  }

  // Close-on-outside-click for the inline rich editor. Capture-phase pointerdown
  // so we react before React Flow's marquee selection handler runs. We commit
  // the draft (saveDraft) rather than discarding — matches the previous textarea
  // blur-save semantics.
  useEffect(() => {
    if (!editing) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as globalThis.Node | null;
      if (!target) return;
      if (editorWrapperRef.current?.contains(target)) return;
      if (cancelBlurSaveRef.current) {
        cancelBlurSaveRef.current = false;
        return;
      }
      void saveDraft();
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
    // saveDraft closes over `draft`; intentionally re-bound when draft changes
    // so the latest text is what we persist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft]);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={80}
        lineClassName="mc-resize-line"
        handleClassName="mc-resize-handle"
      />
      <div
        className={`markdown-node${selected ? ' selected' : ''}${
          data.isSummary ? ' summary' : ''
        }${editing ? ' editing' : ''}`}
        style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
        onDoubleClick={(e) => {
          e.stopPropagation();
          cancelBlurSaveRef.current = false;
          setDraft(data.contentMarkdown);
          setEditingNode(id);
        }}
      >
        <NodeHandles />
        <div className="markdown-node-header">
          {data.title ? <div className="title">{data.title}</div> : <span />}
        </div>
        {editing ? (
          <div
            ref={editorWrapperRef}
            className="markdown-node-editor-wrapper nodrag nowheel"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onWheel={bodyWheel}
          >
            <MarkdownEditor
              value={draft}
              onChange={setDraft}
              onSubmit={() => void saveDraft()}
              onCancel={cancelEdit}
              compact
              autoFocus
            />
          </div>
        ) : (
          <div
            className="content markdown-node-body nodrag nowheel"
            onWheel={bodyWheel}
          >
            <div className="markdown-node-content" data-node-id={id}>
              <MarkdownRenderer
                markdown={data.contentMarkdown}
                markers={markers}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export const MarkdownNode = memo(MarkdownNodeImpl);
