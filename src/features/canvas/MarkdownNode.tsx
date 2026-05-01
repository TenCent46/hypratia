import { memo, useRef, useState, type WheelEvent } from 'react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { MarkdownRenderer } from '../../services/markdown/MarkdownRenderer';
import { NodeHandles } from './NodeHandles';
import { useStore } from '../../store';
import type { CanvasSelectionMarker } from '../../types';
import {
  ensureNodeMarkdownPath,
} from '../../services/markdown/MarkdownContextResolver';
import {
  markdownFiles,
  resolveMarkdownRoot,
} from '../../services/storage/MarkdownFileService';


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

// Keep the canvas's pinch-to-zoom and Cmd/Ctrl+wheel zoom working over a
// node body. Trackpad pinch arrives as a wheel event with ctrlKey synthesized
// by the browser; Cmd-wheel sets metaKey. Both bubble to React Flow when we
// don't stop them. Plain wheels are stopped so the body's native scroll runs
// without the canvas also panning/zooming.
function bodyWheelHandler(e: WheelEvent<HTMLElement>) {
  if (e.ctrlKey || e.metaKey) return;
  e.stopPropagation();
}

function MarkdownNodeImpl({
  id,
  data,
  selected,
}: NodeProps<MarkdownNodeType>) {
  const accent =
    typeof data.hue === 'number' ? `hsl(${data.hue}, 35%, 70%)` : undefined;
  const updateNode = useStore((s) => s.updateNode);
  const editing = useStore((s) => s.ui.editingNodeId === id);
  const setEditingNode = useStore((s) => s.setEditingNode);
  const [draft, setDraft] = useState(data.contentMarkdown);
  const cancelBlurSaveRef = useRef(false);
  const markers = data.markers ?? [];

  async function saveDraft(nextMarkdown = draft) {
    const rootPath = await resolveMarkdownRoot(useStore.getState().settings.markdownStorageDir);
    const path = await ensureNodeMarkdownPath(rootPath, id);
    if (path) {
      await markdownFiles.writeFile(rootPath, path, nextMarkdown);
    }
    updateNode(id, {
      title: titleFromMarkdown(nextMarkdown, data.title),
      contentMarkdown: nextMarkdown,
      ...(path ? { mdPath: path } : {}),
    });
    setEditingNode(null);
  }

  function cancelEdit() {
    cancelBlurSaveRef.current = true;
    setDraft(data.contentMarkdown);
    setEditingNode(null);
  }

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
          <textarea
            className="markdown-node-editor nodrag"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onWheel={bodyWheelHandler}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void saveDraft();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            onBlur={() => {
              if (cancelBlurSaveRef.current) {
                cancelBlurSaveRef.current = false;
                return;
              }
              void saveDraft();
            }}
          />
        ) : (
          <div
            className="content markdown-node-body nodrag"
            onWheel={bodyWheelHandler}
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
