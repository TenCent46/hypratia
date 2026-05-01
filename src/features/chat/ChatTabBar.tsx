import { useStore } from '../../store';
import type { ID } from '../../types';

/**
 * Horizontal tab strip rendered above the chat panel when the user has turned
 * "Show Tabs in Sidebar" off. Mirrors a browser tab bar: per-conversation
 * tabs, click to switch, × to close, + to add. Only the conversations in the
 * active conversation's scope (its project, or "no project") are listed —
 * mixing every conversation in the workspace makes the strip unusable.
 */
export function ChatTabBar() {
  const conversations = useStore((s) => s.conversations);
  const activeId = useStore((s) => s.settings.lastConversationId);
  const projects = useStore((s) => s.projects);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const createConversation = useStore((s) => s.createConversation);
  const removeConversation = useStore((s) => s.removeConversation);

  const activeConv = conversations.find((c) => c.id === activeId);
  const scopeProjectId: ID | undefined = activeConv?.projectId;
  const projectName = scopeProjectId
    ? projects.find((p) => p.id === scopeProjectId)?.name ?? 'Project'
    : 'Workspace';

  const tabs = conversations.filter((c) =>
    scopeProjectId ? c.projectId === scopeProjectId : !c.projectId,
  );

  function newTab() {
    const id = createConversation('Untitled', scopeProjectId);
    setActiveConversation(id);
  }

  function closeTab(e: React.MouseEvent, id: ID) {
    e.stopPropagation();
    removeConversation(id);
  }

  return (
    <div className="chat-tab-bar" role="tablist" aria-label={`Chats in ${projectName}`}>
      <span className="chat-tab-bar-scope" title={projectName}>
        {projectName}
      </span>
      <div className="chat-tab-bar-tabs">
        {tabs.length === 0 ? (
          <span className="chat-tab-bar-empty">No chats yet</span>
        ) : (
          tabs.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === activeId}
              className={`chat-tab${c.id === activeId ? ' active' : ''}`}
              onClick={() => setActiveConversation(c.id)}
              title={c.title}
            >
              <span className="chat-tab-title">{c.title || 'Untitled'}</span>
              <span
                className="chat-tab-close"
                onClick={(e) => closeTab(e, c.id)}
                aria-label={`Close ${c.title}`}
                role="button"
              >
                ×
              </span>
            </button>
          ))
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
