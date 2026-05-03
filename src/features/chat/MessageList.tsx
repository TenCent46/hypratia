import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';

/**
 * Global Shift-held listener. The chat-message Shift+drag gesture relies on
 * this so the `draggable` attribute is set declaratively (via JSX) rather
 * than imperatively in `pointerdown`; the imperative path raced against
 * React re-renders and would silently turn drag off again.
 *
 * `keyup`+`blur`+`visibilitychange` together guarantee the held flag clears
 * even if focus leaves the window mid-press.
 */
import { useStore } from '../../store';
import {
  beginMessageDrag,
  beginCrossWindowMessageDrag,
  createMessageDragImage,
  createMessageDragPayload,
  endMessageDrag,
  MIME_CROSS_WINDOW_DRAG_PAYLOAD,
  MIME_CROSS_WINDOW_DRAG_SESSION,
  MIME_MESSAGE_ID,
  MIME_MESSAGE_JSON,
} from '../canvas/dnd';
import { MarkdownRenderer } from '../../services/markdown/MarkdownRenderer';
import { confirmDangerTwice } from '../../lib/confirm';
import { ArtifactCard } from './ArtifactCard';
import {
  extractFencedBlocks,
  saveBlockAsArtifact,
  saveFencedBlocksFromMessage,
} from './saveCodeBlock';
import type { Message } from '../../types';
import {
  compressLaconicLocally,
  contentHash,
  LACONIC_PROMPT_VERSION,
  persistLaconicToSidecar,
} from '../../services/views/laconic';

export function MessageList({
  onRegenerate,
}: {
  onRegenerate: (messageId: string) => void;
}) {
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const allMessages = useStore((s) => s.messages);
  const messages = useMemo(
    () =>
      conversationId
        ? allMessages.filter((m) => m.conversationId === conversationId)
        : [],
    [allMessages, conversationId],
  );

  const ref = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const [flashId, setFlashId] = useState<string | null>(null);

  // Listen for canvas → chat jump events. The canvas dispatches
  // `mc:scroll-to-message`; we switch conversations if needed and scroll
  // the matching message into view with a brief flash.
  useEffect(() => {
    function onJump(ev: Event) {
      const detail = (ev as CustomEvent<{
        conversationId: string;
        messageId: string;
      }>).detail;
      if (!detail) return;
      const { conversationId: targetConvId, messageId } = detail;
      const performScroll = () => {
        const el = ref.current?.querySelector<HTMLElement>(
          `[data-message-id="${messageId}"]`,
        );
        if (!el) return false;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setFlashId(messageId);
        window.setTimeout(() => setFlashId(null), 1200);
        stickToBottom.current = false;
        return true;
      };
      if (targetConvId !== conversationId) {
        setActiveConversation(targetConvId);
        // Defer until the new conversation's messages mount. Two RAFs is
        // enough for React to commit and the DOM to paint.
        requestAnimationFrame(() => requestAnimationFrame(() => performScroll()));
        return;
      }
      // Same conversation: try synchronously, then on next frame as a
      // fallback (covers the case where the message was just appended).
      if (!performScroll()) {
        requestAnimationFrame(() => performScroll());
      }
    }
    window.addEventListener('mc:scroll-to-message', onJump as EventListener);
    return () => {
      window.removeEventListener(
        'mc:scroll-to-message',
        onJump as EventListener,
      );
    };
  }, [conversationId, setActiveConversation]);

  // Keep the newest content at the bottom whenever message count or streaming content changes.
  const totalLen = useMemo(
    () => messages.reduce((acc, m) => acc + m.content.length, 0),
    [messages],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, totalLen]);

  // Jump-to-latest the moment a new streaming message appears (i.e., the
  // assistant placeholder is added). This overrides `stickToBottom` for
  // that one transition: even if the user had scrolled up to read older
  // messages, when the next answer starts generating we snap to it so
  // they see the response as it streams. Subsequent text updates use
  // the regular sticky-bottom logic.
  const prevStreamingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentlyStreaming = new Set(
      messages.filter((m) => m.streaming).map((m) => m.id),
    );
    let newlyStreaming = false;
    for (const id of currentlyStreaming) {
      if (!prevStreamingRef.current.has(id)) {
        newlyStreaming = true;
        break;
      }
    }
    prevStreamingRef.current = currentlyStreaming;
    if (!newlyStreaming) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickToBottom.current = true;
  }, [messages]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
    stickToBottom.current = atBottom;
  }

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        Ask anything.
      </div>
    );
  }

  return (
    <div className="message-list" ref={ref} onScroll={onScroll}>
      {messages.map((m) => (
        <MessageRow
          key={m.id}
          message={m}
          onRegenerate={onRegenerate}
          flash={flashId === m.id}
        />
      ))}
    </div>
  );
}

// `React.memo` here is the single biggest chat performance win. The
// store mutates `messages` on every streaming chunk (see
// `appendMessageContent`); without memo, every previous message
// re-parses its markdown and re-runs highlight.js on every token. With
// memo + the message-object identity check, only the row whose
// `message` reference actually changed (= the streaming one) re-renders.
const MessageRow = memo(function MessageRow({
  message,
  onRegenerate,
  flash,
}: {
  message: Message;
  onRegenerate: (messageId: string) => void;
  flash?: boolean;
}) {
  const removeMessage = useStore((s) => s.removeMessage);
  const dragEligible = !message.streaming && message.role !== 'system';
  const rowRef = useRef<HTMLDivElement>(null);
  const [askMenu, setAskMenu] = useState<
    | { x: number; y: number; selectedText: string }
    | null
  >(null);

  // Right-click on a non-empty text selection inside this row → small
  // menu with "Ask" and "Copy". Ask routes the selection into the
  // **regular chat composer** (quoted), it does NOT open the AI
  // palette. Empty selection or right-click outside the row → fall
  // through to the OS-native menu.
  function onContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) return;
    if (!rowRef.current?.contains(sel?.anchorNode ?? null)) return;
    e.preventDefault();
    setAskMenu({ x: e.clientX, y: e.clientY, selectedText: text });
  }

  // Drag is initiated from the small grip handle in the message
  // header (`.drag-hint`), not the row itself. Putting `draggable=true`
  // on the row would make the browser favour drag over text selection
  // for any mousedown on selectable content; the handle pattern
  // sidesteps that.
  const draggable = dragEligible;

  function onDragStart(e: DragEvent<HTMLSpanElement>) {
    const payload = createMessageDragPayload(message.id);
    const crossWindowPayload = beginCrossWindowMessageDrag(message);
    const crossWindowPayloadJson = JSON.stringify(crossWindowPayload);
    beginMessageDrag(message.id);
    e.dataTransfer.setData(MIME_CROSS_WINDOW_DRAG_SESSION, crossWindowPayload.id);
    e.dataTransfer.setData(MIME_CROSS_WINDOW_DRAG_PAYLOAD, crossWindowPayloadJson);
    e.dataTransfer.setData('application/json', crossWindowPayloadJson);
    e.dataTransfer.setData(MIME_MESSAGE_ID, message.id);
    e.dataTransfer.setData(MIME_MESSAGE_JSON, payload);
    e.dataTransfer.setData('text/plain', crossWindowPayload.id);
    e.dataTransfer.effectAllowed = 'copy';
    const dragImage = createMessageDragImage({
      role: message.role,
      title: message.content.split('\n')[0]?.trim() || 'Untitled',
      content: message.content,
    });
    e.dataTransfer.setDragImage(dragImage, 18, 18);
    // The drag is initiated from the small grip handle; surface the
    // "dragging" visual treatment on the whole row so the user sees
    // which message is in flight.
    rowRef.current?.classList.add('dragging');
  }

  function onDragEnd() {
    rowRef.current?.classList.remove('dragging');
    endMessageDrag();
  }

  // Chat rows intentionally have no custom context menu: the OS-native
  // right-click (Copy / Search-with / Look-up …) is enough, and an extra
  // floating Ask menu was overlapping the native one. Ask-AI lives in the
  // markdown editor and the attachment preview instead.

  function onCopy() {
    void navigator.clipboard.writeText(message.content);
  }

  const showActions =
    !message.streaming && message.role !== 'system' && message.content.trim();
  const thinking = message.streaming && !message.content.trim();

  // Plan 51 — Laconic View. Always preserve the original content; if the
  // user asked for the laconic view, derive (or read from cache) and render
  // that instead. The derive cost is microseconds — no need to memo across
  // renders.
  const setMessagePreferredView = useStore((s) => s.setMessagePreferredView);
  const cacheMessageView = useStore((s) => s.cacheMessageView);
  const vaultPath = useStore((s) => s.settings.obsidianVaultPath);
  const isLaconic =
    message.role === 'assistant' &&
    !message.streaming &&
    message.preferredView === 'laconic';
  const displayContent = useMemo(() => {
    if (!isLaconic) return message.content;
    const hash = contentHash(message.content);
    const cached = message.views?.laconic;
    if (
      cached &&
      cached.engine === 'local' &&
      cached.promptVersion === LACONIC_PROMPT_VERSION &&
      message.contentHash === hash
    ) {
      return cached.text;
    }
    const compressed = compressLaconicLocally(message.content, 'en');
    const generatedAt = new Date().toISOString();
    cacheMessageView(
      message.id,
      'laconic',
      {
        text: compressed,
        engine: 'local',
        promptVersion: LACONIC_PROMPT_VERSION,
        generatedAt,
      },
      hash,
    );
    // Plan 51 + sidecar architecture — also persist the Laconic view to
    // `Hypratia/.hypratia/sidecars/{messageId}.json` so the compressed text
    // travels with the vault. No-op when no vault is configured.
    void persistLaconicToSidecar({
      messageId: message.id,
      conversationId: message.conversationId,
      laconic: {
        text: compressed,
        promptVersion: LACONIC_PROMPT_VERSION,
        generatedAt,
      },
      contentHash: hash,
      vaultPath,
    }).catch((err: unknown) =>
      console.warn('[laconic] sidecar persist failed', err),
    );
    return compressed;
  }, [
    isLaconic,
    message.content,
    message.contentHash,
    message.views?.laconic,
    message.id,
    message.conversationId,
    cacheMessageView,
    vaultPath,
  ]);
  const canShowViewToggle =
    message.role === 'assistant' && !message.streaming && message.content.trim();
  const hasFencedBlocks =
    message.role === 'assistant' &&
    !message.streaming &&
    extractFencedBlocks(message.content).length > 0;
  const artifactIds = message.attachmentIds ?? [];

  return (
    <div
      ref={rowRef}
      className={`message role-${message.role}${message.streaming ? ' streaming' : ''}${
        thinking ? ' thinking' : ''
      }${
        message.errored ? ' errored' : ''
      }${flash ? ' message--flash' : ''}`}
      data-message-id={message.id}
      onContextMenu={onContextMenu}
    >
      <div className="role">
        {message.role}
        {message.model ? <span className="model"> · {message.model.model}</span> : null}
        {thinking ? <span className="status">thinking</span> : null}
        {message.streaming && !thinking ? <span className="status">streaming</span> : null}
        {message.errored ? <span className="status error">error</span> : null}
        {canShowViewToggle ? (
          <span
            className="message-view-toggle"
            role="group"
            aria-label="Message view"
          >
            <button
              type="button"
              className={`message-view-btn${!isLaconic ? ' is-active' : ''}`}
              onClick={() => setMessagePreferredView(message.id, 'original')}
              title="Original (full message)"
            >
              Original
            </button>
            <button
              type="button"
              className={`message-view-btn${isLaconic ? ' is-active' : ''}`}
              onClick={() => setMessagePreferredView(message.id, 'laconic')}
              title="Laconic (verbosity removed, meaning preserved)"
            >
              Laconic
            </button>
          </span>
        ) : null}
        {/*
          Drag-handle pattern: only this grip is `draggable=true`, so
          the rest of the row stays a normal selectable region. Setting
          `draggable=true` on the entire row would make the browser
          favour drag over text selection (mousedown on text starts a
          drag with no chance to select), which is what users hit when
          we tried it row-wide.
        */}
        {draggable ? (
          <span
            className="drag-hint"
            aria-label="Drag this message to the canvas"
            title="Drag to canvas"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            ⋮⋮
          </span>
        ) : null}
      </div>
      {message.contextSummary ? (
        <details className="message-context-chip">
          <summary>
            Context: {message.contextSummary.fileCount} Markdown files,{' '}
            {message.contextSummary.edgeCount} canvas links
          </summary>
          <div>
            {message.contextSummary.fileNames.slice(0, 12).map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </details>
      ) : null}
      {message.errored ? (
        <div className="content error">
          <strong>Error:</strong> {message.errorMessage ?? 'Unknown error'}
        </div>
      ) : message.role === 'user' ? (
        <CollapsibleUserContent content={message.content} />
      ) : (
        <div className={`content${isLaconic ? ' is-laconic' : ''}`}>
          <MarkdownRenderer
            markdown={displayContent || (message.streaming ? '…' : '')}
            streaming={message.streaming}
            onSaveCodeBlock={
              message.role === 'assistant' && !message.streaming
                ? (code, language) =>
                    void saveBlockAsArtifact(
                      { code, language },
                      message.conversationId,
                      0,
                    )
                : undefined
            }
          />
        </div>
      )}
      {artifactIds.length > 0 ? (
        <div className="artifact-card-list">
          {artifactIds.map((id) => (
            <ArtifactCard
              key={id}
              attachmentId={id}
              conversationId={message.conversationId}
            />
          ))}
        </div>
      ) : null}
      {showActions ? (
        <div className="actions">
          <button type="button" onClick={onCopy} aria-label="Copy message" title="Copy">
            ⧉
          </button>
          {message.role === 'assistant' ? (
            <button
              type="button"
              onClick={() => onRegenerate(message.id)}
              aria-label="Regenerate response"
              title="Regenerate"
            >
              ↻
            </button>
          ) : null}
          {message.role === 'assistant' && !message.streaming ? (
            <>
              <button
                type="button"
                onClick={() => pinAssistantToMap(message, 'insight')}
                aria-label="Pin reply to map as insight"
                title="Pin to map → insight"
              >
                💡
              </button>
              <button
                type="button"
                onClick={() => pinAssistantToMap(message, 'decision')}
                aria-label="Pin reply to map as decision"
                title="Pin to map → decision"
              >
                ✓
              </button>
            </>
          ) : null}
          {hasFencedBlocks ? (
            <button
              type="button"
              onClick={() =>
                void saveFencedBlocksFromMessage(
                  message.content,
                  message.conversationId,
                )
              }
              aria-label="Save code block as file"
              title="Save fenced code block as file"
            >
              ⤓
            </button>
          ) : null}
          <button
            type="button"
            className="link"
            onClick={() => {
              if (
                confirmDangerTwice({
                  title: 'Delete this message?',
                  detail: 'This removes the message from the chat history.',
                  finalDetail: 'Second confirmation: permanently delete this message?',
                })
              ) {
                removeMessage(message.id);
              }
            }}
            aria-label="Delete message"
            title="Delete"
          >
            ×
          </button>
        </div>
      ) : null}
      {askMenu ? (
        <ChatSelectionAskMenu
          x={askMenu.x}
          y={askMenu.y}
          selectedText={askMenu.selectedText}
          rowRef={rowRef}
          onAsk={() => {
            // Pre-fill the chat composer with the quoted selection, then
            // focus it so the user can type their question and hit
            // Enter — same flow as a normal chat message.
            window.dispatchEvent(
              new CustomEvent('mc:chat-prefill', {
                detail: { quoted: askMenu.selectedText },
              }),
            );
            setAskMenu(null);
          }}
          onClose={() => setAskMenu(null)}
        />
      ) : null}
    </div>
  );
});

function ChatSelectionAskMenu({
  x,
  y,
  selectedText,
  rowRef,
  onAsk,
  onClose,
}: {
  x: number;
  y: number;
  selectedText: string;
  rowRef: React.RefObject<HTMLDivElement | null>;
  onAsk: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onPointer(e: globalThis.MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const preview =
    selectedText.length > 60
      ? `${selectedText.slice(0, 60)}…`
      : selectedText;
  const queryPreview = preview.replace(/\s+/g, ' ');

  function copySelection() {
    void navigator.clipboard.writeText(selectedText);
    onClose();
  }

  function selectAllInRow() {
    const row = rowRef.current;
    if (!row) {
      onClose();
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(row);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    onClose();
  }

  function searchWeb() {
    const url = `https://www.google.com/search?q=${encodeURIComponent(selectedText)}`;
    // `window.open` works in the Tauri webview and routes through the
    // OS opener for `https:` URLs.
    window.open(url, '_blank');
    onClose();
  }

  return (
    <div
      ref={ref}
      className="app-context-menu"
      role="menu"
      style={{ position: 'fixed', left: x, top: y, zIndex: 220 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="selection-menu-title" title={selectedText}>
        “{preview}”
      </div>
      <button type="button" className="app-context-menu-item" onClick={onAsk}>
        <span className="app-context-menu-label">Ask…</span>
        <span className="app-context-menu-shortcut">⏎</span>
      </button>
      <div className="app-context-menu-sep" role="separator" />
      <button
        type="button"
        className="app-context-menu-item"
        onClick={copySelection}
      >
        <span className="app-context-menu-label">Copy</span>
        <span className="app-context-menu-shortcut">⌘C</span>
      </button>
      <button
        type="button"
        className="app-context-menu-item"
        onClick={selectAllInRow}
      >
        <span className="app-context-menu-label">Select Message</span>
        <span className="app-context-menu-shortcut">⌘A</span>
      </button>
      <div className="app-context-menu-sep" role="separator" />
      <button
        type="button"
        className="app-context-menu-item"
        onClick={searchWeb}
        title={`Search the web for "${selectedText}"`}
      >
        <span className="app-context-menu-label">
          Search the Web for “{queryPreview}”
        </span>
      </button>
    </div>
  );
}

/**
 * Pin an assistant reply onto the conversation map as an `insight` or
 * `decision` node, parented under the most recent theme root in the same
 * conversation. Falls back to creating a fresh theme root if none exists.
 */
function pinAssistantToMap(
  message: Message,
  themeKind: 'insight' | 'decision',
) {
  const state = useStore.getState();
  const conversationId = message.conversationId;
  const allNodes = state.nodes;
  const themeRoots = allNodes.filter(
    (n) =>
      n.conversationId === conversationId &&
      n.kind === 'theme' &&
      (n.tags ?? []).includes('themeKind:theme'),
  );
  let themeRoot = themeRoots[themeRoots.length - 1];
  if (!themeRoot) {
    const titleSeed = message.content
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'Pinned';
    const root = state.addNode({
      conversationId,
      kind: 'theme',
      title: titleSeed,
      contentMarkdown: titleSeed,
      position: { x: 200, y: 200 },
      tags: ['themeKind:theme'],
      importance: 3,
    });
    state.updateNode(root.id, { themeId: root.id });
    themeRoot = useStore.getState().nodes.find((n) => n.id === root.id) ?? root;
  }
  const siblings = useStore
    .getState()
    .nodes.filter((n) => n.themeId === themeRoot.id);
  const lowestY = siblings.reduce(
    (acc, n) => (n.position.y > acc ? n.position.y : acc),
    themeRoot.position.y,
  );
  const summary = (
    message.content.split('\n').find((l) => l.trim().length > 0) ?? ''
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const node = state.addNode({
    conversationId,
    kind: 'theme',
    title: themeKind === 'insight' ? `💡 ${summary}` : `✓ ${summary}`,
    contentMarkdown: summary || message.content.slice(0, 80),
    sourceMessageId: message.id,
    position: { x: themeRoot.position.x, y: lowestY + 90 },
    tags: [`themeKind:${themeKind}`],
    themeId: themeRoot.id,
    importance: themeKind === 'decision' ? 4 : 3,
  });
  state.addEdge({
    sourceNodeId: themeRoot.id,
    targetNodeId: node.id,
    kind: 'parent',
  });
}

/**
 * User-typed prompts can be quite long (pasted-in articles, drafted
 * essays, multi-line briefs). Collapsing them by default keeps the
 * chat readable; clicking the bubble expands the full text. The
 * expand/collapse heuristic uses both newline count and character
 * length so a 9-line bullet list and a 1500-char wall both collapse.
 */
const COLLAPSE_LINE_THRESHOLD = 5;
const COLLAPSE_CHAR_THRESHOLD = 360;

function CollapsibleUserContent({ content }: { content: string }) {
  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const shouldCollapse =
    lineCount > COLLAPSE_LINE_THRESHOLD ||
    content.length > COLLAPSE_CHAR_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  if (!shouldCollapse) {
    return (
      <div className="content">
        <MarkdownRenderer markdown={content} />
      </div>
    );
  }
  if (expanded) {
    return (
      <div className="content user-collapsible expanded">
        <MarkdownRenderer markdown={content} />
        <button
          type="button"
          className="user-collapsible-toggle"
          onClick={() => setExpanded(false)}
        >
          Show less
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="content user-collapsible collapsed"
      onClick={() => setExpanded(true)}
      title="Click to expand"
      aria-label="Expand full message"
    >
      <MarkdownRenderer markdown={content} />
      <span className="user-collapsible-fade" aria-hidden="true" />
      <span className="user-collapsible-hint">Show more</span>
    </button>
  );
}
