import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasTool } from '../../store';
import {
  AppContextMenuItem as Item,
  AppContextMenuSeparator as Separator,
} from '../ContextMenu/AppContextMenuItem';

export type CanvasPanelContextMenuProps = {
  x: number;
  y: number;
  canvasPanelState?: 'shown' | 'hidden';
  chatPanelState?: 'shown' | 'hidden';
  canvasTool: CanvasTool;
  hasSelection: boolean;
  hasNodes: boolean;
  onShowCanvas?: () => void;
  onHideCanvas?: () => void;
  onShowChat?: () => void;
  onHideChat?: () => void;
  onResetView: () => void;
  onFitView: () => void;
  onFitToCanvas: () => void;
  onSetTool: (tool: CanvasTool) => void;
  onClose: () => void;
};

export function CanvasPanelContextMenu({
  x,
  y,
  canvasPanelState = 'shown',
  chatPanelState = 'shown',
  canvasTool,
  hasSelection,
  hasNodes,
  onShowCanvas,
  onHideCanvas,
  onShowChat,
  onHideChat,
  onResetView,
  onFitView,
  onFitToCanvas,
  onSetTool,
  onClose,
}: CanvasPanelContextMenuProps) {
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
    // Capture phase so the canvas's onPointerDownCapture (which calls
    // preventDefault for marquee selection) cannot swallow the dismiss.
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const fitLabel = hasSelection ? 'Fit Selection' : 'Fit All';

  return (
    <div
      ref={ref}
      className="app-context-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Item
        onClick={() => {
          onShowCanvas?.();
          onClose();
        }}
        label="Show Canvas"
        checked={canvasPanelState === 'shown'}
      />
      <Item
        onClick={() => {
          onHideCanvas?.();
          onClose();
        }}
        label="Hide Canvas"
        checked={canvasPanelState === 'hidden'}
      />
      <Separator />
      <Item
        onClick={() => {
          onShowChat?.();
          onClose();
        }}
        label="Show Chat"
        checked={chatPanelState === 'shown'}
      />
      <Item
        onClick={() => {
          onHideChat?.();
          onClose();
        }}
        label="Hide Chat"
        checked={chatPanelState === 'hidden'}
      />
      <Separator />
      <Item
        onClick={() => {
          onResetView();
          onClose();
        }}
        label="Reset View"
      />
      <Item
        onClick={() => {
          onFitView();
          onClose();
        }}
        label={fitLabel}
        disabled={!hasSelection && !hasNodes}
      />
      <Item
        onClick={() => {
          onFitToCanvas();
          onClose();
        }}
        label="Fit to Canvas"
        disabled={!hasNodes}
      />
      <Separator />
      <Item
        onClick={() => {
          onSetTool('select');
          onClose();
        }}
        label="Select Tool"
        shortcut="V"
        checked={canvasTool === 'select'}
      />
      <Item
        onClick={() => {
          onSetTool('hand');
          onClose();
        }}
        label="Hand Tool"
        shortcut="H"
        checked={canvasTool === 'hand'}
      />
      <Separator />
      <Item onClick={onClose} label="Cancel" shortcut="Esc" />
    </div>
  );
}
