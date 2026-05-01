import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AppContextMenuItem as Item,
  AppContextMenuSeparator as Separator,
} from '../ContextMenu/AppContextMenuItem';

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
  return (
    <div className="app-context-submenu">
      <button type="button" className="app-context-menu-item" role="menuitem">
        <span className="app-context-menu-check" aria-hidden="true" />
        <span className="app-context-menu-label">{label}</span>
        <span className="app-context-menu-shortcut" aria-hidden="true">
          ›
        </span>
      </button>
      <div className="app-context-submenu-body" role="menu">
        <PaneMenuItems items={items} onSelect={onSelect} />
      </div>
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
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let nx = x;
    let ny = y;
    if (nx + rect.width + pad > window.innerWidth) {
      nx = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (ny + rect.height + pad > window.innerHeight) {
      ny = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
  }, [x, y, pos.x, pos.y]);

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
