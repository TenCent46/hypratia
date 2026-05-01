import { useEffect, useRef } from 'react';

export type EditorContextMenuItem =
  | {
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
    }
  | { separator: true };

export function EditorContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: EditorContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="knowledge-menu editor-context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      {items.map((item, idx) => {
        if ('separator' in item) {
          return <hr key={`sep-${idx}`} className="editor-context-separator" />;
        }
        return (
          <button
            key={`${item.label}-${idx}`}
            type="button"
            className={item.danger ? 'danger' : undefined}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
