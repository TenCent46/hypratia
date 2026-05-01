import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useStore } from '../../store';
import { confirmDangerTwice } from '../../lib/confirm';
import type { Conversation, ID, Project } from '../../types';
import { MarkdownFileExplorer } from '../../features/knowledge/MarkdownFileExplorer';

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
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  const [renamingChatId, setRenamingChatId] = useState<ID | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<ID | null>(null);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('');
  const [sidebarMenu, setSidebarMenu] = useState<{ x: number; y: number } | null>(null);
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
        .filter((c) =>
          filter
            ? c.title.toLowerCase().includes(filter.toLowerCase())
            : true,
        )
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [conversations, filter],
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
        <button
          type="button"
          className="sidebar-icon-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>
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

      <div className="sidebar-section">
        <MarkdownFileExplorer
          activePath={activeMarkdownPath ?? null}
          onOpenFile={(path) => onOpenMarkdownFile?.(path)}
        />
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Projects</span>
          <button
            type="button"
            className="sidebar-section-add"
            onClick={onNewProject}
            aria-label="New project"
            title="New project"
          >
            ＋
          </button>
        </div>
        {projects.length === 0 ? null : (
          <div className="sidebar-projects">
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
                onChatMoveOut={(id) => setConversationProject(id, null)}
                projects={projects}
                onChatMoveTo={(cid, pid) => setConversationProject(cid, pid)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-section sidebar-section-recents">
        <div className="sidebar-section-header">
          <span>Chats</span>
        </div>
        <div className="sidebar-search">
          <input
            type="text"
            placeholder="Filter chats…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="sidebar-chat-list">
          {orphanConversations.length === 0 ? (
            <div className="sidebar-empty">
              {filter ? 'No matches.' : 'No chats yet.'}
            </div>
          ) : (
            orphanConversations.map((c) => (
              <ChatRow
                key={c.id}
                conversation={c}
                active={c.id === activeId}
                renaming={renamingChatId === c.id}
                draft={draft}
                onActivate={() => setActive(c.id)}
                onStartRename={() => {
                  setRenamingChatId(c.id);
                  setDraft(c.title);
                }}
                onCommitRename={() => commitChatRename(c.id)}
                onCancelRename={() => {
                  setRenamingChatId(null);
                  setDraft('');
                }}
                onDraftChange={setDraft}
                onDelete={() => {
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
                onMoveTo={(pid) => setConversationProject(c.id, pid)}
              />
            ))
          )}
        </div>
      </div>

      <div className="sidebar-bottom">
        <button
          type="button"
          className="sidebar-row sidebar-action"
          onClick={() => setSettingsOpen(true)}
        >
          <span className="sidebar-row-icon">⚙</span>
          <span className="sidebar-row-label">Settings</span>
        </button>
      </div>
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <div className={`sidebar-project${expanded ? ' expanded' : ''}`}>
      <div className="sidebar-project-header">
        <button
          type="button"
          className="sidebar-project-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="sidebar-project-caret">{expanded ? '▾' : '▸'}</span>
          <span className="sidebar-project-icon">
            {project.emoji || '📁'}
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
        <div className="sidebar-project-actions" ref={menuRef}>
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
            ＋
          </button>
          <button
            type="button"
            className="sidebar-icon-btn small"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label="Project menu"
            title="More"
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="sidebar-menu">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onRename();
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMoveOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <div
      className={`sidebar-chat${active ? ' active' : ''}${
        inProject ? ' nested' : ''
      }`}
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
          title={conversation.title}
        >
          {conversation.kind === 'inbox' ? '📥 ' : conversation.kind === 'daily' ? '🗓 ' : ''}
          {conversation.title}
        </button>
      )}
      <div className="sidebar-chat-actions" ref={menuRef}>
        <button
          type="button"
          className="sidebar-icon-btn small"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
            setMoveOpen(false);
          }}
          aria-label="Chat menu"
          title="More"
        >
          ⋯
        </button>
        {menuOpen ? (
          <div className="sidebar-menu">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onStartRename();
              }}
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => setMoveOpen((v) => !v)}
            >
              Move to… {moveOpen ? '▾' : '▸'}
            </button>
            {moveOpen ? (
              <div className="sidebar-submenu">
                {inProject ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onMoveTo(null);
                    }}
                  >
                    (No project)
                  </button>
                ) : null}
                {projects
                  .filter((p) => p.id !== conversation.projectId)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onMoveTo(p.id);
                      }}
                    >
                      {p.emoji ? `${p.emoji} ` : ''}
                      {p.name}
                    </button>
                  ))}
                {projects.length === 0 ? (
                  <div className="sidebar-empty small">No projects yet.</div>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              className="danger"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
