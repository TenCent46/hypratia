import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from 'react';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ViewModeToggle } from './components/ViewModeToggle/ViewModeToggle';
import { CanvasPanel } from './features/canvas/CanvasPanel';
import { MarkdownDocumentEditor } from './features/knowledge/MarkdownDocumentEditor';
import { RightPane } from './components/RightPane/RightPane';
import { SettingsModal } from './components/SettingsModal/SettingsModal';
import { SearchPalette } from './features/search/SearchPalette';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { ShortcutsModal } from './components/CommandPalette/ShortcutsModal';
import { QuickCapture } from './components/QuickCapture/QuickCapture';
import { AIPalette } from './features/ai-palette/AIPalette';
import { PdfViewer } from './features/pdf/PdfViewer';
import { Onboarding } from './components/Onboarding/Onboarding';
import { hydrateAndWire } from './store/persistence';
import { useStore } from './store';
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

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useStore((s) => s.settings.theme);

  useEffect(() => {
    hydrateAndWire()
      .then(() => {
        const tabId = getInitialTabId();
        if (tabId) {
          const s = useStore.getState();
          if (s.conversations.some((c) => c.id === tabId)) {
            s.setActiveConversation(tabId);
          }
        }
        setReady(true);
      })
      .catch((err) => {
        console.error('hydration failed', err);
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

  if (error) return <div className="splash error">Failed to load: {error}</div>;
  if (!ready) return <div className="splash">Loading…</div>;
  return <ReadyApp />;
}

function ReadyApp() {
  useKeymap();
  const sidebarCollapsedForMenu = useStore((s) => s.ui.sidebarCollapsed);
  const initialLayoutPreset = useMemo(() => getInitialLayoutPreset(), []);
  const initialMarkdownPath = useMemo(() => getInitialMarkdownPath(), []);
  const [activeMarkdownPath, setActiveMarkdownPath] = useState<string | null>(
    initialMarkdownPath,
  );
  const [paneWidths, setPaneWidths] =
    useState<Record<PaneId, number>>(PANE_DEFAULT);
  const [layoutMenu, setLayoutMenu] = useState<{ x: number; y: number } | null>(
    null,
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
    initialLayoutPreset === 'canvasFocused' || initialMarkdownPath ? 'hidden' : 'shown',
  );
  const [canvasPanelState, setCanvasPanelStateRaw] = useState<PanelState>(() =>
    initialLayoutPreset === 'chatFocused' || initialMarkdownPath ? 'hidden' : 'shown',
  );
  const [sidebarPanelState, setSidebarPanelStateRaw] = useState<PanelState>(() =>
    sidebarCollapsedForMenu ? 'hidden' : 'shown',
  );
  const [markdownPanelState, setMarkdownPanelState] = useState<PanelState>(() =>
    initialMarkdownPath ? 'shown' : 'hidden',
  );

  const setSidebarPanelState = useCallback((state: PanelState) => {
    setSidebarPanelStateRaw(state);
    useStore.getState().setSidebarCollapsed(state !== 'shown');
  }, []);

  useEffect(() => {
    if (initialLayoutPreset === 'main') return;
    const timer = window.setTimeout(() => setSidebarPanelState('hidden'), 0);
    return () => window.clearTimeout(timer);
  }, [initialLayoutPreset, setSidebarPanelState]);

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
    if (activeMarkdownPath) setMarkdownPanelState('shown');
  }, [activeMarkdownPath]);
  const hideMarkdown = useCallback(() => setMarkdownPanelState('hidden'), []);
  const toggleMarkdown = useCallback(() => {
    if (!activeMarkdownPath) return;
    setMarkdownPanelState((state) => (state === 'shown' ? 'hidden' : 'shown'));
  }, [activeMarkdownPath]);

  const showAllPanels = useCallback(() => {
    showSidebar();
    showCanvas();
    showChat();
    if (activeMarkdownPath) setMarkdownPanelState('shown');
  }, [activeMarkdownPath, showCanvas, showChat, showSidebar]);

  const openNewChatWindow = useCallback(() => {
    void openChatWindow(ensureConversation());
  }, [ensureConversation]);
  const openNewCanvasWindow = useCallback(() => {
    void openCanvasWorkspaceWindow(ensureConversation());
  }, [ensureConversation]);
  const openCurrentMarkdownWindow = useCallback(() => {
    if (!activeMarkdownPath) return;
    void openMarkdownEditorWindow(activeMarkdownPath, conversationId ?? ensureConversation());
  }, [activeMarkdownPath, conversationId, ensureConversation]);
  const toggleChatTabsAutoHide = useCallback(() => {
    const cur = useStore.getState().settings.chatTabsAutoHide ?? false;
    useStore.getState().setChatTabsAutoHide(!cur);
  }, []);

  const openMarkdownFile = useCallback((path: string) => {
    setActiveMarkdownPath(path || null);
    setMarkdownPanelState(path ? 'shown' : 'hidden');
  }, []);

  const returnToCanvas = useCallback(() => {
    setActiveMarkdownPath(null);
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
  useEffect(() => {
    void setMenuCheck('view:show-chat', chatPanelState === 'shown');
    void setMenuCheck('view:show-canvas', canvasPanelState === 'shown');
    void setMenuCheck('view:show-sidebar', sidebarPanelState === 'shown');
    void setMenuCheck('view:toggle-tabs-autohide', chatTabsAutoHide);
  }, [chatPanelState, canvasPanelState, sidebarPanelState, chatTabsAutoHide]);

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
    if (!layoutMenu) return;
    function close() {
      setLayoutMenu(null);
    }
    window.addEventListener('pointerdown', close, { once: true });
    window.addEventListener('keydown', close, { once: true });
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [layoutMenu]);

  const visiblePanes = useMemo<PaneId[]>(() => {
    const panes: PaneId[] = [];
    if (sidebarPanelState === 'shown') panes.push('sidebar');
    if (canvasPanelState === 'shown') panes.push('canvas');
    if (activeMarkdownPath && markdownPanelState === 'shown') panes.push('markdown');
    if (chatPanelState === 'shown') panes.push('right');
    return panes.length ? panes : ['canvas'];
  }, [
    activeMarkdownPath,
    canvasPanelState,
    chatPanelState,
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

  function onPaneSplitterPointerDown(
    e: PointerEvent<HTMLDivElement>,
    left: PaneId,
    right: PaneId,
  ) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startLeft = paneWidths[left];
    const startRight = paneWidths[right];

    function onMove(ev: globalThis.PointerEvent) {
      const delta = ev.clientX - startX;
      setPaneWidths((current) => {
        if (left === primaryPane && right !== primaryPane) {
          return {
            ...current,
            [right]: Math.max(PANE_MIN[right], startRight - delta),
          };
        }
        if (right === primaryPane && left !== primaryPane) {
          return {
            ...current,
            [left]: Math.max(PANE_MIN[left], startLeft + delta),
          };
        }
        return {
          ...current,
          [left]: Math.max(PANE_MIN[left], startLeft + delta),
          [right]: Math.max(PANE_MIN[right], startRight - delta),
        };
      });
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

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
          {activeMarkdownPath ? (
            <MarkdownDocumentEditor
              path={activeMarkdownPath}
              onClose={returnToCanvas}
              onOpenInWindow={openCurrentMarkdownWindow}
            />
          ) : null}
        </section>
      );
    }
    if (pane === 'right') {
      return (
        <section className="workspace-pane right-pane-shell" data-pane="right">
          <RightPane
            panelState={chatPanelState}
            onShow={showChat}
            onHide={hideChat}
            onClose={hideChat}
            onDetach={() => {
              void openChatWindow(ensureConversation());
              hideChat();
            }}
          />
        </section>
      );
    }
    return (
      <section className="workspace-pane canvas-shell" data-pane="canvas">
        <div className="pane-toolbar canvas-toolbar">
          <ViewModeToggle />
          <button
            type="button"
            onClick={() => {
              void openCanvasWorkspaceWindow(conversationId ?? ensureConversation());
              hideCanvas();
            }}
            aria-label="Open canvas in new window"
            title="Open canvas in new window (⌘⌥T)"
          >
            ⧉
          </button>
          <button
            type="button"
            onClick={hideCanvas}
            aria-label="Hide canvas"
            title="Hide canvas"
          >
            ×
          </button>
        </div>
        <CanvasPanel
          canvasPanelState={canvasPanelState}
          chatPanelState={chatPanelState}
          onShowCanvas={showCanvas}
          onHideCanvas={hideCanvas}
          onShowChat={showChat}
          onHideChat={hideChat}
        />
      </section>
    );
  };

  const paneMenu = [
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
      label: 'Markdown editor',
      shown: Boolean(activeMarkdownPath && markdownPanelState === 'shown'),
      show: showMarkdown,
      hide: hideMarkdown,
      canShow: Boolean(activeMarkdownPath),
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
        <div
          className="workspace-layout-menu"
          style={{ left: layoutMenu.x, top: layoutMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="workspace-layout-menu-title">Panes</div>
          {paneMenu.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!item.canShow && !item.shown}
              onClick={() => {
                if (item.shown) item.hide();
                else item.show();
                setLayoutMenu(null);
              }}
            >
              <span>{item.shown ? 'Hide' : 'Show'}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
          <hr />
          <button
            type="button"
            onClick={() => {
              showAllPanels();
              setLayoutMenu(null);
            }}
          >
            <span>Show</span>
            <strong>All panes</strong>
          </button>
        </div>
      ) : null}
      <SettingsModal />
      <SearchPalette />
      <CommandPalette />
      <ShortcutsModal />
      <QuickCapture />
      <AIPalette />
      <PdfViewer />
      <Onboarding />
    </div>
  );
}

export default App;
