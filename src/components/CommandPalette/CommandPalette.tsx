import { useEffect, useMemo, useRef } from 'react';
import { Command } from 'cmdk';
import { useStore } from '../../store';
import { useCommands } from '../../services/commands/useCommands';

export function CommandPalette() {
  const open = useStore((s) => s.ui.commandOpen);
  const setOpen = useStore((s) => s.setCommandOpen);
  const commands = useCommands();
  const visible = useMemo(
    () => commands.filter((c) => !c.when || c.when()),
    [commands],
  );
  const paletteRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Body scroll lock: while the palette is open, freeze the document so
  // that even if the inner list isn't scrollable for any reason, wheel
  // events can never end up scrolling the page underneath.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Native wheel safeguard: any wheel event landing OUTSIDE `.cmd-list`
  // (e.g. on the input bar, padding, or the 1px border) is preventDefault'd
  // so it can never scroll the page underneath. Wheels inside the list
  // are left alone so its native overflow scroll works normally; the
  // list's own `overscroll-behavior: contain` stops chaining at its
  // edges. Native non-passive listener so it runs before browser scroll.
  useEffect(() => {
    if (!open) return;
    const el = paletteRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.cmd-list')) {
        event.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open]);

  // Dev-only sanity check: log the scroll-container measurements so we
  // can verify scrollHeight > clientHeight without a screenshot. Fires
  // once per open + once after layout stabilises.
  useEffect(() => {
    if (!open) return;
    if (import.meta.env.PROD) return;
    let frame1: number | null = null;
    let frame2: number | null = null;
    function dump(label: string) {
      const palette = paletteRef.current;
      const list = listRef.current;
      const sizer = list?.querySelector<HTMLElement>('[cmdk-list-sizer]');
      console.debug(`[cmd-palette ${label}]`, {
        palette: palette
          ? {
              clientHeight: palette.clientHeight,
              scrollHeight: palette.scrollHeight,
              computedHeight: getComputedStyle(palette).height,
              overflow: getComputedStyle(palette).overflow,
            }
          : null,
        list: list
          ? {
              clientHeight: list.clientHeight,
              scrollHeight: list.scrollHeight,
              isScrollable: list.scrollHeight > list.clientHeight,
              computedHeight: getComputedStyle(list).height,
              overflowY: getComputedStyle(list).overflowY,
              overscrollBehavior: getComputedStyle(list).overscrollBehavior,
            }
          : null,
        sizer: sizer
          ? {
              clientHeight: sizer.clientHeight,
              scrollHeight: sizer.scrollHeight,
              overflow: getComputedStyle(sizer).overflow,
            }
          : null,
        body: {
          overflow: document.body.style.overflow,
          scrollHeight: document.body.scrollHeight,
          clientHeight: document.body.clientHeight,
        },
      });
    }
    frame1 = requestAnimationFrame(() => {
      dump('after first paint');
      frame2 = requestAnimationFrame(() => dump('after second paint'));
    });
    return () => {
      if (frame1 !== null) cancelAnimationFrame(frame1);
      if (frame2 !== null) cancelAnimationFrame(frame2);
    };
  }, [open]);

  if (!open) return null;

  const groups = visible.reduce<Record<string, typeof visible>>((acc, c) => {
    if (!acc[c.section]) acc[c.section] = [];
    acc[c.section].push(c);
    return acc;
  }, {});

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div
        ref={paletteRef}
        className="cmd-palette"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette" loop>
          <Command.Input
            autoFocus
            placeholder="Type a command…"
            className="cmd-input"
          />
          <Command.List ref={listRef} className="cmd-list">
            <Command.Empty className="search-empty">No commands.</Command.Empty>
            {Object.entries(groups).map(([section, cmds]) => (
              <Command.Group
                key={section}
                heading={section}
                className="cmd-group"
              >
                {cmds.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`${c.section} ${c.title}`}
                    className="cmd-item"
                    onSelect={() => {
                      setOpen(false);
                      void c.run();
                    }}
                  >
                    <span>{c.title}</span>
                    {c.shortcut ? (
                      <kbd className="cmd-shortcut">{c.shortcut}</kbd>
                    ) : null}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
