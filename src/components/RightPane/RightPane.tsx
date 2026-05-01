import { useState, type MouseEvent } from 'react';
import { ChatPanel } from '../../features/chat/ChatPanel';
import { ChatPanelContextMenu } from '../ChatPanel/ChatPanelContextMenu';

export function RightPane({
  onClose,
  onDetach,
  panelState,
  onShow,
  onHide,
}: {
  onClose?: () => void;
  onDetach?: () => void;
  panelState?: 'shown' | 'hidden';
  onShow?: () => void;
  onHide?: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  function onContextMenu(e: MouseEvent<HTMLElement>) {
    // Let inputs/textareas keep the OS clipboard menu.
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  return (
    <aside className="right-pane chat-only" onContextMenu={onContextMenu}>
      {onDetach || onClose ? (
        <div className="right-pane-controls">
          {onDetach ? (
            <button
              type="button"
              className="pane-close"
              onClick={onDetach}
              aria-label="Open right pane in window"
              title="Open right pane in window"
            >
              ⧉
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="pane-close"
              onClick={onClose}
              aria-label="Hide right pane"
              title="Hide right pane"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="right-body">
        <ChatPanel />
      </div>
      {menu ? (
        <ChatPanelContextMenu
          x={menu.x}
          y={menu.y}
          panelState={panelState}
          onShow={onShow}
          onHide={onHide}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </aside>
  );
}
