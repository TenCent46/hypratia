import { useStore } from '../../store';
import { openRelationshipTreeWindow } from '../../services/window';

export function ViewModeToggle() {
  const mode = useStore((s) => s.ui.viewMode);
  const setMode = useStore((s) => s.setViewMode);
  const lastConversationId = useStore((s) => s.settings.lastConversationId);
  return (
    <div className="view-toggle" role="tablist" aria-label="Map view mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'current'}
        className={mode === 'current' ? 'active' : ''}
        onClick={() => setMode('current')}
      >
        Current Map
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'global'}
        className={mode === 'global' ? 'active' : ''}
        onClick={() => setMode('global')}
      >
        Global Map
      </button>
      <button
        type="button"
        onClick={() => void openRelationshipTreeWindow(lastConversationId)}
        title="Open Relationship Tree Window — title-only tree projection of the active conversation"
      >
        Titles
      </button>
    </div>
  );
}
