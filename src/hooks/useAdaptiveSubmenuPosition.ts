import { useLayoutEffect, useState, type RefObject } from 'react';

const DEFAULT_PAD = 8;
const DEFAULT_GAP = 6;

export type AdaptiveSubmenuPosition = {
  side: 'left' | 'right';
  top: number;
};

/**
 * Position a submenu relative to its trigger row while keeping it inside the
 * viewport. The returned `top` is relative to the trigger container; `side`
 * tells the caller whether to render the flyout to the right or left.
 */
export function useAdaptiveSubmenuPosition(
  triggerRef: RefObject<HTMLElement | null>,
  submenuRef: RefObject<HTMLElement | null>,
  open: boolean,
  opts: { pad?: number; gap?: number; topOffset?: number } = {},
): AdaptiveSubmenuPosition {
  const pad = opts.pad ?? DEFAULT_PAD;
  const gap = opts.gap ?? DEFAULT_GAP;
  const topOffset = opts.topOffset ?? -4;
  const [position, setPosition] = useState<AdaptiveSubmenuPosition>({
    side: 'right',
    top: topOffset,
  });

  useLayoutEffect(() => {
    if (!open) {
      setPosition({ side: 'right', top: topOffset });
      return;
    }

    function update() {
      const trigger = triggerRef.current;
      const submenu = submenuRef.current;
      if (!trigger || !submenu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const submenuRect = submenu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const fitsRight = triggerRect.right + gap + submenuRect.width + pad <= vw;
      const fitsLeft = triggerRect.left - gap - submenuRect.width >= pad;
      const side = fitsRight || !fitsLeft ? 'right' : 'left';

      let top = topOffset;
      const absoluteTop = triggerRect.top + top;
      if (absoluteTop + submenuRect.height + pad > vh) {
        top = vh - pad - submenuRect.height - triggerRect.top;
      }
      if (triggerRect.top + top < pad) {
        top = pad - triggerRect.top;
      }

      setPosition((cur) =>
        cur.side === side && cur.top === top ? cur : { side, top },
      );
    }

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [gap, open, pad, submenuRef, topOffset, triggerRef]);

  return position;
}
