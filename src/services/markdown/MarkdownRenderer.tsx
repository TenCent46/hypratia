import { createContext, memo, useContext, useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { preprocessMarkdown, safeForStreaming } from './preprocess';
import { useStore } from '../../store';
import type { CanvasSelectionMarker } from '../../types';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

type HastText = { type: 'text'; value: string };
type HastElement = {
  type: 'element';
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastChild[];
};
type HastChild = HastText | HastElement | { type: string; [key: string]: unknown };
type HastRoot = { type: 'root'; children: HastChild[] };

const MAX_TRANSCLUDE_DEPTH = 2;
const TranscludeStack = createContext<readonly string[]>([]);

const CALLOUT_RE = /^\[callout:(\w+)\]\s*(.*)$/;

function CalloutBlockquote({
  children,
}: {
  children?: ReactNode;
}) {
  const arr = Array.isArray(children) ? children : children ? [children] : [];
  const first = arr.find((c) => c) as ReactNode;
  let kind: string | null = null;
  let title: string | null = null;

  if (
    first &&
    typeof first === 'object' &&
    first !== null &&
    'props' in first
  ) {
    const props = (first as { props?: { children?: ReactNode } }).props;
    const text = extractText(props?.children);
    const m = text.match(CALLOUT_RE);
    if (m) {
      kind = m[1].toLowerCase();
      title = m[2].trim();
    }
  }

  if (kind) {
    return (
      <blockquote className={`callout callout-${kind}`}>
        {title ? <div className="callout-title">{title || kind}</div> : null}
        {arr.slice(1)}
      </blockquote>
    );
  }
  return <blockquote>{children}</blockquote>;
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children: ReactNode } }).props.children);
  }
  return '';
}

function Wikilink({ id, label }: { id: string; label: string }) {
  const node = useStore((s) => s.nodes.find((n) => n.id === id));
  const selectNode = useStore((s) => s.selectNode);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const setActiveRightTab = useStore((s) => s.setActiveRightTab);
  if (!node) {
    return <span className="wikilink broken">[[{label}]]?</span>;
  }
  return (
    <a
      className="wikilink"
      href="#"
      onClick={(e) => {
        e.preventDefault();
        setActiveConversation(node.conversationId);
        selectNode(node.id);
        setActiveRightTab('inspect');
      }}
    >
      {label || node.title || node.id}
    </a>
  );
}

function Transclusion({ id }: { id: string }) {
  const node = useStore((s) => s.nodes.find((n) => n.id === id));
  const selectNode = useStore((s) => s.selectNode);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const setActiveRightTab = useStore((s) => s.setActiveRightTab);
  const stack = useContext(TranscludeStack);
  if (!node) {
    return <div className="transclusion broken">![[ {id} ]] — not found</div>;
  }
  if (stack.includes(id)) {
    return (
      <span className="wikilink broken" title="Transclusion cycle detected">
        [[{node.title || id}]]
      </span>
    );
  }
  if (stack.length >= MAX_TRANSCLUDE_DEPTH) {
    return (
      <div className="transclusion">
        <div className="transclusion-title">↪ {node.title || node.id}</div>
        <div className="transclusion-body muted">…(depth limit)</div>
      </div>
    );
  }
  const clipped = node.contentMarkdown;
  const isLong = clipped.length > 400;
  return (
    <div className="transclusion">
      <div className="transclusion-title">
        ↪ {node.title || node.id}
        <button
          type="button"
          className="link"
          style={{ marginLeft: 6 }}
          onClick={() => {
            setActiveConversation(node.conversationId);
            selectNode(node.id);
            setActiveRightTab('inspect');
          }}
        >
          ↗ open
        </button>
      </div>
      <TranscludeStack.Provider value={[...stack, id]}>
        <div className="transclusion-body">
          <MarkdownRendererRecursive
            markdown={isLong ? `${clipped.slice(0, 400)}…` : clipped}
          />
        </div>
      </TranscludeStack.Provider>
    </div>
  );
}

function MarkdownRendererRecursive({ markdown }: { markdown: string }) {
  return <MarkdownRendererImpl markdown={markdown} />;
}

function rehypeSelectionMarkers(markers: readonly CanvasSelectionMarker[]) {
  const sorted = [...markers]
    .filter((m) => m.endOffset > m.startOffset)
    .sort((a, b) => a.startOffset - b.startOffset);
  return () => (tree: HastRoot) => {
    if (sorted.length === 0) return;
    let cursor = 0;
    const walk = (parent: HastRoot | HastElement) => {
      const next: HastChild[] = [];
      for (const child of parent.children) {
        if (child.type === 'text') {
          const text = (child as HastText).value;
          const start = cursor;
          const end = cursor + text.length;
          cursor = end;
          const overlapping = sorted.filter(
            (m) => m.endOffset > start && m.startOffset < end,
          );
          if (overlapping.length === 0) {
            next.push(child);
            continue;
          }
          let pos = start;
          for (const m of overlapping) {
            const mStart = Math.max(m.startOffset, start);
            const mEnd = Math.min(m.endOffset, end);
            if (mStart > pos) {
              next.push({
                type: 'text',
                value: text.slice(pos - start, mStart - start),
              });
            }
            next.push({
              type: 'element',
              tagName: 'mark',
              properties: {
                className: ['canvas-selection-marker'],
                'data-marker-id': m.markerId,
                'data-answer-node-id': m.answerNodeId,
                'data-source-node-id': m.sourceNodeId,
                title: m.question,
              },
              children: [
                {
                  type: 'text',
                  value: text.slice(mStart - start, mEnd - start),
                },
              ],
            });
            pos = mEnd;
          }
          if (pos < end) {
            next.push({ type: 'text', value: text.slice(pos - start) });
          }
        } else if (child.type === 'element') {
          walk(child as HastElement);
          next.push(child);
        } else {
          next.push(child);
        }
      }
      parent.children = next;
    };
    walk(tree);
  };
}

function SelectionMark({
  markerId,
  answerNodeId,
  sourceNodeId,
  title,
  children,
}: {
  markerId?: string;
  answerNodeId?: string;
  sourceNodeId?: string;
  title?: string;
  children?: ReactNode;
}) {
  const selectNode = useStore((s) => s.selectNode);
  const setCanvasSelection = useStore((s) => s.setCanvasSelection);
  const edges = useStore((s) => s.edges);
  return (
    <mark
      className="canvas-selection-marker"
      data-marker-id={markerId}
      data-answer-node-id={answerNodeId}
      data-source-node-id={sourceNodeId}
      title={title}
      onClick={(e) => {
        if (!answerNodeId) return;
        e.preventDefault();
        e.stopPropagation();
        selectNode(answerNodeId);
        setCanvasSelection(
          [answerNodeId],
          edges
            .filter(
              (edge) =>
                edge.sourceNodeId === sourceNodeId &&
                edge.targetNodeId === answerNodeId,
            )
            .map((edge) => edge.id),
        );
        window.dispatchEvent(
          new CustomEvent('mc:focus-canvas-node', {
            detail: { nodeId: answerNodeId },
          }),
        );
      }}
    >
      {children}
    </mark>
  );
}

function MarkdownRendererImpl({
  markdown,
  streaming,
  markers,
  onSaveCodeBlock,
}: {
  markdown: string;
  streaming?: boolean;
  markers?: readonly CanvasSelectionMarker[];
  /**
   * When provided, fenced code blocks render with a hover-revealed
   * "Save as file" button. Inline code is unaffected.
   */
  onSaveCodeBlock?: (code: string, language?: string) => void;
}) {
  const text = preprocessMarkdown(streaming ? safeForStreaming(markdown) : markdown);
  const rehypePlugins = useMemo(() => {
    const plugins: Parameters<typeof ReactMarkdown>[0]['rehypePlugins'] = [
      rehypeKatex,
      rehypeHighlight,
    ];
    if (markers && markers.length > 0) {
      plugins.push(rehypeSelectionMarkers(markers));
    }
    return plugins;
  }, [markers]);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={rehypePlugins}
      skipHtml
      components={{
        blockquote: CalloutBlockquote,
        mark(props) {
          const {
            children,
            'data-marker-id': markerId,
            'data-answer-node-id': answerNodeId,
            'data-source-node-id': sourceNodeId,
            title,
          } = props as {
            children?: ReactNode;
            'data-marker-id'?: string;
            'data-answer-node-id'?: string;
            'data-source-node-id'?: string;
            title?: string;
          };
          if (!markerId) return <mark {...(props as object)}>{children}</mark>;
          return (
            <SelectionMark
              markerId={markerId}
              answerNodeId={answerNodeId}
              sourceNodeId={sourceNodeId}
              title={title}
            >
              {children}
            </SelectionMark>
          );
        },
        a({ href, children, ...rest }) {
          if (href && href.startsWith('mc:wikilink/')) {
            const id = decodeURIComponent(href.slice('mc:wikilink/'.length));
            const label = extractText(children);
            return <Wikilink id={id} label={label} />;
          }
          if (href && href.startsWith('mc:transclude/')) {
            const id = decodeURIComponent(href.slice('mc:transclude/'.length));
            return <Transclusion id={id} />;
          }
          const isExternal = !!href && /^https?:\/\//.test(href);
          return (
            <a
              href={href}
              {...rest}
              target={isExternal ? '_blank' : undefined}
              rel={isExternal ? 'noreferrer noopener' : undefined}
            >
              {children}
            </a>
          );
        },
        pre(props) {
          if (!onSaveCodeBlock) {
            return <pre {...(props as object)} />;
          }
          return <CodeBlockWithSave {...props} onSave={onSaveCodeBlock} />;
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function CodeBlockWithSave({
  children,
  onSave,
  ...rest
}: {
  children?: ReactNode;
  onSave: (code: string, language?: string) => void;
}) {
  const { code, language } = extractCodeBlock(children);
  return (
    <div className="md-codeblock-wrap">
      <pre {...(rest as object)}>{children}</pre>
      {code ? (
        <button
          type="button"
          className="md-codeblock-save"
          title="Save this code block as a file"
          onClick={() => onSave(code, language)}
        >
          ⤓ Save
        </button>
      ) : null}
    </div>
  );
}

function extractCodeBlock(children: ReactNode): {
  code: string;
  language?: string;
} {
  // ReactMarkdown wraps fenced blocks as <pre><code class="language-xx">...</code></pre>
  const arr = Array.isArray(children) ? children : [children];
  for (const child of arr) {
    if (
      child &&
      typeof child === 'object' &&
      'props' in child &&
      (child as { props?: { className?: string; children?: ReactNode } })
        .props
    ) {
      const props = (child as { props: { className?: string; children?: ReactNode } })
        .props;
      const className = props.className ?? '';
      const match = /language-([\w+#-]+)/.exec(className);
      const language = match ? match[1] : undefined;
      const code = extractText(props.children);
      return { code, language };
    }
  }
  return { code: extractText(children) };
}

export const MarkdownRenderer = memo(MarkdownRendererImpl);
