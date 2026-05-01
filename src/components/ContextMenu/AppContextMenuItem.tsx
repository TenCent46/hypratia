export function AppContextMenuItem({
  label,
  shortcut,
  checked,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`app-context-menu-item${disabled ? ' disabled' : ''}`}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      <span className="app-context-menu-check" aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      <span className="app-context-menu-label">{label}</span>
      {shortcut ? (
        <kbd className="app-context-menu-shortcut">{shortcut}</kbd>
      ) : null}
    </button>
  );
}

export function AppContextMenuSeparator() {
  return (
    <div
      className="app-context-menu-sep"
      role="separator"
      aria-hidden="true"
    />
  );
}
