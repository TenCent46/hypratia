import { useEffect, useRef } from 'react';
import type { CanvasTool } from '../../store';
import {
  AppContextMenuItem as Item,
  AppContextMenuSeparator as Separator,
} from '../ContextMenu/AppContextMenuItem';
import {
  PaneMenuSubmenu,
  type PaneMenuControl,
} from '../PanesContextMenu/PanesContextMenu';
import { useClampedMenuPosition } from '../../hooks/useClampedMenuPosition';

export type CanvasPanelContextMenuProps = {
  x: number;
  y: number;
  canvasPanelState?: 'shown' | 'hidden';
  chatPanelState?: 'shown' | 'hidden';
  paneMenuItems?: PaneMenuControl[];
  canvasTool: CanvasTool;
  hasSelection: boolean;
  hasNodes: boolean;
  canAddNode: boolean;
  onShowCanvas?: () => void;
  onHideCanvas?: () => void;
  onShowChat?: () => void;
  onHideChat?: () => void;
  onAddNode: () => void;
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
  paneMenuItems,
  canvasTool,
  hasSelection,
  hasNodes,
  canAddNode,
  onShowCanvas,
  onHideCanvas,
  onShowChat,
  onHideChat,
  onAddNode,
  onResetView,
  onFitView,
  onFitToCanvas,
  onSetTool,
  onClose,
}: CanvasPanelContextMenuProps) {
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
          onAddNode();
          onClose();
        }}
        label="Add Node"
        disabled={!canAddNode}
      />
      <Separator />
      {paneMenuItems ? (
        <>
          <PaneMenuSubmenu items={paneMenuItems} onSelect={onClose} />
          <Separator />
        </>
      ) : (
        <>
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
        </>
      )}
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
