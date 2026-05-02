import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useAdaptiveSubmenuPosition } from '../../../hooks/useAdaptiveSubmenuPosition';
import { ComposerActionMenuItem } from './ComposerActionMenuItem';
import { SkillSubmenu } from './SkillMenuPlaceholder';
import { ConnectorSubmenu } from './ConnectorMenuPlaceholder';
import { ProjectSubmenu } from './ProjectSubmenu';
import { StyleSubmenu } from './StyleSubmenu';
import {
  PaperclipIcon,
  FolderPlusIcon,
  BookOpenIcon,
  BlocksIcon,
  PlugIcon,
  GlobeIcon,
  RadarIcon,
  FeatherIcon,
} from './icons';
import type { ComposerMode } from './ComposerMode';

type Submenu = 'project' | 'skills' | 'connectors' | 'style' | null;
const HOVER_LEAVE_DELAY_MS = 120;
const POPOVER_GAP = 8;
const VIEWPORT_PAD = 8;

export function ComposerActionMenu({
  open,
  anchorRef,
  onClose,
  onPickFiles,
  mode,
  onModeChange,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onPickFiles: () => void;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<Submenu>(null);
  const [activeStyleId, setActiveStyleId] = useState<string>('default');
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The menu is unmounted when `open` is false (we return null below), so
  // local state — submenu, close-timer — naturally resets on the next open.
  // That means this effect can assume `open === true` and only needs to wire
  // global listeners.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (submenu) setSubmenu(null);
        else onClose();
      }
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    const timerRef = closeTimerRef;
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, anchorRef, onClose, submenu]);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) return;

      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const width = popoverRect.width || 280;
      const height = popoverRect.height || 240;
      let left = anchorRect.left;
      let top = anchorRect.top - height - POPOVER_GAP;

      if (top < VIEWPORT_PAD) {
        top = anchorRect.bottom + POPOVER_GAP;
      }
      if (top + height + VIEWPORT_PAD > vh) {
        top = Math.max(VIEWPORT_PAD, vh - height - VIEWPORT_PAD);
      }
      if (left + width + VIEWPORT_PAD > vw) {
        left = Math.max(VIEWPORT_PAD, vw - width - VIEWPORT_PAD);
      }
      left = Math.max(VIEWPORT_PAD, left);

      setPopoverPos((cur) =>
        cur && cur.left === left && cur.top === top ? cur : { left, top },
      );
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, open]);

  function scheduleClose(target: Submenu) {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      // Only close if the user hasn't moved into another submenu in the meantime.
      setSubmenu((cur) => (cur === target ? null : cur));
      closeTimerRef.current = null;
    }, HOVER_LEAVE_DELAY_MS);
  }

  function openSubmenu(target: Submenu) {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setSubmenu(target);
  }

  if (!open) return null;

  function toggleMode(target: ComposerMode) {
    onModeChange(mode === target ? 'chat' : target);
    onClose();
  }

  return createPortal(
    <div
      className="composer-menu-wrap"
      ref={popoverRef}
      style={
        popoverPos
          ? { left: popoverPos.left, top: popoverPos.top }
          : { left: 0, top: 0, visibility: 'hidden' }
      }
    >
      <div className="composer-menu" role="menu" aria-label="Composer actions">
        <ComposerActionMenuItem
          icon={<PaperclipIcon />}
          label="Add files or photos"
          onClick={() => {
            onPickFiles();
            onClose();
          }}
        />
        <FlyoutItem
          name="project"
          activeSubmenu={submenu}
          onOpen={openSubmenu}
          onScheduleClose={scheduleClose}
          render={() => (
            <ProjectSubmenu
              onPicked={() => {
                onClose();
              }}
            />
          )}
        >
          <ComposerActionMenuItem
            icon={<FolderPlusIcon />}
            label="Add to project"
            chevron
            active={submenu === 'project'}
            highlight={submenu === 'project'}
          />
        </FlyoutItem>
        <div className="composer-menu-sep" role="separator" />
        <FlyoutItem
          name="skills"
          activeSubmenu={submenu}
          onOpen={openSubmenu}
          onScheduleClose={scheduleClose}
          render={() => (
            <SkillSubmenu
              onPick={(s) => {
                console.log('[composer] skill picked', s.id);
                onClose();
              }}
            />
          )}
        >
          <ComposerActionMenuItem
            icon={<BookOpenIcon />}
            label="Skills"
            chevron
            highlight={submenu === 'skills'}
          />
        </FlyoutItem>
        <FlyoutItem
          name="connectors"
          activeSubmenu={submenu}
          onOpen={openSubmenu}
          onScheduleClose={scheduleClose}
          render={() => (
            <ConnectorSubmenu
              onPick={(c) => {
                console.log('[composer] connector picked', c.id);
              }}
            />
          )}
        >
          <ComposerActionMenuItem
            icon={<BlocksIcon />}
            label="Connectors"
            chevron
            highlight={submenu === 'connectors'}
          />
        </FlyoutItem>
        <ComposerActionMenuItem icon={<PlugIcon />} label="Plugins" disabled />
        <div className="composer-menu-sep" role="separator" />
        <ComposerActionMenuItem
          icon={<GlobeIcon />}
          label="Web Search"
          active={mode === 'search'}
          onClick={() => toggleMode('search')}
        />
        <ComposerActionMenuItem
          icon={<RadarIcon />}
          label="Deep Search"
          active={mode === 'deep_search'}
          onClick={() => toggleMode('deep_search')}
        />
        <FlyoutItem
          name="style"
          activeSubmenu={submenu}
          onOpen={openSubmenu}
          onScheduleClose={scheduleClose}
          render={() => (
            <StyleSubmenu
              activeStyleId={activeStyleId}
              onPick={(s) => {
                setActiveStyleId(s.id);
                console.log('[composer] style picked', s.id);
                onClose();
              }}
            />
          )}
        >
          <ComposerActionMenuItem
            icon={<FeatherIcon />}
            label="Use style"
            chevron
            highlight={submenu === 'style'}
          />
        </FlyoutItem>
      </div>
    </div>,
    document.body,
  );
}

function FlyoutItem({
  name,
  activeSubmenu,
  onOpen,
  onScheduleClose,
  render,
  children,
}: {
  name: Submenu;
  activeSubmenu: Submenu;
  onOpen: (name: Submenu) => void;
  onScheduleClose: (name: Submenu) => void;
  render: () => ReactNode;
  children: ReactNode;
}) {
  const isOpen = activeSubmenu === name;
  const triggerRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const pos = useAdaptiveSubmenuPosition(triggerRef, submenuRef, isOpen, {
    topOffset: -6,
  });
  return (
    <div
      ref={triggerRef}
      className="composer-flyout"
      onMouseEnter={() => onOpen(name)}
      onMouseLeave={() => onScheduleClose(name)}
      onFocus={() => onOpen(name)}
    >
      {children}
      {isOpen ? (
        <div
          ref={submenuRef}
          className={`composer-submenu-wrap side-${pos.side}`}
          style={{ top: pos.top }}
          // Cancel a pending close while the cursor is over the submenu.
          onMouseEnter={() => onOpen(name)}
          onMouseLeave={() => onScheduleClose(name)}
        >
          {render()}
        </div>
      ) : null}
    </div>
  );
}
