import { useLayoutEffect, useState, type RefObject } from 'react';

const DEFAULT_PAD = 8;

/**
 * Keep a floating right-click / context menu inside the viewport.
 *
 * The menu's `ref` element is measured *after* it mounts (via
 * `useLayoutEffect`, before paint), and the position is shifted left /
 * up so the menu's bounding box stays inside `window.innerWidth` /
 * `window.innerHeight` minus a small padding. The viewport-relative
 * `(x, y)` the caller passed in is only adjusted when the menu would
 * otherwise overflow — clicks near the top-left of the screen don't
 * move at all, clicks near the bottom-right flip up/left automatically.
 *
 * Returns the clamped `(x, y)` to feed into the menu's `style.left` /
 * `style.top`. Re-runs when the input position changes (e.g. the user
 * right-clicks a different spot without closing first).
 *
 * Usage:
 *
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * const pos = useClampedMenuPosition(ref, x, y);
 * return <div ref={ref} style={{ left: pos.x, top: pos.y }} />;
 * ```
 */
export function useClampedMenuPosition(
  ref: RefObject<HTMLElement | null>,
  x: number,
  y: number,
  pad = DEFAULT_PAD,
): { x: number; y: number } {
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      // The element isn't mounted yet — keep using the raw cursor
      // coords until it is. We re-run when ref is populated because
      // the dep array carries `x, y` which change with each open.
      setPos({ x, y });
      return;
    }
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (nx + rect.width + pad > vw) {
      // Prefer flipping to the left of the cursor so the click point
      // stays anchored to a corner of the menu, not buried inside it.
      const flipped = x - rect.width;
      nx = flipped >= pad ? flipped : Math.max(pad, vw - rect.width - pad);
    }
    if (ny + rect.height + pad > vh) {
      const flipped = y - rect.height;
      ny = flipped >= pad ? flipped : Math.max(pad, vh - rect.height - pad);
    }
    nx = Math.max(pad, nx);
    ny = Math.max(pad, ny);
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
    // We intentionally exclude `pos` from the dep array — including it
    // would re-run on every state update and risk an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, pad]);

  return pos;
}
