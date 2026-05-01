import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import type { ID } from '../../types';

/**
 * Horizontal tab strip rendered above the chat panel when the user has turned
 * "Show Tabs in Sidebar" off. Mirrors a browser tab bar: per-conversation
 * tabs, click to switch, double-click to rename, × to close, + to add. Only
 * the conversations in the active conversation's scope (its project, or
 * "no project") are listed — mixing every conversation in the workspace
 * makes the strip unusable.
 */
export function ChatTabBar() {
  const conversations = useStore((s) => s.conversations);
  const activeId = useStore((s) => s.settings.lastConversationId);
  const hiddenIds = useStore((s) => s.settings.hiddenChatTabIds);
  const projects = useStore((s) => s.projects);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const createConversation = useStore((s) => s.createConversation);
  const hideChatTab = useStore((s) => s.hideChatTab);
  const renameConversation = useStore((s) => s.renameConversation);
  const setWorkspaceConfigOpen = useStore((s) => s.setWorkspaceConfigOpen);

  const [renamingId, setRenamingId] = useState<ID | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!renamingId) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [renamingId]);

  const activeConv = conversations.find((c) => c.id === activeId);
  const scopeProjectId: ID | undefined = activeConv?.projectId;
  const projectName = scopeProjectId
    ? projects.find((p) => p.id === scopeProjectId)?.name ?? 'Project'
    : 'Workspace';

  const hiddenSet = new Set(hiddenIds ?? []);
  const tabs = conversations.filter((c) => {
    if (hiddenSet.has(c.id)) return false;
    return scopeProjectId ? c.projectId === scopeProjectId : !c.projectId;
  });

  function newTab() {
    const id = createConversation('Untitled', scopeProjectId);
    setActiveConversation(id);
  }

  function closeTab(e: React.MouseEvent, id: ID) {
    e.stopPropagation();
    if (renamingId === id) {
      // Don't close while editing — pressing × should commit + close, but
      // safer to require commit/cancel first.
      cancelRename();
      return;
    }
    // Non-destructive: hide from the tab bar only. The chat history stays
    // in the library and the conversation is still listed in the sidebar;
    // clicking it from there activates it again and the tab returns.
    hideChatTab(id);
  }

  function startRename(id: ID, currentTitle: string) {
    setRenamingId(id);
    setDraft(currentTitle);
  }

  function commitRename() {
    if (!renamingId) return;
    const next = draft.trim();
    const cur = conversations.find((c) => c.id === renamingId);
    if (next && next !== cur?.title) {
      renameConversation(renamingId, next);
    }
    setRenamingId(null);
    setDraft('');
  }

  function cancelRename() {
    setRenamingId(null);
    setDraft('');
  }

  return (
    <div className="chat-tab-bar" role="tablist" aria-label={`Chats in ${projectName}`}>
      <button
        type="button"
        className="chat-tab-bar-scope"
        title={`${projectName} — click to configure instructions, memory & files`}
        onClick={() => setWorkspaceConfigOpen(true)}
      >
        {projectName}
      </button>
      <div className="chat-tab-bar-tabs">
        {tabs.length === 0 ? (
          <span className="chat-tab-bar-empty">No chats yet</span>
        ) : (
          tabs.map((c) => {
            const isRenaming = renamingId === c.id;
            return (
              <div
                key={c.id}
                role="tab"
                aria-selected={c.id === activeId}
                className={`chat-tab${c.id === activeId ? ' active' : ''}${
                  isRenaming ? ' renaming' : ''
                }`}
                onClick={() => {
                  if (isRenaming) return;
                  setActiveConversation(c.id);
                }}
                onDoubleClick={() => startRename(c.id, c.title)}
                title={isRenaming ? undefined : `${c.title} — double-click to rename`}
              >
                {isRenaming ? (
                  <input
                    ref={inputRef}
                    className="chat-tab-rename-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    aria-label="Rename chat"
                  />
                ) : (
                  <span className="chat-tab-title">{c.title || 'Untitled'}</span>
                )}
                {!isRenaming ? (
                  <span
                    className="chat-tab-close"
                    onClick={(e) => closeTab(e, c.id)}
                    aria-label={`Close ${c.title}`}
                    role="button"
                  >
                    ×
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <button
        type="button"
        className="chat-tab-new"
        onClick={newTab}
        aria-label="New chat tab"
        title="New chat tab"
      >
        +
      </button>
    </div>
  );
}
