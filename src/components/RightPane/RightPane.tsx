import { useState, type MouseEvent } from 'react';
import { ChatPanel } from '../../features/chat/ChatPanel';
import { ChatPanelContextMenu } from '../ChatPanel/ChatPanelContextMenu';
import type { PaneMenuControl } from '../PanesContextMenu/PanesContextMenu';

/**
 * Right-pane shell. Detach + hide are intentionally not exposed as inline
 * UI buttons here — they were colliding with the chat tab strip's "+" /
 * tab close glyphs. Hide remains reachable via the right-click menu and
 * the Panes submenu; detach is reachable from the command palette
 * (`Cmd-K` → "Detach Chat to Window") and the macOS File menu.
 */
export function RightPane({
  panelState,
  paneMenuItems,
  onShow,
  onHide,
}: {
  panelState?: 'shown' | 'hidden';
  paneMenuItems?: PaneMenuControl[];
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
      <div className="right-body">
        <ChatPanel />
      </div>
      {menu ? (
        <ChatPanelContextMenu
          x={menu.x}
          y={menu.y}
          panelState={panelState}
          paneMenuItems={paneMenuItems}
          onShow={onShow}
          onHide={onHide}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </aside>
  );
}
