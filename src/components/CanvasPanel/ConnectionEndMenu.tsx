import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Floating "what should land here?" menu that appears when the user releases
 * a connection drag on empty canvas. Two options: create a fresh blank card
 * connected to the source, or pick an existing Markdown file from the vault
 * and use that as the new node's content.
 *
 * Position is in viewport (screen) coordinates so the menu stays where the
 * cursor was released.
 *
 * Rendered via `createPortal` directly under `document.body` so it escapes
 * `.canvas-panel`'s stacking context — otherwise the chat/canvas split
 * divider (in a sibling stacking context) was painting on top of it.
 */
export function ConnectionEndMenu({
  x,
  y,
  onAddCard,
  onAddFromVault,
  onClose,
}: {
  x: number;
  y: number;
  onAddCard: () => void;
  onAddFromVault: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    // Capture-phase pointerdown so the canvas marquee handler does not
    // swallow the dismiss.
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      className="connection-end-menu"
      style={{ left: x, top: y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="connection-end-menu-row"
        onClick={() => {
          onAddCard();
          onClose();
        }}
      >
        <span className="connection-end-menu-icon" aria-hidden>
          ＋
        </span>
        <span className="connection-end-menu-label">
          <strong>Add card</strong>
          <em>Blank Markdown node, connected</em>
        </span>
      </button>
      <button
        type="button"
        className="connection-end-menu-row"
        onClick={() => {
          onAddFromVault();
          onClose();
        }}
      >
        <span className="connection-end-menu-icon" aria-hidden>
          ⊞
        </span>
        <span className="connection-end-menu-label">
          <strong>Add note from vault</strong>
          <em>Pick an existing Markdown file</em>
        </span>
      </button>
    </div>,
    document.body,
  );
}
