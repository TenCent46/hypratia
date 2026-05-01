import { useStore } from '../../store';

export function ViewModeToggle() {
  const mode = useStore((s) => s.ui.viewMode);
  const setMode = useStore((s) => s.setViewMode);
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
    </div>
  );
}
