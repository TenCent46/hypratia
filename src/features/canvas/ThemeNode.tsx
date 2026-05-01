import { memo } from 'react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { NodeHandles } from './NodeHandles';
import type { CanvasNode } from '../../types';

export type ThemeNodeData = {
  title: string;
  summary: string;
  conversationId: string;
  messageId?: string;
  themeKind: 'theme' | 'ask' | 'insight' | 'decision';
  importance?: 1 | 2 | 3 | 4 | 5;
  hue?: number;
};

export type ThemeNodeType = Node<ThemeNodeData, 'theme'>;

const KIND_GLYPH: Record<ThemeNodeData['themeKind'], string> = {
  theme: '',
  ask: '?',
  insight: '!',
  decision: '✓',
};

/**
 * Build node data from a stored CanvasNode. Single source of truth so the
 * renderer never has to look up tags or guess at fields.
 */
export function themeNodeDataFromCanvasNode(n: CanvasNode): ThemeNodeData {
  const tags = n.tags ?? [];
  const kindTag = tags.find((t) => t.startsWith('themeKind:'));
  const themeKind: ThemeNodeData['themeKind'] = (() => {
    const v = kindTag ? kindTag.slice('themeKind:'.length) : 'theme';
    if (v === 'theme' || v === 'ask' || v === 'insight' || v === 'decision') {
      return v;
    }
    return 'theme';
  })();
  return {
    title: n.title,
    summary: n.contentMarkdown.split('\n')[0] ?? '',
    conversationId: n.conversationId,
    messageId: n.sourceMessageId,
    themeKind,
    importance: n.importance,
  };
}

function ThemeNodeImpl({ data, selected }: NodeProps<ThemeNodeType>) {
  const accent =
    typeof data.hue === 'number' ? `hsl(${data.hue}, 35%, 70%)` : undefined;
  const glyph = KIND_GLYPH[data.themeKind];
  const importance = data.importance ?? 0;

  function handleClick() {
    // Single-click jumps the chat to the source message. We do NOT
    // stopPropagation — React Flow's node selection should still happen so
    // the visual `selected` state stays in sync with the user's intent.
    if (!data.messageId) return;
    window.dispatchEvent(
      new CustomEvent('mc:scroll-to-message', {
        detail: {
          conversationId: data.conversationId,
          messageId: data.messageId,
        },
      }),
    );
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={140}
        minHeight={56}
        lineClassName="mc-resize-line"
        handleClassName="mc-resize-handle"
      />
      <div
        className={`theme-node theme-node--${data.themeKind}${
          selected ? ' selected' : ''
        }`}
        style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
        onClick={handleClick}
        title={data.messageId ? 'Click to jump to chat' : data.title}
      >
        <NodeHandles />
        {importance > 0 ? (
          <span
            className={`theme-node-importance imp-${importance}`}
            aria-label={`Importance ${importance} of 5`}
            style={accent ? { background: accent } : undefined}
          />
        ) : null}
        {glyph ? (
          <span className="theme-node-glyph" aria-hidden="true">
            {glyph}
          </span>
        ) : null}
        <div className="theme-node-title">{data.title || '(untitled)'}</div>
        {data.summary ? (
          <div className="theme-node-summary">{data.summary}</div>
        ) : null}
      </div>
    </>
  );
}

export const ThemeNode = memo(ThemeNodeImpl);
