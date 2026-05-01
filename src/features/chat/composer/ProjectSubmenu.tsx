import { useStore } from '../../../store';
import { ComposerActionMenuItem } from './ComposerActionMenuItem';
import { FolderPlusIcon } from './icons';
import type { ID } from '../../../types';

export function ProjectSubmenu({ onPicked }: { onPicked?: () => void }) {
  const projects = useStore((s) => s.projects);
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const conv = useStore((s) =>
    conversationId
      ? s.conversations.find((c) => c.id === conversationId) ?? null
      : null,
  );
  const workspaceName = useStore((s) => s.settings.workspaceName) ?? 'Workspace';
  const setConversationProject = useStore((s) => s.setConversationProject);

  function pick(projectId: ID | null) {
    if (!conversationId) {
      console.log('[composer] add to project — no active conversation');
      onPicked?.();
      return;
    }
    setConversationProject(conversationId, projectId);
    onPicked?.();
  }

  if (projects.length === 0) {
    return (
      <div className="composer-submenu" role="menu" aria-label="Add to project">
        <div className="composer-menu-empty">
          <strong>No projects yet</strong>
          <p>Create a project from the sidebar to file conversations under it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="composer-submenu" role="menu" aria-label="Add to project">
      <ComposerActionMenuItem
        icon={<FolderPlusIcon />}
        label="No project"
        description={workspaceName}
        active={!conv?.projectId}
        onClick={() => pick(null)}
      />
      {projects.map((p) => (
        <ComposerActionMenuItem
          key={p.id}
          icon={
            p.emoji ? (
              <span aria-hidden="true">{p.emoji}</span>
            ) : (
              <FolderPlusIcon />
            )
          }
          label={p.name}
          description={workspaceName}
          active={conv?.projectId === p.id}
          onClick={() => pick(p.id)}
        />
      ))}
    </div>
  );
}
