import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from 'react';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ViewModeToggle } from './components/ViewModeToggle/ViewModeToggle';
import { CanvasPanel } from './features/canvas/CanvasPanel';
import { TreePanel } from './features/tree-view/TreePanel';
import { MarkdownDocumentEditor } from './features/knowledge/MarkdownDocumentEditor';
import { AttachmentPreview } from './features/preview/AttachmentPreview';
import { KnowledgeFilePreview } from './features/preview/KnowledgeFilePreview';
import { resolveCitation } from './services/knowledge/citationNavigation';
import { RightPane } from './components/RightPane/RightPane';
import {
  PanesContextMenu,
  type PaneMenuControl,
} from './components/PanesContextMenu/PanesContextMenu';
import { SettingsModal } from './components/SettingsModal/SettingsModal';
import { SearchPalette } from './features/search/SearchPalette';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { ShortcutsModal } from './components/CommandPalette/ShortcutsModal';
import { QuickCapture } from './components/QuickCapture/QuickCapture';
import { AIPalette } from './features/ai-palette/AIPalette';
import { GraphImportModal } from './features/graph-import/GraphImportModal';
import { WorkspaceConfigModal } from './features/workspace-config/WorkspaceConfigModal';
import { PdfViewer } from './features/pdf/PdfViewer';
import { Onboarding } from './components/Onboarding/Onboarding';
import { hydrateAndWire } from './store/persistence';
import { useStore } from './store';
import { CANVAS_FONT_SIZE_DEFAULT } from './types';
import { useKeymap } from './services/commands/useKeymap';
import { useMenu, type LayoutControls } from './services/commands/useMenu';
import { setMenuCheck } from './services/menu';
import {
  getInitialLayoutPreset,
  getInitialMarkdownPath,
  getInitialTabId,
  onWindowLifecycle,
  openCanvasWorkspaceWindow,
  openChatWindow,
  openMarkdownEditorWindow,
} from './services/window';
import './App.css';

type PanelState = 'shown' | 'hidden';
type PaneId = 'sidebar' | 'markdown' | 'canvas' | 'right';
/**
 * Open documents in the workspace pane. The `preview` flag follows
 * VSCode's preview-tab convention:
 *   - A single click in the file explorer opens the file as a preview
 *     tab (italic title). The previous preview tab is replaced — only
 *     one preview slot exists at a time.
 *   - Editing the file does NOT promote the tab; it stays in preview.
 *   - Double-clicking the tab title promotes it to permanent (the
 *     italic clears and the tab is no longer auto-closed).
 */
type WorkspaceDocTab =
  | { id: string; kind: 'markdown'; path: string; preview?: boolean }
  | {
      id: string;
      kind: 'knowledge-file';
      path: string;
      preview?: boolean;
      /** Citation jump target — KnowledgeFilePreview scrolls a PDF to
       *  pageStart and keeps sentence offsets for future highlighting. */
      pageStart?: number;
      sentenceStart?: number;
      sentenceEnd?: number;
    }
  | {
      id: string;
      kind: 'attachment';
      attachmentId: string;
      title?: string;
      preview?: boolean;
    };

const PANE_MIN: Record<PaneId, number> = {
  sidebar: 180,
  markdown: 320,
  canvas: 320,
  right: 300,
};

const PANE_DEFAULT: Record<PaneId, number> = {
  sidebar: 260,
  markdown: 520,
  canvas: 720,
  right: 420,
};

function markdownTabId(path: string): string {
  return `md:${path}`;
}

function knowledgeFileTabId(path: string): string {
  return `kb:${path}`;
}

function attachmentTabId(attachmentId: string): string {
  return `att:${attachmentId}`;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path || 'Untitled';
}

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useStore((s) => s.settings.theme);
  const canvasFontSize = useStore((s) => s.settings.canvasFontSize);

  useEffect(() => {
    console.info('[mc:loading] App splash — hydrateAndWire start');
    hydrateAndWire()
      .then(() => {
        const tabId = getInitialTabId();
        if (tabId) {
          const s = useStore.getState();
          if (s.conversations.some((c) => c.id === tabId)) {
            s.setActiveConversation(tabId);
          }
        }
        console.info('[mc:loading] App splash — hydrate done, setReady(true)');
        setReady(true);
      })
      .catch((err) => {
        console.error('[mc:loading] App splash — hydration failed', err);
        setError(String(err));
      });
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onWindowLifecycle((e) => {
      console.debug('[window-lifecycle]', e);
    })
      .then((u) => {
        unlisten = u;
      })
      .catch((err) => console.warn('window-lifecycle subscribe failed', err));
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme ?? 'light');
  }, [theme]);

  useEffect(() => {
    const px = canvasFontSize ?? CANVAS_FONT_SIZE_DEFAULT;
    document.documentElement.style.setProperty(
      '--canvas-font-size',
      `${px}px`,
    );
  }, [canvasFontSize]);

  if (error) return <div className="splash error">Failed to load: {error}</div>;
  if (!ready) return <div className="splash">Loading…</div>;
  // Detached tree window: render only the read-only tree projection.
  // Skip the full ReadyApp shell since the tree view never needs a
  // sidebar / chat / editor pane around it. See spec 36.
  if (getInitialLayoutPreset() === 'treeFocused') {
    return <TreeWindowShell />;
  }
  return <ReadyApp />;
}

function TreeWindowShell() {
  return (
    <div className="app workspace-window tree-window-root">
      <TreePanel />
    </div>
  );
}

function ReadyApp() {
  useKeymap();
  const sidebarCollapsedForMenu = useStore((s) => s.ui.sidebarCollapsed);
  const initialLayoutPreset = useMemo(() => getInitialLayoutPreset(), []);
  const initialMarkdownPath = useMemo(() => getInitialMarkdownPath(), []);
  const attachmentsList = useStore((s) => s.attachments);
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceDocTab[]>(() =>
    initialMarkdownPath
      ? [
          {
            id: markdownTabId(initialMarkdownPath),
            kind: 'markdown',
            path: initialMarkdownPath,
          },
        ]
      : [],
  );
  const [activeWorkspaceTabId, setActiveWorkspaceTabId] = useState<string | null>(
    () => (initialMarkdownPath ? markdownTabId(initialMarkdownPath) : null),
  );
  const [paneWidths, setPaneWidths] =
    useState<Record<PaneId, number>>(PANE_DEFAULT);
  const [layoutMenu, setLayoutMenu] = useState<{ x: number; y: number } | null>(
    null,
  );

  const activeWorkspaceTab = useMemo(() => {
    if (!workspaceTabs.length) return null;
    return (
      workspaceTabs.find((tab) => tab.id === activeWorkspaceTabId) ??
      workspaceTabs[0]
    );
  }, [activeWorkspaceTabId, workspaceTabs]);
  const activeMarkdownPath =
    activeWorkspaceTab?.kind === 'markdown' ? activeWorkspaceTab.path : null;
  const hasWorkspaceTabs = workspaceTabs.length > 0;
  const attachmentNameById = useMemo(
    () => new Map(attachmentsList.map((att) => [att.id, att.filename])),
    [attachmentsList],
  );

  const conversationId = useStore((s) => s.settings.lastConversationId);
  const createConversation = useStore((s) => s.createConversation);
  const setActiveConversation = useStore((s) => s.setActiveConversation);

  const ensureConversation = useCallback(() => {
    const existing = useStore.getState().settings.lastConversationId;
    if (existing) return existing;
    const id = createConversation('Untitled');
    setActiveConversation(id);
    return id;
  }, [createConversation, setActiveConversation]);

  const [chatPanelState, setChatPanelStateRaw] = useState<PanelState>(() =>
    initialMarkdownPath
      ? 'shown'
      : initialLayoutPreset === 'canvasFocused'
        ? 'hidden'
        : 'shown',
  );
  const [canvasPanelState, setCanvasPanelStateRaw] = useState<PanelState>(() =>
    initialMarkdownPath
      ? 'shown'
      : initialLayoutPreset === 'chatFocused'
        ? 'hidden'
        : 'shown',
  );
  const [sidebarPanelState, setSidebarPanelStateRaw] = useState<PanelState>(() =>
    sidebarCollapsedForMenu ? 'hidden' : 'shown',
  );
  const [markdownPanelState, setMarkdownPanelState] = useState<PanelState>(() =>
    initialMarkdownPath ? 'shown' : 'hidden',
  );

  const focusOrAddWorkspaceTab = useCallback(
    (tab: WorkspaceDocTab, opts?: { preview?: boolean }) => {
      const preview = opts?.preview ?? false;
      console.debug('[mc:cite] focusOrAddWorkspaceTab', {
        id: tab.id,
        kind: tab.kind,
        preview,
        ...(tab.kind === 'knowledge-file'
          ? {
              path: tab.path,
              pageStart: tab.pageStart,
              sentenceStart: tab.sentenceStart,
            }
          : {}),
      });
      setWorkspaceTabs((tabs) => {
        if (tabs.some((existing) => existing.id === tab.id)) {
          // Re-clicking an already-open tab focuses it without changing
          // its preview state. Two metadata refreshes are allowed:
          //   - attachment titles (existing behaviour)
          //   - knowledge-file citation jump targets, so clicking a
          //     citation for page 5 then one for page 12 of the same
          //     file actually scrolls to page 12 instead of silently
          //     keeping the old jump target.
          return tabs.map((existing) => {
            if (existing.id !== tab.id) return existing;
            if (
              existing.kind === 'attachment' &&
              tab.kind === 'attachment' &&
              tab.title &&
              existing.title !== tab.title
            ) {
              return { ...existing, title: tab.title };
            }
            if (existing.kind === 'knowledge-file' && tab.kind === 'knowledge-file') {
              return {
                ...existing,
                pageStart: tab.pageStart,
                sentenceStart: tab.sentenceStart,
                sentenceEnd: tab.sentenceEnd,
              };
            }
            return existing;
          });
        }
        // New preview tab evicts whatever is currently in the preview
        // slot. Permanent tabs are left alone.
        const baseTabs = preview ? tabs.filter((t) => !t.preview) : tabs;
        return [...baseTabs, { ...tab, preview }];
      });
      setActiveWorkspaceTabId(tab.id);
      setMarkdownPanelState('shown');
    },
    [],
  );

  const promoteWorkspaceTab = useCallback((tabId: string) => {
    setWorkspaceTabs((tabs) =>
      tabs.map((tab) =>
        tab.id === tabId && tab.preview ? { ...tab, preview: false } : tab,
      ),
    );
  }, []);

  const closeWorkspaceTab = useCallback(
    (tabId: string) => {
      const index = workspaceTabs.findIndex((tab) => tab.id === tabId);
      if (index < 0) return;
      const nextTabs = workspaceTabs.filter((tab) => tab.id !== tabId);
      setWorkspaceTabs(nextTabs);
      if (!nextTabs.length) {
        setActiveWorkspaceTabId(null);
        setMarkdownPanelState('hidden');
        return;
      }
      if (
        activeWorkspaceTabId === tabId ||
        !nextTabs.some((tab) => tab.id === activeWorkspaceTabId)
      ) {
        setActiveWorkspaceTabId(
          nextTabs[Math.min(index, nextTabs.length - 1)]?.id ?? nextTabs[0].id,
        );
      }
    },
    [activeWorkspaceTabId, workspaceTabs],
  );

  const closeActiveWorkspaceTab = useCallback(() => {
    if (activeWorkspaceTab) closeWorkspaceTab(activeWorkspaceTab.id);
  }, [activeWorkspaceTab, closeWorkspaceTab]);

  const setSidebarPanelState = useCallback((state: PanelState) => {
    setSidebarPanelStateRaw(state);
    useStore.getState().setSidebarCollapsed(state !== 'shown');
  }, []);

  useEffect(() => {
    if (initialLayoutPreset === 'main' || initialMarkdownPath) return;
    const timer = window.setTimeout(() => setSidebarPanelState('hidden'), 0);
    return () => window.clearTimeout(timer);
  }, [initialLayoutPreset, initialMarkdownPath, setSidebarPanelState]);

  const setChatPanelState = useCallback((state: PanelState) => {
    setChatPanelStateRaw(state);
  }, []);
  const setCanvasPanelState = useCallback((state: PanelState) => {
    setCanvasPanelStateRaw(state);
  }, []);

  const showCanvas = useCallback(
    () => setCanvasPanelState('shown'),
    [setCanvasPanelState],
  );
  const hideCanvas = useCallback(
    () => setCanvasPanelState('hidden'),
    [setCanvasPanelState],
  );
  const toggleCanvas = useCallback(() => {
    setCanvasPanelState(canvasPanelState === 'shown' ? 'hidden' : 'shown');
  }, [canvasPanelState, setCanvasPanelState]);

  const showChat = useCallback(() => setChatPanelState('shown'), [setChatPanelState]);
  const hideChat = useCallback(() => setChatPanelState('hidden'), [setChatPanelState]);
  const toggleChat = useCallback(() => {
    setChatPanelState(chatPanelState === 'shown' ? 'hidden' : 'shown');
  }, [chatPanelState, setChatPanelState]);

  const showSidebar = useCallback(
    () => setSidebarPanelState('shown'),
    [setSidebarPanelState],
  );
  const hideSidebar = useCallback(
    () => setSidebarPanelState('hidden'),
    [setSidebarPanelState],
  );
  const toggleSidebar = useCallback(() => {
    setSidebarPanelState(sidebarPanelState === 'shown' ? 'hidden' : 'shown');
  }, [setSidebarPanelState, sidebarPanelState]);

  const showMarkdown = useCallback(() => {
    if (hasWorkspaceTabs) setMarkdownPanelState('shown');
  }, [hasWorkspaceTabs]);
  const hideMarkdown = useCallback(() => setMarkdownPanelState('hidden'), []);
  const toggleMarkdown = useCallback(() => {
    if (!hasWorkspaceTabs) return;
    setMarkdownPanelState((state) => (state === 'shown' ? 'hidden' : 'shown'));
  }, [hasWorkspaceTabs]);

  const showAllPanels = useCallback(() => {
    showSidebar();
    showCanvas();
    showChat();
    if (hasWorkspaceTabs) setMarkdownPanelState('shown');
  }, [hasWorkspaceTabs, showCanvas, showChat, showSidebar]);

  const openNewChatWindow = useCallback(() => {
    void openChatWindow(ensureConversation());
  }, [ensureConversation]);
  const openNewCanvasWindow = useCallback(() => {
    void openCanvasWorkspaceWindow(ensureConversation());
  }, [ensureConversation]);
  const openCurrentMarkdownWindow = useCallback(() => {
    if (activeWorkspaceTab?.kind !== 'markdown') return;
    void openMarkdownEditorWindow(
      activeWorkspaceTab.path,
      conversationId ?? ensureConversation(),
    );
  }, [activeWorkspaceTab, conversationId, ensureConversation]);
  const toggleChatTabsAutoHide = useCallback(() => {
    const cur = useStore.getState().settings.chatTabsAutoHide ?? false;
    useStore.getState().setChatTabsAutoHide(!cur);
  }, []);

  const openMarkdownFile = useCallback(
    (path: string) => {
      if (!path) {
        setWorkspaceTabs([]);
        setActiveWorkspaceTabId(null);
        setMarkdownPanelState('hidden');
        return;
      }
      // Single-click opens as preview. Double-click on the tab title
      // (handled in the tab UI) promotes it.
      focusOrAddWorkspaceTab(
        {
          id: markdownTabId(path),
          kind: 'markdown',
          path,
        },
        { preview: true },
      );
    },
    [focusOrAddWorkspaceTab],
  );

  const openAttachmentPreview = useCallback(
    (attachmentId: string, title?: string) => {
      focusOrAddWorkspaceTab(
        {
          id: attachmentTabId(attachmentId),
          kind: 'attachment',
          attachmentId,
          title,
        },
        { preview: true },
      );
    },
    [focusOrAddWorkspaceTab],
  );

  const openKnowledgeFilePreview = useCallback(
    (
      path: string,
      jump?: {
        pageStart?: number;
        sentenceStart?: number;
        sentenceEnd?: number;
        debugId?: string;
      },
    ) => {
      console.info('[mc:pdf-link] 07 openKnowledgeFilePreview()', {
        debugId: jump?.debugId,
        path,
        pageStart: jump?.pageStart,
        sentenceStart: jump?.sentenceStart,
        sentenceEnd: jump?.sentenceEnd,
      });
      focusOrAddWorkspaceTab(
        {
          id: knowledgeFileTabId(path),
          kind: 'knowledge-file',
          path,
          pageStart: jump?.pageStart,
          sentenceStart: jump?.sentenceStart,
          sentenceEnd: jump?.sentenceEnd,
        },
        { preview: true },
      );
    },
    [focusOrAddWorkspaceTab],
  );

  const returnToCanvas = useCallback(() => {
    setMarkdownPanelState('hidden');
    showCanvas();
  }, [showCanvas]);

  const focusCanvasPane = useCallback(() => {
    showCanvas();
    hideChat();
  }, [hideChat, showCanvas]);
  const focusChatPane = useCallback(() => {
    showChat();
    hideCanvas();
  }, [hideCanvas, showChat]);

  const layoutControls: LayoutControls = useMemo(
    () => ({
      showCanvas,
      hideCanvas,
      showChat,
      hideChat,
      showAllPanels,
      focusCanvasPane,
      focusChatPane,
      showSidebar,
      hideSidebar,
      showMarkdown,
      hideMarkdown,
    }),
    [
      showCanvas,
      hideCanvas,
      showChat,
      hideChat,
      showAllPanels,
      focusCanvasPane,
      focusChatPane,
      showSidebar,
      hideSidebar,
      showMarkdown,
      hideMarkdown,
    ],
  );
  useMenu(layoutControls);

  const chatTabsAutoHide = useStore(
    (s) => s.settings.chatTabsAutoHide ?? false,
  );
  const markdownAutoSave = useStore(
    (s) => s.settings.markdownAutoSave ?? true,
  );
  useEffect(() => {
    void setMenuCheck('file:toggle-auto-save', markdownAutoSave);
    void setMenuCheck('view:show-chat', chatPanelState === 'shown');
    void setMenuCheck('view:show-canvas', canvasPanelState === 'shown');
    void setMenuCheck('view:show-sidebar', sidebarPanelState === 'shown');
    void setMenuCheck('view:toggle-tabs-autohide', chatTabsAutoHide);
  }, [
    chatPanelState,
    canvasPanelState,
    sidebarPanelState,
    chatTabsAutoHide,
    markdownAutoSave,
  ]);

  useEffect(() => {
    function onPanelDetached(e: Event) {
      const panel = (e as CustomEvent<{ panel?: string }>).detail?.panel;
      if (panel === 'chat') hideChat();
      if (panel === 'canvas') hideCanvas();
      if (panel === 'markdown') hideMarkdown();
    }
    function onLayoutAction(e: Event) {
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      if (action === 'show-chat') showChat();
      if (action === 'hide-chat') hideChat();
      if (action === 'toggle-chat') toggleChat();
      if (action === 'show-canvas') showCanvas();
      if (action === 'hide-canvas') hideCanvas();
      if (action === 'toggle-canvas') toggleCanvas();
      if (action === 'return-to-canvas') returnToCanvas();
      if (action === 'show-sidebar') showSidebar();
      if (action === 'hide-sidebar') hideSidebar();
      if (action === 'toggle-sidebar') toggleSidebar();
      if (action === 'show-markdown') showMarkdown();
      if (action === 'hide-markdown') hideMarkdown();
      if (action === 'toggle-markdown') toggleMarkdown();
      if (action === 'show-all-panels') showAllPanels();
      if (action === 'open-chat-window') openNewChatWindow();
      if (action === 'open-canvas-window') openNewCanvasWindow();
      if (action === 'toggle-tabs-autohide') toggleChatTabsAutoHide();
    }
    window.addEventListener('mc:panel-detached', onPanelDetached);
    window.addEventListener('mc:layout-action', onLayoutAction);
    return () => {
      window.removeEventListener('mc:panel-detached', onPanelDetached);
      window.removeEventListener('mc:layout-action', onLayoutAction);
    };
  }, [
    hideCanvas,
    hideChat,
    hideMarkdown,
    hideSidebar,
    openNewCanvasWindow,
    openNewChatWindow,
    returnToCanvas,
    showAllPanels,
    showCanvas,
    showChat,
    showMarkdown,
    showSidebar,
    toggleCanvas,
    toggleChat,
    toggleChatTabsAutoHide,
    toggleMarkdown,
    toggleSidebar,
  ]);

  useEffect(() => {
    function onOpenMarkdownFile(e: Event) {
      const path = (e as CustomEvent<{ path?: string }>).detail?.path;
      if (path !== undefined) openMarkdownFile(path);
    }
    window.addEventListener('mc:open-markdown-file', onOpenMarkdownFile);
    return () =>
      window.removeEventListener('mc:open-markdown-file', onOpenMarkdownFile);
  }, [openMarkdownFile]);

  useEffect(() => {
    function onOpenAttachmentPreview(e: Event) {
      const detail = (e as CustomEvent<{ attachmentId?: string; title?: string }>)
        .detail;
      if (detail?.attachmentId) {
        openAttachmentPreview(detail.attachmentId, detail.title);
      }
    }
    window.addEventListener(
      'mc:open-attachment-preview',
      onOpenAttachmentPreview,
    );
    return () =>
      window.removeEventListener(
        'mc:open-attachment-preview',
        onOpenAttachmentPreview,
      );
  }, [openAttachmentPreview]);

  useEffect(() => {
    function onOpenKnowledgeFilePreview(e: Event) {
      const detail = (e as CustomEvent<{ path?: string; debugId?: string }>)
        .detail;
      console.info('[mc:pdf-link] 04 App received direct preview event', detail);
      if (detail?.path) {
        openKnowledgeFilePreview(detail.path, { debugId: detail.debugId });
      }
    }
    function onOpenKnowledgeCitation(e: Event) {
      const detail = (e as CustomEvent<{
        filename?: string;
        pageStart?: number;
        sentenceStart?: number;
        sentenceEnd?: number;
        debugId?: string;
      }>).detail;
      console.info('[mc:pdf-link] 04 App received citation event', detail);
      console.info('[mc:cite] event received in App', detail);
      if (!detail?.filename) {
        console.warn('[mc:pdf-link] 04b citation event missing filename', detail);
        return;
      }
      void (async () => {
        try {
          console.info('[mc:pdf-link] 05 resolveCitation call', {
            debugId: detail.debugId,
            filename: detail.filename,
            pageStart: detail.pageStart,
            sentenceStart: detail.sentenceStart,
            sentenceEnd: detail.sentenceEnd,
          });
          const resolved = await resolveCitation({
            filename: detail.filename!,
            pageStart: detail.pageStart,
            sentenceStart: detail.sentenceStart,
            sentenceEnd: detail.sentenceEnd,
            debugId: detail.debugId,
          });
          if (!resolved) {
            console.warn('[mc:pdf-link] 06 resolveCitation returned null', detail);
            // Surface the failure via the existing knowledge sync toast
            // channel so the user sees feedback even when devtools is
            // closed. If the KB panel isn't mounted, the warn above is
            // the only signal — that's fine, this is best-effort.
            window.dispatchEvent(
              new CustomEvent('mc:knowledge-sync', {
                detail: {
                  error: `Citation source "${detail.filename}" not found in any indexed project. Open Project Settings → Files and confirm it was added & indexed.`,
                },
              }),
            );
            return;
          }
          console.debug('[mc:cite] opening preview tab', {
            sourcePath: resolved.sourcePath,
            pageStart: resolved.pageStart,
            status: resolved.status,
          });
          console.info('[mc:pdf-link] 06 resolveCitation matched', {
            debugId: detail.debugId,
            sourcePath: resolved.sourcePath,
            pageStart: resolved.pageStart,
            pageEnd: resolved.pageEnd,
            sentenceStart: resolved.sentenceStart,
            sentenceEnd: resolved.sentenceEnd,
            status: resolved.status,
            error: resolved.error,
          });
          openKnowledgeFilePreview(resolved.sourcePath, {
            pageStart: resolved.pageStart,
            sentenceStart: resolved.sentenceStart,
            sentenceEnd: resolved.sentenceEnd,
            debugId: detail.debugId,
          });
        } catch (err) {
          console.error('[mc:pdf-link] 06b resolveCitation threw', {
            debugId: detail.debugId,
            err,
            detail,
          });
          window.dispatchEvent(
            new CustomEvent('mc:knowledge-sync', {
              detail: {
                error: `Citation lookup failed: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              },
            }),
          );
        }
      })();
    }
    window.addEventListener(
      'mc:open-knowledge-file-preview',
      onOpenKnowledgeFilePreview,
    );
    window.addEventListener(
      'mc:open-knowledge-citation',
      onOpenKnowledgeCitation,
    );
    return () => {
      window.removeEventListener(
        'mc:open-knowledge-file-preview',
        onOpenKnowledgeFilePreview,
      );
      window.removeEventListener(
        'mc:open-knowledge-citation',
        onOpenKnowledgeCitation,
      );
    };
  }, [openKnowledgeFilePreview]);

  const visiblePanes = useMemo<PaneId[]>(() => {
    const panes: PaneId[] = [];
    if (sidebarPanelState === 'shown') panes.push('sidebar');
    if (canvasPanelState === 'shown') panes.push('canvas');
    if (hasWorkspaceTabs && markdownPanelState === 'shown') panes.push('markdown');
    if (chatPanelState === 'shown') panes.push('right');
    return panes.length ? panes : ['canvas'];
  }, [
    canvasPanelState,
    chatPanelState,
    hasWorkspaceTabs,
    markdownPanelState,
    sidebarPanelState,
  ]);

  const primaryPane = useMemo<PaneId>(() => {
    if (visiblePanes.includes('canvas')) return 'canvas';
    if (visiblePanes.includes('markdown')) return 'markdown';
    if (visiblePanes.includes('right')) return 'right';
    return 'sidebar';
  }, [visiblePanes]);

  const workspaceColumns = useMemo(() => {
    return visiblePanes
      .flatMap((pane, index) => {
        const column =
          pane === primaryPane
            ? `minmax(${PANE_MIN[pane]}px, 1fr)`
            : `${paneWidths[pane]}px`;
        return index === visiblePanes.length - 1 ? [column] : [column, '10px'];
      })
      .join(' ');
  }, [paneWidths, primaryPane, visiblePanes]);

  // Pane splitter drag: keep one active window-level session, and clamp the
  // delta before writing widths so the 1fr pane cannot absorb overflow and
  // make a different boundary appear to move.
  type DragSession = {
    id: number;
    pointerId: number;
    left: PaneId;
    right: PaneId;
    primaryPane: PaneId;
    startX: number;
    startLeft: number;
    startRight: number;
    minDelta: number;
    maxDelta: number;
    splitter: HTMLDivElement;
    ctrl: AbortController;
  };
  const dragRef = useRef<DragSession | null>(null);
  const dragSeqRef = useRef(0);

  const endDragSession = useCallback(() => {
    const s = dragRef.current;
    if (!s) return;
    s.ctrl.abort();
    s.splitter.classList.remove('dragging');
    dragRef.current = null;
  }, []);

  function onPaneSplitterPointerDown(
    e: PointerEvent<HTMLDivElement>,
    left: PaneId,
    right: PaneId,
  ) {
    // Only the primary (left) mouse button starts a drag. Right-click /
    // middle-click MUST fall through so the workspace's `onContextMenu`
    // fires and shows the show/hide PanesContextMenu — calling
    // `preventDefault()` on a non-primary pointerdown suppresses the
    // contextmenu event in WebKit and was breaking that flow.
    if (e.button !== 0) return;
    e.preventDefault();
    // Ensure only one drag session is ever live.
    endDragSession();

    const sessionId = ++dragSeqRef.current;
    const splitter = e.currentTarget;
    const leftSlot = splitter.previousElementSibling as HTMLElement | null;
    const rightSlot = splitter.nextElementSibling as HTMLElement | null;
    const leftActual = leftSlot?.getBoundingClientRect().width ?? paneWidths[left];
    const rightActual = rightSlot?.getBoundingClientRect().width ?? paneWidths[right];
    const startLeft = left === primaryPane ? leftActual : paneWidths[left];
    const startRight = right === primaryPane ? rightActual : paneWidths[right];
    const minDelta = PANE_MIN[left] - leftActual;
    const maxDelta = rightActual - PANE_MIN[right];
    splitter.classList.add('dragging');
    const ctrl = new AbortController();
    const session: DragSession = {
      id: sessionId,
      pointerId: e.pointerId,
      left,
      right,
      primaryPane,
      startX: e.clientX,
      startLeft,
      startRight,
      minDelta,
      maxDelta,
      splitter,
      ctrl,
    };
    dragRef.current = session;

    function activeSession(): DragSession | null {
      const s = dragRef.current;
      if (!s || s.id !== sessionId) return null;
      return s;
    }

    function onMove(ev: globalThis.PointerEvent) {
      const s = activeSession();
      if (!s) return;
      if (ev.pointerId !== s.pointerId) return;
      const rawDelta = ev.clientX - s.startX;
      const delta = Math.max(s.minDelta, Math.min(s.maxDelta, rawDelta));
      setPaneWidths((current) => {
        if (s.left === s.primaryPane && s.right !== s.primaryPane) {
          return {
            ...current,
            [s.right]: Math.max(PANE_MIN[s.right], s.startRight - delta),
          };
        }
        if (s.right === s.primaryPane && s.left !== s.primaryPane) {
          return {
            ...current,
            [s.left]: Math.max(PANE_MIN[s.left], s.startLeft + delta),
          };
        }
        return {
          ...current,
          [s.left]: Math.max(PANE_MIN[s.left], s.startLeft + delta),
          [s.right]: Math.max(PANE_MIN[s.right], s.startRight - delta),
        };
      });
    }

    function onEnd(ev: globalThis.PointerEvent | Event) {
      const s = activeSession();
      if (!s) return;
      if (
        'pointerId' in ev &&
        typeof ev.pointerId === 'number' &&
        ev.pointerId !== s.pointerId
      ) {
        return;
      }
      endDragSession();
    }

    const signal = ctrl.signal;
    // Use window listeners so the cursor leaving the splitter doesn't
    // pause the drag. The session ref guards against cross-talk.
    window.addEventListener('pointermove', onMove, { signal });
    window.addEventListener('pointerup', onEnd as EventListener, { signal });
    window.addEventListener(
      'pointercancel',
      onEnd as EventListener,
      { signal },
    );
    // Defensive: if the window loses focus / visibility mid-drag, the
    // OS may swallow the eventual pointerup. End the drag so the next
    // pointerdown starts cleanly.
    window.addEventListener('blur', onEnd as EventListener, { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) onEnd(new Event('visibilitychange'));
      },
      { signal },
    );
  }

  // Belt-and-suspenders: when this component unmounts (e.g., HMR) clean
  // up any in-flight drag so its listeners don't outlive the React tree.
  useEffect(() => {
    return () => {
      endDragSession();
    };
  }, [endDragSession]);

  function onWorkspaceContextMenu(e: ReactMouseEvent<HTMLDivElement>) {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        'input, textarea, button, select, [contenteditable="true"], .cm-editor, .editor-context-menu, .node-context-menu',
      )
    ) {
      return;
    }
    e.preventDefault();
    setLayoutMenu({ x: e.clientX, y: e.clientY });
  }

  const workspaceTabLabel = useCallback(
    (tab: WorkspaceDocTab) =>
      tab.kind === 'markdown'
        ? fileNameFromPath(tab.path)
        : tab.kind === 'knowledge-file'
          ? fileNameFromPath(tab.path)
          : tab.title ?? attachmentNameById.get(tab.attachmentId) ?? 'Preview',
    [attachmentNameById],
  );

  const renderPane = (pane: PaneId) => {
    if (pane === 'sidebar') {
      return (
        <section className="workspace-pane sidebar-pane" data-pane="sidebar">
          <Sidebar
            forceExpanded
            sidebarPanelState={sidebarPanelState}
            onShowSidebar={showSidebar}
            onHideSidebar={hideSidebar}
            activeMarkdownPath={activeMarkdownPath}
            onOpenMarkdownFile={openMarkdownFile}
          />
        </section>
      );
    }
    if (pane === 'markdown') {
      return (
        <section className="workspace-pane markdown-pane" data-pane="markdown">
          {activeWorkspaceTab ? (
            <div className="document-workspace">
              <div
                className="document-tab-strip"
                role="tablist"
                aria-label="Open documents"
              >
                {workspaceTabs.map((tab) => {
                  const active = tab.id === activeWorkspaceTab.id;
                  const isPreview = tab.preview === true;
                  return (
                    <div
                      key={tab.id}
                      className={`document-tab${active ? ' active' : ''}${
                        isPreview ? ' preview' : ''
                      }`}
                      role="presentation"
                    >
                      <button
                        type="button"
                        className="document-tab-pick"
                        role="tab"
                        aria-selected={active}
                        title={
                          isPreview
                            ? `${workspaceTabLabel(tab)} — preview (double-click to keep open)`
                            : workspaceTabLabel(tab)
                        }
                        onClick={() => setActiveWorkspaceTabId(tab.id)}
                        onDoubleClick={() => promoteWorkspaceTab(tab.id)}
                      >
                        <span className="document-tab-kind">
                          {tab.kind === 'markdown' ? 'MD' : 'FILE'}
                        </span>
                        <span className="document-tab-title">
                          {workspaceTabLabel(tab)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="document-tab-close"
                        aria-label={`Close ${workspaceTabLabel(tab)}`}
                        title="Close tab"
                        onClick={() => closeWorkspaceTab(tab.id)}
                      >
                        x
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="document-tab-content">
                {activeWorkspaceTab.kind === 'markdown' ? (
                  <MarkdownDocumentEditor
                    key={activeWorkspaceTab.id}
                    path={activeWorkspaceTab.path}
                    onClose={closeActiveWorkspaceTab}
                    onOpenInWindow={openCurrentMarkdownWindow}
                  />
                ) : activeWorkspaceTab.kind === 'knowledge-file' ? (
                  <KnowledgeFilePreview
                    key={activeWorkspaceTab.id}
                    path={activeWorkspaceTab.path}
                    pageStart={activeWorkspaceTab.pageStart}
                    sentenceStart={activeWorkspaceTab.sentenceStart}
                    sentenceEnd={activeWorkspaceTab.sentenceEnd}
                  />
                ) : (
                  <AttachmentPreview
                    key={activeWorkspaceTab.id}
                    attachmentId={activeWorkspaceTab.attachmentId}
                    displayName={activeWorkspaceTab.title}
                  />
                )}
              </div>
            </div>
          ) : null}
        </section>
      );
    }
    if (pane === 'right') {
      return (
        <section className="workspace-pane right-pane-shell" data-pane="right">
          <RightPane
            panelState={chatPanelState}
            paneMenuItems={paneMenu}
            onShow={showChat}
            onHide={hideChat}
          />
        </section>
      );
    }
    return (
      <section className="workspace-pane canvas-shell" data-pane="canvas">
        <div className="pane-toolbar canvas-toolbar">
          <ViewModeToggle />
        </div>
        <CanvasPanel
          canvasPanelState={canvasPanelState}
          chatPanelState={chatPanelState}
          paneMenuItems={paneMenu}
          onShowCanvas={showCanvas}
          onHideCanvas={hideCanvas}
          onShowChat={showChat}
          onHideChat={hideChat}
        />
      </section>
    );
  };

  const paneMenu: PaneMenuControl[] = [
    {
      id: 'sidebar' as const,
      label: 'Chat history / File explorer',
      shown: sidebarPanelState === 'shown',
      show: showSidebar,
      hide: hideSidebar,
      canShow: true,
    },
    {
      id: 'canvas' as const,
      label: 'Canvas',
      shown: canvasPanelState === 'shown',
      show: showCanvas,
      hide: hideCanvas,
      canShow: true,
    },
    {
      id: 'markdown' as const,
      label: 'Document tabs',
      shown: Boolean(hasWorkspaceTabs && markdownPanelState === 'shown'),
      show: showMarkdown,
      hide: hideMarkdown,
      canShow: hasWorkspaceTabs,
    },
    {
      id: 'right' as const,
      label: 'Chat',
      shown: chatPanelState === 'shown',
      show: showChat,
      hide: hideChat,
      canShow: true,
    },
  ];

  return (
    <div
      className={`app workspace-window${
        chatTabsAutoHide ? ' chat-tabs-autohide' : ''
      }`}
    >
      <div
        className="workspace-panes"
        style={{ gridTemplateColumns: workspaceColumns }}
        onContextMenu={onWorkspaceContextMenu}
      >
        {visiblePanes.flatMap((pane, index) => {
          const nodes = [
            <div key={pane} className="workspace-pane-slot">
              {renderPane(pane)}
            </div>,
          ];
          const next = visiblePanes[index + 1];
          if (next) {
            nodes.push(
              <div
                key={`${pane}-${next}-splitter`}
                className="splitter pane-splitter"
                role="separator"
                aria-orientation="vertical"
                title="Drag to resize"
                onPointerDown={(e) => onPaneSplitterPointerDown(e, pane, next)}
                onDoubleClick={() => setPaneWidths(PANE_DEFAULT)}
              />,
            );
          }
          return nodes;
        })}
      </div>

      {layoutMenu ? (
        <PanesContextMenu
          x={layoutMenu.x}
          y={layoutMenu.y}
          items={paneMenu}
          onShowAll={showAllPanels}
          onClose={() => setLayoutMenu(null)}
        />
      ) : null}
      <SettingsModal />
      <SearchPalette />
      <CommandPalette />
      <ShortcutsModal />
      <QuickCapture />
      <AIPalette />
      <GraphImportModal />
      <WorkspaceConfigModal />
      <PdfViewer />
      <Onboarding />
    </div>
  );
}

export default App;
