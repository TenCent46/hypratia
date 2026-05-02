import { useEffect, useRef, useState } from 'react';
import {
  AppContextMenuItem as Item,
  AppContextMenuSeparator as Separator,
} from '../ContextMenu/AppContextMenuItem';
import { useClampedMenuPosition } from '../../hooks/useClampedMenuPosition';
import { useAdaptiveSubmenuPosition } from '../../hooks/useAdaptiveSubmenuPosition';

export type PaneMenuControl = {
  id: string;
  label: string;
  shown: boolean;
  show: () => void;
  hide: () => void;
  canShow: boolean;
};

export function PaneMenuItems({
  items,
  onSelect,
}: {
  items: PaneMenuControl[];
  onSelect?: () => void;
}) {
  return (
    <>
      {items.map((item) => (
        <Item
          key={item.id}
          label={`${item.shown ? 'Hide' : 'Show'} ${item.label}`}
          checked={item.shown}
          disabled={!item.canShow && !item.shown}
          onClick={() => {
            if (item.shown) item.hide();
            else item.show();
            onSelect?.();
          }}
        />
      ))}
    </>
  );
}

export function PaneMenuSubmenu({
  items,
  onSelect,
  label = 'Tabs',
}: {
  items: PaneMenuControl[];
  onSelect?: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pos = useAdaptiveSubmenuPosition(triggerRef, bodyRef, open);

  return (
    <div
      ref={triggerRef}
      className="app-context-submenu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button type="button" className="app-context-menu-item" role="menuitem">
        <span className="app-context-menu-check" aria-hidden="true" />
        <span className="app-context-menu-label">{label}</span>
        <span className="app-context-menu-shortcut" aria-hidden="true">
          ›
        </span>
      </button>
      {open ? (
        <div
          ref={bodyRef}
          className={`app-context-submenu-body open side-${pos.side}`}
          role="menu"
          style={{ top: pos.top }}
        >
          <PaneMenuItems items={items} onSelect={onSelect} />
        </div>
      ) : null}
    </div>
  );
}

export function PanesContextMenu({
  x,
  y,
  items,
  onShowAll,
  onClose,
}: {
  x: number;
  y: number;
  items: PaneMenuControl[];
  onShowAll: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useClampedMenuPosition(ref, x, y);

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (ref.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="app-context-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="app-context-menu-title">Panes</div>
      <PaneMenuItems items={items} onSelect={onClose} />
      <Separator />
      <Item
        label="Show All Panes"
        onClick={() => {
          onShowAll();
          onClose();
        }}
      />
    </div>
  );
}
