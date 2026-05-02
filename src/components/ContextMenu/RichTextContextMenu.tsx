import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useClampedMenuPosition } from '../../hooks/useClampedMenuPosition';

/**
 * Single right-click menu shape used everywhere selectable / editable
 * text appears: Canvas markdown viewer, Canvas markdown editor textarea,
 * Chat messages, Chat input. Each call site supplies only the actions
 * that make sense in its context — items with no handler are hidden.
 *
 * The visual order is: editing actions (Cut/Copy/Paste/Select All), a
 * divider, then semantic actions (Ask/Search/Open Markdown). The divider
 * is suppressed when only one of the two groups is non-empty.
 */
export type RichTextMenuItems = {
  cut?: () => void;
  copy?: () => void;
  paste?: () => void;
  selectAll?: () => void;
  ask?: () => void;
  search?: () => void;
  openMarkdown?: () => void;
};

export type RichTextContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  items: RichTextMenuItems;
};

export function RichTextContextMenu({
  x,
  y,
  onClose,
  items,
}: RichTextContextMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const pos = useClampedMenuPosition(ref, x, y);

  useEffect(() => {
    function onDoc(e: globalThis.PointerEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const editGroup = !!(items.cut || items.copy || items.paste || items.selectAll);
  const semanticGroup = !!(items.ask || items.search || items.openMarkdown);
  if (!editGroup && !semanticGroup) return null;

  return (
    <div
      ref={ref}
      className="node-context-menu"
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000 }}
      // Prevent mousedown inside the menu from blurring the textarea /
      // collapsing the user's selection — otherwise Cut/Copy lose what
      // they were supposed to act on.
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.cut ? (
        <button type="button" onClick={items.cut}>
          {t('common.cut')}
        </button>
      ) : null}
      {items.copy ? (
        <button type="button" onClick={items.copy}>
          {t('common.copy')}
        </button>
      ) : null}
      {items.paste ? (
        <button type="button" onClick={items.paste}>
          {t('common.paste')}
        </button>
      ) : null}
      {items.selectAll ? (
        <button type="button" onClick={items.selectAll}>
          {t('common.selectAll')}
        </button>
      ) : null}
      {editGroup && semanticGroup ? <hr /> : null}
      {items.ask ? (
        <button type="button" onClick={items.ask}>
          {t('selection.ask')}
        </button>
      ) : null}
      {items.search ? (
        <button type="button" onClick={items.search}>
          {t('selection.search')}
        </button>
      ) : null}
      {items.openMarkdown ? (
        <button type="button" onClick={items.openMarkdown}>
          {t('selection.openMarkdown')}
        </button>
      ) : null}
    </div>
  );
}
