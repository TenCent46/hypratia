import type { ReactNode } from 'react';
import { CheckIcon, ChevronRightIcon } from './icons';

export type ComposerActionMenuItemProps = {
  icon: ReactNode;
  label: string;
  description?: string;
  active?: boolean;
  disabled?: boolean;
  chevron?: boolean;
  /** Visual hover/open state for parents that drive a flyout submenu. */
  highlight?: boolean;
  onClick?: () => void;
};

export function ComposerActionMenuItem({
  icon,
  label,
  description,
  active,
  disabled,
  chevron,
  highlight,
  onClick,
}: ComposerActionMenuItemProps) {
  const cls = [
    'composer-menu-item',
    active ? 'active' : '',
    disabled ? 'disabled' : '',
    highlight ? 'highlight' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      role="menuitem"
      className={cls}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-checked={active ? true : undefined}
      aria-disabled={disabled ? true : undefined}
    >
      <span className="composer-menu-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="composer-menu-item-label">
        <span className="composer-menu-item-title">{label}</span>
        {description ? (
          <span className="composer-menu-item-desc">{description}</span>
        ) : null}
      </span>
      <span className="composer-menu-item-trailing" aria-hidden="true">
        {active ? <CheckIcon /> : chevron ? <ChevronRightIcon /> : null}
      </span>
    </button>
  );
}
