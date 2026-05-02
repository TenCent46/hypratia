import { useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from 'react';
import { useStore } from '../../store';
import { confirmDangerTwice } from '../../lib/confirm';
import type { Conversation, ID, Project } from '../../types';
import { MarkdownFileExplorer } from '../../features/knowledge/MarkdownFileExplorer';
import { moveConversationProjectFiles } from '../../services/knowledge/moveConversationProjectFiles';

// Stroked black-and-white icons for the sidebar. Inline SVG so we don't
// inherit an emoji font's rendering quirks; the path strokes pick up
// `currentColor` and stay legible across light / dark / sepia themes.
const SIDEBAR_ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const MIME_SIDEBAR_CHAT = 'application/x-memory-canvas-sidebar-chat';

function FolderIcon() {
  return (
    <svg {...SIDEBAR_ICON_PROPS}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg {...SIDEBAR_ICON_PROPS}>
      <path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1h-9l-4 3v-3H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
    </svg>
  );
}

export function Sidebar({
  activeMarkdownPath,
  onOpenMarkdownFile,
  forceExpanded,
  popout,
  sidebarPanelState = 'shown',
  onShowSidebar,
  onHideSidebar,
}: {
  activeMarkdownPath?: string | null;
  onOpenMarkdownFile?: (path: string) => void;
  /** Render the expanded sidebar regardless of `ui.sidebarCollapsed`. */
  forceExpanded?: boolean;
  /** Mark the rendering as a temporary pop-out overlay. */
  popout?: boolean;
  sidebarPanelState?: 'shown' | 'hidden';
  onShowSidebar?: () => void;
  onHideSidebar?: () => void;
}) {
  const storedCollapsed = useStore((s) => s.ui.sidebarCollapsed);
  const collapsed = forceExpanded ? false : storedCollapsed;
  const setCollapsed = useStore((s) => s.setSidebarCollapsed);
  const chatTabsInSidebar = useStore(
    (s) => s.settings.chatTabsInSidebar ?? true,
  );
  const conversations = useStore((s) => s.conversations);
  const projects = useStore((s) => s.projects);
  const expandedIds = useStore((s) => s.ui.expandedProjectIds);
  const activeId = useStore((s) => s.settings.lastConversationId);
  const setActive = useStore((s) => s.setActiveConversation);
  const createConversation = useStore((s) => s.createConversation);
  const removeConversation = useStore((s) => s.removeConversation);
  const renameConversation = useStore((s) => s.renameConversation);
  const setConversationProject = useStore((s) => s.setConversationProject);
  const createProject = useStore((s) => s.createProject);
  const renameProject = useStore((s) => s.renameProject);
  const removeProject = useStore((s) => s.removeProject);
  const toggleProjectExpanded = useStore((s) => s.toggleProjectExpanded);
  const setSearchOpen = useStore((s) => s.setSearchOpen);

  const [renamingChatId, setRenamingChatId] = useState<ID | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<ID | null>(null);
  const [draft, setDraft] = useState('');
  const [defaultExpanded, setDefaultExpanded] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'projects' | 'explorer'>(
    'projects',
  );
  const [sidebarMenu, setSidebarMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<ID | 'default' | null>(null);
  const sidebarMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sidebarMenu) return;
    function onDoc(e: MouseEvent) {
      if (!sidebarMenuRef.current) return;
      if (!sidebarMenuRef.current.contains(e.target as Node)) setSidebarMenu(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sidebarMenu]);

  const orphanConversations = useMemo(
    () =>
      [...conversations]
        .filter((c) => !c.projectId)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [conversations],
  );

  const projectConversations = useMemo(() => {
    const map = new Map<ID, Conversation[]>();
    for (const p of projects) map.set(p.id, []);
    for (const c of conversations) {
      if (!c.projectId) continue;
      const arr = map.get(c.projectId);
      if (arr) arr.push(c);
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }
    return map;
  }, [conversations, projects]);

  function onNewChat(projectId?: ID) {
    const id = createConversation('Untitled', projectId);
    setActive(id);
  }

  function onNewProject() {
    const id = createProject('New project');
    setRenamingProjectId(id);
    setDraft('New project');
  }

  async function moveChatToProject(conversationId: ID, projectId: ID | null) {
    const current = useStore
      .getState()
      .conversations.find((c) => c.id === conversationId);
    if ((current?.projectId ?? null) === projectId) return;

    try {
      await moveConversationProjectFiles(conversationId, projectId);
    } catch (err) {
      console.warn('failed to move conversation files', err);
    }
    setConversationProject(conversationId, projectId);
  }

  function commitChatRename(id: ID) {
    const t = draft.trim();
    if (t) renameConversation(id, t);
    setRenamingChatId(null);
    setDraft('');
  }

  function commitProjectRename(id: ID) {
    const t = draft.trim();
    if (t) renameProject(id, t);
    setRenamingProjectId(null);
    setDraft('');
  }

  if (collapsed) {
    return (
      <aside
        className="sidebar collapsed"
        onContextMenu={(e) => {
          e.preventDefault();
          setSidebarMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <button
          type="button"
          className="sidebar-icon-btn"
          onClick={() => {
            onShowSidebar?.();
            setCollapsed(false);
          }}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          ☰
        </button>
        <button
          type="button"
          className="sidebar-icon-btn"
          onClick={() => onNewChat()}
          aria-label="New chat"
          title="New chat"
        >
          ✎
        </button>
        <button
          type="button"
          className="sidebar-icon-btn"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          title="Search (⌘K)"
        >
          ⌕
        </button>
        <span className="sidebar-spacer" />
        {sidebarMenu ? (
          <SidebarDockMenu
            refEl={sidebarMenuRef}
            x={sidebarMenu.x}
            y={sidebarMenu.y}
            panelState={sidebarPanelState}
            onShow={onShowSidebar}
            onHide={onHideSidebar}
            onClose={() => setSidebarMenu(null)}
          />
        ) : null}
      </aside>
    );
  }

  return (
    <aside
      className={`sidebar${chatTabsInSidebar ? '' : ' chats-out'}${
        popout ? ' popout' : ''
      }`}
      onContextMenu={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.knowledge-section')) return;
        e.preventDefault();
        setSidebarMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="sidebar-top">
        <button
          type="button"
          className="sidebar-collapse"
          onClick={() => {
            onHideSidebar?.();
            setCollapsed(true);
          }}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          ☰
        </button>
        <button
          type="button"
          className="sidebar-row sidebar-action"
          onClick={() => onNewChat()}
        >
          <span className="sidebar-row-icon">✎</span>
          <span className="sidebar-row-label">New chat</span>
        </button>
        <button
          type="button"
          className="sidebar-row sidebar-action"
          onClick={() => setSearchOpen(true)}
        >
          <span className="sidebar-row-icon">⌕</span>
          <span className="sidebar-row-label">Search chats</span>
        </button>
      </div>

      <div className="sidebar-tabs" role="tablist" aria-label="Sidebar sections">
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'projects'}
          className={`sidebar-tab${sidebarTab === 'projects' ? ' active' : ''}`}
          onClick={() => setSidebarTab('projects')}
        >
          Projects
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'explorer'}
          className={`sidebar-tab${sidebarTab === 'explorer' ? ' active' : ''}`}
          onClick={() => setSidebarTab('explorer')}
        >
          Files
        </button>
      </div>

      {sidebarTab === 'explorer' ? (
        <div className="sidebar-section sidebar-section-fill">
          <MarkdownFileExplorer
            activePath={activeMarkdownPath ?? null}
            onOpenFile={(path) => onOpenMarkdownFile?.(path)}
          />
        </div>
      ) : (
        <div className="sidebar-section sidebar-section-fill">
        <div className="sidebar-section-header">
          <span>Projects</span>
          <button
            type="button"
            className="sidebar-section-add"
            onClick={onNewProject}
            aria-label="New project"
            title="New project"
          >
            +
          </button>
        </div>
        <div className="sidebar-projects">
          <DefaultProjectRow
            expanded={defaultExpanded}
            onToggle={() => setDefaultExpanded((v) => !v)}
            onAddChat={() => onNewChat()}
            conversations={orphanConversations}
            activeId={activeId}
            onActivate={(id) => setActive(id)}
            renamingChatId={renamingChatId}
            onChatRename={(id) => {
              const c = conversations.find((x) => x.id === id);
              setRenamingChatId(id);
              setDraft(c?.title ?? '');
            }}
            onChatCommitRename={commitChatRename}
            onChatCancelRename={() => {
              setRenamingChatId(null);
              setDraft('');
            }}
            onChatDraftChange={setDraft}
            chatDraft={draft}
            onChatDelete={(c) => {
              if (
                confirmDangerTwice({
                  title: `Delete conversation "${c.title}"?`,
                  detail:
                    'This will remove the conversation, its messages, canvas nodes, and connected edges.',
                  finalDetail:
                    'Second confirmation: permanently delete this conversation?',
                })
              ) {
                removeConversation(c.id);
              }
            }}
            projects={projects}
            onChatMoveTo={moveChatToProject}
            dragOver={dragOverProjectId === 'default'}
            onChatDrop={(id) => void moveChatToProject(id, null)}
            onDragOverProject={() => setDragOverProjectId('default')}
            onDragLeaveProject={() =>
              setDragOverProjectId((cur) => (cur === 'default' ? null : cur))
            }
          />
          {projects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                expanded={expandedIds.includes(p.id)}
                renaming={renamingProjectId === p.id}
                draft={draft}
                onRename={() => {
                  setRenamingProjectId(p.id);
                  setDraft(p.name);
                }}
                onCommitRename={() => commitProjectRename(p.id)}
                onCancelRename={() => {
                  setRenamingProjectId(null);
                  setDraft('');
                }}
                onDraftChange={setDraft}
                onToggle={() => toggleProjectExpanded(p.id)}
                onDelete={() => {
                  const childCount =
                    projectConversations.get(p.id)?.length ?? 0;
                  if (childCount > 0) {
                    if (
                      confirmDangerTwice({
                        title: `Delete project "${p.name}"?`,
                        detail: `Contains ${childCount} chat(s). Delete the project AND its chats?`,
                        finalDetail:
                          'Second confirmation: permanently delete this project and all its chats?',
                      })
                    ) {
                      removeProject(p.id, { deleteChats: true });
                    }
                  } else {
                    removeProject(p.id);
                  }
                }}
                onAddChat={() => onNewChat(p.id)}
                conversations={projectConversations.get(p.id) ?? []}
                activeId={activeId}
                onActivate={(id) => setActive(id)}
                renamingChatId={renamingChatId}
                onChatRename={(id) => {
                  const c = conversations.find((x) => x.id === id);
                  setRenamingChatId(id);
                  setDraft(c?.title ?? '');
                }}
                onChatCommitRename={commitChatRename}
                onChatCancelRename={() => {
                  setRenamingChatId(null);
                  setDraft('');
                }}
                onChatDraftChange={setDraft}
                chatDraft={draft}
                onChatDelete={(c) => {
                  if (
                    confirmDangerTwice({
                      title: `Delete conversation "${c.title}"?`,
                      detail:
                        'This will remove the conversation, its messages, canvas nodes, and connected edges.',
                      finalDetail:
                        'Second confirmation: permanently delete this conversation?',
                    })
                  ) {
                    removeConversation(c.id);
                  }
                }}
                onChatMoveOut={(id) => void moveChatToProject(id, null)}
                projects={projects}
                onChatMoveTo={moveChatToProject}
                dragOver={dragOverProjectId === p.id}
                onChatDrop={(id) => void moveChatToProject(id, p.id)}
                onDragOverProject={() => setDragOverProjectId(p.id)}
                onDragLeaveProject={() =>
                  setDragOverProjectId((cur) => (cur === p.id ? null : cur))
                }
              />
            ))}
        </div>
        </div>
      )}

      {sidebarMenu ? (
        <SidebarDockMenu
          refEl={sidebarMenuRef}
          x={sidebarMenu.x}
          y={sidebarMenu.y}
          panelState={sidebarPanelState}
          onShow={onShowSidebar}
          onHide={onHideSidebar}
          onClose={() => setSidebarMenu(null)}
        />
      ) : null}
    </aside>
  );
}

function SidebarDockMenu({
  refEl,
  x,
  y,
  panelState,
  onShow,
  onHide,
  onClose,
}: {
  refEl: RefObject<HTMLDivElement | null>;
  x: number;
  y: number;
  panelState: 'shown' | 'hidden';
  onShow?: () => void;
  onHide?: () => void;
  onClose: () => void;
}) {
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 180);
  return (
    <div ref={refEl} className="app-context-menu" style={{ left, top }}>
      <button
        type="button"
        className="app-context-menu-item"
        onClick={() => {
          onShow?.();
          onClose();
        }}
      >
        <span className="app-context-menu-check">{panelState === 'shown' ? '✓' : ''}</span>
        <span className="app-context-menu-label">Show Sidebar</span>
      </button>
      <button
        type="button"
        className="app-context-menu-item"
        onClick={() => {
          onHide?.();
          onClose();
        }}
      >
        <span className="app-context-menu-check">{panelState === 'hidden' ? '✓' : ''}</span>
        <span className="app-context-menu-label">Hide Sidebar</span>
      </button>
    </div>
  );
}

function DefaultProjectRow({
  expanded,
  onToggle,
  onAddChat,
  conversations,
  activeId,
  onActivate,
  renamingChatId,
  onChatRename,
  onChatCommitRename,
  onChatCancelRename,
  onChatDraftChange,
  chatDraft,
  onChatDelete,
  projects,
  onChatMoveTo,
  dragOver,
  onChatDrop,
  onDragOverProject,
  onDragLeaveProject,
}: {
  expanded: boolean;
  onToggle: () => void;
  onAddChat: () => void;
  conversations: Conversation[];
  activeId: ID | undefined;
  onActivate: (id: ID) => void;
  renamingChatId: ID | null;
  onChatRename: (id: ID) => void;
  onChatCommitRename: (id: ID) => void;
  onChatCancelRename: () => void;
  onChatDraftChange: (v: string) => void;
  chatDraft: string;
  onChatDelete: (c: Conversation) => void;
  projects: Project[];
  onChatMoveTo: (conversationId: ID, projectId: ID | null) => void;
  dragOver: boolean;
  onChatDrop: (conversationId: ID) => void;
  onDragOverProject: () => void;
  onDragLeaveProject: () => void;
}) {
  function onProjectDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes(MIME_SIDEBAR_CHAT)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOverProject();
  }

  function onProjectDrop(e: DragEvent<HTMLDivElement>) {
    const conversationId = e.dataTransfer.getData(MIME_SIDEBAR_CHAT);
    if (!conversationId) return;
    e.preventDefault();
    onDragLeaveProject();
    onChatDrop(conversationId);
  }

  return (
    <div
      className={`sidebar-project sidebar-project-default${expanded ? ' expanded' : ''}${
        dragOver ? ' drop-target' : ''
      }`}
      onDragOver={onProjectDragOver}
      onDragLeave={onDragLeaveProject}
      onDrop={onProjectDrop}
    >
      <div className="sidebar-project-header">
        <button
          type="button"
          className="sidebar-project-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="sidebar-project-caret">{expanded ? '▾' : '▸'}</span>
          <span className="sidebar-project-icon">
            <ChatBubbleIcon />
          </span>
          <span className="sidebar-project-name">Chats</span>
        </button>
        <div className="sidebar-project-actions">
          <button
            type="button"
            className="sidebar-icon-btn small"
            onClick={(e) => {
              e.stopPropagation();
              onAddChat();
            }}
            aria-label="New chat"
            title="New chat"
          >
            +
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="sidebar-project-children">
          {conversations.length === 0 ? (
            <div className="sidebar-empty small">No chats yet.</div>
          ) : (
            conversations.map((c) => (
              <ChatRow
                key={c.id}
                conversation={c}
                active={c.id === activeId}
                renaming={renamingChatId === c.id}
                draft={chatDraft}
                onActivate={() => onActivate(c.id)}
                onStartRename={() => onChatRename(c.id)}
                onCommitRename={() => onChatCommitRename(c.id)}
                onCancelRename={onChatCancelRename}
                onDraftChange={onChatDraftChange}
                onDelete={() => onChatDelete(c)}
                projects={projects}
                onMoveTo={(pid) => onChatMoveTo(c.id, pid)}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData(MIME_SIDEBAR_CHAT, c.id);
                  e.dataTransfer.setData('text/plain', c.title);
                }}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function ProjectRow({
  project,
  expanded,
  renaming,
  draft,
  onRename,
  onCommitRename,
  onCancelRename,
  onDraftChange,
  onToggle,
  onDelete,
  onAddChat,
  conversations,
  activeId,
  onActivate,
  renamingChatId,
  onChatRename,
  onChatCommitRename,
  onChatCancelRename,
  onChatDraftChange,
  chatDraft,
  onChatDelete,
  onChatMoveOut,
  projects,
  onChatMoveTo,
  dragOver,
  onChatDrop,
  onDragOverProject,
  onDragLeaveProject,
}: {
  project: Project;
  expanded: boolean;
  renaming: boolean;
  draft: string;
  onRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDraftChange: (v: string) => void;
  onToggle: () => void;
  onDelete: () => void;
  onAddChat: () => void;
  conversations: Conversation[];
  activeId: ID | undefined;
  onActivate: (id: ID) => void;
  renamingChatId: ID | null;
  onChatRename: (id: ID) => void;
  onChatCommitRename: (id: ID) => void;
  onChatCancelRename: () => void;
  onChatDraftChange: (v: string) => void;
  chatDraft: string;
  onChatDelete: (c: Conversation) => void;
  onChatMoveOut: (id: ID) => void;
  projects: Project[];
  onChatMoveTo: (conversationId: ID, projectId: ID | null) => void;
  dragOver: boolean;
  onChatDrop: (conversationId: ID) => void;
  onDragOverProject: () => void;
  onDragLeaveProject: () => void;
}) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  function onHeaderContextMenu(e: React.MouseEvent) {
    if (renaming) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  function onProjectDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes(MIME_SIDEBAR_CHAT)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOverProject();
  }

  function onProjectDrop(e: DragEvent<HTMLDivElement>) {
    const conversationId = e.dataTransfer.getData(MIME_SIDEBAR_CHAT);
    if (!conversationId) return;
    e.preventDefault();
    onDragLeaveProject();
    onChatDrop(conversationId);
  }

  return (
    <div
      className={`sidebar-project${expanded ? ' expanded' : ''}${
        dragOver ? ' drop-target' : ''
      }`}
      onContextMenu={onHeaderContextMenu}
      onDragOver={onProjectDragOver}
      onDragLeave={onDragLeaveProject}
      onDrop={onProjectDrop}
    >
      <div className="sidebar-project-header">
        <button
          type="button"
          className="sidebar-project-toggle"
          onClick={onToggle}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
          aria-expanded={expanded}
          title={renaming ? undefined : 'Double-click to rename · Right-click for more'}
        >
          <span className="sidebar-project-caret">{expanded ? '▾' : '▸'}</span>
          <span className="sidebar-project-icon">
            {project.emoji ? project.emoji : <FolderIcon />}
          </span>
          {renaming ? (
            <input
              autoFocus
              className="sidebar-rename-input"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitRename();
                if (e.key === 'Escape') onCancelRename();
              }}
            />
          ) : (
            <span className="sidebar-project-name">{project.name}</span>
          )}
        </button>
        <div className="sidebar-project-actions">
          <button
            type="button"
            className="sidebar-icon-btn small"
            onClick={(e) => {
              e.stopPropagation();
              onAddChat();
            }}
            aria-label="New chat in project"
            title="New chat in project"
          >
            +
          </button>
        </div>
        {ctxMenu ? (
          <SidebarRowContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            onClose={() => setCtxMenu(null)}
          >
            <button
              type="button"
              className="app-context-menu-item"
              onClick={() => {
                setCtxMenu(null);
                onRename();
              }}
            >
              <span className="app-context-menu-label">Rename</span>
            </button>
            <button
              type="button"
              className="app-context-menu-item danger"
              onClick={() => {
                setCtxMenu(null);
                onDelete();
              }}
            >
              <span className="app-context-menu-label">Delete project</span>
            </button>
          </SidebarRowContextMenu>
        ) : null}
      </div>
      {expanded ? (
        <div className="sidebar-project-children">
          {conversations.length === 0 ? (
            <div className="sidebar-empty small">No chats here yet.</div>
          ) : (
            conversations.map((c) => (
              <ChatRow
                key={c.id}
                conversation={c}
                active={c.id === activeId}
                renaming={renamingChatId === c.id}
                draft={chatDraft}
                onActivate={() => onActivate(c.id)}
                onStartRename={() => onChatRename(c.id)}
                onCommitRename={() => onChatCommitRename(c.id)}
                onCancelRename={onChatCancelRename}
                onDraftChange={onChatDraftChange}
                onDelete={() => onChatDelete(c)}
                projects={projects}
                onMoveTo={(pid) => {
                  if (pid === null) onChatMoveOut(c.id);
                  else onChatMoveTo(c.id, pid);
                }}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData(MIME_SIDEBAR_CHAT, c.id);
                  e.dataTransfer.setData('text/plain', c.title);
                }}
                inProject
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function ChatRow({
  conversation,
  active,
  renaming,
  draft,
  onActivate,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDraftChange,
  onDelete,
  projects,
  onMoveTo,
  inProject,
  onDragStart,
}: {
  conversation: Conversation;
  active: boolean;
  renaming: boolean;
  draft: string;
  onActivate: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDraftChange: (v: string) => void;
  onDelete: () => void;
  projects: Project[];
  onMoveTo: (projectId: ID | null) => void;
  inProject?: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
}) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  function onRowContextMenu(e: React.MouseEvent) {
    if (renaming) return;
    e.preventDefault();
    e.stopPropagation();
    setMoveOpen(false);
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  return (
    <div
      className={`sidebar-chat${active ? ' active' : ''}${
        inProject ? ' nested' : ''
      }`}
      onContextMenu={onRowContextMenu}
      draggable={!renaming}
      onDragStart={(e) => {
        if (renaming) {
          e.preventDefault();
          return;
        }
        onDragStart(e);
        e.currentTarget.classList.add('dragging');
      }}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('dragging');
      }}
    >
      {renaming ? (
        <input
          autoFocus
          className="sidebar-rename-input"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename();
            if (e.key === 'Escape') onCancelRename();
          }}
        />
      ) : (
        <button
          type="button"
          className="sidebar-chat-pick"
          onClick={onActivate}
          onDoubleClick={onStartRename}
          title={`${conversation.title} — double-click to rename · right-click for more`}
        >
          {conversation.kind === 'inbox' ? '📥 ' : conversation.kind === 'daily' ? '🗓 ' : ''}
          {conversation.title}
        </button>
      )}
      {ctxMenu ? (
        <SidebarRowContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => {
            setCtxMenu(null);
            setMoveOpen(false);
          }}
        >
          <button
            type="button"
            className="app-context-menu-item"
            onClick={() => {
              setCtxMenu(null);
              onStartRename();
            }}
          >
            <span className="app-context-menu-label">Rename</span>
          </button>
          <button
            type="button"
            className="app-context-menu-item"
            onClick={() => setMoveOpen((v) => !v)}
          >
            <span className="app-context-menu-label">
              Move to… {moveOpen ? '▾' : '▸'}
            </span>
          </button>
          {moveOpen ? (
            <div className="sidebar-submenu">
              {inProject ? (
                <button
                  type="button"
                  className="app-context-menu-item"
                  onClick={() => {
                    setCtxMenu(null);
                    onMoveTo(null);
                  }}
                >
                  <span className="app-context-menu-label">(No project)</span>
                </button>
              ) : null}
              {projects
                .filter((p) => p.id !== conversation.projectId)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="app-context-menu-item"
                    onClick={() => {
                      setCtxMenu(null);
                      onMoveTo(p.id);
                    }}
                  >
                    <span className="app-context-menu-label">
                      {p.emoji ? `${p.emoji} ` : ''}
                      {p.name}
                    </span>
                  </button>
                ))}
              {projects.length === 0 ? (
                <div className="sidebar-empty small">No projects yet.</div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="app-context-menu-item danger"
            onClick={() => {
              setCtxMenu(null);
              onDelete();
            }}
          >
            <span className="app-context-menu-label">Delete chat</span>
          </button>
        </SidebarRowContextMenu>
      ) : null}
    </div>
  );
}

/**
 * Floating context menu used by both ProjectRow and ChatRow. Positions at
 * (x, y) clamped to viewport, dismisses on outside-click or Escape.
 */
function SidebarRowContextMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 180);
  return (
    <div
      ref={ref}
      className="app-context-menu"
      style={{ position: 'fixed', left, top, zIndex: 220 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
