import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
  onPaste: () => void;
  onResetView: () => void;
  onFitView: () => void;
  onFitToCanvas: () => void;
  onSetTool: (tool: CanvasTool) => void;
  /**
   * Single button replacing the older "Export as Obsidian Canvas" +
   * "Sync to Vault" pair. Autosave handles the steady state; this is the
   * "I want certainty right now" affordance.
   */
  onForceResync?: () => void;
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
  onPaste,
  onResetView,
  onFitView,
  onFitToCanvas,
  onSetTool,
  onForceResync,
  onClose,
}: CanvasPanelContextMenuProps) {
  const { t } = useTranslation();
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

  const fitLabel = hasSelection
    ? t('canvas.fitSelection')
    : t('canvas.fitAll');

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
        label={t('canvas.addNode')}
        disabled={!canAddNode}
      />
      <Item
        onClick={() => {
          onPaste();
          onClose();
        }}
        label={t('canvas.paste')}
        shortcut="⌘V"
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
            label={t('canvas.showCanvas')}
            checked={canvasPanelState === 'shown'}
          />
          <Item
            onClick={() => {
              onHideCanvas?.();
              onClose();
            }}
            label={t('canvas.hideCanvas')}
            checked={canvasPanelState === 'hidden'}
          />
          <Separator />
          <Item
            onClick={() => {
              onShowChat?.();
              onClose();
            }}
            label={t('canvas.showChat')}
            checked={chatPanelState === 'shown'}
          />
          <Item
            onClick={() => {
              onHideChat?.();
              onClose();
            }}
            label={t('canvas.hideChat')}
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
        label={t('canvas.resetView')}
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
        label={t('canvas.fitToCanvas')}
        disabled={!hasNodes}
      />
      <Separator />
      <Item
        onClick={() => {
          onSetTool('select');
          onClose();
        }}
        label={t('canvas.selectTool')}
        shortcut="V"
        checked={canvasTool === 'select'}
      />
      <Item
        onClick={() => {
          onSetTool('hand');
          onClose();
        }}
        label={t('canvas.handTool')}
        shortcut="H"
        checked={canvasTool === 'hand'}
      />
      {onForceResync ? (
        <>
          <Separator />
          <Item
            onClick={() => {
              onForceResync();
              onClose();
            }}
            label="Force re-sync now"
            shortcut="⌘⇧R"
          />
        </>
      ) : null}
      <Separator />
      <Item onClick={onClose} label={t('canvas.cancel')} shortcut="Esc" />
    </div>
  );
}
