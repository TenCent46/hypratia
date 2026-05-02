import { useStore } from '../store';
import { ConversationSwitcher } from './ConversationSwitcher/ConversationSwitcher';
import { ViewModeToggle } from './ViewModeToggle/ViewModeToggle';

export function Header() {
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const workspaceName = useStore((s) => s.settings.workspaceName);

  return (
    <header className="header">
      <span className="title">
        {workspaceName?.trim() || 'Hypratia'}
      </span>
      <ConversationSwitcher />
      <ViewModeToggle />
      <span className="header-spacer" />
      <button
        type="button"
        className="header-icon"
        onClick={() => setSearchOpen(true)}
        title="Search (⌘K)"
        aria-label="Search"
      >
        ⌕
      </button>
      <button
        type="button"
        className="header-icon"
        onClick={() => setSettingsOpen(true)}
        title="Settings & export"
        aria-label="Settings and export"
      >
        ⚙
      </button>
    </header>
  );
}
